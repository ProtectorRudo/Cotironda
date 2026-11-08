-- MVP316 concurrency preparation. CI POSTGRESQL17 ONLY, never Supabase.
-- Run AFTER committing the fully synthetic MVP315 fixture in the
-- disposable cotironda_ci database. No external calls or real accounts.
DO $synthetic316$
DECLARE v_request uuid; v_buyer text; v_count integer;
BEGIN
 IF current_database()<>'cotironda_ci' OR current_user<>'postgres'
  OR session_user<>'postgres'
 THEN RAISE EXCEPTION 'mvp316_disposable_database_only' USING ERRCODE='42501';END IF;
 SELECT r.id,r.buyer_key INTO v_request,v_buyer
 FROM cotironda_piloto_privado.requests r
 JOIN cotironda_piloto_privado.ai_shadow_requests_mvp221 sh
  ON sh.request_id=r.id AND sh.status='shadow'
 LIMIT 1;
 IF v_request IS NULL THEN RAISE EXCEPTION 'mvp316_synthetic_round_absent';END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 j
  JOIN cotironda_piloto_privado.admin_channels_mvp312 ch
   ON ch.participant_key=j.supplier_key AND ch.participant_role='supplier'
  WHERE j.request_id=v_request)<3
 THEN RAISE EXCEPTION 'mvp316_three_synthetic_suppliers_required';END IF;
 UPDATE cotironda_piloto_privado.participants
 SET opted_out_at=NULL WHERE key=v_buyer;
 UPDATE cotironda_piloto_privado.ai_batch_gate_mvp314
 SET enabled=true,activated_at=clock_timestamp()-interval '1 hour',
  daily_attempt_limit=1,buyer_daily_attempt_limit=1 WHERE only_row;
 UPDATE cotironda_piloto_privado.ai_buyer_notice_gate_mvp315
 SET enabled=true,activated_at=clock_timestamp()-interval '10 days',
  daily_notice_limit=1 WHERE only_row;
 UPDATE cotironda_piloto_privado.ai_auto_release_gate_mvp306
 SET enabled=true,activated_at=clock_timestamp()-interval '10 days'
 WHERE only_row;
 DELETE FROM cotironda_piloto_privado.ai_batch_budget_mvp314;
 DELETE FROM cotironda_piloto_privado.ai_batch_buyer_budget_mvp314;
 DELETE FROM cotironda_piloto_privado.ai_buyer_notice_budget_mvp315;
 DELETE FROM cotironda_piloto_privado.buyer_tracking_mvp091
 WHERE request_id=v_request;
 WITH eligible AS (
   SELECT j.supplier_key FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 j
   JOIN cotironda_piloto_privado.admin_channels_mvp312 ch
    ON ch.participant_key=j.supplier_key AND ch.participant_role='supplier'
   WHERE j.request_id=v_request ORDER BY j.supplier_key LIMIT 2
 )
 UPDATE cotironda_piloto_privado.ai_dispatch_jobs_mvp222 j
 SET state='pending',lease_token=NULL,leased_at=NULL,finished_at=NULL,
     whapi_message_id=NULL
 WHERE j.request_id=v_request AND j.supplier_key IN
   (SELECT supplier_key FROM eligible);
 SELECT count(*) INTO v_count
 FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222
 WHERE request_id=v_request AND state='pending';
 IF v_count<>2 OR NOT cotironda_piloto_privado.confirmada_comprador_mvp280(v_request)
 THEN RAISE EXCEPTION 'mvp316_prepared_jobs_invalid';END IF;
 IF public.cotironda_piloto_ia_next_batch_mvp314()->>'state'<>'ready'
 THEN RAISE EXCEPTION 'mvp316_claim_not_ready';END IF;
 IF public.cotironda_piloto_ia_next_buyer_notice_mvp315('pilotchan_313')->>'state'<>'empty'
 THEN RAISE EXCEPTION 'mvp316_unfinished_notice_was_eligible';END IF;
END $synthetic316$;
