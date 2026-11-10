-- MVP342 synthetic PG17: each external call is leased before any cost,
-- privacy and token observations held in RLS table only. One ROLLBACK.
DO $test$
DECLARE v_source text;v_hash text;v_chat text;v_round uuid;
 v_plan text;v_receipt text;v_digest text;v_result jsonb;
 v_calls int;v_before_outbox int;
BEGIN
 IF has_function_privilege('anon',
  'public.cotironda_piloto_begin_lot_call_mvp342(text,text,text,integer,text,text,text)','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.cotironda_piloto_finish_lot_call_mvp342(text,text,text,integer,text,text,text,text,text,text,text,text,text,integer,integer,integer)','EXECUTE')
 OR has_function_privilege('anon',
  'public.cotironda_piloto_observed_lots_mvp342(text,text,text)','EXECUTE')
 OR has_table_privilege('service_role',
  'cotironda_piloto_privado.ai_supplier_lot_calls_mvp342','SELECT')
 OR has_table_privilege('authenticated',
  'cotironda_piloto_privado.ai_supplier_lot_calls_mvp342','SELECT')
 OR NOT has_function_privilege('service_role',
  'public.cotironda_piloto_begin_lot_call_mvp342(text,text,text,integer,text,text,text)','EXECUTE')
 OR (SELECT NOT relrowsecurity FROM pg_catalog.pg_class WHERE oid=
  'cotironda_piloto_privado.ai_supplier_lot_calls_mvp342'::regclass)
 THEN RAISE EXCEPTION 'mvp342_acl_broken';END IF;

 v_source:=pg_catalog.encode(pg_catalog.sha256(
  pg_catalog.convert_to('mvp336_document_15_2_1','UTF8')),'hex');
 v_hash:=pg_catalog.encode(pg_catalog.sha256(
  pg_catalog.convert_to('mvp336_immutable_archive_bytes','UTF8')),'hex');
 v_plan:=pg_catalog.encode(pg_catalog.sha256(
  pg_catalog.convert_to('mvp342_synthetic_plan_v1','UTF8')),'hex');
 v_digest:=pg_catalog.encode(pg_catalog.sha256(
  pg_catalog.convert_to('mvp342_synthetic_lot','UTF8')),'hex');
 SELECT a.chat_hmac,a.request_id INTO v_chat,v_round
 FROM cotironda_piloto_privado.media_archive_mvp095 a
 WHERE a.message_hmac=v_source;
 IF v_round IS NULL THEN RAISE EXCEPTION 'mvp342_missing_source_fixture';END IF;

 -- Previous MVP341 synthetic negative test made acceptance TOO LATE.
 -- Restore a credible sent-before-inbound synthetic job, no real sends.
 UPDATE cotironda_piloto_privado.ai_dispatch_jobs_mvp222
 SET finished_at=(
  SELECT inbox.received_at-interval '1 minute'
  FROM cotironda_piloto_privado.whapi_inbox inbox
  WHERE inbox.message_hmac=v_source)
 WHERE request_id=v_round AND supplier_key='corralon_ailin';
 SELECT count(*) INTO v_before_outbox FROM cotironda_piloto_privado.whapi_outbox;

 v_result:=public.cotironda_piloto_reserve_supplier_lots_mvp340(
  v_round,'corralon_ailin',v_source,v_chat,v_hash,
  v_plan,3,1,2,300);
 IF v_result->>'state'<>'reserved'
 THEN RAISE EXCEPTION 'mvp342_parent_lease_missing: %',v_result;END IF;
 v_receipt:=v_result->>'receipt';

 v_result:=public.cotironda_piloto_begin_lot_call_mvp342(
  v_source,repeat('f',32),v_plan,1,'primary',v_digest,'gpt-6-luna');
 IF v_result->>'state'='reserved'
 THEN RAISE EXCEPTION 'mvp342_forged_receipt';END IF;

 v_result:=public.cotironda_piloto_begin_lot_call_mvp342(
  v_source,v_receipt,v_plan,1,'primary',v_digest,'gpt-6-luna');
 IF v_result->>'state'<>'reserved'
 THEN RAISE EXCEPTION 'mvp342_first_call_not_leased: %',v_result;END IF;
 v_result:=public.cotironda_piloto_begin_lot_call_mvp342(
  v_source,v_receipt,v_plan,1,'primary',v_digest,'gpt-6-luna');
 IF v_result->>'state'='reserved'
 THEN RAISE EXCEPTION 'mvp342_duplicate_expensive_call';END IF;
 v_result:=public.cotironda_piloto_begin_lot_call_mvp342(
  v_source,v_receipt,v_plan,1,'corroboration',v_digest,'gpt-6-luna');
 IF v_result->>'state'='reserved'
 THEN RAISE EXCEPTION 'mvp342_next_before_usage_recorded';END IF;

 v_result:=public.cotironda_piloto_finish_lot_call_mvp342(
  v_source,v_receipt,v_plan,1,'primary',v_digest,'gpt-6-luna',
  'observed',NULL,repeat('A',16),repeat('Q',128),
  repeat('a',64),repeat('b',64),100,20,121);
 IF v_result->>'state'='recorded'
 THEN RAISE EXCEPTION 'mvp342_forged_total_tokens';END IF;
 v_result:=public.cotironda_piloto_finish_lot_call_mvp342(
  v_source,v_receipt,v_plan,1,'primary',v_digest,'gpt-6-luna',
  'observed',NULL,repeat('A',16),repeat('Q',128),
  repeat('a',64),repeat('b',64),100,20,120);
 IF v_result->>'state'<>'recorded'
 THEN RAISE EXCEPTION 'mvp342_observed_evidence_not_saved: %',v_result;END IF;
 v_result:=public.cotironda_piloto_begin_lot_call_mvp342(
  v_source,v_receipt,v_plan,1,'corroboration',v_digest,'gpt-6-luna');
 IF v_result->>'state'<>'reserved'
 THEN RAISE EXCEPTION 'mvp342_second_call_not_leased: %',v_result;END IF;
 v_result:=public.cotironda_piloto_finish_lot_call_mvp342(
  v_source,v_receipt,v_plan,1,'corroboration',v_digest,'gpt-6-luna',
  'observed',NULL,repeat('B',16),repeat('R',128),
  repeat('c',64),repeat('d',64),200,30,230);
 IF v_result->>'state'<>'recorded'
 THEN RAISE EXCEPTION 'mvp342_second_evidence_not_saved: %',v_result;END IF;
 v_result:=public.cotironda_piloto_observed_lots_mvp342(
  v_source,v_receipt,v_plan);
 IF v_result->>'state'<>'observed_complete'
 THEN RAISE EXCEPTION 'mvp342_all_calls_not_credited';END IF;

 SELECT count(*) INTO v_calls
 FROM cotironda_piloto_privado.ai_supplier_lot_calls_mvp342
 WHERE source_hmac=v_source AND state='observed'
  AND input_tokens+output_tokens=total_tokens
  AND pg_catalog.length(ciphertext_b64)>60
  AND pg_catalog.length(nonce_b64)=16;
 IF v_calls<>2 THEN RAISE EXCEPTION 'mvp342_missing_encrypted_call_records';END IF;

 -- SQL cannot decrypt/verify AES-GCM: only trusted Edge can create the
 -- ciphertext. SQL enforces no plaintext and records metering metadata.
 -- In synthetic fixture the ciphertext is a deliberately nonsecret dummy.
 DELETE FROM cotironda_piloto_privado.ai_supplier_lot_calls_mvp342
 WHERE source_hmac=v_source;
 v_result:=public.cotironda_piloto_begin_lot_call_mvp342(
  v_source,v_receipt,v_plan,1,'primary',v_digest,'gpt-6-luna');
 IF v_result->>'state'<>'reserved'
 THEN RAISE EXCEPTION 'mvp342_synthetic_reset_failed';END IF;
 v_result:=public.cotironda_piloto_finish_lot_call_mvp342(
  v_source,v_receipt,v_plan,1,'primary',v_digest,'gpt-6-luna',
  'unmetered','network_uncertain',NULL,NULL,NULL,NULL,NULL,NULL,NULL);
 IF v_result->>'state'<>'recorded'
 THEN RAISE EXCEPTION 'mvp342_unknown_spend_not_recorded';END IF;
 v_result:=public.cotironda_piloto_begin_lot_call_mvp342(
  v_source,v_receipt,v_plan,1,'corroboration',v_digest,'gpt-6-luna');
 IF v_result->>'state'='reserved'
 THEN RAISE EXCEPTION 'mvp342_unknown_spend_treated_as_free';END IF;
 v_result:=public.cotironda_piloto_observed_lots_mvp342(
  v_source,v_receipt,v_plan);
 IF v_result->>'state'='observed_complete'
 THEN RAISE EXCEPTION 'mvp342_unmetered_quote_could_be_promoted';END IF;

 IF (SELECT count(*) FROM cotironda_piloto_privado.whapi_outbox)<>v_before_outbox
 THEN RAISE EXCEPTION 'mvp342_whatsapp_side_effect';END IF;
 RAISE NOTICE 'MVP342 PASS: service_role only, encrypted records and observed tokens, unknown blocks';
END $test$;
