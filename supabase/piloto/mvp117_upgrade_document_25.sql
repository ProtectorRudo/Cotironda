-- MVP-117 — DEV/PILOTO only: upgrade ALREADY-INSTALLED 8-item document route.
-- All functions retain security definer and locked search_path; no new grants.
-- No flags, WhatsApp dispatch, backfill or live data writes.
do $gate$ begin
 if to_regclass('cotironda_piloto_privado.document_agreements_mvp099') is null
  or to_regclass('cotironda_piloto_privado.invitation_lines_mvp099') is null
  or to_regclass('cotironda_piloto_privado.requests') is null then
  raise exception 'mvp117_wrong_pilot_baseline' using errcode='42501';
 end if;
end $gate$;
alter table cotironda_piloto_privado.document_agreements_mvp099
 drop constraint document_agreements_mvp099_line_count_check;
alter table cotironda_piloto_privado.document_agreements_mvp099
 add constraint document_agreements_mvp099_line_count_check
 check(line_count between 1 and 25);

-- 25-item compatibility: public.cotironda_piloto_record_agreement_mvp099
create or replace function public.cotironda_piloto_record_agreement_mvp099(
 p_message_hmac text,p_second_proposal jsonb
) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare a record; total int; n int; line_ jsonb; compare_ jsonb;
      q text;u text;d text;ev text;ev2 text;
begin
 if p_message_hmac !~ '^[a-f0-9]{64}$' then
   return jsonb_build_object('state','invalid_hmac');end if;
 select m.message_hmac,m.proposal,m.content_sha256,m.chat_hmac,m.participant_key
 into a from cotironda_piloto_privado.media_archive_mvp095 m
 join cotironda_piloto_privado.participants p on
   p.key=m.participant_key and p.chat_hmac=m.chat_hmac
 where m.message_hmac=p_message_hmac and m.state='stored'
  and m.review_state='suggested_only'
  and m.proposal->>'kind'='buyer_request'
  and m.request_id is null
  and p.participant_role='buyer' and p.consent_at is not null
  and p.opted_out_at is null
 for update of m;
 if not found then return jsonb_build_object('state','not_permitted');end if;
 if exists(select 1 from cotironda_piloto_privado.document_agreements_mvp099
    where message_hmac=p_message_hmac) then
  return jsonb_build_object('state','already_agreed');end if;
 if p_second_proposal is null or p_second_proposal->>'kind'<>'buyer_request'
  or jsonb_typeof(p_second_proposal->'lines')<>'array'
  or jsonb_typeof(a.proposal->'lines')<>'array' then
  return jsonb_build_object('state','disagreement');end if;
 total:=jsonb_array_length(a.proposal->'lines');
 if total not between 1 and 25 or jsonb_array_length(
  p_second_proposal->'lines')<>total then
  return jsonb_build_object('state','disagreement');end if;
 if a.proposal->>'delivery_city' is distinct from
    p_second_proposal->>'delivery_city' then
  return jsonb_build_object('state','city_disagreement');end if;
 if a.proposal->>'requested_delivery_note' is distinct from
    p_second_proposal->>'requested_delivery_note' then
  return jsonb_build_object('state','delivery_note_disagreement');end if;
 for n in 0..total-1 loop
  line_:=a.proposal->'lines'->n;
  compare_:=p_second_proposal->'lines'->n;
  d:=line_->>'original_description';
  q:=line_->>'quantity';
  u:=line_->>'unit';
  ev:=line_->>'evidence_location';
  ev2:=compare_->>'evidence_location';
  if d is null or q is null or length(d) not between 3 and 75
    or q !~ '^[0-9]{1,6}([.,][0-9]{1,3})?$'
    or replace(q,',','.')::numeric<=0
    or btrim(lower(d)) is distinct from btrim(lower(
      compare_->>'original_description'))
    or replace(q,',','.') is distinct from
       replace(compare_->>'quantity',',','.')
    or lower(btrim(coalesce(u,''))) is distinct from
       lower(btrim(coalesce(compare_->>'unit','')))
    or coalesce(length(ev),0)=0 or coalesce(length(ev2),0)=0
    or position(lower(d) in lower(ev))=0
    or position(lower(d) in lower(ev2))=0
    or position(q in ev)=0
    or position(compare_->>'quantity' in ev2)=0
   then return jsonb_build_object('state','line_disagreement',
     'line_no',n+1);end if;
  -- Explicit unit is the only path to future dispatch. If omitted in both
  -- extractions, agreement may still be stored but promotion will refuse it.
  if u is not null and (
      position(lower(u) in lower(ev))=0 or
      position(lower(compare_->>'unit') in lower(ev2))=0) then
    return jsonb_build_object('state','unit_evidence_missing','line_no',n+1);
  end if;
 end loop;
 insert into cotironda_piloto_privado.document_agreements_mvp099(
   message_hmac,source_sha256,line_count)
 values(p_message_hmac,a.content_sha256,total);
 return jsonb_build_object('state','agreed_private','lines',total,
  'invites_created',0);
