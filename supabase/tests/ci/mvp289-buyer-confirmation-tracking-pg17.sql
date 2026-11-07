-- MVP289: isolated PostgreSQL 17 verification, executed AFTER MVP288 fixture.
-- All changes are inside the same outer BEGIN/ROLLBACK.
DO $test$
DECLARE rid uuid; answer jsonb; rsrc text;
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
 VALUES(repeat('b',64),'arquitecto',repeat('a',64),'text','needs_review',
   encode(sha256(convert_to('CONFIRMAR COTI 1234567890ABCDEF','UTF8')),'hex'),
   clock_timestamp());
 UPDATE cotironda_piloto_privado.ai_buyer_review_mvp279
 SET state='confirmed',whapi_message_id='mvp289-review-00001',
  sent_at=clock_timestamp(),confirmed_at=clock_timestamp(),
  confirmed_reply_hmac=repeat('b',64)
 WHERE request_id=rid;
 -- This SQL fixture does not publish or dispatch through the real RPC.
 -- It constructs the same final persisted state for a read-only RPC test.
 UPDATE cotironda_piloto_privado.requests SET state='prepared' WHERE id=rid;
 INSERT INTO cotironda_piloto_privado.ai_dispatch_jobs_mvp222(
  request_id,supplier_key,state,lease_token,leased_at,finished_at,whapi_message_id)
 VALUES(rid,'corralon_ailin','pending',NULL,NULL,NULL,NULL);

 answer:=public.cotironda_piloto_issue_confirmed_tracking_mvp289(
  repeat('a',64),repeat('b',64),rid,repeat('e',64),'confirmed');
 IF answer->>'state'<>'not_eligible_or_issued' THEN
  RAISE EXCEPTION 'mvp289_premature_message: %',answer;END IF;
 UPDATE cotironda_piloto_privado.ai_dispatch_jobs_mvp222
 SET state='api_accepted',lease_token=gen_random_uuid(),
   leased_at=clock_timestamp(),finished_at=clock_timestamp(),
   whapi_message_id='mvp289-supplier-00001'
 WHERE request_id=rid;
 answer:=public.cotironda_piloto_issue_confirmed_tracking_mvp289(
  repeat('c',64),repeat('b',64),rid,repeat('e',64),'confirmed');
 IF answer->>'state' NOT IN ('not_authorized','not_eligible_or_issued')
 THEN RAISE EXCEPTION 'mvp289_wrong_buyer: %',answer;END IF;
 answer:=public.cotironda_piloto_issue_confirmed_tracking_mvp289(
  repeat('a',64),repeat('c',64),rid,repeat('e',64),'confirmed');
 IF answer->>'state'<>'not_authorized'
 THEN RAISE EXCEPTION 'mvp289_missing_signed_event: %',answer;END IF;
 answer:=public.cotironda_piloto_issue_confirmed_tracking_mvp289(
  repeat('a',64),repeat('b',64),rid,repeat('e',64),'confirmed');
 IF answer->>'state'<>'issued' OR answer->>'request_id'<>rid::text
 THEN RAISE EXCEPTION 'mvp289_link_not_issued: %',answer;END IF;
 answer:=public.cotironda_piloto_issue_confirmed_tracking_mvp289(
  repeat('a',64),repeat('b',64),rid,repeat('f',64),'confirmed');
 IF answer->>'state'='issued' THEN
  RAISE EXCEPTION 'mvp289_double_link';END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.buyer_tracking_mvp091
   WHERE request_id=rid)<>1
 THEN RAISE EXCEPTION 'mvp289_duplicate_tracking_token';END IF;
 INSERT INTO cotironda_piloto_privado.whapi_inbox(
  message_hmac,participant_key,chat_hmac,kind,processing_state,
  plaintext_sha256,received_at)
 VALUES(repeat('c',64),'arquitecto',repeat('a',64),'text','needs_review',
  encode(sha256(convert_to('SEGUIMIENTO COTI','UTF8')),'hex'),
  clock_timestamp());
 answer:=public.cotironda_piloto_issue_confirmed_tracking_mvp289(
  repeat('a',64),repeat('c',64),NULL,repeat('d',64),'recovery');
 IF answer->>'state'='issued'
 THEN RAISE EXCEPTION 'mvp289_recovery_duplicated_existing_link';END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222
  WHERE request_id=rid)<>1
 THEN RAISE EXCEPTION 'mvp289_requeued_supplier';END IF;
 RAISE NOTICE 'MVP289 PASS: signed buyer, accepted supplier, one private token, no repeat dispatch';
END $test$;
