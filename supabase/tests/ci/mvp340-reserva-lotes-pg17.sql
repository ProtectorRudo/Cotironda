-- MVP340: all operations below are inside the cumulative PG17 BEGIN/ROLLBACK.
-- This test reuses the synthetic, already-linked MVP336 source. No real pilot.
DO $test$
DECLARE
 v_source text;source_hash text;plan_hash text;chat text;
 rid uuid; reply jsonb;receipt text;before_jobs int;before_outbox int;
BEGIN
 IF has_function_privilege('anon',
  'public.cotironda_piloto_reserve_supplier_lots_mvp340(uuid,text,text,text,text,text,integer,integer,integer,integer)','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.cotironda_piloto_finish_supplier_lots_mvp340(uuid,text,text,text,text,text,text,text,text,integer,integer,integer)','EXECUTE')
 OR NOT has_function_privilege('service_role',
  'public.cotironda_piloto_reserve_supplier_lots_mvp340(uuid,text,text,text,text,text,integer,integer,integer,integer)','EXECUTE')
 OR has_table_privilege('service_role',
  'cotironda_piloto_privado.ai_supplier_lot_ledger_mvp340','SELECT')
 OR has_table_privilege('anon',
  'cotironda_piloto_privado.ai_supplier_lot_ledger_mvp340','SELECT')
 OR (SELECT NOT relrowsecurity FROM pg_class
  WHERE oid='cotironda_piloto_privado.ai_supplier_lot_ledger_mvp340'::regclass)
 THEN RAISE EXCEPTION 'mvp340_permissions_or_rls_failed';END IF;

 SELECT id INTO rid FROM cotironda_piloto_privado.requests
 WHERE source_hmac=encode(sha256(convert_to('mvp291_new_request','UTF8')),'hex');
 SELECT chat_hmac INTO chat FROM cotironda_piloto_privado.participants
 WHERE key='corralon_ailin';
 IF rid IS NULL OR chat IS NULL
 THEN RAISE EXCEPTION 'mvp340_missing_mvp336_fixture';END IF;
 v_source:=encode(sha256(convert_to('mvp336_document_15_2_1','UTF8')),'hex');
 source_hash:=encode(sha256(convert_to('mvp336_immutable_archive_bytes','UTF8')),'hex');
 plan_hash:=encode(sha256(convert_to('mvp340_plan_15_2_1','UTF8')),'hex');
 IF NOT EXISTS(SELECT 1
  FROM cotironda_piloto_privado.ai_supplier_links_mvp225
  WHERE message_hmac=v_source AND source_sha256=source_hash
   AND request_id=rid AND supplier_key='corralon_ailin')
 THEN RAISE EXCEPTION 'mvp340_missing_linked_source_fixture';END IF;

 SELECT count(*) INTO before_jobs FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222;
 SELECT count(*) INTO before_outbox FROM cotironda_piloto_privado.whapi_outbox;
 -- Wrong chat / source SHA / supplier / round must never reserve.
 reply:=public.cotironda_piloto_reserve_supplier_lots_mvp340(
  rid,'corralon_ailin',v_source,repeat('f',64),source_hash,
  plan_hash,3,1,2,1024);
 IF reply->>'state'='reserved'
 THEN RAISE EXCEPTION 'mvp340_wrong_chat_accepted';END IF;
 reply:=public.cotironda_piloto_reserve_supplier_lots_mvp340(
  rid,'corralon_ailin',v_source,chat,repeat('d',64),
  plan_hash,3,1,2,1024);
 IF reply->>'state'='reserved'
 THEN RAISE EXCEPTION 'mvp340_wrong_hash_accepted';END IF;
 reply:=public.cotironda_piloto_reserve_supplier_lots_mvp340(
  rid,'corralon_nahuel',v_source,chat,source_hash,
  plan_hash,3,1,2,1024);
 IF reply->>'state'='reserved'
 THEN RAISE EXCEPTION 'mvp340_wrong_supplier_accepted';END IF;
 reply:=public.cotironda_piloto_reserve_supplier_lots_mvp340(
  gen_random_uuid(),'corralon_ailin',v_source,chat,source_hash,
  plan_hash,3,1,2,1024);
 IF reply->>'state'='reserved'
 THEN RAISE EXCEPTION 'mvp340_wrong_round_accepted';END IF;
 reply:=public.cotironda_piloto_reserve_supplier_lots_mvp340(
  rid,'corralon_ailin',v_source,chat,source_hash,
  plan_hash,3,4,8,1024);
 IF reply->>'state'='reserved'
 THEN RAISE EXCEPTION 'mvp340_empty_lots_accepted';END IF;
 reply:=public.cotironda_piloto_reserve_supplier_lots_mvp340(
  rid,'corralon_ailin',v_source,chat,source_hash,
  plan_hash,3,1,1,1024);
 IF reply->>'state'='reserved'
 THEN RAISE EXCEPTION 'mvp340_incomplete_budget_accepted';END IF;

 -- Valid source with real linkage, consent and outbound acceptance.
 reply:=public.cotironda_piloto_reserve_supplier_lots_mvp340(
  rid,'corralon_ailin',v_source,chat,source_hash,
  plan_hash,3,1,2,1024);
 IF reply->>'state'<>'reserved' OR reply->>'sourceSha256'<>source_hash
 OR reply->>'supplierKey'<>'corralon_ailin'
 OR reply->>'roundId'<>rid::text
 OR reply->>'messageHmac'<>v_source
 OR reply->>'chatHmac'<>chat
 OR reply->>'receipt' !~ '^[a-f0-9]{32}$'
 THEN RAISE EXCEPTION 'mvp340_source_reservation_failed: %',reply;END IF;
 receipt:=reply->>'receipt';
 IF (SELECT count(*) FROM cotironda_piloto_privado.ai_supplier_lot_ledger_mvp340
  WHERE source_hmac=v_source AND state='leased')<>1
 THEN RAISE EXCEPTION 'mvp340_no_single_ledger';END IF;
 reply:=public.cotironda_piloto_reserve_supplier_lots_mvp340(
  rid,'corralon_ailin',v_source,chat,source_hash,
  plan_hash,3,1,2,1024);
 IF reply->>'state'<>'already_processed'
 THEN RAISE EXCEPTION 'mvp340_duplicate_model_cost';END IF;
 reply:=public.cotironda_piloto_finish_supplier_lots_mvp340(
  rid,'corralon_ailin',v_source,chat,source_hash,
  plan_hash,repeat('a',32),'analysis_ready_private',
  'all_rows_preserved',2,3,3);
 IF reply->>'state'='recorded'
 THEN RAISE EXCEPTION 'mvp340_forged_receipt_finished';END IF;
 reply:=public.cotironda_piloto_finish_supplier_lots_mvp340(
  rid,'corralon_ailin',v_source,chat,source_hash,
  plan_hash,receipt,'analysis_ready_private',
  'all_rows_preserved',1,3,3);
 IF reply->>'state'='recorded'
 THEN RAISE EXCEPTION 'mvp340_partial_reading_approved';END IF;
 reply:=public.cotironda_piloto_finish_supplier_lots_mvp340(
  rid,'corralon_ailin',v_source,chat,source_hash,
  plan_hash,receipt,'analysis_ready_private',
  'all_rows_preserved',2,3,3);
 IF reply->>'state'<>'recorded'
 THEN RAISE EXCEPTION 'mvp340_finish_not_recorded';END IF;
 reply:=public.cotironda_piloto_finish_supplier_lots_mvp340(
  rid,'corralon_ailin',v_source,chat,source_hash,
  plan_hash,receipt,'analysis_ready_private',
  'all_rows_preserved',2,3,3);
 IF reply->>'state'='recorded'
 THEN RAISE EXCEPTION 'mvp340_double_finish';END IF;
 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_supplier_lot_ledger_mvp340
  WHERE source_hmac=v_source AND
   (state<>'analysis_ready_private' OR model_calls<>2
    OR agreed_rows<>3 OR reason_code<>'all_rows_preserved'
    OR finished_at IS NULL))
 THEN RAISE EXCEPTION 'mvp340_final_record_incorrect';END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222)<>before_jobs
 OR (SELECT count(*) FROM cotironda_piloto_privado.whapi_outbox)<>before_outbox
 OR EXISTS(SELECT 1 FROM cotironda_piloto_privado.anonymous_supplier_docs_mvp107
  WHERE message_hmac=v_source)
 THEN RAISE EXCEPTION 'mvp340_unverified_quote_or_whatsapp_published';END IF;
 RAISE NOTICE 'MVP340 PASS: one durable lease, scoped receipt, no duplicate analysis or published quote';
END $test$;
