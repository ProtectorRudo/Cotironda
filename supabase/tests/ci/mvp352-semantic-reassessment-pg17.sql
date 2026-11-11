-- MVP352 PostgreSQL 17 synthetic. The complete parent suite already
-- created two genuinely dispatched request candidates and applied MVP351.
-- This script runs INSIDE the outer BEGIN / ROLLBACK and never sends WhatsApp.
DO $test$
DECLARE
 source_h text; source_sha text; chat text; other_chat text;
 req_new uuid; req_old uuid; original jsonb; claim jsonb; prepared jsonb;
 out_before int; dispatch_before int; offers_before int; ledger_before int;
 received timestamptz; stored text;
BEGIN
 SELECT id INTO req_new FROM cotironda_piloto_privado.requests
  WHERE source_hmac=encode(sha256(convert_to('mvp291_new_request','UTF8')),'hex');
 SELECT id INTO req_old FROM cotironda_piloto_privado.requests
  WHERE source_hmac=encode(sha256(convert_to('mvp291_old_request','UTF8')),'hex');
 SELECT chat_hmac INTO chat FROM cotironda_piloto_privado.participants
  WHERE key='corralon_ailin';
 SELECT chat_hmac INTO other_chat FROM cotironda_piloto_privado.participants
  WHERE key='corralon_nahuel';
 IF req_new IS NULL OR req_old IS NULL OR chat IS NULL OR other_chat IS NULL
 THEN RAISE EXCEPTION 'mvp352_missing_fixture';END IF;

 IF NOT (SELECT relrowsecurity FROM pg_class
  WHERE oid='cotironda_piloto_privado.ai_supplier_semantic_reassessment_mvp352'::regclass)
 OR has_table_privilege('anon',
  'cotironda_piloto_privado.ai_supplier_semantic_reassessment_mvp352','SELECT')
 OR has_table_privilege('authenticated',
  'cotironda_piloto_privado.ai_supplier_semantic_reassessment_mvp352','UPDATE')
 OR has_function_privilege('anon',
  'public.cotironda_piloto_claim_semantic_reassessment_mvp352()','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.cotironda_piloto_claim_semantic_reassessment_mvp352()','EXECUTE')
 THEN RAISE EXCEPTION 'mvp352_rls_or_rpc_exposure';END IF;

 SELECT count(*) INTO out_before FROM cotironda_piloto_privado.whapi_outbox;
 SELECT count(*) INTO dispatch_before FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222;
 SELECT count(*) INTO offers_before FROM cotironda_piloto_privado.anonymous_supplier_docs_mvp107;
 SELECT count(*) INTO ledger_before FROM cotironda_piloto_privado.ai_supplier_recovery_second_attempt_mvp351;

 source_h:=encode(sha256(convert_to('mvp352_semantic_reassessment_document','UTF8')),'hex');
 source_sha:=encode(sha256(convert_to('mvp352_immutable_source_pdf','UTF8')),'hex');
 original:=jsonb_build_object('kind','supplier_quote','status','review_required',
  'requested_delivery_note','Entrega en La Plata',
  'lines',jsonb_build_array(
   jsonb_build_object('original_description','Cemento Avellaneda; Dscto. 22.4%',
     'quantity','15,00','unit',null,'unit_price','$100','line_total','$1500'),
   jsonb_build_object('original_description','BIG BAG de Arena; Dscto. 22.4%',
     'quantity','2,00','unit',null,'unit_price','$200','line_total','$400'),
   jsonb_build_object('original_description','BIG BAG de Piedra; Dscto. 22.4%',
     'quantity','1,00','unit',null,'unit_price','$300','line_total','$300')
  ),'total_declared','$2200','unanswered',jsonb_build_array());
 received:=clock_timestamp();
 INSERT INTO cotironda_piloto_privado.whapi_inbox(
  message_hmac,chat_hmac,participant_key,kind,nonce_b64,ciphertext_b64,
  plaintext_sha256,source_unix,processing_state,received_at)
 VALUES(source_h,chat,'corralon_ailin','document','AAAAAAAAAAAAAAAA',
  'AAAAAAAAAAAAAAAAAAAAAAAA',source_sha,extract(epoch from received)::bigint,
  'needs_review',received);
 INSERT INTO cotironda_piloto_privado.media_archive_mvp095(
  message_hmac,chat_hmac,participant_key,kind,mime,media_id_sha256,
  state,finished_at,size_bytes,content_sha256,storage_path,
  ai_reserved_at,review_state,proposal)
 VALUES(source_h,chat,'corralon_ailin','document','application/pdf',
  encode(sha256(convert_to('mvp352_media','UTF8')),'hex'),
  'stored',clock_timestamp(),512,source_sha,'media/'||source_h,
  clock_timestamp(),'suggested_only',original);
 INSERT INTO cotironda_piloto_privado.ai_supplier_unresolved_mvp237(
  message_hmac,supplier_key,source_sha256,kind,state,candidate_count,association_method)
 VALUES(source_h,'corralon_ailin',source_sha,'document','ambiguous_round',2,
  'single_active_round');
 INSERT INTO cotironda_piloto_privado.ai_supplier_auto_correlation_mvp291(
  source_hmac,supplier_key,source_sha256,state,reason,reserved_at,finished_at)
 VALUES(source_h,'corralon_ailin',source_sha,'review','insufficient_material_evidence',
  clock_timestamp()-interval '5 minutes',clock_timestamp()-interval '4 minutes');
 INSERT INTO cotironda_piloto_privado.ai_supplier_auto_recovery_mvp292(
  source_hmac,supplier_key,state,reason_code,claimed_at,finished_at)
 VALUES(source_h,'corralon_ailin','review','multiple_indistinguishable_rounds',
  clock_timestamp()-interval '3 minutes',clock_timestamp()-interval '2 minutes');
 INSERT INTO cotironda_piloto_privado.ai_supplier_recovery_second_attempt_mvp351(
  source_hmac,supplier_key,previous_reason,previous_claimed_at,previous_finished_at)
 VALUES(source_h,'corralon_ailin','archived_materials_disagree',
  clock_timestamp()-interval '8 minutes',clock_timestamp()-interval '7 minutes');
 INSERT INTO cotironda_piloto_privado.ai_supplier_correlation_retries_mvp336(
  source_hmac,supplier_key,source_sha256,previous_reason)
 VALUES(source_h,'corralon_ailin',source_sha,'insufficient_material_evidence');

 -- The competitor was still open when the PDF arrived, then closed later.
 PERFORM pg_sleep(0.02);
 UPDATE cotironda_piloto_privado.requests
 SET state='closed',closed_at=clock_timestamp() WHERE id=req_old;
 IF NOT FOUND THEN RAISE EXCEPTION 'mvp352_missing_old_round';END IF;

 -- The earlier MVP351 claim must never reuse the consumed source.
 claim:=public.cotironda_piloto_claim_reviewed_auto_recovery_mvp336();
 IF claim->>'state'='claimed' AND claim->>'source_hmac'=source_h
 THEN RAISE EXCEPTION 'mvp352_old_claim_bypassed_reassessment_ledger';END IF;
 claim:=public.cotironda_piloto_claim_semantic_reassessment_mvp352();
 IF claim->>'state'<>'claimed' OR claim->>'source_hmac'<>source_h
 OR claim->>'retry_reviewed'<>'true'
 OR claim->>'source_sha256'<>source_sha
 THEN RAISE EXCEPTION 'mvp352_semantic_claim_failed: %',claim;END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.ai_supplier_semantic_reassessment_mvp352
   WHERE source_hmac=source_h AND previous_recovery_reason='multiple_indistinguishable_rounds'
    AND previous_correlation_reason='insufficient_material_evidence')<>1
 THEN RAISE EXCEPTION 'mvp352_audit_ledger_missing';END IF;
 claim:=public.cotironda_piloto_claim_semantic_reassessment_mvp352();
 IF claim->>'state'='claimed' AND claim->>'source_hmac'=source_h
 THEN RAISE EXCEPTION 'mvp352_duplicate_semantic_reassessment';END IF;
 prepared:=public.cotironda_piloto_auto_correlation_retry_prepare_mvp336(
  source_h,other_chat);
 IF prepared->>'state'='reserved'
 THEN RAISE EXCEPTION 'mvp352_wrong_supplier_chat_accepted';END IF;
 prepared:=public.cotironda_piloto_auto_correlation_retry_prepare_mvp336(source_h,chat);
 IF prepared->>'state'<>'reserved'
 OR jsonb_array_length(prepared->'quote')<>3
 OR jsonb_array_length(prepared->'candidates')<2
 OR prepared::text LIKE '%unit_price%'
 OR prepared::text LIKE '%line_total%'
 OR prepared::text LIKE '%source_hmac%'
 OR prepared::text LIKE '%chat_hmac%'
 THEN RAISE EXCEPTION 'mvp352_bounded_snapshot_invalid: %',prepared;END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(prepared->'candidates') c
  WHERE c->>'request_id'=req_new::text AND c->>'bind_allowed'='true')
 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(prepared->'candidates') c
  WHERE c->>'request_id'=req_old::text AND c->>'bind_allowed'='false')
 THEN RAISE EXCEPTION 'mvp352_historical_round_must_remain_negative_control';END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(prepared->'quote') q
  WHERE q->>'description'='Cemento Avellaneda; Dscto. 22.4%'
  AND q->>'quantity'='15,00' AND q->>'unit' IS NULL)
 THEN RAISE EXCEPTION 'mvp352_original_material_or_discount_modified';END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.ai_supplier_correlation_retries_mvp336
  WHERE source_hmac=source_h)<>1
 THEN RAISE EXCEPTION 'mvp352_old_correlation_retry_was_duplicated';END IF;
 claim:=public.cotironda_piloto_auto_correlation_bind_mvp291(
  source_h,chat,source_sha,req_old);
 IF claim->>'state'='linked_private'
 THEN RAISE EXCEPTION 'mvp352_closed_round_bound';END IF;
 claim:=public.cotironda_piloto_auto_correlation_bind_mvp291(
  source_h,chat,source_sha,req_new);
 IF claim->>'state'<>'linked_private'
 THEN RAISE EXCEPTION 'mvp352_valid_private_bind_rejected: %',claim;END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.ai_supplier_recovery_second_attempt_mvp351)<>ledger_before+1
 OR (SELECT count(*) FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222)<>dispatch_before
 OR (SELECT count(*) FROM cotironda_piloto_privado.whapi_outbox)<>out_before
 OR (SELECT count(*) FROM cotironda_piloto_privado.anonymous_supplier_docs_mvp107)<>offers_before
 THEN RAISE EXCEPTION 'mvp352_modified_prior_decisions_or_made_messages';END IF;
 RAISE NOTICE 'MVP352 PASS private and one-shot; both older ledgers intact, no quote or WhatsApp';
END $test$;
