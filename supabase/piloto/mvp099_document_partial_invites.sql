-- MVP-099 Pilot: outbound per supplier uses only matched request line numbers.
-- All buyer lines remain immutable in request_lines, irrespective of coverage.
-- No sends, no flags turned on by this migration.
create table cotironda_piloto_privado.document_sources_mvp099(
 request_id uuid primary key references cotironda_piloto_privado.requests(id),
 message_hmac text not null unique references cotironda_piloto_privado.media_archive_mvp095(message_hmac),
 content_sha256 text not null check(content_sha256 ~ '^[a-f0-9]{64}$'),
 verified_method text not null check(verified_method='dual_ai_exact_lines'),
 verified_at timestamptz not null default clock_timestamp()
);
alter table cotironda_piloto_privado.document_sources_mvp099 enable row level security;
revoke all on cotironda_piloto_privado.document_sources_mvp099
 from public,anon,authenticated,service_role;

create table cotironda_piloto_privado.invitation_lines_mvp099(
 request_id uuid not null,
 supplier_key text not null,
 line_no smallint not null,
 primary key(request_id,supplier_key,line_no),
 foreign key(request_id,supplier_key)
  references cotironda_piloto_privado.invitations(request_id,supplier_key),
 foreign key(request_id,line_no)
  references cotironda_piloto_privado.request_lines(request_id,line_no)
);
alter table cotironda_piloto_privado.invitation_lines_mvp099 enable row level security;
revoke all on cotironda_piloto_privado.invitation_lines_mvp099
 from public,anon,authenticated,service_role;

-- The queue trigger inserts a legacy full-list body first. A later named
-- AFTER INSERT trigger atomically replaces it with the supplier subset.
-- SQL transaction commit is impossible before BOTH triggers complete.
create function cotironda_piloto_privado.refresh_partial_invite_mvp099()
returns trigger language plpgsql security definer set search_path='' as $fn$
declare n integer; full_n integer; body_text text; city text;
begin
 if not exists(select 1 from cotironda_piloto_privado.document_sources_mvp099
  where request_id=new.request_id) then return new;end if;
 select r.delivery_city into city from cotironda_piloto_privado.requests r
 where r.id=new.request_id;
 insert into cotironda_piloto_privado.invitation_lines_mvp099(
  request_id,supplier_key,line_no)
 select l.request_id,new.supplier_key,l.line_no
 from cotironda_piloto_privado.request_lines l
 where l.request_id=new.request_id
  and exists(select 1 from cotironda_piloto_privado.catalogue_lines c
    where c.participant_key=new.supplier_key
      and c.family_code=l.family_code
      and c.recognition_state='curated_family')
 order by l.line_no;
 get diagnostics n=row_count;
 select count(*) into full_n from cotironda_piloto_privado.request_lines l
 where l.request_id=new.request_id;
 if n<1 or n>25 or full_n<1 or full_n>25 then
  raise exception 'mvp099_invalid_subset' using errcode='23514';end if;
 select 'Cotironda · Solicitud de cotización'||E'\nEntrega: '||city||
   E'\nArtículos de tu rubro ('||n||' de '||full_n||'):'||E'\n'||
   string_agg(
     case when l.quantity=trunc(l.quantity) then l.quantity::bigint::text
       else l.quantity::text end||' '||
     case l.unit when 'bag' then 'bolsas' when 'unit' then 'unidades'
      when 'l' then 'litros' when 'm3' then 'm³' when 'kg' then 'kg'
      else l.unit end||' · '||l.original_description,
     E'\n' order by l.line_no)
 into body_text
 from cotironda_piloto_privado.request_lines l
 join cotironda_piloto_privado.invitation_lines_mvp099 il
  on il.request_id=l.request_id and il.line_no=l.line_no
 where il.request_id=new.request_id and il.supplier_key=new.supplier_key;
 -- A 25-item request can exceed WhatsApp's legacy 3500-character
 -- message column. All items are still sent in the attached, source-backed
 -- MULTI-PAGE PDF. Never truncate item descriptions without telling the
 -- recipient where the entire request lives.
 if length(body_text)>3500 then
  body_text:='Cotironda · Solicitud de cotización'||E'\nEntrega: '||city||
    E'\nArtículos de tu rubro: '||n||' de '||full_n||
    E'\nLista completa y cantidades en el PDF adjunto.'||
    E'\nRespondé por WhatsApp con tu presupuesto.';
 end if;
 if length(body_text) not between 20 and 3500 then
  raise exception 'mvp099_invitation_body_invalid' using errcode='23514';end if;
 update cotironda_piloto_privado.whapi_outbox o
 set message_body=body_text
 where o.request_id=new.request_id and o.supplier_key=new.supplier_key
   and o.state='pending';
 get diagnostics n=row_count;
 if n<>1 then raise exception 'mvp099_queue_not_patched' using errcode='23514';end if;
 return new;
