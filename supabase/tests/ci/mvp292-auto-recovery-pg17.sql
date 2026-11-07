-- MVP292 PostgreSQL 17, synthetic legacy+IA Central overlap.
-- Automated WhatsApp text, one-shot historical media recovery and no Whapi.
-- Run after MVP291 fixture inside the SAME outer transaction / ROLLBACK.
DO $test$
DECLARE
 rid uuid;chat text;other_chat text;
 source_text text;text_sha text;source_doc text;document_sha text;
 materials jsonb;draft jsonb;answer jsonb;
 before_jobs int;before_outbox int;
BEGIN
 IF has_function_privilege('anon',
    'public.cotironda_piloto_stage_supplier_text_mvp292(text,text,text,jsonb)','EXECUTE')
 OR has_function_privilege('authenticated',
    'public.cotironda_piloto_claim_auto_recovery_mvp292()','EXECUTE')
 OR has_function_privilege('anon',
    'public.cotironda_piloto_auto_correlation_bind_mvp291(text,text,text,uuid)','EXECUTE')
 OR NOT has_function_privilege('service_role',
    'public.cotironda_piloto_reserve_archive_replay_mvp292(text,text)','EXECUTE')
 OR has_table_privilege('authenticated',
    'cotironda_piloto_privado.ai_supplier_text_materials_mvp292','SELECT')
 OR has_table_privilege('anon',
    'cotironda_piloto_privado.ai_supplier_auto_recovery_mvp292','SELECT')
 OR (SELECT NOT relrowsecurity FROM pg_class
   WHERE oid='cotironda_piloto_privado.ai_supplier_archive_replay_mvp292'::regclass)
 THEN RAISE EXCEPTION 'mvp292_privacy_failed';END IF;
 SELECT id INTO rid FROM cotironda_piloto_privado.requests
 WHERE source_hmac=encode(sha256(convert_to('mvp291_new_request','UTF8')),'hex');
 SELECT chat_hmac INTO chat FROM cotironda_piloto_privado.participants
 WHERE key='corralon_ailin';
 SELECT chat_hmac INTO other_chat FROM cotironda_piloto_privado.participants
 WHERE key='corralon_nahuel';
 IF rid IS NULL OR chat IS NULL OR other_chat IS NULL
 THEN RAISE EXCEPTION 'mvp292_missing_prior_fixture';END IF;
 SELECT count(*) INTO before_jobs FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222;
 SELECT count(*) INTO before_outbox FROM cotironda_piloto_privado.whapi_outbox;

 -- Synthetic encrypted WhatsApp text. SQL never decrypts this ciphertext.
 source_text:=encode(sha256(convert_to('mvp292_supplier_text_msg','UTF8')),'hex');
 text_sha:=encode(sha256(convert_to('40 bolsas cemento Avellaneda 25 kg y tres bolsones','UTF8')),'hex');
 INSERT INTO cotironda_piloto_privado.whapi_inbox(
  message_hmac,chat_hmac,participant_key,kind,nonce_b64,ciphertext_b64,
  plaintext_sha256,source_unix,processing_state,received_at)
 VALUES(source_text,chat,'corralon_ailin','text',
  'AAAAAAAAAAAAAAAA','AAAAAAAAAAAAAAAAAAAAAAAA',
  text_sha,extract(epoch from clock_timestamp())::bigint,
  'needs_review',clock_timestamp());
 INSERT INTO cotironda_piloto_privado.ai_supplier_unresolved_mvp237(
  message_hmac,supplier_key,source_sha256,kind,state,candidate_count,
  association_method)
 VALUES(source_text,'corralon_ailin',text_sha,'text','ambiguous_round',
  2,'single_active_round');
 materials:=jsonb_build_array(
  jsonb_build_object('line_no',1,'description','cemento Avellaneda 25 kg',
   'quantity','40','unit','bolsas'),
  jsonb_build_object('line_no',2,'description','bolsones de arena',
   'quantity','3','unit','bolsones'));
 answer:=public.cotironda_piloto_stage_supplier_text_mvp292(
  source_text,other_chat,text_sha,materials);
 IF answer->>'state'='staged' THEN RAISE EXCEPTION 'mvp292_cross_supplier_stage';END IF;
 answer:=public.cotironda_piloto_stage_supplier_text_mvp292(
  source_text,chat,repeat('f',64),materials);
 IF answer->>'state'='staged' THEN RAISE EXCEPTION 'mvp292_wrong_sha_stage';END IF;
 answer:=public.cotironda_piloto_stage_supplier_text_mvp292(
  source_text,chat,text_sha,materials);
 IF answer->>'state'<>'staged' THEN RAISE EXCEPTION 'mvp292_text_not_staged: %',answer;END IF;
 answer:=public.cotironda_piloto_stage_supplier_text_mvp292(
  source_text,chat,text_sha,materials);
 IF answer->>'state'<>'already_staged' THEN RAISE EXCEPTION 'mvp292_duplicate_stage';END IF;
 answer:=public.cotironda_piloto_auto_correlation_prepare_mvp291(source_text,chat);
 IF answer->>'state'<>'reserved' OR
    jsonb_array_length(answer->'quote')<>2 OR
    jsonb_array_length(answer->'candidates')<2 OR
    answer::text LIKE '%line_total%' OR answer::text LIKE '%unit_price%'
 THEN RAISE EXCEPTION 'mvp292_text_candidate_snapshot_invalid: %',answer;END IF;
 answer:=public.cotironda_piloto_auto_correlation_prepare_mvp291(source_text,chat);
 IF answer->>'state'<>'already_reserved' THEN RAISE EXCEPTION 'mvp292_duplicate_text_model';END IF;
 answer:=public.cotironda_piloto_auto_correlation_bind_mvp291(
  source_text,other_chat,text_sha,rid);
 IF answer->>'state'='linked_private' THEN RAISE EXCEPTION 'mvp292_cross_chat_text_link';END IF;
 answer:=public.cotironda_piloto_auto_correlation_bind_mvp291(
  source_text,chat,text_sha,rid);
 IF answer->>'state'<>'linked_private' THEN RAISE EXCEPTION 'mvp292_text_link_denied: %',answer;END IF;
 IF (SELECT request_id FROM cotironda_piloto_privado.whapi_inbox
    WHERE message_hmac=source_text)<>rid
 OR (SELECT resolved_request_id FROM cotironda_piloto_privado.ai_supplier_unresolved_mvp237
    WHERE message_hmac=source_text)<>rid
 OR (SELECT kind FROM cotironda_piloto_privado.ai_supplier_links_mvp225
    WHERE message_hmac=source_text)<>'text'
 OR EXISTS(SELECT 1 FROM cotironda_piloto_privado.media_archive_mvp095
    WHERE message_hmac=source_text)
 THEN RAISE EXCEPTION 'mvp292_text_did_not_bind_atomically';END IF;
 answer:=public.cotironda_piloto_auto_correlation_bind_mvp291(
  source_text,chat,text_sha,rid);
 IF answer->>'state'='linked_private'
 THEN RAISE EXCEPTION 'mvp292_rebound_text_source';END IF;

 -- Historical document: already stored, still ambiguous; no need for
 -- vendor resubmission. Single private background claim and replay.
 source_doc:=encode(sha256(convert_to('mvp292_historic_document_msg','UTF8')),'hex');
 document_sha:=encode(sha256(convert_to('mvp292_historic_original_bytes','UTF8')),'hex');
 draft:=jsonb_build_object('kind','supplier_quote','status','review_required',
  'delivery_city',null,'requested_delivery_note',null,
  'lines',jsonb_build_array(jsonb_build_object(
    'original_description','Cemento Avellaneda 25 kg',
    'quantity','40','unit','bolsas','unit_price','$100',
    'line_total','$4000','evidence_location','p1','ambiguity',null)),
  'total_declared','$4000','unanswered',jsonb_build_array());
 INSERT INTO cotironda_piloto_privado.whapi_inbox(
  message_hmac,chat_hmac,participant_key,kind,nonce_b64,ciphertext_b64,
  plaintext_sha256,source_unix,processing_state,received_at)
 VALUES(source_doc,chat,'corralon_ailin','document',
  'AAAAAAAAAAAAAAAA','AAAAAAAAAAAAAAAAAAAAAAAA',
  document_sha,extract(epoch from clock_timestamp())::bigint,
  'needs_review',clock_timestamp());
 INSERT INTO cotironda_piloto_privado.media_archive_mvp095(
  message_hmac,chat_hmac,participant_key,kind,mime,media_id_sha256,
  state,finished_at,size_bytes,content_sha256,storage_path,
  ai_reserved_at,review_state,proposal)
 VALUES(source_doc,chat,'corralon_ailin','document','application/pdf',
  encode(sha256(convert_to('mvp292_media_id','UTF8')),'hex'),
  'stored',clock_timestamp(),1500,document_sha,'media/'||source_doc,
  clock_timestamp(),'suggested_only',draft);
 INSERT INTO cotironda_piloto_privado.ai_supplier_unresolved_mvp237(
  message_hmac,supplier_key,source_sha256,kind,state,candidate_count,
  association_method)
 VALUES(source_doc,'corralon_ailin',document_sha,
  'document','ambiguous_round',2,'single_active_round');
 answer:=public.cotironda_piloto_claim_auto_recovery_mvp292();
 IF answer->>'state'<>'claimed' OR answer->>'source_hmac'<>source_doc
 OR answer->>'kind'<>'document' OR answer->>'source_sha256'<>document_sha
 THEN RAISE EXCEPTION 'mvp292_history_not_claimed: %',answer;END IF;
 answer:=public.cotironda_piloto_claim_auto_recovery_mvp292();
 IF answer->>'state'='claimed'
 THEN RAISE EXCEPTION 'mvp292_duplicate_historic_claim: %',answer;END IF;
 answer:=public.cotironda_piloto_auto_correlation_prepare_mvp291(source_doc,chat);
 IF answer->>'state'<>'reserved' THEN
  RAISE EXCEPTION 'mvp292_historic_doc_not_prepared: %',answer;END IF;
 answer:=public.cotironda_piloto_auto_correlation_bind_mvp291(
  source_doc,chat,document_sha,rid);
 IF answer->>'state'<>'linked_private' THEN
  RAISE EXCEPTION 'mvp292_historic_doc_not_bound: %',answer;END IF;
 answer:=public.cotironda_piloto_reserve_archive_replay_mvp292(
  source_doc,other_chat);
 IF answer->>'state'='reserved' THEN
  RAISE EXCEPTION 'mvp292_foreign_replay_authorized';END IF;
 answer:=public.cotironda_piloto_reserve_archive_replay_mvp292(
  source_doc,chat);
 IF answer->>'state'<>'reserved' OR answer->>'sha256'<>document_sha
 OR answer->'draft'<>draft THEN
  RAISE EXCEPTION 'mvp292_historic_original_not_available: %',answer;END IF;
 answer:=public.cotironda_piloto_reserve_archive_replay_mvp292(
  source_doc,chat);
 IF answer->>'state'='reserved'
 THEN RAISE EXCEPTION 'mvp292_historic_replay_double_charged';END IF;
 answer:=public.cotironda_piloto_finish_archive_replay_mvp292(
  source_doc,'review','source_not_independently_verified');
 IF answer->>'state'<>'recorded' THEN
  RAISE EXCEPTION 'mvp292_replay_outcome_lost';END IF;
 answer:=public.cotironda_piloto_finish_auto_recovery_mvp292(
  source_doc,'linked','source_bound_to_unique_round');
 IF answer->>'state'<>'recorded' THEN
  RAISE EXCEPTION 'mvp292_background_outcome_lost';END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222)<>before_jobs
 OR (SELECT count(*) FROM cotironda_piloto_privado.whapi_outbox)<>before_outbox
 OR EXISTS(SELECT 1 FROM cotironda_piloto_privado.anonymous_supplier_docs_mvp107
    WHERE message_hmac IN(source_text,source_doc))
 THEN RAISE EXCEPTION 'mvp292_wrote_supplier_outbox_or_unverified_prices';END IF;
 RAISE NOTICE 'MVP292 PASS: encrypted free chat, old PDF recovery, RLS, idempotency, zero real WhatsApp';
END $test$;
