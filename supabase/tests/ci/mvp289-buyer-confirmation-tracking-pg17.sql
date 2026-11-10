-- MVP289: isolated PostgreSQL 17 verification, executed AFTER MVP288 fixture.
-- All changes are inside the same outer BEGIN/ROLLBACK.
DO $test$
DECLARE rid uuid; rid_recovery uuid; moment timestamptz; answer jsonb;
 confirm_event text:=encode(sha256(convert_to('mvp289_confirm_signed_2026','UTF8')),'hex');
 recovery_event text:=encode(sha256(convert_to('mvp289_recovery_signed_2026','UTF8')),'hex');
 missing_event text:=encode(sha256(convert_to('mvp289_unsigned_event_2026','UTF8')),'hex');
BEGIN
 IF has_function_privilege('anon',
  'public.cotironda_piloto_issue_confirmed_tracking_mvp289(text,text,uuid,text,text)','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.cotironda_piloto_issue_confirmed_tracking_mvp289(text,text,uuid,text,text)','EXECUTE')
 THEN RAISE EXCEPTION 'mvp289_public_rpc_exposed';END IF;
 IF has_table_privilege('anon','cotironda_piloto_privado.buyer_tracking_mvp091','SELECT')
 THEN RAISE EXCEPTION 'mvp289_token_table_exposed';END IF;
 SELECT id INTO rid FROM cotironda_piloto_privado.requests
 WHERE source_hmac=repeat('7',64);
 IF rid IS NULL THEN RAISE EXCEPTION 'mvp289_missing_fixture';END IF;
 -- A reviewed, authorized buyer and a validated prior Whapi confirmation.
 -- The original MVP288 SQL does NOT send real messages.
 INSERT INTO cotironda_piloto_privado.whapi_inbox(
   message_hmac,participant_key,chat_hmac,kind,processing_state,
   plaintext_sha256,received_at)
 VALUES(confirm_event,'arquitecto',repeat('a',64),'text','needs_review',
   encode(sha256(convert_to('CONFIRMAR COTI 1234567890ABCDEF','UTF8')),'hex'),
   clock_timestamp());
 UPDATE cotironda_piloto_privado.ai_buyer_review_mvp279
 SET state='confirmed',whapi_message_id='mvp289-review-00001',
  sent_at=clock_timestamp(),confirmed_at=clock_timestamp(),
  confirmed_reply_hmac=confirm_event
 WHERE request_id=rid;
 -- This SQL fixture does not publish or dispatch through the real RPC.
 -- It constructs the same final persisted state for a read-only RPC test.
 UPDATE cotironda_piloto_privado.requests SET state='prepared' WHERE id=rid;
 INSERT INTO cotironda_piloto_privado.ai_dispatch_jobs_mvp222(
  request_id,supplier_key,state,lease_token,leased_at,finished_at,whapi_message_id)
 VALUES(rid,'corralon_ailin','pending',NULL,NULL,NULL,NULL);

 answer:=public.cotironda_piloto_issue_confirmed_tracking_mvp289(
  repeat('a',64),confirm_event,rid,repeat('e',64),'confirmed');
 IF answer->>'state'<>'not_eligible_or_issued' THEN
  RAISE EXCEPTION 'mvp289_premature_message: %',answer;END IF;
 UPDATE cotironda_piloto_privado.ai_dispatch_jobs_mvp222
 SET state='api_accepted',lease_token=gen_random_uuid(),
   leased_at=clock_timestamp(),finished_at=clock_timestamp(),
   whapi_message_id='mvp289-supplier-00001'
 WHERE request_id=rid;
 answer:=public.cotironda_piloto_issue_confirmed_tracking_mvp289(
  repeat('c',64),confirm_event,rid,repeat('e',64),'confirmed');
 IF answer->>'state' NOT IN ('not_authorized','not_eligible_or_issued')
 THEN RAISE EXCEPTION 'mvp289_wrong_buyer: %',answer;END IF;
 answer:=public.cotironda_piloto_issue_confirmed_tracking_mvp289(
  repeat('a',64),missing_event,rid,repeat('e',64),'confirmed');
 IF answer->>'state'<>'not_authorized'
 THEN RAISE EXCEPTION 'mvp289_missing_signed_event: %',answer;END IF;
 answer:=public.cotironda_piloto_issue_confirmed_tracking_mvp289(
  repeat('a',64),confirm_event,rid,repeat('e',64),'confirmed');
 IF answer->>'state'<>'issued' OR answer->>'request_id'<>rid::text
 THEN RAISE EXCEPTION 'mvp289_link_not_issued: %',answer;END IF;
 answer:=public.cotironda_piloto_issue_confirmed_tracking_mvp289(
  repeat('a',64),confirm_event,rid,repeat('f',64),'confirmed');
 IF answer->>'state'='issued' THEN
  RAISE EXCEPTION 'mvp289_double_link';END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.buyer_tracking_mvp091
   WHERE request_id=rid)<>1
 THEN RAISE EXCEPTION 'mvp289_duplicate_tracking_token';END IF;
 INSERT INTO cotironda_piloto_privado.whapi_inbox(
  message_hmac,participant_key,chat_hmac,kind,processing_state,
  plaintext_sha256,received_at)
 VALUES(recovery_event,'arquitecto',repeat('a',64),'text','needs_review',
  encode(sha256(convert_to('SEGUIMIENTO COTI','UTF8')),'hex'),
  clock_timestamp());
 answer:=public.cotironda_piloto_issue_confirmed_tracking_mvp289(
  repeat('a',64),recovery_event,NULL,repeat('d',64),'recovery');
 IF answer->>'state'='issued'
 THEN RAISE EXCEPTION 'mvp289_recovery_duplicated_existing_link';END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222
  WHERE request_id=rid)<>1
 THEN RAISE EXCEPTION 'mvp289_requeued_supplier';END IF;
 -- A second confirmed and dispatched round WITHOUT tracking is recoverable
 -- by an explicitly signed message from the same buyer, without a new job.
 SELECT id INTO rid_recovery FROM cotironda_piloto_privado.requests
 WHERE source_hmac=repeat('0',64);
 moment:=clock_timestamp();
 UPDATE cotironda_piloto_privado.requests SET state='prepared'
 WHERE id=rid_recovery;
 INSERT INTO cotironda_piloto_privado.ai_buyer_review_mvp279(
  request_id,buyer_key,chat_hmac,source_hmac,snapshot_sha256,code_sha256,
  state,whapi_message_id,sent_at,confirmed_reply_hmac,confirmed_at,created_at,expires_at)
 VALUES(rid_recovery,'arquitecto',repeat('a',64),repeat('0',64),
  encode(sha256(convert_to('mvp289_snapshot_recovery','UTF8')),'hex'),
  encode(sha256(convert_to('mvp289_code_recovery','UTF8')),'hex'),
  'confirmed','mvp289-review-recovery-001',moment,
  encode(sha256(convert_to('mvp289_previously_confirmed','UTF8')),'hex'),
  moment,moment,moment+interval '1 hour');
 INSERT INTO cotironda_piloto_privado.ai_dispatch_jobs_mvp222(
  request_id,supplier_key,state,lease_token,leased_at,finished_at,whapi_message_id)
 VALUES(rid_recovery,'corralon_ailin','api_accepted',gen_random_uuid(),
        moment,moment,'mvp289-supplier-recovery-001');
 answer:=public.cotironda_piloto_issue_confirmed_tracking_mvp289(
  repeat('a',64),recovery_event,NULL,repeat('d',64),'recovery');
 IF answer->>'state'<>'issued' OR answer->>'request_id'<>rid_recovery::text
 THEN RAISE EXCEPTION 'mvp289_valid_recovery_denied: %',answer;END IF;
 answer:=public.cotironda_piloto_issue_confirmed_tracking_mvp289(
  repeat('a',64),recovery_event,NULL,repeat('e',64),'recovery');
 IF answer->>'state'='issued'
 THEN RAISE EXCEPTION 'mvp289_repeated_recovery_issued_second_token';END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222
  WHERE request_id=rid_recovery)<>1
 THEN RAISE EXCEPTION 'mvp289_recovery_resent_supplier';END IF;
 RAISE NOTICE 'MVP289 PASS: signed buyer, accepted supplier, one private token, no repeat dispatch';
END $test$;
