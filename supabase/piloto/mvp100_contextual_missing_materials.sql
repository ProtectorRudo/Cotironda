-- MVP-100 PILOT: zero extra customer confirmations, single contextual WhatsApp
-- request for essential missing specs. Never changes the immutable original
-- or model proposal. All responses are bound to an authenticated buyer.
create table cotironda_piloto_privado.clarified_lines_mvp100(
 source_hmac text not null,
 line_no smallint not null,
 reply_hmac text not null references cotironda_piloto_privado.whapi_inbox(message_hmac),
 unit_code text,
 family_code text,
 created_at timestamptz not null default clock_timestamp(),
 primary key(source_hmac,line_no,reply_hmac),
 foreign key(source_hmac,line_no)
  references cotironda_piloto_privado.document_lines_mvp098(message_hmac,line_no),
 check(unit_code is not null or family_code is not null),
 check(unit_code is null or unit_code in
 ('bag','unit','kg','l','m3','m2','m','g','box','roll','pack')),
 check(family_code is null or family_code in('arena_fina','arena_gruesa'))
);
alter table cotironda_piloto_privado.clarified_lines_mvp100 enable row level security;
revoke all on cotironda_piloto_privado.clarified_lines_mvp100
 from public,anon,authenticated,service_role;

-- One approved message per already-agreed archived document.
-- The text is generated from a private source line list, never model prose.
create function public.cotironda_piloto_clarification_preview_mvp100(
 p_message_hmac text
) returns jsonb language plpgsql stable security definer set search_path='' as $fn$
declare a record; body text; needs text; city text; n integer; l record;
begin
 if p_message_hmac !~ '^[a-f0-9]{64}$' then
  return jsonb_build_object('state','invalid');end if;
 select a.message_hmac,a.participant_key,a.delivery_city_confirmed,
   a.proposal
 into a from cotironda_piloto_privado.media_archive_mvp095 a
 join cotironda_piloto_privado.document_agreements_mvp099 g on
  g.message_hmac=a.message_hmac and g.source_sha256=a.content_sha256
 join cotironda_piloto_privado.participants p on
  p.key=a.participant_key and p.chat_hmac=a.chat_hmac
 where a.message_hmac=p_message_hmac and a.request_id is null
  and a.state='stored' and a.review_state='suggested_only'
  and p.participant_role='buyer' and p.consent_at is not null
  and p.opted_out_at is null;
 if not found then return jsonb_build_object('state','not_ready');end if;
 city:=coalesce(a.delivery_city_confirmed,a.proposal->>'delivery_city');
 body:='Cotironda recibió tu lista. Para pedir precios necesito estos datos:'||E'\n';
 n:=0;
 for l in select l.line_no,l.description_literal,l.unit_literal,
  l.classified_family
  from cotironda_piloto_privado.document_lines_mvp098 l
  where l.message_hmac=p_message_hmac order by l.line_no
 loop
  needs:='';
  if cotironda_piloto_privado.unit_code_mvp099(l.unit_literal) is null
   then needs:='unidad';end if;
  if l.classified_family is null
   then needs:=case when needs='' then 'tipo de producto'
     else needs||' y tipo de producto' end;end if;
  if needs<>'' then
   body:=body||l.line_no||'. '||l.description_literal||': '||needs||E'\n';
   n:=n+1;
  end if;
 end loop;
 if city is null or length(btrim(city))<3 then
  body:=body||'Localidad de entrega'||E'\n';n:=n+1;end if;
 if n=0 then return jsonb_build_object('state','complete');end if;
 body:=body||'Respondé por número, por ejemplo: 1 bolsas; 2 m3 gruesa; 3 unidades; entrega: La Plata.';
 if length(body)>1300 then return jsonb_build_object('state','too_long');end if;
 return jsonb_build_object('state','needs_details','body',body);
end;$fn$;
revoke all on function public.cotironda_piloto_clarification_preview_mvp100(text)
 from public,anon,authenticated;
grant execute on function public.cotironda_piloto_clarification_preview_mvp100(text)
 to service_role;

-- Private gate: one consented buyer, one successfully archived and
-- independently agreed document, one outbound reply code/HMAC.
create function public.cotironda_piloto_reserve_clarification_mvp100(
 p_chat_hmac text,p_message_hmac text
) returns boolean language plpgsql security definer set search_path='' as $fn$
declare n integer; preview jsonb;
begin
 if p_chat_hmac !~ '^[a-f0-9]{64}$' or
    p_message_hmac !~ '^[a-f0-9]{64}$' then return false;end if;
 if not exists(select 1 from cotironda_piloto_privado.integration_flags f
   where f.only_row and f.whatsapp_inbound_enabled and
   f.whatsapp_outbound_enabled) then return false;end if;
 if not exists(select 1 from cotironda_piloto_privado.media_archive_mvp095 a
  join cotironda_piloto_privado.participants p on
   p.key=a.participant_key and p.chat_hmac=a.chat_hmac
  where a.message_hmac=p_message_hmac and a.chat_hmac=p_chat_hmac
    and a.state='stored' and a.request_id is null
    and a.reserved_at>clock_timestamp()-interval '10 minutes'
    and p.participant_role='buyer' and p.consent_at is not null
    and p.opted_out_at is null) then return false;end if;
 preview:=public.cotironda_piloto_clarification_preview_mvp100(p_message_hmac);
 if preview->>'state'<>'needs_details' then return false;end if;
 perform 1 from cotironda_piloto_privado.participants
 where chat_hmac=p_chat_hmac and participant_role='buyer' for update;
 select count(*) into n from cotironda_piloto_privado.ai_replies_mvp094
 where chat_hmac=p_chat_hmac and created_at>=clock_timestamp()-interval '24 hours';
 if n>=(select max_replies_per_24h from
  cotironda_piloto_privado.operational_caps_mvp097 where only_row)
 then return false;end if;
 insert into cotironda_piloto_privado.ai_replies_mvp094(
   message_hmac,chat_hmac,reply_code)
 values(p_message_hmac,p_chat_hmac,'zone')
 on conflict do nothing;
 get diagnostics n=row_count;
 return n=1;
end;$fn$;
revoke all on function public.cotironda_piloto_reserve_clarification_mvp100(text,text)
 from public,anon,authenticated;
grant execute on function public.cotironda_piloto_reserve_clarification_mvp100(text,text)
 to service_role;

-- Atomically attach only missing human-supplied specs. The original and
-- proposal remain byte-for-byte unchanged; reply HMAC proves provenance.
create function public.cotironda_piloto_apply_clarification_mvp100(
 p_chat_hmac text,p_reply_hmac text,p_city text,p_changes jsonb
) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare buyer text; original text; found_n integer;
 change_ record; item record; canonical_unit text; new_family text;
 changed integer:=0; city_added boolean:=false; city_old text;
begin
 if p_chat_hmac !~ '^[a-f0-9]{64}$' or
    p_reply_hmac !~ '^[a-f0-9]{64}$' or
    p_changes is null or jsonb_typeof(p_changes)<>'array' or
    jsonb_array_length(p_changes)>8 or
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
     (change_.obj->>'line_no') !~ '^[1-8]$'
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
revoke all on function public.cotironda_piloto_apply_clarification_mvp100(
 text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.cotironda_piloto_apply_clarification_mvp100(
 text,text,text,jsonb) to service_role;