end;$fn$;

-- 25-item compatibility: cotironda_piloto_privado.refresh_partial_invite_mvp099
create or replace function cotironda_piloto_privado.refresh_partial_invite_mvp099()
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

-- 25-item compatibility: cotironda_piloto_privado.allow_document_send_mvp099
create or replace function cotironda_piloto_privado.allow_document_send_mvp099(
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

-- 25-item compatibility: public.cotironda_piloto_apply_clarification_mvp100
create or replace function public.cotironda_piloto_apply_clarification_mvp100(
 p_chat_hmac text,p_reply_hmac text,p_city text,p_changes jsonb
) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare buyer text; original text; found_n integer;
 change_ record; item record; canonical_unit text; new_family text;
 changed integer:=0; city_added boolean:=false; city_old text;
begin
 if p_chat_hmac !~ '^[a-f0-9]{64}$' or
    p_reply_hmac !~ '^[a-f0-9]{64}$' or
    p_changes is null or jsonb_typeof(p_changes)<>'array' or
    jsonb_array_length(p_changes)>25 or
    (jsonb_array_length(p_changes)=0 and p_city is null)
 then return jsonb_build_object('state','invalid');end if;
 select p.key into buyer from cotironda_piloto_privado.whapi_inbox i
 join cotironda_piloto_privado.participants p on
  p.key=i.participant_key and p.chat_hmac=i.chat_hmac
 where i.chat_hmac=p_chat_hmac and i.message_hmac=p_reply_hmac
  and i.kind='text' and i.processing_state in('needs_review','needs_zone')
  and i.received_at>clock_timestamp()-interval '15 minutes'
  and p.participant_role='buyer' and p.consent_at is not null
  and p.opted_out_at is null
 for update of p;
 if buyer is null then return jsonb_build_object('state','not_permitted');end if;
 select count(*),min(a.message_hmac) into found_n,original
 from cotironda_piloto_privado.media_archive_mvp095 a
 join cotironda_piloto_privado.document_agreements_mvp099 g on
  g.message_hmac=a.message_hmac and g.source_sha256=a.content_sha256
 where a.participant_key=buyer and a.chat_hmac=p_chat_hmac
  and a.state='stored' and a.request_id is null
  and a.reserved_at>clock_timestamp()-interval '7 days'
  and exists(select 1 from cotironda_piloto_privado.ai_replies_mvp094 r
   where r.message_hmac=a.message_hmac and r.chat_hmac=a.chat_hmac
    and r.reply_code='zone' and r.state='api_accepted');
 if found_n<>1 then return jsonb_build_object('state',case when found_n=0
  then 'no_pending_document' else 'ambiguous_pending_documents' end);end if;
 -- Lock the unique document row and review every proposed update before
 -- applying ANY changes: no partial city or line mutation on bad input.
 select coalesce(a.delivery_city_confirmed,a.proposal->>'delivery_city')
  into city_old from cotironda_piloto_privado.media_archive_mvp095 a
 where a.message_hmac=original for update;
 if p_city is not null and (
    length(btrim(p_city)) not between 3 and 80 or
    p_city !~ '^[[:alpha:][:space:]()'',.-]+$' or
    (city_old is not null and lower(btrim(city_old))<>lower(btrim(p_city))))
 then return jsonb_build_object('state','invalid_or_conflicting_city');end if;
 if (select count(distinct (v.value->>'line_no')) from
  jsonb_array_elements(p_changes) v)<>jsonb_array_length(p_changes)
 then return jsonb_build_object('state','duplicate_line');end if;
 for change_ in select v.value as obj from jsonb_array_elements(p_changes) v loop
  if jsonb_typeof(change_.obj)<>'object' or
     (change_.obj->>'line_no') !~ '^([1-9]|1[0-9]|2[0-5])$'
  then return jsonb_build_object('state','invalid_line');end if;
  select l.* into item from cotironda_piloto_privado.document_lines_mvp098 l
  where l.message_hmac=original and
    l.line_no=(change_.obj->>'line_no')::smallint
  for update;
  if not found then return jsonb_build_object('state','unrelated_line');end if;
  canonical_unit:=nullif(change_.obj->>'unit','');
  new_family:=nullif(change_.obj->>'family_hint','');
  if canonical_unit is not null and (
      canonical_unit not in ('bag','unit','kg','l','m3','m2','m','g','box','roll','pack')
      or cotironda_piloto_privado.unit_code_mvp099(item.unit_literal) is not null)
  then return jsonb_build_object('state','unit_not_missing');end if;
  if new_family is not null and (
      item.classified_family is not null or
      lower(btrim(item.description_literal))<>'arena' or
      new_family not in ('arena_fina','arena_gruesa'))
  then return jsonb_build_object('state','family_not_ambiguous');end if;
  if canonical_unit is null and new_family is null
  then return jsonb_build_object('state','empty_change');end if;
  if exists(select 1 from cotironda_piloto_privado.clarified_lines_mvp100 c
     where c.source_hmac=original and c.line_no=item.line_no
      and ((canonical_unit is not null and c.unit_code is not null)
        or (new_family is not null and c.family_code is not null)))
  then return jsonb_build_object('state','already_clarified');end if;
 end loop;
 for change_ in select v.value as obj from jsonb_array_elements(p_changes) v loop
  canonical_unit:=nullif(change_.obj->>'unit','');
  new_family:=nullif(change_.obj->>'family_hint','');
  insert into cotironda_piloto_privado.clarified_lines_mvp100(
   source_hmac,line_no,reply_hmac,unit_code,family_code)
  values(original,(change_.obj->>'line_no')::smallint,p_reply_hmac,
    canonical_unit,new_family);
  update cotironda_piloto_privado.document_lines_mvp098 l
   set unit_literal=coalesce(canonical_unit,l.unit_literal),
       classified_family=coalesce(new_family,l.classified_family),
       blocker=case
         when coalesce(canonical_unit,l.unit_literal) is null then 'missing_unit'
         when coalesce(new_family,l.classified_family) is null then 'ambiguous_family'
         else 'needs_source_verification' end
   where l.message_hmac=original and
     l.line_no=(change_.obj->>'line_no')::smallint;
  changed:=changed+1;
 end loop;
 if p_city is not null and city_old is null then
  update cotironda_piloto_privado.media_archive_mvp095
    set delivery_city_confirmed=btrim(p_city),
      delivery_zone_source_hmac=p_reply_hmac
   where message_hmac=original and delivery_city_confirmed is null;
  city_added:=true;
 end if;
 return jsonb_build_object('state','applied','source_message_hmac',original,
  'lines',changed,'city_added',city_added);
end;$fn$;
