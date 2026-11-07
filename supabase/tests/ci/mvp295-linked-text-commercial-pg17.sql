-- MVP295 synthetic PostgreSQL 17 regression, in existing single transaction
-- ROLLBACK. Sources, buyers and suppliers are fake; no API or WhatsApp call.
DO $test$
DECLARE
 rid uuid;sid text;chat text;sha text;result jsonb;before_outbox int;before_dispatch int;
BEGIN
 IF has_function_privilege('anon',
   'public.cotironda_piloto_claim_linked_text_mvp295()','EXECUTE')
 OR has_function_privilege('authenticated',
   'public.cotironda_piloto_finish_linked_text_mvp295(text,text,text)','EXECUTE')
 OR NOT has_function_privilege('service_role',
   'public.cotironda_piloto_claim_linked_text_mvp295()','EXECUTE')
 OR has_table_privilege('anon',
   'cotironda_piloto_privado.ai_supplier_linked_replay_mvp295','SELECT')
 OR has_table_privilege('authenticated',
   'cotironda_piloto_privado.ai_supplier_linked_replay_mvp295','SELECT')
 OR (SELECT NOT relrowsecurity FROM pg_class
    WHERE oid='cotironda_piloto_privado.ai_supplier_linked_replay_mvp295'::regclass)
 THEN RAISE EXCEPTION 'mvp295_acl_or_rls_failure';END IF;
 SELECT id INTO rid FROM cotironda_piloto_privado.requests
 WHERE source_hmac=encode(sha256(convert_to('mvp291_new_request','UTF8')),'hex');
 sid:=encode(sha256(convert_to('mvp292_supplier_text_msg','UTF8')),'hex');
 SELECT m.chat_hmac,m.plaintext_sha256 INTO chat,sha
 FROM cotironda_piloto_privado.whapi_inbox m
 WHERE m.message_hmac=sid;
 IF rid IS NULL OR chat IS NULL OR sha IS NULL
 THEN RAISE EXCEPTION 'mvp295_no_mvp292_source_fixture';END IF;
 SELECT count(*) INTO before_outbox FROM cotironda_piloto_privado.whapi_outbox;
 SELECT count(*) INTO before_dispatch FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222;

 -- Mere association does NOT authorize an archival commercial replay.
 result:=public.cotironda_piloto_claim_linked_text_mvp295();
 IF result->>'state'<>'empty'
 THEN RAISE EXCEPTION 'mvp295_unauthorized_link_claim: %',result;END IF;
 -- Model a real source older than ten minutes, but within the active
 -- request after the confirmed Whapi delivery. These edits are synthetics
 -- and all will be rolled back after this single rehearsal.
 UPDATE cotironda_piloto_privado.requests
 SET created_at=clock_timestamp()-interval '40 minutes'
 WHERE id=rid;
 UPDATE cotironda_piloto_privado.ai_dispatch_jobs_mvp222
 SET leased_at=clock_timestamp()-interval '35 minutes',
  finished_at=clock_timestamp()-interval '30 minutes'
 WHERE request_id=rid AND supplier_key='corralon_ailin';
 UPDATE cotironda_piloto_privado.whapi_inbox
 SET received_at=clock_timestamp()-interval '20 minutes'
 WHERE message_hmac=sid;
 INSERT INTO cotironda_piloto_privado.ai_supplier_auto_recovery_mvp292(
  source_hmac,supplier_key,state,reason_code,finished_at)
 VALUES(sid,'corralon_ailin','linked','archive_bound_to_unique_round',clock_timestamp());
 result:=public.cotironda_piloto_claim_linked_text_mvp295();
 IF result->>'state'<>'claimed'
  OR result->>'message_hmac'<>sid OR result->>'chat_hmac'<>chat
 THEN RAISE EXCEPTION 'mvp295_old_quote_not_claimed: %',result;END IF;
 result:=public.cotironda_piloto_claim_linked_text_mvp295();
 IF result->>'state'='claimed'
 THEN RAISE EXCEPTION 'mvp295_duplicate_billable_claim';END IF;
 result:=public.cotironda_piloto_ia_reserve_quote_mvp227(
  sid,repeat('e',64));
 IF result->>'state'='reserved'
 THEN RAISE EXCEPTION 'mvp295_cross_supplier_or_chat_reserve';END IF;
 result:=public.cotironda_piloto_ia_reserve_quote_mvp227(sid,chat);
 IF result->>'state'<>'reserved'
  OR result->>'source_sha256'<>sha
  OR jsonb_array_length(result->'items')<1
 THEN RAISE EXCEPTION 'mvp295_historical_ia_still_blocked: %',result;END IF;
 result:=public.cotironda_piloto_ia_reserve_quote_mvp227(sid,chat);
 IF result->>'state'<>'already_reserved'
 THEN RAISE EXCEPTION 'mvp295_ia_reprocessing_allowed';END IF;
 result:=public.cotironda_piloto_finish_linked_text_mvp295(
  sid,'processed','commercial_verified');
 IF result->>'state'<>'not_verified'
 THEN RAISE EXCEPTION 'mvp295_unaudited_quote_marked_processed';END IF;
 result:=public.cotironda_piloto_finish_linked_text_mvp295(
  sid,'review','commercial_needs_review');
 IF result->>'state'<>'not_reviewed'
 THEN RAISE EXCEPTION 'mvp295_false_review_recorded';END IF;
 result:=public.cotironda_piloto_finish_linked_text_mvp295(
  sid,'uncertain','commercial_uncertain');
 IF result->>'state'<>'recorded'
 THEN RAISE EXCEPTION 'mvp295_private_uncertain_not_finished';END IF;
 result:=public.cotironda_piloto_finish_linked_text_mvp295(
  sid,'uncertain','commercial_uncertain');
 IF result->>'state'<>'already_finished'
 THEN RAISE EXCEPTION 'mvp295_replay_finish_not_idempotent';END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.whapi_outbox)<>before_outbox
 OR (SELECT count(*) FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222)<>before_dispatch

 THEN RAISE EXCEPTION 'mvp295_generated_outbound_or_false_offer';END IF;
 RAISE NOTICE 'MVP295 PASS: old source verified, one-shot private review, RLS, no outbound';
END $test$;
