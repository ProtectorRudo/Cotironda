-- MVP099b: promote ONLY a strict dual reading of a private original.
-- "agreement" is not a mathematical proof of OCR fidelity; never overwrite
-- the original and never add a missing item/quantity/unit by assumption.
create table cotironda_piloto_privado.document_agreements_mvp099(
 message_hmac text primary key references cotironda_piloto_privado.media_archive_mvp095(message_hmac),
 source_sha256 text not null check(source_sha256 ~ '^[a-f0-9]{64}$'),
 line_count smallint not null check(line_count between 1 and 8),
 agreed_at timestamptz not null default clock_timestamp()
);
alter table cotironda_piloto_privado.document_agreements_mvp099 enable row level security;
revoke all on cotironda_piloto_privado.document_agreements_mvp099
 from public,anon,authenticated,service_role;

create function cotironda_piloto_privado.unit_code_mvp099(p_literal text)
returns text language sql immutable set search_path='' as $fn$
 select case lower(btrim(p_literal))
 when 'bolsa' then 'bag' when 'bolsas' then 'bag'
 when 'bag' then 'bag'
 when 'unidad' then 'unit' when 'unidades' then 'unit'
 when 'u' then 'unit' when 'unit' then 'unit'
 when 'kg' then 'kg' when 'kilogramos' then 'kg'
 when 'litro' then 'l' when 'litros' then 'l'
 when 'l' then 'l' when 'lts' then 'l'
 when 'm3' then 'm3' when 'm³' then 'm3'
 when 'metros cúbicos' then 'm3'
 when 'm' then 'm' when 'metros' then 'm'
 when 'm2' then 'm2' when 'm²' then 'm2'
 when 'caja' then 'box' when 'cajas' then 'box'
 when 'rollo' then 'roll' when 'rollos' then 'roll'
 when 'paquete' then 'pack' when 'paquetes' then 'pack'
 else null end;
$fn$;
revoke all on function cotironda_piloto_privado.unit_code_mvp099(text)
 from public,anon,authenticated,service_role;

