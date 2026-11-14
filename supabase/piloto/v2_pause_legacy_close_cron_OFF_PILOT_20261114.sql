-- Cotironda V2 / P0 — aislar cierre CRON V1 del futuro piloto V2.
-- ÚNICAMENTE Supabase PILOTO: suspender un job PG_CRON, nunca borrarlo.
-- Preflight estricto: ninguna ronda V1 activa y políticas V2 OFF.
-- No envía mensajes, no mueve solicitudes, no toca cron documental ni IA.
SET LOCAL lock_timeout='3s';
DO $guard$
BEGIN
 IF current_database()<>'postgres' OR current_setting('server_version_num')::integer<170000
 THEN RAISE EXCEPTION 'v2_stop_not_pilot_pg17';END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.requests)<>7
 OR EXISTS(SELECT 1 FROM cotironda_piloto_privado.requests WHERE state='prepared')
 OR (SELECT count(*) FROM cotironda_piloto_privado.requests WHERE state='closed')<>5
 OR (SELECT count(*) FROM cotironda_piloto_privado.requests WHERE state='draft')<>2
 THEN RAISE EXCEPTION 'v2_stop_legacy_rounds_changed';END IF;
 IF COALESCE((SELECT enabled FROM cotironda_piloto_privado.v2_business_policy WHERE singleton),true)
 OR COALESCE((SELECT enabled FROM cotironda_piloto_privado.v2_original_share_policy WHERE singleton),true)
 OR COALESCE((SELECT enabled FROM cotironda_piloto_privado.v2_auto_release_policy WHERE singleton),true)
 OR COALESCE((SELECT enabled FROM cotironda_piloto_privado.v2_d016_supplier_terms_policy WHERE singleton),true)
 THEN RAISE EXCEPTION 'v2_stop_policies_not_off';END IF;
 IF NOT EXISTS(
  SELECT 1 FROM cron.job WHERE jobid=1
   AND jobname='cotironda_piloto_close_due_5min'
   AND schedule='*/5 * * * *'
   AND command='select public.cotironda_piloto_close_due_v1(25);'
   AND active=true
 ) THEN RAISE EXCEPTION 'v2_stop_unexpected_cron_definition';END IF;
 -- Congela únicamente el cierre legado: reversible vía cron.alter_job.
 PERFORM cron.alter_job(job_id=>1,active=>false);
 IF NOT EXISTS(SELECT 1 FROM cron.job WHERE jobid=1 AND
  jobname='cotironda_piloto_close_due_5min' AND active=false)
 THEN RAISE EXCEPTION 'v2_stop_legacy_cron_still_active';END IF;
 IF NOT EXISTS(SELECT 1 FROM cron.job WHERE jobid=3 AND active=true)
 OR NOT EXISTS(SELECT 1 FROM cron.job WHERE jobid=4 AND active=true)
 THEN RAISE EXCEPTION 'v2_stop_other_crons_changed';END IF;
 RAISE NOTICE 'V2_LEGACY_CRON_CLOSURE_SUSPENDED_PILOT_PASS';
END $guard$;
