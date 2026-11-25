-- REVERTIR SOLO CON AUTORIZACIÓN EXPLÍCITA de reanudar cierre V1.
-- No ejecutar por rutina: vuelve a activar cierre automático antiguo.
SET LOCAL lock_timeout='3s';
DO $rollback$
BEGIN
 IF current_database()<>'postgres' OR current_setting('server_version_num')::integer<170000
 OR (SELECT count(*) FROM cotironda_piloto_privado.requests)<>7
 OR EXISTS(SELECT 1 FROM cotironda_piloto_privado.requests WHERE state='prepared')
 THEN RAISE EXCEPTION 'rollback_old_cron_new_round_or_wrong_project'; END IF;
 IF NOT EXISTS(SELECT 1 FROM cron.job WHERE jobid=1
 AND jobname='cotironda_piloto_close_due_5min'
 AND command='select public.cotironda_piloto_close_due_v1(25);' AND active=false)
 THEN RAISE EXCEPTION 'rollback_old_cron_changed'; END IF;
 PERFORM cron.alter_job(job_id=>1,active=>true);
 IF NOT EXISTS(SELECT 1 FROM cron.job WHERE jobid=1 AND active=true)
 THEN RAISE EXCEPTION 'rollback_old_cron_not_restored'; END IF;
END $rollback$;
