-- MVP-110: close notices queued exactly once after consent and source validation
-- for a private closed-round plan. No plaintext contacts or Whapi sends.
begin;
do $test$
declare p record;h text;buyer_source text;rid uuid;cutoff timestamptz;
 result jsonb;consent_hash text;revoke_hash text;before_offers bigint;
 track_token text;
 claim jsonb; permission jsonb;reserved_count integer;
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
 track_token:=encode(extensions.gen_random_bytes(32),'hex');
 insert into cotironda_piloto_privado.buyer_tracking_mvp091(
   request_id,token_hash,expires_at)
 values(rid,track_token,clock_timestamp()+interval '10 days');
 if (public.cotironda_piloto_tracking_finalists_mvp110(track_token))
   ->>'state'<>'not_ready'
 then raise exception 'mvp110_premature_portal_contact_release';end if;
 result:=public.cotironda_piloto_queue_finalists_mvp110(rid);
 if result->>'state'<>'consent_or_contact_missing' then
  raise exception 'mvp110_no_consent_queued';end if;
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
   'AAAAAAAAAAAAAAAA','AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',consent_hash,
   extract(epoch from clock_timestamp())::bigint,
   encode(extensions.gen_random_bytes(32),'hex'),
   'AAAAAAAAAAAAAAAA','AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
  if result->>'state'<>'consented' then
   raise exception 'mvp109_valid_consent_refused % %',p.key,result;end if;
  if (public.cotironda_piloto_contact_command_mvp109(
   h,p.chat_hmac,'approve',
   'AAAAAAAAAAAAAAAA','AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',consent_hash,
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

 result:=public.cotironda_piloto_tracking_finalists_mvp110(track_token);
 if result->>'state'<>'ready_private' or
  jsonb_array_length(result->'contacts_encrypted')<>3 or
  result->>'price_ranked'<>'false'
 then raise exception 'mvp110_portal_reveal_not_authorized %',result;end if;
 if (public.cotironda_piloto_tracking_finalists_mvp110(
   encode(extensions.gen_random_bytes(32),'hex')))->>'state'<>'not_ready'
 then raise exception 'mvp110_wrong_token_access_to_contacts';end if;
 -- Full consent received: create exactly three recipient records.
 result:=public.cotironda_piloto_queue_finalists_mvp110(rid);
 if result->>'state'<>'queued' or
   (result->>'created')::integer<>3 or
   (result->>'total_recipients')::integer<>3 or
   result->>'messages_sent'<>'false'
 then raise exception 'mvp110_3_messages_not_queued %',result;end if;
 result:=public.cotironda_piloto_queue_finalists_mvp110(rid);
 if result->>'state'<>'queued' or
   (result->>'created')::integer<>0
 then raise exception 'mvp110_duplicate_queue %',result;end if;
 select count(*) into reserved_count from
  cotironda_piloto_privado.finalist_whapi_outbox_mvp110
  where request_id=rid;
 if reserved_count<>3 then raise exception 'mvp110_wrong_count';end if;
 -- Worker obtains one lease. It needs a separate last-moment authorization.
 claim:=public.cotironda_piloto_claim_finalist_whapi_mvp110();
 if claim->>'state'<>'leased' or claim->>'request_id'<>rid::text then
  raise exception 'mvp110_claim_failed %',claim;end if;
 if (public.cotironda_piloto_authorize_finalist_whapi_mvp110(
   rid,claim->>'recipient_key',extensions.gen_random_uuid()))
    ->>'state'<>'not_permitted'
 then raise exception 'mvp110_wrong_lease_authorized';end if;
 permission:=public.cotironda_piloto_authorize_finalist_whapi_mvp110(
  rid,claim->>'recipient_key',(claim->>'lease_token')::uuid);
 if permission->>'state'<>'authorized' or
    permission->>'price_ranked'<>'false' or
    jsonb_array_length(permission->'contacts_encrypted')<>3
 then raise exception 'mvp110_authorization_wrong %',permission;end if;
 if permission::text ~ '(549[0-9]{8,}|@s[.]whatsapp[.]net)'
 then raise exception 'mvp110_plaintext_leaked';end if;
 if not public.cotironda_piloto_finish_finalist_whapi_mvp110(
  rid,claim->>'recipient_key',(claim->>'lease_token')::uuid,
  'api_accepted','fake-test-message')
 then raise exception 'mvp110_finish_failed';end if;
 if public.cotironda_piloto_finish_finalist_whapi_mvp110(
  rid,claim->>'recipient_key',(claim->>'lease_token')::uuid,
  'api_accepted','fake-test-message')
 then raise exception 'mvp110_double_finish';end if;
 if (public.cotironda_piloto_authorize_finalist_whapi_mvp110(
   rid,claim->>'recipient_key',(claim->>'lease_token')::uuid))
     ->>'state'<>'not_permitted'
 then raise exception 'mvp110_completed_lease_reauthorized';end if;

 h:=encode(extensions.gen_random_bytes(32),'hex');
 result:=public.cotironda_piloto_contact_command_mvp109(
   h,(select chat_hmac from cotironda_piloto_privado.participants
       where key='corralon_nahuel'),
   'revoke',
   'AAAAAAAAAAAAAAAA','AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',revoke_hash,
   extract(epoch from clock_timestamp())::bigint,
   (select contact_sha256 from cotironda_piloto_privado.participant_channels_mvp109 where participant_key='corralon_nahuel'),
   'AAAAAAAAAAAAAAAA','AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
 if result->>'state'<>'revoked' then
  raise exception 'mvp109_revocation_refused %',result;end if;
 if (public.cotironda_piloto_finalist_contacts_mvp109(rid))
   ->>'state'<>'consent_or_contact_missing' then
  raise exception 'mvp109_revocation_not_effective';end if;
 if (public.cotironda_piloto_tracking_finalists_mvp110(track_token))
   ->>'state'<>'not_ready'
 then raise exception 'mvp110_revoked_contact_visible_in_portal';end if;
 -- A revocation after queue blocks EVERY pending notification, even for
 -- another participant who personally still consents.
 claim:=public.cotironda_piloto_claim_finalist_whapi_mvp110();
 if claim->>'state'='leased' then
   permission:=public.cotironda_piloto_authorize_finalist_whapi_mvp110(
     rid,claim->>'recipient_key',(claim->>'lease_token')::uuid);
   if permission->>'state'<>'consent_or_contact_missing'
   then raise exception 'mvp110_revoked_contact_was_authorized';end if;
   if not public.cotironda_piloto_finish_finalist_whapi_mvp110(
      rid,claim->>'recipient_key',(claim->>'lease_token')::uuid,'uncertain',null)
   then raise exception 'mvp110_revoked_lease_not_closed';end if;
 end if;
 if has_table_privilege('anon',
   'cotironda_piloto_privado.finalist_whapi_outbox_mvp110','SELECT')
  or has_table_privilege('authenticated',
   'cotironda_piloto_privado.finalist_whapi_outbox_mvp110','SELECT')
  or has_function_privilege('anon',
   'public.cotironda_piloto_claim_finalist_whapi_mvp110()','EXECUTE')
 then raise exception 'mvp110_public_outbox_leak';end if;
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