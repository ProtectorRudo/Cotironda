-- D016 PG17 sintético, dentro de BEGIN/ROLLBACK. SIN WhatsApp, NO datos reales.
DO $d016_offline$
DECLARE v_catalog jsonb;v_job jsonb;v_src jsonb;v_claim jsonb;v_done boolean;
 v_created timestamptz;v_due timestamptz;v_final jsonb;
 v_round uuid:='cccccccc-3333-4333-8333-333333333333';
 v_ses text:=repeat('c',64);v_ticket text:=repeat('d',64);
 v_doc uuid;v_holiday date;
BEGIN
 -- A había sido procesada por la sesión buyer y el proveedor fue revocado
 -- al final del fixture previo. El worker exige consentimiento V2 NUEVO.
 UPDATE cotironda_piloto_privado.v2_supplier_original_consents
 SET revoked_at=NULL WHERE supplier_key='supplier_a';
 UPDATE cotironda_piloto_privado.v2_original_share_policy
 SET activated_at=clock_timestamp()-interval '10 days' WHERE singleton=true;
 UPDATE cotironda_piloto_privado.requests
 SET timing_mode='business_two_days',round_days=2,
  v2_calendar_revision='lp_piloto_2026',
  closes_at=public.cotironda_piloto_v2_d016_expected_close_private(
   created_at,delivery_city,'lp_piloto_2026')
 WHERE id='aaaaaaaa-1111-4111-8111-111111111111';

 -- El fixture histórico recibió ofertas a T-12h para una ronda
 -- tradicional de 4 días. Con el contrato real de DOS hábiles a 18:00,
 -- esas ofertas caerían FUERA DE PLAZO. Ajustar solo el fixture:
 -- despacho a T-2h y llegada a T-1h, AMBOS previos al vencimiento.
 -- Nunca relajar el filtro temporal del catálogo en producción.
 UPDATE cotironda_piloto_privado.ai_dispatch_jobs_mvp222 dispatch
 SET finished_at=r.closes_at-interval '2 hours'
 FROM cotironda_piloto_privado.requests r
 WHERE dispatch.request_id=r.id
  AND r.id='aaaaaaaa-1111-4111-8111-111111111111';
 UPDATE cotironda_piloto_privado.whapi_inbox msg
 SET received_at=r.closes_at-interval '1 hour'
 FROM cotironda_piloto_privado.requests r
 WHERE msg.request_id=r.id
  AND r.id='aaaaaaaa-1111-4111-8111-111111111111'
  AND msg.participant_key IN ('supplier_a','supplier_b','supplier_c');

 -- Compare worker with the exact source semantics (same 3 original docs).
 v_catalog:=public.cotironda_piloto_v2_d016_worker_catalog_private(
  'aaaaaaaa-1111-4111-8111-111111111111');
 IF v_catalog IS NULL OR v_catalog->>'state'<>'authorized_responders_v2'
  OR jsonb_array_length(v_catalog->'originals')<1
 THEN RAISE EXCEPTION 'd016_worker_catalog_denied';END IF;
 SELECT (x->>'documentId')::uuid INTO v_doc
 FROM jsonb_array_elements(v_catalog->'originals') x
 WHERE x->>'mime'='application/pdf' LIMIT 1;
 IF v_doc IS NULL THEN RAISE EXCEPTION 'd016_worker_no_pdf';END IF;
 v_src:=public.cotironda_piloto_v2_d016_worker_source_private(
  'aaaaaaaa-1111-4111-8111-111111111111',v_doc);
 IF v_src IS NULL OR v_src->>'state'<>'authorized_original_v2'
 THEN RAISE EXCEPTION 'd016_worker_source_missing';END IF;
 -- La prueba histórica dejó un análisis de texto EN PROCESO con lease
 -- vigente, así que no debe duplicarse su costo. Simular vencimiento real.
 UPDATE cotironda_piloto_privado.v2_original_analysis
 SET status='review',points=NULL,text_sha256=NULL,
  updated_at=clock_timestamp()-interval '10 minutes',
  lease_until=clock_timestamp()-interval '9 minutes'
 WHERE request_id='aaaaaaaa-1111-4111-8111-111111111111'
  AND status='processing';
 v_job:=public.cotironda_piloto_v2_d016_worker_due_private(1);
 IF jsonb_typeof(v_job)<>'array' OR jsonb_array_length(v_job)<>1
 THEN RAISE EXCEPTION 'd016_worker_due_missing:% catalog=%',v_job,jsonb_array_length(v_catalog->'originals');END IF;
 v_doc:=(v_job->0->>'documentId')::uuid;
 v_src:=public.cotironda_piloto_v2_d016_worker_source_private(
  'aaaaaaaa-1111-4111-8111-111111111111',v_doc);
 IF v_src IS NULL OR v_src->>'sha256'<>v_job->0->>'sourceSha256'
 THEN RAISE EXCEPTION 'd016_worker_due_forged';END IF;
 v_claim:=public.cotironda_piloto_v2_d016_worker_claim_private(
  'aaaaaaaa-1111-4111-8111-111111111111',v_doc);
 IF v_claim->>'state'<>'analysis_claimed_v2'
 THEN RAISE EXCEPTION 'd016_worker_claim_denied:%',v_claim;END IF;
 IF public.cotironda_piloto_v2_d016_worker_claim_private(
  'aaaaaaaa-1111-4111-8111-111111111111',v_doc) IS NOT NULL
 THEN RAISE EXCEPTION 'd016_worker_duplicate_model';END IF;
 IF public.cotironda_piloto_v2_d016_worker_finish_private(
  'aaaaaaaa-1111-4111-8111-111111111111',v_doc,gen_random_uuid(),
  v_src->>'sha256',NULL,NULL,'review') IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'd016_worker_forged_token';END IF;
 IF public.cotironda_piloto_v2_d016_worker_finish_private(
  'aaaaaaaa-1111-4111-8111-111111111111',v_doc,
  (v_claim->>'jobToken')::uuid,
  v_src->>'sha256',NULL,NULL,'review') IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'd016_worker_finish_denied';END IF;
 IF public.cotironda_piloto_v2_d016_worker_claim_private(
  'aaaaaaaa-1111-4111-8111-111111111111',v_doc) IS NOT NULL
 THEN RAISE EXCEPTION 'd016_worker_retry_immediate';END IF;
 UPDATE cotironda_piloto_privado.participants
 SET opted_out_at=clock_timestamp() WHERE key='buyer_a';
 IF public.cotironda_piloto_v2_d016_worker_catalog_private(
  'aaaaaaaa-1111-4111-8111-111111111111') IS NOT NULL
 THEN RAISE EXCEPTION 'd016_worker_buyer_optout';END IF;
 UPDATE cotironda_piloto_privado.participants
 SET opted_out_at=NULL WHERE key='buyer_a';

 -- La ronda del fixture de recepción ya se usó para probar el worker:
 -- no debe contaminar el conteo del cierre. Queda CANCELADA únicamente
 -- dentro del BEGIN/ROLLBACK sintético, no en Supabase PILOTO.
 UPDATE cotironda_piloto_privado.requests SET state='cancelled'
 WHERE id='aaaaaaaa-1111-4111-8111-111111111111';

 -- Para cierre se usa UNA ronda sintética distinta, sin tocar los
 -- documentos del comprador ni falsificar una respuesta de proveedor.
 -- Prueba extrema: viernes -> martes (dos hábiles), preserva hora.
 IF public.cotironda_piloto_v2_d016_expected_close_private(
  '2026-11-13 10:00:00-03'::timestamptz,
  'La Plata','lp_piloto_2026') IS DISTINCT FROM
  '2026-11-17 18:00:00-03'::timestamptz
 THEN RAISE EXCEPTION 'd016_weekend_deadline_wrong';END IF;
 -- Cruce de año: sin aprobación anticipada 2027 NO se calcula deadline.
 IF public.cotironda_piloto_v2_d016_expected_close_private(
  '2026-12-30 10:00:00-03'::timestamptz,
  'La Plata','lp_piloto_2026') IS NOT NULL
 THEN RAISE EXCEPTION 'd016_unapproved_next_year';END IF;
 INSERT INTO cotironda_piloto_privado.v2_business_calendar(
  locality,year,revision,approved_at
 ) VALUES('la plata',2027,'lp_piloto_2026',
  '2026-01-01 00:00:00-03'::timestamptz);
 -- Día feriado ficticio 2027-01-01: el segundo hábil pasa al lunes 4.
 INSERT INTO cotironda_piloto_privado.v2_business_holidays(
  locality,day,calendar_year,description,evidence
 ) VALUES('la plata','2027-01-01',2027,'Feriado CI', 'synthetic');
 IF public.cotironda_piloto_v2_d016_expected_close_private(
  '2026-12-30 10:00:00-03'::timestamptz,
  'La Plata','lp_piloto_2026') IS DISTINCT FROM
  '2027-01-04 18:00:00-03'::timestamptz
 THEN RAISE EXCEPTION 'd016_cross_year_holiday_wrong';END IF;
 DELETE FROM cotironda_piloto_privado.v2_business_holidays
 WHERE day='2027-01-01' AND description='Feriado CI';

 v_created:=clock_timestamp()-interval '6 days';
 v_due:=public.cotironda_piloto_v2_d016_expected_close_private(
  v_created,'La Plata','lp_piloto_2026');
 IF v_due IS NULL OR v_due>clock_timestamp()
 THEN RAISE EXCEPTION 'd016_expected_deadline_unavailable';END IF;
 INSERT INTO cotironda_piloto_privado.requests(
  id,buyer_key,state,created_at,closes_at,timing_mode,round_days,
  v2_calendar_revision,delivery_city
 ) VALUES(v_round,'buyer_a','prepared',v_created,v_due,
  'business_two_days',2,'lp_piloto_2026','La Plata');
 IF public.cotironda_piloto_v2_d016_issue_ticket_private(
  v_ticket,'buyer_a',v_round,repeat('1',64)) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'd016_closure_ticket';END IF;
 IF public.cotironda_piloto_v2_d016_claim_session_private(
  v_ticket,v_ses) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'd016_closure_session';END IF;
 v_final:=public.cotironda_piloto_v2_d016_final_status_private(v_round,v_ses);
 IF v_final->>'state'<>'waiting_for_close'
 THEN RAISE EXCEPTION 'd016_final_before_close:%',v_final;END IF;
 -- Un feriado aprobado dentro de los dos días mueve el vencimiento:
 -- el cron debe negarse a cerrar usando el deadline viejo.
 v_holiday:=(v_due AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
 INSERT INTO cotironda_piloto_privado.v2_business_holidays(
  locality,day,calendar_year,description,evidence
 ) VALUES('la plata',v_holiday,extract(year from v_holiday)::integer,
  'Feriado sintético', 'ci_fixture_no_real');
 v_final:=public.cotironda_piloto_v2_d016_close_due_private(5);
 IF (v_final->>'closed')::integer<>0
 THEN RAISE EXCEPTION 'd016_closure_wrong_holiday_deadline';END IF;
 DELETE FROM cotironda_piloto_privado.v2_business_holidays
 WHERE day=v_holiday AND description='Feriado sintético';
 UPDATE cotironda_piloto_privado.v2_auto_release_policy
 SET enabled=false WHERE singleton=true;
 v_final:=public.cotironda_piloto_v2_d016_close_due_private(5);
 IF v_final->>'state'<>'disabled'
 THEN RAISE EXCEPTION 'd016_scheduler_flag_disabled_not_respected';END IF;
 UPDATE cotironda_piloto_privado.v2_auto_release_policy
 SET enabled=true WHERE singleton=true;
 UPDATE cotironda_piloto_privado.v2_business_calendar
 SET approved_at=NULL WHERE revision='lp_piloto_2026';
 v_final:=public.cotironda_piloto_v2_d016_close_due_private(5);
 IF (v_final->>'closed')::integer<>0
 THEN RAISE EXCEPTION 'd016_scheduler_unapproved_calendar';END IF;
 UPDATE cotironda_piloto_privado.v2_business_calendar
 SET approved_at=clock_timestamp()-interval '16 days'
 WHERE revision='lp_piloto_2026';
 v_final:=public.cotironda_piloto_v2_d016_close_due_private(5);
 IF v_final->>'state'<>'checked' OR (v_final->>'closed')::integer<>1
 THEN RAISE EXCEPTION 'd016_scheduler_did_not_close:%',v_final;END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.v2_d016_closure_audit
  WHERE request_id=v_round)<>1
 THEN RAISE EXCEPTION 'd016_closure_not_audited';END IF;
 v_final:=public.cotironda_piloto_v2_d016_final_status_private(v_round,v_ses);
 IF v_final->>'state'<>'closed_verified_business_two_days'
 THEN RAISE EXCEPTION 'd016_final_after_close_denied:%',v_final;END IF;
 v_final:=public.cotironda_piloto_v2_d016_close_due_private(5);
 IF (v_final->>'closed')::integer<>0
 THEN RAISE EXCEPTION 'd016_scheduler_closed_twice';END IF;
 IF public.cotironda_piloto_v2_d016_final_status_private(
  v_round,repeat('f',64)) IS NOT NULL
 THEN RAISE EXCEPTION 'd016_final_wrong_buyer_session';END IF;
 IF has_function_privilege('anon',
  'public.cotironda_piloto_v2_d016_worker_source_private(uuid,uuid)','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.cotironda_piloto_v2_d016_worker_due_private(integer)','EXECUTE')
 OR has_function_privilege('anon',
  'public.cotironda_piloto_v2_d016_close_due_private(integer)','EXECUTE')
 OR has_table_privilege('anon',
  'cotironda_piloto_privado.v2_d016_closure_audit','SELECT')
 THEN RAISE EXCEPTION 'd016_worker_or_cron_acl';END IF;
 RAISE NOTICE 'V2_D016_OFFLINE_AND_BUSINESS_CLOSE_PG17_PASS';
END $d016_offline$;
