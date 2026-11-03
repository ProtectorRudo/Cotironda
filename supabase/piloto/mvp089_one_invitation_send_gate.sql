-- MVP-089: one explicitly scoped outbound pilot invite; NO sends here.
-- Supabase cotironda-piloto ONLY; never production/cotironda-dev.
-- The 51 identical supplier catalogue entries remain UNCONFIRMED.
-- A scoped quote invitation is a test request, not a proof of inventory.
do $guard$
begin
 if to_regclass('cotironda_piloto_privado.whapi_outbox') is null
 or to_regclass('cotironda_piloto_privado.request_lines') is null
 or to_regprocedure('public.cotironda_piloto_authorize_whapi_v1(uuid,text,uuid)') is null
 or not exists(select 1 from cotironda_piloto_privado.integration_flags
   where only_row=true and whatsapp_inbound_enabled=true
     and whatsapp_outbound_enabled=false) then
   raise exception 'mvp089_wrong_pilot_or_outbound_must_be_off' using errcode='42501';
 end if;
end $guard$;

-- One row for the first authorized test only. No client, authenticated,
-- service_role or Edge key gets CRUD on this scope.
create table cotironda_piloto_privado.whapi_test_send_scope_mvp089 (
 only_row boolean primary key default true check(only_row=true),
 request_id uuid not null references cotironda_piloto_privado.requests(id),
 supplier_key text not null references cotironda_piloto_privado.participants(key),
 approved_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null,
 reason text not null default 'first_pilot_text_quote'
   check(reason='first_pilot_text_quote')
);
alter table cotironda_piloto_privado.whapi_test_send_scope_mvp089 enable row level security;
revoke all on cotironda_piloto_privado.whapi_test_send_scope_mvp089
 from public,anon,authenticated,service_role;

-- Fails closed unless this ONE request is active and covers exactly the two
-- requested families in La Plata, and this supplier has opt-in and catalogue
-- categories (not automatically marked as confirmed for future sends).
create function cotironda_piloto_privado.allow_single_test_send_mvp089(
 p_request uuid,p_supplier text
) returns boolean language sql stable security definer set search_path='' as $fn$
 select exists(
   select 1
   from cotironda_piloto_privado.whapi_test_send_scope_mvp089 scope
   join cotironda_piloto_privado.requests r on r.id=scope.request_id
   join cotironda_piloto_privado.participants p on p.key=scope.supplier_key
   join cotironda_piloto_privado.participants buyer on buyer.key=r.buyer_key
   join cotironda_piloto_privado.invitations i
     on i.request_id=r.id and i.supplier_key=p.key
   where scope.only_row and scope.request_id=p_request
     and scope.supplier_key=p_supplier
     and scope.supplier_key='corralon_nahuel'
     and scope.expires_at>clock_timestamp()
     and scope.expires_at<=r.closes_at
     and r.state='prepared' and r.delivery_city='La Plata'
     and r.closes_at>clock_timestamp()
     and r.created_at>clock_timestamp()-interval '7 days'
     and buyer.participant_role='buyer'
     and buyer.consent_at is not null and buyer.opted_out_at is null
     and p.participant_role='supplier' and p.delivery_city=r.delivery_city
     and p.consent_at is not null and p.opted_out_at is null
     and p.chat_hmac is not null and i.state='prepared'
     and (select count(*) from cotironda_piloto_privado.request_lines l
          where l.request_id=r.id)=2
     and exists(select 1 from cotironda_piloto_privado.request_lines l
          where l.request_id=r.id and l.family_code='cemento_gris_obra')
     and exists(select 1 from cotironda_piloto_privado.request_lines l
          where l.request_id=r.id and l.family_code='hidrofugo')
     and not exists (
       select 1 from cotironda_piloto_privado.request_lines l
       where l.request_id=r.id and not exists (
         select 1 from cotironda_piloto_privado.catalogue_lines c
          where c.participant_key=p.key
          and c.family_code=l.family_code
          and c.recognition_state='curated_family'
       )
     )
     and not exists(select 1 from cotironda_piloto_privado.offer_versions v
          where v.request_id=r.id and v.supplier_key=p.key)
 );
