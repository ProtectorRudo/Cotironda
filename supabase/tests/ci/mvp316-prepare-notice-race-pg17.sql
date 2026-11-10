-- MVP316: disposable-only prepare race for 1 buyer tracking token.
DO $prepare316$
DECLARE rid uuid;
BEGIN
 IF current_database()<>'cotironda_ci' OR current_user<>'postgres'
  OR session_user<>'postgres'
 THEN RAISE EXCEPTION 'mvp316_disposable_database_only' USING ERRCODE='42501';END IF;
 SELECT request_id INTO rid FROM cotironda_piloto_privado.ai_shadow_requests_mvp221 LIMIT 1;
 IF rid IS NULL THEN RAISE EXCEPTION 'mvp316_no_synthetic_round';END IF;
 -- All IDs are simulated in disposable CI; never fabricate them in pilot.
 UPDATE cotironda_piloto_privado.ai_dispatch_jobs_mvp222
 SET state='api_accepted',
  lease_token=coalesce(lease_token,gen_random_uuid()),
  leased_at=coalesce(leased_at,clock_timestamp()),
  finished_at=coalesce(finished_at,clock_timestamp()),
  whapi_message_id='synthetic-mvp316-'||supplier_key
 WHERE request_id=rid;
 DELETE FROM cotironda_piloto_privado.buyer_tracking_mvp091 WHERE request_id=rid;
 DELETE FROM cotironda_piloto_privado.ai_buyer_notice_budget_mvp315;
 IF public.cotironda_piloto_ia_next_buyer_notice_mvp315('pilotchan_313')
  ->>'state'<>'ready'
 THEN RAISE EXCEPTION 'mvp316_notice_precondition_unmet';END IF;
END $prepare316$;