end;$fn$;
revoke all on function cotironda_piloto_privado.refresh_partial_invite_mvp099()
 from public,anon,authenticated,service_role;
create trigger z_mvp099_partial_invite
after insert on cotironda_piloto_privado.invitations
for each row execute function cotironda_piloto_privado.refresh_partial_invite_mvp099();

-- A new document request can be dispatched only with auditable source,
-- consented matching supplier, complete subset, and active 4-day deadline.
-- Existing MVP091 test send gate remains in force for all legacy requests.
create function cotironda_piloto_privado.allow_document_send_mvp099(
 p_request uuid,p_supplier text
) returns boolean language sql stable security definer set search_path='' as $fn$
 select exists(
  select 1 from cotironda_piloto_privado.document_sources_mvp099 ds
  join cotironda_piloto_privado.requests r on r.id=ds.request_id
  join cotironda_piloto_privado.media_archive_mvp095 a on
    a.message_hmac=ds.message_hmac and a.content_sha256=ds.content_sha256
  join cotironda_piloto_privado.participants b on
    b.key=r.buyer_key and b.chat_hmac=a.chat_hmac
  join cotironda_piloto_privado.participants s on s.key=p_supplier
  join cotironda_piloto_privado.invitations i on i.request_id=r.id and
    i.supplier_key=s.key
  join cotironda_piloto_privado.whapi_outbox o on
    o.request_id=r.id and o.supplier_key=s.key
  join cotironda_piloto_privado.integration_flags flags on flags.only_row
  where r.id=p_request and a.participant_key=b.key
   and flags.whatsapp_outbound_enabled and r.state='prepared'
   and r.closes_at>clock_timestamp() and r.delivery_city='La Plata'
   and r.buyer_key='arquitecto' and b.participant_role='buyer'
   and b.consent_at is not null and b.opted_out_at is null
   and s.key in ('corralon_ailin','corralon_nahuel')
   and s.participant_role='supplier'
   and lower(btrim(s.delivery_city))=lower(btrim(r.delivery_city))
   and s.chat_hmac is not null and s.consent_at is not null
   and s.opted_out_at is null and i.state='prepared'
   and a.state='stored' and a.kind in('image','document')
   and a.review_state='suggested_only'
   and ds.verified_method='dual_ai_exact_lines'
   and (select count(*) from cotironda_piloto_privado.request_lines l
      where l.request_id=r.id) between 1 and 25
   and (select count(*) from cotironda_piloto_privado.invitation_lines_mvp099 il
      where il.request_id=r.id and il.supplier_key=s.key) between 1 and 25
   and not exists(
     select 1 from cotironda_piloto_privado.invitation_lines_mvp099 il
     join cotironda_piloto_privado.request_lines l
      on l.request_id=il.request_id and l.line_no=il.line_no
     where il.request_id=r.id and il.supplier_key=s.key
       and not exists(
        select 1 from cotironda_piloto_privado.catalogue_lines c
        where c.participant_key=s.key and c.family_code=l.family_code
         and c.recognition_state='curated_family'))
   and not exists(
     select 1 from cotironda_piloto_privado.offer_versions v
     where v.request_id=r.id and v.supplier_key=s.key)
 );$fn$;
revoke all on function cotironda_piloto_privado.allow_document_send_mvp099(uuid,text)
 from public,anon,authenticated,service_role;