$fn$;
revoke all on function cotironda_piloto_privado.allow_single_test_send_mvp089(uuid,text)
 from public,anon,authenticated,service_role;

-- The existing text-quote body has ugly raw NUMERIC and code units (20.000 bag).
-- Format only display, never mutate request_lines, offers or original source.
create function cotironda_piloto_privado.invitation_body_mvp089(p_request uuid)
returns text language sql stable security definer set search_path='' as $fn$
 select
   'Cotironda · Consulta de prueba'||E'\n'||
   'Entrega: '||r.delivery_city||E'\n'||
   'Materiales:'||E'\n'||
   left(string_agg(
     case when l.quantity=trunc(l.quantity)
       then trunc(l.quantity)::text
       else trim(trailing '0' from l.quantity::text) end||
     ' '||case l.unit
       when 'bag' then 'bolsas'
       when 'l' then 'litros'
       when 'unit' then 'unidades'
       when 'kg' then 'kg'
       when 'm3' then 'm³'
       else l.unit end||
     ' · '||l.original_description,E'\n' order by l.line_no),2700)||
   E'\n'||'Respondé este WhatsApp con los productos que puedas cotizar, '||
   'precios y aclaraciones (IVA, entrega, adicionales o descuentos).'
 from cotironda_piloto_privado.requests r
 join cotironda_piloto_privado.request_lines l on l.request_id=r.id
 where r.id=p_request group by r.id,r.delivery_city;
$fn$;
revoke all on function cotironda_piloto_privado.invitation_body_mvp089(uuid)
 from public,anon,authenticated,service_role;

create or replace function cotironda_piloto_privado.queue_invitation_whapi_v1()
returns trigger language plpgsql security invoker set search_path='' as $fn$
declare txt text;
begin
 select cotironda_piloto_privado.invitation_body_mvp089(new.request_id) into txt;
 if txt is null then raise exception 'missing_invitation_lines';end if;
 insert into cotironda_piloto_privado.whapi_outbox(request_id,supplier_key,message_body)
 values(new.request_id,new.supplier_key,txt);
 return new;
end;$fn$;

-- Claims remain ONE-AT-A-TIME, SKIP LOCKED, lease once, no retry of unknowns.
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
 and cotironda_piloto_privado.allow_single_test_send_mvp089(o.request_id,o.supplier_key)
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
end;
$fn$;
revoke all on function public.cotironda_piloto_claim_whapi_v1()
 from public,anon,authenticated;
grant execute on function public.cotironda_piloto_claim_whapi_v1() to service_role;

-- Recheck consent, state, time, scope, sender and lease immediately before HTTP.
create or replace function public.cotironda_piloto_authorize_whapi_v1(
 p_request uuid,p_supplier text,p_lease uuid
) returns boolean language sql stable security definer set search_path='' as $fn$
 select exists(
 select 1 from cotironda_piloto_privado.whapi_outbox o
 join cotironda_piloto_privado.integration_flags f on f.only_row
 where o.request_id=p_request and o.supplier_key=p_supplier
 and o.state='leased' and o.lease_token=p_lease
 and f.whatsapp_outbound_enabled=true
 and cotironda_piloto_privado.allow_single_test_send_mvp089(o.request_id,o.supplier_key)
 );
$fn$;
revoke all on function public.cotironda_piloto_authorize_whapi_v1(uuid,text,uuid)
 from public,anon,authenticated;
grant execute on function public.cotironda_piloto_authorize_whapi_v1(uuid,text,uuid)
 to service_role;

-- DO NOT INSERT scope or turn on outbound in migration.
-- In the operator step, authorize EXACTLY the current request and Nahuel,
-- rewrite only HIS pending body, perform a rollback smoke, THEN consider output.
