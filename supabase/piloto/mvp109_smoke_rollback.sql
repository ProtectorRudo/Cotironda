-- MVP-109: authenticated one-time commands and encrypted addresses
-- for a private closed-round plan. No plaintext contacts or Whapi sends.
begin;
do $test$
declare p record;h text;buyer_source text;rid uuid;cutoff timestamptz;
 result jsonb;consent_hash text;revoke_hash text;before_offers bigint;
begin
 consent_hash:=encode(extensions.digest('COTI CONTACTOS SI','sha256'),'hex');
 revoke_hash:=encode(extensions.digest('COTI CONTACTOS NO','sha256'),'hex');
 select count(*) into before_offers
  from cotironda_piloto_privado.offer_versions;
 cutoff:=clock_timestamp()-interval '2 seconds';
 buyer_source:=encode(extensions.gen_random_bytes(32),'hex');
 insert into cotironda_piloto_privado.requests(
  buyer_key,delivery_city,original_request,source_hmac,
  state,created_at,closes_at,closed_at)
 values('arquitecto','La Plata','Cemento CPC 50 kg, 20 bolsas sintéticas',
  buyer_source,'closed',cutoff-interval '4 days',cutoff,clock_timestamp())
 returning id into rid;
 insert into cotironda_piloto_privado.finalist_coverage_plans_mvp108(
  request_id,state,candidate_count,supplier_keys)
 values(rid,'two_complete_alternatives',2,
  ARRAY['corralon_ailin','corralon_nahuel']);
 result:=public.cotironda_piloto_finalist_contacts_mvp109(rid);
 if result->>'state'<>'consent_or_contact_missing' then
  raise exception 'mvp109_unconsented_contact_available %',result;end if;
 for p in select key,chat_hmac from cotironda_piloto_privado.participants
  where key in('arquitecto','corralon_ailin','corralon_nahuel')
  and consent_at is not null and opted_out_at is null
 loop
  h:=encode(extensions.gen_random_bytes(32),'hex');
  result:=public.cotironda_piloto_contact_command_mvp109(
   h,p.chat_hmac,'approve',
   'AAAAAAAAAAAAAAAA','AAAAAAAAAAAAAAAAAAAAAAAA',consent_hash,
   extract(epoch from clock_timestamp())::bigint,
   encode(extensions.gen_random_bytes(32),'hex'),
   'AAAAAAAAAAAAAAAA','AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
  if result->>'state'<>'consented' then
   raise exception 'mvp109_valid_consent_refused % %',p.key,result;end if;
  if (public.cotironda_piloto_contact_command_mvp109(
   h,p.chat_hmac,'approve',
   'AAAAAAAAAAAAAAAA','AAAAAAAAAAAAAAAAAAAAAAAA',consent_hash,
   extract(epoch from clock_timestamp())::bigint,
   encode(extensions.gen_random_bytes(32),'hex'),
   'AAAAAAAAAAAAAAAA','AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'))
      ->>'state'<>'duplicate'
  then raise exception 'mvp109_consent_command_replayed';end if;
  if (public.cotironda_piloto_bind_contact_mvp109(
   h,p.chat_hmac,repeat('b',64),
   'AAAAAAAAAAAAAAAA','AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'))
      ->>'state'<>'identity_conflict'
  then raise exception 'mvp109_contact_identity_mutable';end if;
 end loop;
 result:=public.cotironda_piloto_finalist_contacts_mvp109(rid);
 if result->>'state'<>'ready_private'
  or (result->>'count')::integer<>3
  or jsonb_array_length(result->'contacts_encrypted')<>3
  or result->>'messages_sent'<>'false'
 then raise exception 'mvp109_private_contacts_unavailable %',result;end if;
 if result::text ~ '(549[0-9]{8,}|@s[.]whatsapp[.]net)'
 then raise exception 'mvp109_plaintext_leaked';end if;
 h:=encode(extensions.gen_random_bytes(32),'hex');
 result:=public.cotironda_piloto_contact_command_mvp109(
   h,(select chat_hmac from cotironda_piloto_privado.participants
       where key='corralon_nahuel'),
   'revoke',
   'AAAAAAAAAAAAAAAA','AAAAAAAAAAAAAAAAAAAAAAAA',revoke_hash,
   extract(epoch from clock_timestamp())::bigint,
   encode(extensions.gen_random_bytes(32),'hex'),
   'AAAAAAAAAAAAAAAA','AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
 if result->>'state'<>'revoked' then
  raise exception 'mvp109_revocation_refused %',result;end if;
 if (public.cotironda_piloto_finalist_contacts_mvp109(rid))
   ->>'state'<>'consent_or_contact_missing' then
  raise exception 'mvp109_revocation_not_effective';end if;
 if has_table_privilege('anon',
  'cotironda_piloto_privado.participant_channels_mvp109','SELECT')
 or has_table_privilege('authenticated',
  'cotironda_piloto_privado.contact_reveal_consents_mvp109','SELECT')
 or has_function_privilege('anon',
  'public.cotironda_piloto_finalist_contacts_mvp109(uuid)','EXECUTE')
 then raise exception 'mvp109_exposed_contact';end if;
 if (select count(*) from cotironda_piloto_privado.offer_versions)
  <>before_offers then raise exception 'mvp109_consent_was_quote';end if;
end;$test$;
rollback;