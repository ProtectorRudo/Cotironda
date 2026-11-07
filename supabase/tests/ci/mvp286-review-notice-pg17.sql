-- MVP286 PG17 transaccional: solo comprador con estado "review" y fuente verificada.
-- Se importa dentro de BEGIN/ROLLBACK del banco acumulativo.
DO $mvp286$
DECLARE
 r jsonb; n integer;h text; i text;
BEGIN
 IF has_function_privilege('anon',
   'public.cotironda_piloto_ia_reserve_review_notice_mvp286(text,text)','EXECUTE')
 OR has_function_privilege('authenticated',
   'public.cotironda_piloto_ia_finish_review_notice_mvp286(text,text,text,text)','EXECUTE')
 THEN RAISE EXCEPTION 'mvp286_public_acl_not_revoked';END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.ai_buyer_review_notice_mvp286)<>0
 THEN RAISE EXCEPTION 'mvp286_notice_must_start_empty';END IF;
 -- Existing fixture has an authorized architect and its authentic inbox.
 -- Turn gates ON only inside this transaction; no Whapi is called.
 UPDATE cotironda_piloto_privado.ai_central_control_mvp226
 SET enabled=true,activated_at=clock_timestamp() WHERE only_row;
 UPDATE cotironda_piloto_privado.ai_dispatch_gate_mvp222
 SET enabled=true,activated_at=clock_timestamp() WHERE only_row;
 UPDATE cotironda_piloto_privado.ai_trial_control_mvp229
 SET enabled=true,activated_at=clock_timestamp(),expires_at=NULL WHERE only_row;
 UPDATE cotironda_piloto_privado.ai_review_launch_mvp285
 SET enabled=true,activated_at=clock_timestamp() WHERE only_row;
 FOR n IN 1..4 LOOP
  i:=repeat(n::text,64);
  INSERT INTO cotironda_piloto_privado.whapi_inbox(
   message_hmac,chat_hmac,participant_key,kind,processing_state,
   plaintext_sha256,received_at)
  VALUES(i,repeat('a',64),'arquitecto','text','needs_review',
    repeat('e',64),clock_timestamp())
  ON CONFLICT DO NOTHING;
  INSERT INTO cotironda_piloto_privado.ai_central_attempts_mvp226(
   message_hmac,buyer_key,chat_hmac,source_sha256,state,
   failure_code,finished_at)
  VALUES(i,'arquitecto',repeat('a',64),repeat('e',64),'review',
   'ai_request_rejected',clock_timestamp())
  ON CONFLICT DO NOTHING;
 END LOOP;
 h:=repeat('1',64);
 r:=public.cotironda_piloto_ia_reserve_review_notice_mvp286(
    repeat('a',64),h);
 IF r->>'state'<>'leased' THEN
  RAISE EXCEPTION 'mvp286_first_notice_not_leased: %',r;END IF;
 r:=public.cotironda_piloto_ia_reserve_review_notice_mvp286(
    repeat('a',64),h);
 IF r->>'state'<>'already_reserved' THEN
  RAISE EXCEPTION 'mvp286_duplicate_leased: %',r;END IF;
 IF public.cotironda_piloto_ia_finish_review_notice_mvp286(
    repeat('a',64),h,'api_accepted',NULL)
 THEN RAISE EXCEPTION 'mvp286_accepted_without_id';END IF;
 IF NOT public.cotironda_piloto_ia_finish_review_notice_mvp286(
    repeat('a',64),h,'api_accepted','whapi-mvp286-review-1')
 THEN RAISE EXCEPTION 'mvp286_valid_finish_not_saved';END IF;
 IF public.cotironda_piloto_ia_finish_review_notice_mvp286(
    repeat('a',64),h,'api_accepted','whapi-mvp286-review-1')
 THEN RAISE EXCEPTION 'mvp286_second_send_allowed';END IF;
 r:=public.cotironda_piloto_ia_reserve_review_notice_mvp286(
    repeat('a',64),repeat('2',64));
 IF r->>'state'<>'leased' THEN RAISE EXCEPTION 'mvp286_second_notice_not_leased';END IF;
 IF NOT public.cotironda_piloto_ia_finish_review_notice_mvp286(
    repeat('a',64),repeat('2',64),'uncertain',NULL)
 THEN RAISE EXCEPTION 'mvp286_uncertain_not_saved';END IF;
 r:=public.cotironda_piloto_ia_reserve_review_notice_mvp286(
    repeat('a',64),repeat('3',64));
 IF r->>'state'<>'quota_exceeded' THEN
  RAISE EXCEPTION 'mvp286_daily_quota_not_enforced: %',r;END IF;
 r:=public.cotironda_piloto_ia_reserve_review_notice_mvp286(
    repeat('2',64),repeat('4',64));
 IF r->>'state'='leased' THEN RAISE EXCEPTION 'mvp286_supplier_sent_buyer_notice';END IF;
 UPDATE cotironda_piloto_privado.participants
 SET opted_out_at=clock_timestamp() WHERE key='arquitecto';
 r:=public.cotironda_piloto_ia_reserve_review_notice_mvp286(
    repeat('a',64),repeat('4',64));
 IF r->>'state'='leased' THEN RAISE EXCEPTION 'mvp286_revoked_buyer_not_blocked';END IF;
 UPDATE cotironda_piloto_privado.participants
 SET opted_out_at=NULL WHERE key='arquitecto';
 UPDATE cotironda_piloto_privado.ai_review_launch_mvp285
 SET enabled=false,activated_at=NULL WHERE only_row;
 r:=public.cotironda_piloto_ia_reserve_review_notice_mvp286(
    repeat('a',64),repeat('4',64));
 IF r->>'state'<>'inactive' THEN RAISE EXCEPTION 'mvp286_operator_gate_bypassed';END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.ai_buyer_review_notice_mvp286)<>2
 OR (SELECT count(*) FROM cotironda_piloto_privado.whapi_outbox)<>0
 THEN RAISE EXCEPTION 'mvp286_unexpected_outbox_data';END IF;
 RAISE NOTICE 'MVP286 PASS: one-time buyer notice, Whapi ID required, daily quota 2, revoked denied, no external messages';
END $mvp286$;
