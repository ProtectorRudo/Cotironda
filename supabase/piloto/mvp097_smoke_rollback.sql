-- MVP097 test all effects with ROLLBACK. Never sends to Whapi/OpenAI.
begin;
do $test$
declare chat text;hm text;city_msg text;n integer; proposal jsonb;
begin
 if (select max_media_per_24h from cotironda_piloto_privado.operational_caps_mvp097 where only_row)<>500
 or (select max_document_ai_per_24h from cotironda_piloto_privado.operational_caps_mvp097 where only_row)<>100
 or (select max_text_ai_per_24h from cotironda_piloto_privado.operational_caps_mvp097 where only_row)<>200
 or (select max_replies_per_24h from cotironda_piloto_privado.operational_caps_mvp097 where only_row)<>100
 then raise exception 'mvp097_config_wrong';end if;
 if has_table_privilege('anon','cotironda_piloto_privado.operational_caps_mvp097','SELECT')
 or has_table_privilege('authenticated','cotironda_piloto_privado.operational_caps_mvp097','UPDATE')
 or has_function_privilege('anon',
   'public.cotironda_piloto_attach_zone_to_document_mvp097(text,text,text)','EXECUTE')
 or has_function_privilege('authenticated',
   'public.cotironda_piloto_reserve_document_zone_reply_mvp097(text,text)','EXECUTE')
 then raise exception 'mvp097_exposes_private_ledger';end if;

 select chat_hmac into chat from cotironda_piloto_privado.participants where key='arquitecto';
 if chat is null then raise exception 'mvp097_buyer_missing';end if;
 hm:=encode(extensions.gen_random_bytes(32),'hex');
 insert into cotironda_piloto_privado.whapi_inbox(
  message_hmac,chat_hmac,participant_key,kind,nonce_b64,ciphertext_b64,
  plaintext_sha256,source_unix,processing_state)
 values(hm,chat,'arquitecto','image','AAAAAAAAAAAAAAAA',
  'AAAAAAAAAAAAAAAAAAAAAAAA',encode(extensions.gen_random_bytes(32),'hex'),
  extract(epoch from clock_timestamp())::bigint,'needs_review');
 if not public.cotironda_piloto_reserve_media_mvp095(
   hm,chat,encode(extensions.gen_random_bytes(32),'hex'),'image/jpeg')
 then raise exception 'mvp097_media_reservation_failed';end if;
 if not public.cotironda_piloto_finish_media_mvp095(
  hm,'stored',127213,encode(extensions.gen_random_bytes(32),'hex'))
 then raise exception 'mvp097_archive_not_finished';end if;
 proposal:='{"status":"review_required","kind":"buyer_request",
 "delivery_city":null,"lines":[{"original_description":"Cemento","quantity":"10"}]}'::jsonb;
 if not public.cotironda_piloto_note_media_proposal_mvp095(hm,proposal)
 then raise exception 'mvp097_proposal_not_recorded';end if;
 if not public.cotironda_piloto_reserve_document_zone_reply_mvp097(chat,hm)
 then raise exception 'mvp097_zone_reply_not_reserved';end if;
 if public.cotironda_piloto_reserve_document_zone_reply_mvp097(chat,hm)
 then raise exception 'mvp097_duplicate_zone_reply';end if;
 if not public.cotironda_piloto_finish_reply_mvp094(hm,'api_accepted')
 then raise exception 'mvp097_zone_reply_not_accepted';end if;

 city_msg:=encode(extensions.gen_random_bytes(32),'hex');
 insert into cotironda_piloto_privado.whapi_inbox(
  message_hmac,chat_hmac,participant_key,kind,nonce_b64,ciphertext_b64,
  plaintext_sha256,source_unix,processing_state)
 values(city_msg,chat,'arquitecto','text','AAAAAAAAAAAAAAAA',
  'AAAAAAAAAAAAAAAAAAAAAAAA',encode(extensions.gen_random_bytes(32),'hex'),
  extract(epoch from clock_timestamp())::bigint,'needs_review');
 if (public.cotironda_piloto_attach_zone_to_document_mvp097(
  chat,city_msg,'La Plata')->>'state')<>'city_attached'
 then raise exception 'mvp097_zone_not_attached';end if;
 if (select delivery_city_confirmed from cotironda_piloto_privado.media_archive_mvp095
  where message_hmac=hm)<>'La Plata'
 then raise exception 'mvp097_zone_mislinked';end if;
 if (public.cotironda_piloto_attach_zone_to_document_mvp097(
  chat,city_msg,'Berisso')->>'state')<>'no_pending_document'
 then raise exception 'mvp097_overwrite_permitted';end if;
 if (select count(*) from cotironda_piloto_privado.requests)<>1
 then raise exception 'mvp097_created_fictitious_round';end if;
end;$test$;
rollback;
