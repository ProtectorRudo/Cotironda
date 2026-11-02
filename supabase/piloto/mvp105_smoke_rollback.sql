-- MVP-105: buyer live anonymous quotes and MVP-104 ACK/tracking gates,
-- no HTTP/Whapi sends, synthetic records, always ROLLBACK.
begin;
do $test$
declare buyer_chat text;supplier_chat text;buyer_hmac text;
 supplier_text_hmac text;supplier_doc_hmac text;invalid_doc_hmac text;
 rid uuid;hash_ text;v_token_hash text;result jsonb;
 n integer;before_offers bigint;
begin
 select chat_hmac into buyer_chat from cotironda_piloto_privado.participants
 where key='arquitecto' and participant_role='buyer'
  and consent_at is not null and opted_out_at is null;
 select chat_hmac into supplier_chat from cotironda_piloto_privado.participants
 where key='corralon_nahuel' and participant_role='supplier'
  and consent_at is not null and opted_out_at is null;
 if buyer_chat is null or supplier_chat is null then
  raise exception 'mvp104_fixture_no_consent';end if;
 select count(*) into before_offers from cotironda_piloto_privado.offer_versions;
 buyer_hmac:=encode(extensions.gen_random_bytes(32),'hex');
 supplier_text_hmac:=encode(extensions.gen_random_bytes(32),'hex');
 supplier_doc_hmac:=encode(extensions.gen_random_bytes(32),'hex');
 invalid_doc_hmac:=encode(extensions.gen_random_bytes(32),'hex');
 hash_:=encode(extensions.gen_random_bytes(32),'hex');
 v_token_hash:=encode(extensions.gen_random_bytes(32),'hex');

 insert into cotironda_piloto_privado.whapi_inbox(
  message_hmac,chat_hmac,participant_key,kind,
  nonce_b64,ciphertext_b64,plaintext_sha256,source_unix,processing_state)
 values(buyer_hmac,buyer_chat,'arquitecto','image',
  'AAAAAAAAAAAAAAAA','AAAAAAAAAAAAAAAAAAAAAAAA',hash_,
  extract(epoch from clock_timestamp())::bigint,'needs_review');
 insert into cotironda_piloto_privado.requests(
  buyer_key,delivery_city,original_request,source_hmac,state)
 values('arquitecto','La Plata','Lista documental sintética de cemento 20 bolsas',
  buyer_hmac,'prepared') returning id into rid;
 insert into cotironda_piloto_privado.request_lines(
  request_id,line_no,original_description,quantity,unit,family_code)
 values(rid,1,'Cemento CPC 50 kg',20,'bag','cemento_gris_obra');
 insert into cotironda_piloto_privado.invitations(request_id,supplier_key)
 values(rid,'corralon_nahuel');

 -- The ORIGINAL photo HMAC, not the zone-reply HMAC, binds tracking.
 result:=public.cotironda_piloto_issue_tracking_mvp091(
  buyer_chat,buyer_hmac,v_token_hash);
 if result->>'state'<>'issued' then
  raise exception 'mvp104_document_tracking_not_issued %',result;end if;
 if (public.cotironda_piloto_issue_tracking_mvp091(
  buyer_chat,buyer_hmac,encode(extensions.gen_random_bytes(32),'hex')))
    ->>'state'<>'already_issued'
 then raise exception 'mvp104_document_tracking_duplicate';end if;
 if (public.cotironda_piloto_issue_tracking_mvp091(
  supplier_chat,buyer_hmac,encode(extensions.gen_random_bytes(32),'hex')))
    ->>'state'<>'not_eligible'
 then raise exception 'mvp104_supplier_can_steal_tracking';end if;
 if (select send_state from cotironda_piloto_privado.buyer_tracking_mvp091
     where token_hash=v_token_hash)='api_accepted'
 then raise exception 'mvp104_link_was_marked_delivered_without_whapi';end if;
 if not public.cotironda_piloto_finish_tracking_mvp091(v_token_hash,'uncertain')
 then raise exception 'mvp104_link_finish_failed';end if;

 insert into cotironda_piloto_privado.whapi_inbox(
  message_hmac,chat_hmac,participant_key,kind,
  nonce_b64,ciphertext_b64,plaintext_sha256,source_unix,processing_state,
  request_id)
 values(supplier_text_hmac,supplier_chat,'corralon_nahuel','text',
  'AAAAAAAAAAAAAAAA','AAAAAAAAAAAAAAAAAAAAAAAA',hash_,
  extract(epoch from clock_timestamp())::bigint,'quote_recorded',rid);
 insert into cotironda_piloto_privado.offer_versions(
  request_id,supplier_key,revision_no,source_message_hmac,original_quote)
 values(rid,'corralon_nahuel',1,supplier_text_hmac,
  '20 bolsas cemento $ 9500,00 + pallets $ 14000,00; total $ 204000,00');
 if not public.cotironda_piloto_reserve_supplier_ack_mvp104(
    supplier_text_hmac,supplier_chat,'text_quote') then
  raise exception 'mvp104_text_quote_ack_not_reserved';end if;
 if public.cotironda_piloto_reserve_supplier_ack_mvp104(
    supplier_text_hmac,supplier_chat,'text_quote') then
  raise exception 'mvp104_text_quote_ack_duplicate';end if;
 if public.cotironda_piloto_reserve_supplier_ack_mvp104(
    supplier_text_hmac,buyer_chat,'text_quote') then
  raise exception 'mvp104_wrong_chat_allowed';end if;
 if not public.cotironda_piloto_finish_supplier_ack_mvp104(
    supplier_text_hmac,'api_accepted')
 or public.cotironda_piloto_finish_supplier_ack_mvp104(
    supplier_text_hmac,'api_accepted') then
  raise exception 'mvp104_bad_ack_terminal_state';end if;

 -- An unverified PDF is acknowledged as RECEIVED, never as "verified".
 insert into cotironda_piloto_privado.whapi_inbox(
  message_hmac,chat_hmac,participant_key,kind,
  nonce_b64,ciphertext_b64,plaintext_sha256,source_unix,processing_state,
  request_id)
 values(supplier_doc_hmac,supplier_chat,'corralon_nahuel','document',
  'AAAAAAAAAAAAAAAA','AAAAAAAAAAAAAAAAAAAAAAAA',hash_,
  extract(epoch from clock_timestamp())::bigint,'needs_review',null);
 insert into cotironda_piloto_privado.media_archive_mvp095(
   message_hmac,chat_hmac,participant_key,request_id,kind,mime,
   media_id_sha256,state,size_bytes,content_sha256,storage_path,
   review_state,proposal)
 values(supplier_doc_hmac,supplier_chat,'corralon_nahuel',rid,
  'document','application/pdf',hash_,'stored',1024,hash_,
  'media/'||supplier_doc_hmac,'suggested_only',
  jsonb_build_object('status','review_required','kind','supplier_quote',
  'total_declared','$ 9500,00','lines',jsonb_build_array(
   jsonb_build_object('original_description','Cemento CPC 50 kg',
    'quantity','1','unit','bolsa','unit_price','$ 9500,00',
    'line_total','$ 9500,00','evidence_location','Página 1: cementos',
    'ambiguity',null)),'delivery_city',null,
    'requested_delivery_note',null,'unanswered','[]'::jsonb));
 result:=public.cotironda_piloto_record_supplier_media_mvp098(supplier_doc_hmac);
 if result->>'state'<>'stored_unverified' then
  raise exception 'mvp104_document_receipt_failed %',result;end if;
 if not public.cotironda_piloto_reserve_supplier_ack_mvp104(
   supplier_doc_hmac,supplier_chat,'media_quote')
 or public.cotironda_piloto_reserve_supplier_ack_mvp104(
   supplier_doc_hmac,supplier_chat,'media_quote')
 then raise exception 'mvp104_media_ack_not_idempotent';end if;
 if not public.cotironda_piloto_finish_supplier_ack_mvp104(
  supplier_doc_hmac,'uncertain') then
   raise exception 'mvp104_uncertain_not_terminal';end if;
 if public.cotironda_piloto_reserve_supplier_ack_mvp104(
   supplier_doc_hmac,supplier_chat,'media_quote')
 then raise exception 'mvp104_uncertain_quote_retried';end if;
 insert into cotironda_piloto_privado.whapi_inbox(
  message_hmac,chat_hmac,participant_key,kind,
  nonce_b64,ciphertext_b64,plaintext_sha256,source_unix,processing_state,
  request_id)
 values(invalid_doc_hmac,supplier_chat,'corralon_nahuel','document',
  'AAAAAAAAAAAAAAAA','AAAAAAAAAAAAAAAAAAAAAAAA',hash_,
  extract(epoch from clock_timestamp())::bigint,'needs_review',null);
 if public.cotironda_piloto_reserve_supplier_ack_mvp104(
  invalid_doc_hmac,supplier_chat,'media_quote')
 then raise exception 'mvp104_unprocessed_document_acked';end if;

 if (select count(*) from cotironda_piloto_privado.offer_versions)
   <>before_offers+1
 then raise exception 'mvp104_offers_affected_by_ack';end if;
 if has_table_privilege('anon',
    'cotironda_piloto_privado.supplier_ack_mvp104','SELECT')
 or has_table_privilege('authenticated',
    'cotironda_piloto_privado.supplier_ack_mvp104','SELECT')
 or has_function_privilege('anon',
    'public.cotironda_piloto_reserve_supplier_ack_mvp104(text,text,text)',
    'EXECUTE')
 then raise exception 'mvp104_public_access';end if;

 -- The architect sees an operator-reviewed, anonymous projection even
 -- DURING the active round; identities or raw supplier files never leak.
 insert into cotironda_piloto_privado.anonymous_offers_mvp091(
  request_id,supplier_key,revision_no,public_text,approved_by)
 values(rid,'corralon_nahuel',1,
  'Cemento CPC 50 kg: 20 bolsas x $ 9.500,00; pallets vacíos: $ 14.000,00; TOTAL $ 204.000,00',
  'pilot_operator_smoke');
 result:=public.cotironda_piloto_tracking_status_mvp091(v_token_hash);
 if result->>'state'<>'waiting' or result->>'can_open'<>'true'
   or jsonb_array_length(result->'offers')<>1
   or position('Cemento CPC' in result::text)=0
   or position('corralon_nahuel' in result::text)>0
 then raise exception 'mvp105_live_anonymized_offer_not_visible %',result;end if;
 if (public.cotironda_piloto_tracking_status_mvp091(
      encode(extensions.gen_random_bytes(32),'hex')))
    ->>'state'<>'not_found'
 then raise exception 'mvp105_wrong_token_access';end if;

 -- A new, not-yet-approved revision MUST hide the old projected quote.
 declare
 begin
  insert into cotironda_piloto_privado.whapi_inbox(
   message_hmac,chat_hmac,participant_key,kind,nonce_b64,ciphertext_b64,
   plaintext_sha256,source_unix,processing_state,request_id)
  values(encode(extensions.gen_random_bytes(32),'hex'),
   supplier_chat,'corralon_nahuel','text',
   'AAAAAAAAAAAAAAAA','AAAAAAAAAAAAAAAAAAAAAAAA',hash_,
   extract(epoch from clock_timestamp())::bigint,'quote_recorded',rid);
 end;
 -- The new source HMAC is the latest inbox entry from this synthetic round.
 insert into cotironda_piloto_privado.offer_versions(
  request_id,supplier_key,revision_no,source_message_hmac,original_quote)
 select rid,'corralon_nahuel',2,m.message_hmac,
   'Nuevo presupuesto pendiente de revisión'
 from cotironda_piloto_privado.whapi_inbox m
 where m.request_id=rid and m.participant_key='corralon_nahuel'
  and m.message_hmac<>supplier_text_hmac and m.kind='text'
 order by m.received_at desc,m.message_hmac desc limit 1;
 result:=public.cotironda_piloto_tracking_status_mvp091(v_token_hash);
 if result->>'state'<>'waiting' or result->>'can_open'<>'false'
  or jsonb_array_length(result->'offers')<>0
 then raise exception 'mvp105_old_revision_leak %',result;end if;

 update cotironda_piloto_privado.buyer_tracking_mvp091
 set revoked_at=clock_timestamp() where token_hash=v_token_hash;
 result:=public.cotironda_piloto_tracking_status_mvp091(v_token_hash);
 if result->>'state'<>'not_found'
 then raise exception 'mvp105_revoked_token_leak %',result;end if;
 update cotironda_piloto_privado.buyer_tracking_mvp091
 set revoked_at=null where token_hash=v_token_hash;
 update cotironda_piloto_privado.requests set state='cancelled' where id=rid;
 result:=public.cotironda_piloto_tracking_status_mvp091(v_token_hash);
 if result->>'state'<>'cancelled' or result->>'can_open'<>'false'
  or jsonb_array_length(result->'offers')<>0
 then raise exception 'mvp105_cancelled_round_leak %',result;end if;

end;$test$;
rollback;