-- MVP263: OPERATOR ONLY. NOT part of MVP263 migration or CI deployment.
-- Do not execute until an explicitly authorized PILOT publication/window.
-- Preconditions: dedicated PILOT, backups, supervisor SQL MVP262/263,
--             pg_cron, operator approval, gate enabled separately.
DO $preflight$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron')
 THEN RAISE EXCEPTION 'mvp263_pg_cron_not_installed';END IF;
 IF NOT EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.supervisor_policy_mvp263
  WHERE only_row=true AND enabled=true)
 THEN RAISE EXCEPTION 'mvp263_supervisor_gate_disabled';END IF;
 IF EXISTS(SELECT 1 FROM cron.job
  WHERE jobname='cotironda-ia-central-supervisor-mvp263')
 THEN RAISE EXCEPTION 'mvp263_cron_already_registered';END IF;
END$preflight$;
-- Exactly one SQL-only call every 15 minutes. No HTTP or outbound message.
SELECT cron.schedule(
 'cotironda-ia-central-supervisor-mvp263',
 '*/15 * * * *',
 $$SELECT public.cotironda_piloto_supervisor_tick_mvp263();$$
);
-- To disable later, FIRST UPDATE policy enabled=false, THEN
-- SELECT cron.unschedule('cotironda-ia-central-supervisor-mvp263');
-- Both operations must be separately authorized/verified by operator.
