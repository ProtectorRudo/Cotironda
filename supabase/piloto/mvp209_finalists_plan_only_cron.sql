-- MVP209 · PILOTO EXCLUSIVO · PROPUESTA, NO APLICAR SIN «PUBLICALO».
-- Cron autónomo para PLANEAMIENTO de rondas CERRADAS, NUNCA avisos.
-- Requiere Edge MVP209 desplegada con COTIRONDA_PILOT_FINALIST_PLAN_SECRET
-- idéntico al valor aleatorio de 96 caracteres hex de Vault (registrado
-- POR CANAL SEGURO por un operador; nunca pegarlo en SQL, GitHub o logs).
--
-- Riesgo pg_net: la cola HTTP contiene brevemente el secreto descifrado.
-- Por eso ESTA credencial autoriza SOLO planificación; no puede reclamar,
-- revelar contactos ni enviar Whapi aunque el worker dispatch esté ON.
-- Solo instalar con activación de finalistas OFF y resto de permisos cerrados.
DO $guard$
BEGIN
 IF to_regclass('cotironda_piloto_privado.finalist_activation_mvp113') IS NULL
    OR to_regclass('cotironda_piloto_privado.finalist_source_plans_mvp196') IS NULL
    OR to_regclass('cotironda_piloto_privado.requests') IS NULL
    OR to_regprocedure('public.cotironda_piloto_close_due_v1(integer)') IS NULL
    OR to_regprocedure('public.cotironda_piloto_commercial_due_mvp196(integer)') IS NULL
    OR to_regprocedure('public.cotironda_piloto_commit_commercial_plan_mvp196(uuid,text,jsonb)') IS NULL
    OR to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') IS NULL
    OR to_regclass('cron.job') IS NULL
    OR to_regclass('vault.decrypted_secrets') IS NULL
 THEN RAISE EXCEPTION 'mvp209_pilot_dependencies_missing'
      USING ERRCODE='42501'; END IF;
 IF EXISTS (
   SELECT 1 FROM cotironda_piloto_privado.finalist_activation_mvp113
   WHERE only_row AND enabled
 ) THEN RAISE EXCEPTION 'mvp209_must_install_with_finalists_off'
      USING ERRCODE='42501'; END IF;
 IF (SELECT count(*) FROM cron.job
     WHERE jobname='cotironda_piloto_finalists_plan_only_5min')<>0
 THEN RAISE EXCEPTION 'mvp209_cron_already_installed'
      USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(
   SELECT 1 FROM vault.decrypted_secrets
   WHERE name='cotironda_piloto_finalists_plan_only_v1'
     AND decrypted_secret ~ '^[a-f0-9]{96}$'
 ) THEN RAISE EXCEPTION 'mvp209_dedicated_plan_secret_missing'
      USING ERRCODE='42501'; END IF;
END$guard$;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_finalists_plan_tick_mvp209()
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path='' AS $fn$
DECLARE v_token text;v_request_id bigint;v_errstate text;
BEGIN
 -- The scheduler is inert until prospective activation. Never include old
 -- rounds or already-materialized finalists. No external call when idle.
 IF NOT EXISTS (
   SELECT 1 FROM cotironda_piloto_privado.requests r
   JOIN cotironda_piloto_privado.finalist_activation_mvp113 a
     ON a.only_row AND a.enabled AND a.activated_at IS NOT NULL
     AND a.activated_at<=clock_timestamp()
     AND r.created_at>=a.activated_at
   WHERE r.state='closed' AND r.closes_at<=clock_timestamp()
     AND EXISTS (
       SELECT 1 FROM cotironda_piloto_privado.supplier_media_quotes_mvp098 q
       WHERE q.request_id=r.id
     )
     AND NOT EXISTS(
       SELECT 1 FROM cotironda_piloto_privado.finalist_coverage_plans_mvp108 p
       WHERE p.request_id=r.id
     )
 ) THEN RETURN jsonb_build_object('state','idle_no_eligible_round');END IF;

 -- This secret NEVER equals the full finalist dispatch credential.
 SELECT decrypted_secret INTO v_token FROM vault.decrypted_secrets
 WHERE name='cotironda_piloto_finalists_plan_only_v1';
 IF v_token IS NULL OR v_token !~ '^[a-f0-9]{96}$'
 THEN RETURN jsonb_build_object('state','plan_secret_unavailable');END IF;

 -- The paired Edge worker authenticates this header for PLAN-ONLY mode,
 -- returning before queue/decrypt/network sending regardless of env flags.
 SELECT net.http_post(
   url:='https://ilggkalaafhtiysyzlmg.supabase.co/functions/v1/cotironda-piloto-finalistas',
   headers:=jsonb_build_object(
    'content-type','application/json',
    'x-cotironda-finalist-plan-secret',v_token
   ),
   body:='{}'::jsonb,timeout_milliseconds:=20000
 ) INTO v_request_id;
 RETURN jsonb_build_object('state','plan_only_http_queued',
  'request_id',v_request_id,'messages_sent',false,
  'contacts_revealed',false);
EXCEPTION WHEN others THEN
 -- Return only an opaque five-character SQLSTATE code to the private
 -- scheduler for safe operational diagnostics. NEVER return exception
 -- text, SQL or contact/secret headers.
 GET STACKED DIAGNOSTICS v_errstate = RETURNED_SQLSTATE;
 RETURN jsonb_build_object('state','plan_unavailable','error_code',v_errstate);
END;$fn$;

REVOKE ALL ON FUNCTION public.cotironda_piloto_finalists_plan_tick_mvp209()
 FROM PUBLIC,anon,authenticated,service_role;

-- Stable name; guard above refuses duplicate registration.
SELECT cron.schedule(
 'cotironda_piloto_finalists_plan_only_5min',
 '*/5 * * * *',
 $$SELECT public.cotironda_piloto_finalists_plan_tick_mvp209();$$
) AS job_id;

-- Explicit operator rollback/kill switch (NOT automatically run):
-- SELECT cron.unschedule('cotironda_piloto_finalists_plan_only_5min');
-- Revert by unscheduling + DROP FUNCTION only after authorization.
