-- MVP314 - PG17 synthetic batch, rollback by parent fixture. No outbound.
DO $test314$
DECLARE rid uuid; r jsonb; job jsonb; grant_ jsonb;
 supplier text; i integer; count_leased integer; day_reserved integer;
 source text; names text[]:=ARRAY[]::text[];
 day_utc date:=(clock_timestamp() AT TIME ZONE 'UTC')::date;
BEGIN
 IF has_function_privilege('anon',
  'public.cotironda_piloto_ia_claim_mvp314(uuid)','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.cotironda_piloto_ia_next_batch_mvp314()','EXECUTE')
 OR NOT has_function_privilege('service_role',
  'public.cotironda_piloto_ia_claim_mvp314(uuid)','EXECUTE')
 OR has_function_privilege('anon',
  'public.cotironda_piloto_ia_batch_health_mvp314()','EXECUTE')
 THEN RAISE EXCEPTION 'mvp314_rpc_public_access';END IF;
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE
   oid='cotironda_piloto_privado.ai_batch_budget_mvp314'::regclass)
 THEN RAISE EXCEPTION 'mvp314_budget_rls_off';END IF;
 SELECT request_id INTO rid
 FROM cotironda_piloto_privado.ai_shadow_requests_mvp221 LIMIT 1;
 IF rid IS NULL THEN RAISE EXCEPTION 'mvp314_missing_synthetic_round';END IF;
 IF public.cotironda_piloto_ia_next_batch_mvp314()->>'state'<>'disabled'
 OR public.cotironda_piloto_ia_claim_mvp314(rid)->>'state'<>'disabled'
 THEN RAISE EXCEPTION 'mvp314_default_not_off';END IF;
 UPDATE cotironda_piloto_privado.ai_batch_gate_mvp314
  SET enabled=true,activated_at=clock_timestamp(),daily_attempt_limit=2
 WHERE only_row;
 -- Pre-activation historical jobs must not be picked up.
 IF public.cotironda_piloto_ia_next_batch_mvp314()->>'state'<>'empty'
 THEN RAISE EXCEPTION 'mvp314_old_jobs_must_be_excluded';END IF;
 FOR i IN 1..3 LOOP
   source:='mvp314_source_'||i;
   grant_:=cotironda_piloto_privado.admin_create_and_bind_mvp312(
    'supplier','Proveedor Nuevo Lote '||i,'La Plata',
    source,'pilotchan_313',
    encode(sha256(convert_to('mvp314_test_chat_'||i,'UTF8')),'hex'),
    encode(sha256(convert_to('mvp314_test_sha_'||i,'UTF8')),'hex'),
    repeat('E',16),repeat('F',64));
   IF grant_->>'state'<>'created_and_bound'
   THEN RAISE EXCEPTION 'mvp314_admin_supplier_%: %',i,grant_;END IF;
   supplier:=grant_->>'participant_key';
   names:=array_append(names,supplier);
   IF NOT cotironda_piloto_privado.proveedor_contactable_mvp307(supplier)
   THEN RAISE EXCEPTION 'mvp314_supplier_no_permission';END IF;
   INSERT INTO cotironda_piloto_privado.catalogue_lines(
    participant_key,line_no,literal_description,family_code,recognition_state)
   SELECT supplier,line_no,literal_description,family_code,recognition_state
   FROM cotironda_piloto_privado.catalogue_lines
   WHERE participant_key='corralon_ailin' AND line_no=1;
   INSERT INTO cotironda_piloto_privado.ai_shadow_destinos_mvp221(
    request_id,supplier_key,line_no,catalogue_line_no,
    catalogue_description,tipo,explicacion)
   SELECT request_id,supplier,line_no,catalogue_line_no,
    catalogue_description,tipo,explicacion
   FROM cotironda_piloto_privado.ai_shadow_destinos_mvp221
   WHERE request_id=rid AND supplier_key='corralon_ailin';
   INSERT INTO cotironda_piloto_privado.invitations(request_id,supplier_key)
    VALUES(rid,supplier);
   INSERT INTO cotironda_piloto_privado.invitation_lines_mvp099(
    request_id,supplier_key,line_no)
   SELECT request_id,supplier,line_no
   FROM cotironda_piloto_privado.ai_shadow_destinos_mvp221
   WHERE request_id=rid AND supplier_key=supplier;
   INSERT INTO cotironda_piloto_privado.ai_dispatch_jobs_mvp222(
     request_id,supplier_key)
   VALUES(rid,supplier);
 END LOOP;
 r:=public.cotironda_piloto_ia_next_batch_mvp314();
 IF r->>'state'<>'ready' OR (r->>'request_id')::uuid<>rid
 THEN RAISE EXCEPTION 'mvp314_not_ready: %',r;END IF;
 UPDATE cotironda_piloto_privado.ai_batch_gate_mvp314
   SET buyer_daily_attempt_limit=1 WHERE only_row;
 FOR i IN 1..2 LOOP
   -- Even webhook's original MVP222 RPC must share the MVP314 quota.
   job:=CASE WHEN i=1
    THEN public.cotironda_piloto_ia_claim_mvp314(rid)
    ELSE public.cotironda_piloto_ia_claim_mvp222(rid) END;
   IF job->>'state'<>'leased' OR NOT(job->>'supplier_key'=ANY(names))
   THEN RAISE EXCEPTION 'mvp314_no_lease: %',job;END IF;
   IF public.cotironda_piloto_ia_pdf_snapshot_mvp222(
     rid,job->>'supplier_key',(job->>'lease_token')::uuid) IS NULL
   THEN RAISE EXCEPTION 'mvp314_pdf_snapshot_failed';END IF;
   IF public.cotironda_piloto_ia_recipient_packet_mvp313(
    rid,job->>'supplier_key',(job->>'lease_token')::uuid,
    job->>'chat_hmac','pilotchan_313')->>'state'<>'ready'
   THEN RAISE EXCEPTION 'mvp314_contact_packet_failed';END IF;
   IF i=1 THEN
    IF public.cotironda_piloto_ia_next_batch_mvp314()->>'state'<>'empty'
    OR public.cotironda_piloto_ia_claim_mvp222(rid)->>'state'<>'empty'
    THEN RAISE EXCEPTION 'mvp314_per_buyer_cap_ignored';END IF;
    UPDATE cotironda_piloto_privado.ai_batch_gate_mvp314
     SET buyer_daily_attempt_limit=8 WHERE only_row;
   END IF;
 END LOOP;
 IF public.cotironda_piloto_ia_next_batch_mvp314()->>'state'
  <>'budget_exhausted'
 OR public.cotironda_piloto_ia_claim_mvp314(rid)->>'state'
  <>'budget_exhausted'
 THEN RAISE EXCEPTION 'mvp314_budget_bypassed';END IF;
 SELECT attempts_reserved INTO day_reserved
 FROM cotironda_piloto_privado.ai_batch_budget_mvp314
 WHERE day_utc=(clock_timestamp() AT TIME ZONE 'UTC')::date;
 IF day_reserved<>2 THEN RAISE EXCEPTION 'mvp314_not_two_attempts';END IF;
 SELECT count(*) INTO count_leased
 FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222
 WHERE request_id=rid AND supplier_key=ANY(names) AND state='leased';
 IF count_leased<>2 THEN RAISE EXCEPTION 'mvp314_wrong_leases';END IF;
 -- A late outcome never frees a reservation or re-enqueues a job.
 SELECT j.supplier_key,j.lease_token::text INTO supplier,source
 FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 j
 WHERE j.request_id=rid AND j.supplier_key=ANY(names)
   AND j.state='leased' LIMIT 1;
 IF NOT public.cotironda_piloto_ia_finish_mvp222(
   rid,supplier,source::uuid,'uncertain',NULL)
 THEN RAISE EXCEPTION 'mvp314_finish_uncertain_failed';END IF;
 IF public.cotironda_piloto_ia_claim_mvp314(rid)->>'state'
  <>'budget_exhausted'
 THEN RAISE EXCEPTION 'mvp314_uncertain_was_retried';END IF;
 UPDATE cotironda_piloto_privado.ai_batch_gate_mvp314
  SET enabled=false,activated_at=NULL WHERE only_row;
 IF public.cotironda_piloto_ia_next_batch_mvp314()->>'state'<>'disabled'
 THEN RAISE EXCEPTION 'mvp314_disable_did_not_stop';END IF;
END $test314$;