-- Rebind existing lease machinery with same legacy behavior and a separate
-- narrowly scoped, strongly checked document path. No blind retries.
create or replace function public.cotironda_piloto_claim_whapi_v1()
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare row_ record; token uuid;
begin
 if not exists(select 1 from cotironda_piloto_privado.integration_flags
 where only_row and whatsapp_outbound_enabled=true) then
  return jsonb_build_object('state','outbound_disabled');
 end if;
 select o.request_id,o.supplier_key,o.message_body,p.chat_hmac into row_
 from cotironda_piloto_privado.whapi_outbox o
 join cotironda_piloto_privado.participants p on p.key=o.supplier_key
 where o.state='pending'
  and (cotironda_piloto_privado.allow_next_pilot_send_mvp091(
      o.request_id,o.supplier_key)
   or cotironda_piloto_privado.allow_document_send_mvp099(
      o.request_id,o.supplier_key))
 order by o.created_at,o.supplier_key
 for update of o skip locked limit 1;
 if not found then return jsonb_build_object('state','empty');end if;
 token:=gen_random_uuid();
 update cotironda_piloto_privado.whapi_outbox
 set state='leased',lease_token=token,leased_at=clock_timestamp()
 where request_id=row_.request_id and supplier_key=row_.supplier_key;
 return jsonb_build_object('state','leased','request_id',row_.request_id,
 'supplier_key',row_.supplier_key,'chat_hmac',row_.chat_hmac,
 'message_body',row_.message_body,'lease_token',token);
end;$fn$;
revoke all on function public.cotironda_piloto_claim_whapi_v1()
 from public,anon,authenticated;
grant execute on function public.cotironda_piloto_claim_whapi_v1() to service_role;

create or replace function public.cotironda_piloto_authorize_whapi_v1(
 p_request uuid,p_supplier text,p_lease uuid
) returns boolean language sql stable security definer set search_path='' as $fn$
 select exists(select 1 from cotironda_piloto_privado.whapi_outbox o
 join cotironda_piloto_privado.integration_flags f on f.only_row
 where o.request_id=p_request and o.supplier_key=p_supplier
 and o.state='leased' and o.lease_token=p_lease
 and f.whatsapp_outbound_enabled=true
 and (cotironda_piloto_privado.allow_next_pilot_send_mvp091(
       o.request_id,o.supplier_key)
   or cotironda_piloto_privado.allow_document_send_mvp099(
       o.request_id,o.supplier_key)));
$fn$;
revoke all on function public.cotironda_piloto_authorize_whapi_v1(uuid,text,uuid)
 from public,anon,authenticated;
grant execute on function public.cotironda_piloto_authorize_whapi_v1(uuid,text,uuid)
 to service_role;

create or replace function public.cotironda_piloto_pdf_snapshot_mvp091(
 p_request uuid,p_supplier text,p_lease uuid
) returns jsonb language sql stable security definer set search_path='' as $fn$
 select jsonb_build_object(
  'requestId',r.id,'city',r.delivery_city,
  'deadlineIso',to_char(r.closes_at at time zone 'UTC',
   'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'deliveryNote',r.requested_delivery_note,
  'items', (select jsonb_agg(jsonb_build_object(
   'description',l.original_description,
   'quantity',l.quantity::text,'unit',l.unit) order by l.line_no)
   from cotironda_piloto_privado.request_lines l
   where l.request_id=r.id and (
     not exists(select 1 from cotironda_piloto_privado.document_sources_mvp099 d
       where d.request_id=r.id)
     or exists(select 1 from cotironda_piloto_privado.invitation_lines_mvp099 il
       where il.request_id=r.id and il.supplier_key=p_supplier
        and il.line_no=l.line_no))))
 from cotironda_piloto_privado.requests r
 join cotironda_piloto_privado.whapi_outbox o on o.request_id=r.id
 where r.id=p_request and o.supplier_key=p_supplier
  and o.state='leased' and o.lease_token=p_lease
  and (cotironda_piloto_privado.allow_next_pilot_send_mvp091(p_request,p_supplier)
    or cotironda_piloto_privado.allow_document_send_mvp099(p_request,p_supplier));
$fn$;
revoke all on function public.cotironda_piloto_pdf_snapshot_mvp091(uuid,text,uuid)
 from public,anon,authenticated;
grant execute on function public.cotironda_piloto_pdf_snapshot_mvp091(uuid,text,uuid)
 to service_role;