-- Do not accept a second model result just because it's a valid JSON.
-- All rows, quantities, units, descriptions, and source quotes must agree.
-- This is a strict independent MODEL agreement, not a source-level guarantee.
create function public.cotironda_piloto_record_agreement_mvp099(
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
 if total not between 1 and 8 or jsonb_array_length(
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
revoke all on function public.cotironda_piloto_record_agreement_mvp099(text,jsonb)
 from public,anon,authenticated;
grant execute on function public.cotironda_piloto_record_agreement_mvp099(text,jsonb)
 to service_role;

-- Promote verified document into real request and supplier-specific
-- invitation subsets. All items are kept; no unsupported/ambiguous lines
-- may silently be discarded. No individual buyer confirmation needed.
create function public.cotironda_piloto_prepare_document_mvp099(p_message_hmac text)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare a record; line_ record; city text; v_request uuid; n int;
        item_count int:=0; eligible_count int:=0; u text;
        transcription text;
begin
 if p_message_hmac !~ '^[a-f0-9]{64}$' then
  return jsonb_build_object('state','invalid_hmac');end if;
 select m.message_hmac,m.participant_key,m.chat_hmac,
  m.content_sha256,m.proposal,m.delivery_city_confirmed,agr.line_count
 into a from cotironda_piloto_privado.media_archive_mvp095 m
 join cotironda_piloto_privado.document_agreements_mvp099 agr on
  agr.message_hmac=m.message_hmac and agr.source_sha256=m.content_sha256
 join cotironda_piloto_privado.participants p on p.key=m.participant_key
  and p.chat_hmac=m.chat_hmac
 where m.message_hmac=p_message_hmac and m.state='stored'
  and m.review_state='suggested_only' and m.request_id is null
  and m.proposal->>'kind'='buyer_request'
  and p.key='arquitecto' and p.participant_role='buyer'
  and p.consent_at is not null and p.opted_out_at is null
 for update of m;
 if not found then
  return jsonb_build_object('state','not_agreed_or_already_created');end if;
 city:=coalesce(a.delivery_city_confirmed,a.proposal->>'delivery_city');
 if city is null or btrim(city)<> 'La Plata' then
  return jsonb_build_object('state','needs_serviceable_delivery_city');end if;
 if (select count(*) from cotironda_piloto_privado.document_lines_mvp098
   where message_hmac=p_message_hmac)<>a.line_count then
  return jsonb_build_object('state','missing_source_lines');end if;
 -- Every line must be numeric, explicitly unitized and family-mapped.
 for line_ in
  select l.* from cotironda_piloto_privado.document_lines_mvp098 l
  where l.message_hmac=p_message_hmac order by l.line_no
 loop
  u:=cotironda_piloto_privado.unit_code_mvp099(line_.unit_literal);
  if u is null or line_.classified_family is null
   or line_.quantity_literal is null
   or line_.quantity_literal !~ '^[0-9]{1,6}([.,][0-9]{1,3})?$'
   or replace(line_.quantity_literal,',','.')::numeric not between 0.001 and 1000000
   or length(line_.description_literal) not between 3 and 75
  then return jsonb_build_object('state','needs_material_specification',
     'line_no',line_.line_no);end if;
  item_count:=item_count+1;
 end loop;
 if item_count<>a.line_count then
  return jsonb_build_object('state','line_count_mismatch');end if;
 -- Exact supplier eligibility derives from declared curated family + city,
 -- consent and identity. No assertion of stock or confirmed prices.
 select count(distinct p.key) into eligible_count
 from cotironda_piloto_privado.participants p
 where p.key in('corralon_ailin','corralon_nahuel')
  and p.participant_role='supplier' and p.delivery_city=city
  and p.chat_hmac is not null and p.consent_at is not null
  and p.opted_out_at is null
  and exists(select 1 from cotironda_piloto_privado.document_lines_mvp098 l
   join cotironda_piloto_privado.catalogue_lines c
    on c.family_code=l.classified_family
    and c.participant_key=p.key and c.recognition_state='curated_family'
   where l.message_hmac=p_message_hmac);
 if eligible_count=0 then return jsonb_build_object(
   'state','no_matching_suppliers');end if;
 -- No plaintext media or contact data is placed in this transcription:
 -- immutable original byte-for-byte is referenced by SHA256+message_hmac.
 select 'Documento privado archivado (SHA256 '||a.content_sha256||')'||
   E'\nTranscripción estructurada revisada por doble lectura:'||E'\n'||
   string_agg(l.quantity_literal||' '||l.unit_literal||' · '||
    l.description_literal,E'\n' order by l.line_no)
 into transcription from cotironda_piloto_privado.document_lines_mvp098 l
 where l.message_hmac=p_message_hmac;
 insert into cotironda_piloto_privado.requests(
    buyer_key,delivery_city,original_request,source_hmac,state,
    requested_delivery_note)
 values(a.participant_key,city,transcription,p_message_hmac,'prepared',
   nullif(btrim(left(coalesce(a.proposal->>'requested_delivery_note',''),90)),''))
 returning id into v_request;
 insert into cotironda_piloto_privado.request_lines(
   request_id,line_no,original_description,quantity,unit,family_code)
 select v_request,l.line_no,l.description_literal,
  replace(l.quantity_literal,',','.')::numeric,
  cotironda_piloto_privado.unit_code_mvp099(l.unit_literal),
  l.classified_family
 from cotironda_piloto_privado.document_lines_mvp098 l
 where l.message_hmac=p_message_hmac order by l.line_no;
 insert into cotironda_piloto_privado.document_sources_mvp099(
  request_id,message_hmac,content_sha256,verified_method)
 values(v_request,p_message_hmac,a.content_sha256,'dual_ai_exact_lines');
 insert into cotironda_piloto_privado.invitations(request_id,supplier_key)
 select v_request,p.key from cotironda_piloto_privado.participants p
 where p.key in('corralon_ailin','corralon_nahuel')
  and p.participant_role='supplier' and p.delivery_city=city
  and p.chat_hmac is not null and p.consent_at is not null
  and p.opted_out_at is null
  and exists(select 1 from cotironda_piloto_privado.request_lines l
   join cotironda_piloto_privado.catalogue_lines c on
     c.family_code=l.family_code and c.participant_key=p.key
     and c.recognition_state='curated_family'
   where l.request_id=v_request);
 get diagnostics n=row_count;
 if n<>eligible_count then
  raise exception 'mvp099_supplier_count_changed' using errcode='23514';end if;
 update cotironda_piloto_privado.media_archive_mvp095
 set request_id=v_request where message_hmac=p_message_hmac;
 return jsonb_build_object('state','prepared','request_id',v_request,
  'all_lines',item_count,'supplier_invites',n);
end;$fn$;
revoke all on function public.cotironda_piloto_prepare_document_mvp099(text)
 from public,anon,authenticated;
grant execute on function public.cotironda_piloto_prepare_document_mvp099(text)
 to service_role;
