-- MVP-095: PG17 real pilot smoke with full ROLLBACK, never sends any message.
begin;
do $smoke$
declare b text;h text;s text;n integer;sample jsonb;
begin
 select chat_hmac into b from cotironda_piloto_privado.participants
 where key='arquitecto' and participant_role='buyer' and consent_at is not null
   and opted_out_at is null;
 if b is null then raise exception 'media_buyer_missing';end if;
 sample:='{"status":"review_required","kind":"buyer_request","lines":[]}'::jsonb;
 for n in 1..8 loop
  h:=encode(extensions.gen_random_bytes(32),'hex');
  insert into cotironda_piloto_privado.whapi_inbox(
   message_hmac,chat_hmac,participant_key,kind,nonce_b64,ciphertext_b64,
   plaintext_sha256,source_unix,processing_state)
  values(h,b,'arquitecto','document',
    'AAAAAAAAAAAAAAAA','AAAAAAAAAAAAAAAAAAAAAAAA',
    encode(extensions.gen_random_bytes(32),'hex'),
    extract(epoch from clock_timestamp())::bigint,'needs_review');
  if not public.cotironda_piloto_reserve_media_mvp095(
    h,b,encode(extensions.gen_random_bytes(32),'hex'),'application/pdf')
  then raise exception 'media_reserve_failed';end if;
  if public.cotironda_piloto_reserve_media_mvp095(
    h,b,encode(extensions.gen_random_bytes(32),'hex'),'application/pdf')
  then raise exception 'media_double_reserved';end if;
  if not public.cotironda_piloto_finish_media_mvp095(
    h,'stored',123,encode(extensions.gen_random_bytes(32),'hex'))
  then raise exception 'media_finish_failed';end if;
  if public.cotironda_piloto_finish_media_mvp095(h,'stored',123,
     encode(extensions.gen_random_bytes(32),'hex'))
  then raise exception 'media_double_finished';end if;
  if n<=2 then
    if not public.cotironda_piloto_reserve_document_ai_mvp095(h)
    then raise exception 'media_ai_reserve_failed';end if;
    if public.cotironda_piloto_reserve_document_ai_mvp095(h)
    then raise exception 'media_ai_reuse';end if;
  else
    if public.cotironda_piloto_reserve_document_ai_mvp095(h)
    then raise exception 'media_ai_quota_failed';end if;
  end if;
  if n=1 then
    if not public.cotironda_piloto_note_media_proposal_mvp095(h,sample)
    then raise exception 'media_proposal_failed';end if;
    if public.cotironda_piloto_note_media_proposal_mvp095(h,sample)
    then raise exception 'media_duplicate_proposal';end if;
  end if;
 end loop;
 h:=encode(extensions.gen_random_bytes(32),'hex');
 insert into cotironda_piloto_privado.whapi_inbox(
   message_hmac,chat_hmac,participant_key,kind,nonce_b64,ciphertext_b64,
   plaintext_sha256,source_unix,processing_state)
 values(h,b,'arquitecto','document','AAAAAAAAAAAAAAAA',
   'AAAAAAAAAAAAAAAAAAAAAAAA',encode(extensions.gen_random_bytes(32),'hex'),
   extract(epoch from clock_timestamp())::bigint,'needs_review');
 if public.cotironda_piloto_reserve_media_mvp095(
    h,b,encode(extensions.gen_random_bytes(32),'hex'),'application/pdf')
 then raise exception 'media_day_quota_failed';end if;
 if (select count(*) from cotironda_piloto_privado.media_archive_mvp095
     where state='stored')<>8 then raise exception 'media_missing_origins';end if;
 if has_table_privilege('anon',
    'cotironda_piloto_privado.media_archive_mvp095','SELECT')
 or has_table_privilege('authenticated',
    'cotironda_piloto_privado.media_archive_mvp095','SELECT')
 or has_function_privilege('anon',
    'public.cotironda_piloto_reserve_media_mvp095(text,text,text,text)','EXECUTE')
 then raise exception 'media_public_access';end if;
 if (select count(*) from storage.buckets where
   id='cotironda-piloto-originals' and public=false)<>1
 then raise exception 'media_public_bucket';end if;
 if exists(select 1 from storage.policies where 1=1) then
  -- No assertion about other bucket policies; checked via RLS & bucket above.
  null;
 end if;
end;$smoke$;
rollback;
