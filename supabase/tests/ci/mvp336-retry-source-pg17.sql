-- MVP336: all data synthetic, within the parent BEGIN / ROLLBACK.
-- Does not contact WhatsApp, OpenAI, any real buyer, or live pilot.
DO $test$
DECLARE
 src text; sha text;chat text;other_chat text;rid uuid;
 payload jsonb;answer jsonb;before_jobs int;before_outbox int;
BEGIN
 IF has_function_privilege('anon',
  'public.cotironda_piloto_claim_reviewed_auto_recovery_mvp336()','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.cotironda_piloto_auto_correlation_retry_prepare_mvp336(text,text)','EXECUTE')
 OR NOT has_function_privilege('service_role',
  'public.cotironda_piloto_auto_correlation_retry_prepare_mvp336(text,text)','EXECUTE')
 OR has_table_privilege('anon',
  'cotironda_piloto_privado.ai_supplier_correlation_retries_mvp336','SELECT')
 OR (SELECT NOT relrowsecurity FROM pg_class
  WHERE oid='cotironda_piloto_privado.ai_supplier_correlation_retries_mvp336'::regclass)
 THEN RAISE EXCEPTION 'mvp336_private_permissions_broken';END IF;
 SELECT id INTO rid FROM cotironda_piloto_privado.requests
 WHERE source_hmac=encode(sha256(convert_to('mvp291_new_request','UTF8')),'hex');
 SELECT chat_hmac INTO chat FROM cotironda_piloto_privado.participants
 WHERE key='corralon_ailin';
 SELECT chat_hmac INTO other_chat FROM cotironda_piloto_privado.participants
 WHERE key='corralon_nahuel';
 IF rid IS NULL OR chat IS NULL OR other_chat IS NULL
 THEN RAISE EXCEPTION 'mvp336_synthetic_fixture_missing';END IF;
 SELECT count(*) INTO before_jobs FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222;
 SELECT count(*) INTO before_outbox FROM cotironda_piloto_privado.whapi_outbox;
 src:=encode(sha256(convert_to('mvp336_document_15_2_1','UTF8')),'hex');
 sha:=encode(sha256(convert_to('mvp336_immutable_archive_bytes','UTF8')),'hex');
 payload:=jsonb_build_object('kind','supplier_quote','status','review_required',
  'delivery_city',null,'requested_delivery_note','La Plata',
  'lines',jsonb_build_array(
   jsonb_build_object('original_description','Cemento Avellaneda',
    'quantity','15,00','unit',null,'unit_price','$100','line_total','$1500',
    'evidence_location','p1','ambiguity',null),
   jsonb_build_object('original_description','BIG BAG de Arena',
    'quantity','2,00','unit',null,'unit_price','$200','line_total','$400',
    'evidence_location','p1','ambiguity',null),
   jsonb_build_object('original_description','BIG BAG de Piedra',
    'quantity','1,00','unit',null,'unit_price','$300','line_total','$300',
    'evidence_location','p1','ambiguity',null)),
  'total_declared','$2200','unanswered',jsonb_build_array());
 INSERT INTO cotironda_piloto_privado.whapi_inbox(
  message_hmac,chat_hmac,participant_key,kind,nonce_b64,ciphertext_b64,
  plaintext_sha256,source_unix,processing_state,received_at)
 VALUES(src,chat,'corralon_ailin','document','AAAAAAAAAAAAAAAA',
  'AAAAAAAAAAAAAAAAAAAAAAAA',sha,
  extract(epoch from clock_timestamp())::bigint,'needs_review',clock_timestamp());
 INSERT INTO cotironda_piloto_privado.media_archive_mvp095(
  message_hmac,chat_hmac,participant_key,kind,mime,media_id_sha256,
  state,finished_at,size_bytes,content_sha256,storage_path,
  ai_reserved_at,review_state,proposal)
 VALUES(src,chat,'corralon_ailin','document','application/pdf',
  encode(sha256(convert_to('mvp336_media_id','UTF8')),'hex'),
  'stored',clock_timestamp(),1500,sha,'media/'||src,
  clock_timestamp(),'suggested_only',payload);
 INSERT INTO cotironda_piloto_privado.ai_supplier_unresolved_mvp237(
  message_hmac,supplier_key,source_sha256,kind,state,candidate_count,
  association_method)
 VALUES(src,'corralon_ailin',sha,'document','ambiguous_round',
  2,'single_active_round');
 INSERT INTO cotironda_piloto_privado.ai_supplier_auto_correlation_mvp291(
  source_hmac,supplier_key,source_sha256,state,reason,reserved_at,finished_at)
 VALUES(src,'corralon_ailin',sha,'review','insufficient_material_evidence',
  clock_timestamp()-interval '1 minute',clock_timestamp());
 -- Ordinary background claim excludes any already-decided correlation.
 answer:=public.cotironda_piloto_claim_auto_recovery_mvp292();
 IF answer->>'state'='claimed' AND answer->>'source_hmac'=src
 THEN RAISE EXCEPTION 'mvp336_old_claim_reprocessed_decision';END IF;
 -- An explicit one-time SQL lease is the only way to reopen the source.
 answer:=public.cotironda_piloto_claim_reviewed_auto_recovery_mvp336();
 IF answer->>'state'<>'claimed' OR answer->>'source_hmac'<>src
 OR answer->>'retry_reviewed'<>'true' OR answer->>'source_sha256'<>sha
 THEN RAISE EXCEPTION 'mvp336_reviewed_claim_missing: %',answer;END IF;
 answer:=public.cotironda_piloto_auto_correlation_retry_prepare_mvp336(src,other_chat);
 IF answer->>'state'='reserved' THEN
  RAISE EXCEPTION 'mvp336_wrong_supplier_chat_authorized';END IF;
 answer:=public.cotironda_piloto_auto_correlation_retry_prepare_mvp336(src,chat);
 IF answer->>'state'<>'reserved'
  OR jsonb_array_length(answer->'quote')<>3
  OR jsonb_array_length(answer->'candidates')<2
  OR answer::text LIKE '%unit_price%'
  OR answer::text LIKE '%line_total%'
 THEN RAISE EXCEPTION 'mvp336_snapshot_or_privacy_failed: %',answer;END IF;
 IF (SELECT previous_reason
  FROM cotironda_piloto_privado.ai_supplier_correlation_retries_mvp336
  WHERE source_hmac=src)<>'insufficient_material_evidence'
 THEN RAISE EXCEPTION 'mvp336_previous_reason_lost';END IF;
 answer:=public.cotironda_piloto_auto_correlation_retry_prepare_mvp336(src,chat);
 IF answer->>'state'='reserved'
 THEN RAISE EXCEPTION 'mvp336_double_reservation';END IF;
 answer:=public.cotironda_piloto_auto_correlation_bind_mvp291(
  src,other_chat,sha,rid);
 IF answer->>'state'='linked_private'
 THEN RAISE EXCEPTION 'mvp336_foreign_chat_bound';END IF;
 answer:=public.cotironda_piloto_auto_correlation_bind_mvp291(
  src,chat,sha,rid);
 IF answer->>'state'<>'linked_private'
 THEN RAISE EXCEPTION 'mvp336_private_bind_denied: %',answer;END IF;
 IF (SELECT resolved_request_id FROM cotironda_piloto_privado.ai_supplier_unresolved_mvp237
  WHERE message_hmac=src)<>rid
 OR (SELECT request_id FROM cotironda_piloto_privado.media_archive_mvp095
  WHERE message_hmac=src)<>rid
 OR (SELECT state FROM cotironda_piloto_privado.ai_supplier_auto_correlation_mvp291
  WHERE source_hmac=src)<>'linked'
 THEN RAISE EXCEPTION 'mvp336_atomic_link_failed';END IF;
 answer:=public.cotironda_piloto_claim_reviewed_auto_recovery_mvp336();
 IF answer->>'state'='claimed' AND answer->>'source_hmac'=src
 THEN RAISE EXCEPTION 'mvp336_duplicate_claim';END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222)<>before_jobs
 OR (SELECT count(*) FROM cotironda_piloto_privado.whapi_outbox)<>before_outbox
 OR EXISTS(SELECT 1 FROM cotironda_piloto_privado.anonymous_offers_mvp091
  WHERE request_id=rid AND supplier_key='corralon_ailin')
 THEN RAISE EXCEPTION 'mvp336_sent_messages_or_published_unverified_quote';END IF;
 RAISE NOTICE 'MVP336 PASS: one review retry, no guessed units, no outbox, retained source';
END $test$;
