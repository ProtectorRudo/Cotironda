-- MVP351 PG17 SYNTHETIC: an earlier internal recovery finished in
-- archived_materials_disagree; old competitor closed AFTER original arrived.
-- Installed only inside outer BEGIN / ROLLBACK and without real WhatsApps.
DO $test$
DECLARE
 source_h text; source_sha text; chat text; wrong_chat text;
 req_new uuid;req_old uuid;archived jsonb;claim jsonb;replay jsonb;
 jobs_before int; out_before int; offers_before int;
BEGIN
 SELECT id INTO req_new FROM cotironda_piloto_privado.requests
  WHERE source_hmac=encode(sha256(convert_to('mvp291_new_request','UTF8')),'hex');
 SELECT id INTO req_old FROM cotironda_piloto_privado.requests
  WHERE source_hmac=encode(sha256(convert_to('mvp291_old_request','UTF8')),'hex');
 SELECT chat_hmac INTO chat FROM cotironda_piloto_privado.participants
  WHERE key='corralon_ailin';
 SELECT chat_hmac INTO wrong_chat FROM cotironda_piloto_privado.participants
  WHERE key='corralon_nahuel';
 IF req_new IS NULL OR req_old IS NULL OR chat IS NULL OR wrong_chat IS NULL
 THEN RAISE EXCEPTION 'mvp351_fixture_missing';END IF;
 IF has_table_privilege('anon',
   'cotironda_piloto_privado.ai_supplier_recovery_second_attempt_mvp351','SELECT')
 OR has_table_privilege('authenticated',
   'cotironda_piloto_privado.ai_supplier_recovery_second_attempt_mvp351','UPDATE')
 OR (SELECT NOT relrowsecurity FROM pg_class WHERE
   oid='cotironda_piloto_privado.ai_supplier_recovery_second_attempt_mvp351'::regclass)
 THEN RAISE EXCEPTION 'mvp351_rls_broken';END IF;
 SELECT count(*) INTO jobs_before FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222;
 SELECT count(*) INTO out_before FROM cotironda_piloto_privado.whapi_outbox;
 SELECT count(*) INTO offers_before FROM cotironda_piloto_privado.anonymous_offers_mvp091;
 source_h:=encode(sha256(convert_to('mvp351_reviewed_document','UTF8')),'hex');
 source_sha:=encode(sha256(convert_to('mvp351_exact_archived_pdf','UTF8')),'hex');
 archived:=jsonb_build_object('kind','supplier_quote','status','review_required',
  'lines',jsonb_build_array(
   jsonb_build_object('original_description','Cemento Avellaneda','quantity','15','unit',null,
    'unit_price','$1','line_total','$15'),
   jsonb_build_object('original_description','BIG BAG Arena','quantity','2','unit',null,
    'unit_price','$1','line_total','$2'),
   jsonb_build_object('original_description','BIG BAG Piedra','quantity','1','unit',null,
    'unit_price','$1','line_total','$1')
  ),'unanswered',jsonb_build_array());
 INSERT INTO cotironda_piloto_privado.whapi_inbox(
  message_hmac,chat_hmac,participant_key,kind,nonce_b64,ciphertext_b64,
  plaintext_sha256,source_unix,processing_state,received_at)
 VALUES(source_h,chat,'corralon_ailin','document','AAAAAAAAAAAAAAAA',
  'AAAAAAAAAAAAAAAAAAAAAAAA',source_sha,
  extract(epoch from clock_timestamp())::bigint,'needs_review',clock_timestamp());
 INSERT INTO cotironda_piloto_privado.media_archive_mvp095(
  message_hmac,chat_hmac,participant_key,kind,mime,media_id_sha256,
  state,finished_at,size_bytes,content_sha256,storage_path,
  ai_reserved_at,review_state,proposal)
 VALUES(source_h,chat,'corralon_ailin','document','application/pdf',
  encode(sha256(convert_to('mvp351_media','UTF8')),'hex'),
  'stored',clock_timestamp(),512,source_sha,'media/'||source_h,
  clock_timestamp(),'suggested_only',archived);
 INSERT INTO cotironda_piloto_privado.ai_supplier_unresolved_mvp237(
  message_hmac,supplier_key,source_sha256,kind,state,candidate_count,association_method)
 VALUES(source_h,'corralon_ailin',source_sha,'document','ambiguous_round',2,'single_active_round');
 INSERT INTO cotironda_piloto_privado.ai_supplier_auto_correlation_mvp291(
  source_hmac,supplier_key,source_sha256,state,reason,reserved_at,finished_at)
 VALUES(source_h,'corralon_ailin',source_sha,'review','insufficient_material_evidence',
  clock_timestamp()-interval '6 minutes',clock_timestamp()-interval '4 minutes');
 INSERT INTO cotironda_piloto_privado.ai_supplier_auto_recovery_mvp292(
  source_hmac,supplier_key,state,reason_code,claimed_at,finished_at)
 VALUES(source_h,'corralon_ailin','review','archived_materials_disagree',
  clock_timestamp()-interval '3 minutes',clock_timestamp()-interval '2 minutes');
 -- Historical request stopped being eligible AFTER the PDF arrived.
 UPDATE cotironda_piloto_privado.requests
 SET state='closed',closed_at=clock_timestamp()
 WHERE id=req_old;
 IF NOT FOUND THEN RAISE EXCEPTION 'mvp351_old_round_missing';END IF;
 -- Older plain claim must not reopen a reviewed original.
 claim:=public.cotironda_piloto_claim_auto_recovery_mvp292();
 IF claim->>'state'='claimed' AND claim->>'source_hmac'=source_h
 THEN RAISE EXCEPTION 'mvp351_mvp292_bypassed_review';END IF;
 claim:=public.cotironda_piloto_claim_reviewed_auto_recovery_mvp336();
 IF claim->>'state'<>'claimed' OR claim->>'source_hmac'<>source_h
 OR claim->>'retry_reviewed'<>'true'
 THEN RAISE EXCEPTION 'mvp351_reviewed_claim_missing: %',claim;END IF;
 IF NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_supplier_recovery_second_attempt_mvp351 a
  WHERE a.source_hmac=source_h AND a.previous_reason='archived_materials_disagree'
    AND a.previous_finished_at IS NOT NULL)
 OR (SELECT state FROM cotironda_piloto_privado.ai_supplier_auto_recovery_mvp292
    WHERE source_hmac=source_h)<>'leased'
 THEN RAISE EXCEPTION 'mvp351_previous_reason_not_preserved';END IF;
 replay:=public.cotironda_piloto_auto_correlation_retry_prepare_mvp336(source_h,wrong_chat);
 IF replay->>'state'='reserved'
 THEN RAISE EXCEPTION 'mvp351_wrong_chat_reserved';END IF;
 replay:=public.cotironda_piloto_auto_correlation_retry_prepare_mvp336(source_h,chat);
 IF replay->>'state'<>'reserved' OR jsonb_array_length(replay->'quote')<>3
 OR jsonb_array_length(replay->'candidates')<>2
 OR replay::text LIKE '%unit_price%' OR replay::text LIKE '%line_total%'
 OR replay::text LIKE '%message_hmac%' OR replay::text LIKE '%chat_hmac%'
 THEN RAISE EXCEPTION 'mvp351_historic_snapshot_or_privacy_invalid: %',replay;END IF;
 IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(replay->'candidates') c
   WHERE c->>'request_id'=req_new::text AND c->>'bind_allowed'='true')
 OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(replay->'candidates') c
   WHERE c->>'request_id'=req_old::text AND c->>'bind_allowed'='false')
 THEN RAISE EXCEPTION 'mvp351_missing_closed_negative_control';END IF;
 replay:=public.cotironda_piloto_auto_correlation_bind_mvp291(
  source_h,chat,source_sha,req_old);
 IF replay->>'state'='linked_private'
 THEN RAISE EXCEPTION 'mvp351_closed_round_must_never_bind';END IF;
 replay:=public.cotironda_piloto_auto_correlation_bind_mvp291(
  source_h,chat,source_sha,req_new);
 IF replay->>'state'<>'linked_private'
 THEN RAISE EXCEPTION 'mvp351_active_round_bind_denied: %',replay;END IF;
 claim:=public.cotironda_piloto_claim_reviewed_auto_recovery_mvp336();
 IF claim->>'state'='claimed' AND claim->>'source_hmac'=source_h
 THEN RAISE EXCEPTION 'mvp351_double_recovery_attempt';END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222)<>jobs_before
 OR (SELECT count(*) FROM cotironda_piloto_privado.whapi_outbox)<>out_before
 OR (SELECT count(*) FROM cotironda_piloto_privado.anonymous_offers_mvp091)<>offers_before
 THEN RAISE EXCEPTION 'mvp351_generated_offer_or_whatsapp';END IF;
 RAISE NOTICE 'MVP351 PASS: single audited retry, old closed negative control, new private link, no messages or offers';
END $test$;
