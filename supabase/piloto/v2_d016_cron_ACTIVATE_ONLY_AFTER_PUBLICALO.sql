-- COTIRONDA PILOTO D016 — ACTIVACIÓN SQL-ONLY, NO MIGRACIÓN.
-- PROHIBIDO EJECUTAR sin «Publicalo» explícito SOLO cotironda-piloto.
-- No modifica producción, no crea calendarios, no envía WhatsApps.
-- Este script SOLO programa el cierre SQL de rondas (cada 5 min).
-- El análisis de IA se programa por GitHub Actions, fuera de pg_net.
-- MOTIVO: Supabase no soporta revocar los grants del esquema net/pg_net:
--   https://supabase.com/kb/troubleshooting/revoking-access-to-pg_net-objects-has-no-effect-0bbc16
-- Nunca pasar sb_secret_*, API keys o tokens por net.http_post;
-- el contenido de la cola puede ser leído por roles DB con LOGIN.
-- Requiere proyecto PILOTO probado por Vault, RPC D016 instalada,
-- consentimientos V2, políticas comerciales y calendario local aprobados.
-- Este archivo NO se incluye en migraciones ni workflows automáticos.

BEGIN;
DO $preflight_d016_cron$
BEGIN
 -- Guard contra proyecto equivocado, que debe aprovisionarse expresamente
 -- a la hora de autorizar PUBLICACIÓN; no es un secreto de API.
 IF NOT EXISTS(
  SELECT 1 FROM vault.decrypted_secrets
  WHERE name='cotironda_d016_pilot_project_ref'
    AND decrypted_secret='ilggkalaafhtiysyzlmg'
 ) THEN RAISE EXCEPTION 'D016_NOT_PILOT_PROJECT'; END IF;
 IF to_regprocedure('public.cotironda_piloto_v2_d016_close_due_private(integer)')
 IS NULL OR to_regclass('cotironda_piloto_privado.v2_d016_closure_audit') IS NULL
 THEN RAISE EXCEPTION 'D016_SQL_NOT_INSTALLED'; END IF;
 IF NOT EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.v2_business_policy
  WHERE singleton=true AND enabled=true AND activated_at IS NOT NULL
 ) OR NOT EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.v2_original_share_policy
  WHERE singleton=true AND enabled=true AND activated_at IS NOT NULL
 ) OR NOT EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.v2_auto_release_policy
  WHERE singleton=true AND enabled=true AND activated_at IS NOT NULL
 ) THEN RAISE EXCEPTION 'D016_POLICIES_NOT_APPROVED'; END IF;
 IF NOT EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.v2_business_calendar
  WHERE locality='la plata' AND approved_at IS NOT NULL
 ) THEN RAISE EXCEPTION 'D016_CALENDAR_NOT_APPROVED'; END IF;
 IF EXISTS(
  SELECT 1 FROM cron.job
  WHERE jobname IN ('cotironda-v2-d016-close-piloto',
                    'cotironda-v2-d016-offline-worker-piloto')
 ) THEN RAISE EXCEPTION 'D016_CRON_ALREADY_PRESENT_OR_UNSAFE'; END IF;
END $preflight_d016_cron$;

-- Única acción del script: PostgreSQL invoca directamente a su propia RPC
-- para cerrar hasta 5 solicitudes con vencimiento verificado.
-- No hay HTTP ni secretos en cron.job ni en net.http_request_queue.
SELECT cron.schedule(
 'cotironda-v2-d016-close-piloto','*/5 * * * *',
 $$SELECT public.cotironda_piloto_v2_d016_close_due_private(5);$$
);
COMMIT;

-- Rollback bajo autorización explícita SOLO PILOTO:
-- SELECT cron.unschedule('cotironda-v2-d016-close-piloto');
-- NO crear ni programar 'cotironda-v2-d016-offline-worker-piloto'.
-- Worker IA: .github/workflows/cotironda-d016-worker-piloto.yml (OFF
-- por defecto y sólo activo después de merge al branch default).
-- Mantener intactos originales, auditoría SQL y webhook Whapi v76.
