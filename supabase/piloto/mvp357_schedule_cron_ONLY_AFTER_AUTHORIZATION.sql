-- MVP357. SOLO PARA PUBLICACIÓN PILOTO AUTORIZADA, NO ejecucion ahora.
-- Requiere: RPC privados MVP356/MVP357 aplicados, secretos Vault separados,
-- Edge batch desplegado con body {} admitido, salida legacy auditada.
-- NO activa ai_batch_retry_gate_mvp357: sigue OFF por defecto.
DO $mvp357_cron$
BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM pg_extension WHERE extname='pg_cron'
 ) OR NOT EXISTS (
  SELECT 1 FROM pg_extension WHERE extname='pg_net'
 ) THEN RAISE EXCEPTION 'mvp357_cron_or_http_extension_missing';END IF;
 IF NOT EXISTS (
  SELECT 1 FROM vault.secrets
  WHERE name='cotironda_piloto_ai_batch_apikey_mvp357'
 ) OR NOT EXISTS (
  SELECT 1 FROM vault.secrets
  WHERE name='cotironda_piloto_ai_batch_private_mvp357'
 ) THEN RAISE EXCEPTION 'mvp357_independent_vault_secrets_missing';END IF;
 IF EXISTS (
  SELECT 1 FROM cron.job
  WHERE jobname='cotironda_piloto_ai_batch_retry_5min_mvp357'
 ) THEN RAISE EXCEPTION 'mvp357_job_already_exists_do_not_replace';END IF;
 PERFORM cron.schedule(
  'cotironda_piloto_ai_batch_retry_5min_mvp357',
  '*/5 * * * *',
  'SELECT cotironda_piloto_privado.ai_batch_retry_tick_mvp357()'
 );
END
$mvp357_cron$;
-- Run only with explicit activation approval after dry run and smoke:
-- UPDATE cotironda_piloto_privado.ai_batch_retry_gate_mvp357
-- SET enabled=true,activated_at=clock_timestamp() WHERE only_row;
-- This UPDATE is INTENTIONALLY A COMMENT; never activate by installation.
-- Rollback: stop cron via cron.unschedule(jobid), disable gate, then revert
-- only the versioned helper after comparing installed SHA. Never delete
-- accepted/uncertain jobs or auto-reclaim their leases.
