-- ESTE SCRIPT NO ES MIGRACIÓN. PROHIBIDO EJECUTAR EN CI/PRODUCCIÓN.
-- Requiere «Publicalo» explícito SOLO para cotironda-piloto y preflight:
-- SQL D016 instalado y auditado, Edge worker desplegado, políticas V2
-- aprobadas, consentimientos y calendario por localidad/año aprobados.
-- Crear secretos Vault SOLO a través del canal protegido, sin imprimirlos:
--   cotironda_d016_worker_service_key = sb_secret_... del PILOTO
--   cotironda_d016_worker_shared_secret = secreto independiente (40+ chars)
--   cotironda_d016_pilot_project_ref = ilggkalaafhtiysyzlmg (guard entorno)
-- NO incluir secretos en este archivo ni en registros ni en changelog.
-- NOTA: pg_net retiene temporalmente headers descifrados en su cola;
-- limitar permisos de inspección al entorno de infraestructura del piloto.
-- Supabase Docs: https://supabase.com/docs/guides/functions/schedule-functions
-- Ejecutar solo con transacción/supervisión y posibilidad de reversión.

DO $preflight_d016_cron$
BEGIN
 -- Verificación positiva del proyecto; si se ejecuta en otro Supabase,
 -- aborta SIN crear jobs ni tocar rondas.
 IF NOT EXISTS(
  SELECT 1 FROM vault.decrypted_secrets
  WHERE name='cotironda_d016_pilot_project_ref'
   AND decrypted_secret='ilggkalaafhtiysyzlmg'
 ) THEN RAISE EXCEPTION 'D016_NOT_PILOT_PROJECT';END IF;
 -- CRITICAL: pg_net queues temporarily contain outgoing HTTP headers.
 -- In the audited PILOTO, anon/authenticated have schema USAGE and SELECT
 -- on net.http_request_queue, with RLS OFF. DO NOT PLACE A SECRET IN THAT
 -- QUEUE. Hard-stop before cron.schedule, even if Vault keys are present.
 -- This gate requires a separately reviewed, safe mitigation of privileges;
 -- NEVER revoke global grants automatically in this D016 script.
 IF (
   has_schema_privilege('anon','net','USAGE')
   AND has_table_privilege('anon','net.http_request_queue','SELECT')
 ) OR (
   has_schema_privilege('authenticated','net','USAGE')
   AND has_table_privilege('authenticated','net.http_request_queue','SELECT')
 ) THEN
  RAISE EXCEPTION 'D016_PGNET_QUEUE_EXPOSED_TO_CLIENT_ROLES';
 END IF;
 IF to_regprocedure('public.cotironda_piloto_v2_d016_worker_due_private(integer)')
 IS NULL OR to_regprocedure('public.cotironda_piloto_v2_d016_close_due_private(integer)')
 IS NULL OR to_regclass('cotironda_piloto_privado.v2_d016_closure_audit') IS NULL
 THEN RAISE EXCEPTION 'D016_SQL_NOT_INSTALLED';END IF;
 IF NOT EXISTS(SELECT 1 FROM vault.decrypted_secrets
  WHERE name='cotironda_d016_worker_service_key'
   AND decrypted_secret LIKE 'sb_secret_%' AND length(decrypted_secret)>32)
 OR NOT EXISTS(SELECT 1 FROM vault.decrypted_secrets
  WHERE name='cotironda_d016_worker_shared_secret'
   AND length(decrypted_secret)>=40)
 THEN RAISE EXCEPTION 'D016_VAULT_SECRETS_MISSING';END IF;
 -- Debe haber al menos un calendario aprobado; si no, el cron cerraría cero.
 IF NOT EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.v2_business_calendar
  WHERE approved_at IS NOT NULL
 ) THEN RAISE EXCEPTION 'D016_CALENDAR_NOT_APPROVED';END IF;
END $preflight_d016_cron$;

SELECT cron.schedule(
 'cotironda-v2-d016-close-piloto', '*/5 * * * *',
 $$SELECT public.cotironda_piloto_v2_d016_close_due_private(5);$$
);
SELECT cron.schedule(
 'cotironda-v2-d016-offline-worker-piloto', '*/5 * * * *',
 $$
 SELECT net.http_post(
  url:='https://ilggkalaafhtiysyzlmg.supabase.co/functions/v1/cotironda-piloto-v2-worker-d016',
  headers:=jsonb_build_object(
   'Content-type','application/json',
   'apikey',(SELECT decrypted_secret FROM vault.decrypted_secrets
      WHERE name='cotironda_d016_worker_service_key'),
   'x-cotironda-d016-worker-internal',
    (SELECT decrypted_secret FROM vault.decrypted_secrets
      WHERE name='cotironda_d016_worker_shared_secret')
  ),
  body:='{}'::jsonb,
  timeout_milliseconds:=30000
 );
 $$
);
-- Si se revierte (solo en PILOTO autorizado):
-- SELECT cron.unschedule('cotironda-v2-d016-close-piloto');
-- SELECT cron.unschedule('cotironda-v2-d016-offline-worker-piloto');
-- Mantener originales y registros de auditoría, NO borrarlos.
