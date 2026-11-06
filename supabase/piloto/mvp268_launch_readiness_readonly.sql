-- MVP268: PILOT launch preflight, STRICTLY READ-ONLY. Run with a privileged
-- auditor on the SPECIFIC approved cotironda-piloto project. Never use this
-- report as deployment authorisation. No SQL DDL/DML/cron/job or API calls.
-- Requires the historical pilot schema plus pg_cron (already present there).
-- Output intentionally aggregates; it cannot show any HMAC, source, phone,
-- message body, user ID, quote value, token or original document.
WITH
modules(version,installed) AS (
 VALUES
  (256,to_regprocedure('public.cotironda_piloto_retryable_document_error_mvp256(text)') IS NOT NULL),
  (257,to_regclass('cotironda_piloto_privado.uncertain_whapi_receipts_mvp257') IS NOT NULL),
  (258,to_regclass('cotironda_piloto_privado.uncertain_triage_cases_mvp258') IS NOT NULL),
  (259,to_regclass('cotironda_piloto_privado.commercial_context_events_mvp259') IS NOT NULL),
  (260,to_regprocedure('public.cotironda_piloto_memory_quote_context_mvp260(text,text,text)') IS NOT NULL),
  (261,to_regclass('cotironda_piloto_privado.supplier_source_versions_mvp261') IS NOT NULL),
  (262,to_regprocedure('public.cotironda_piloto_supervisor_snapshot_mvp262(integer)') IS NOT NULL),
  (263,to_regclass('cotironda_piloto_privado.supervisor_policy_mvp263') IS NOT NULL),
  (264,to_regclass('cotironda_piloto_privado.ai_usage_calls_mvp264') IS NOT NULL),
  (265,to_regclass('cotironda_piloto_privado.supervisor_operators_mvp265') IS NOT NULL),
  (266,to_regclass('cotironda_piloto_privado.ai_usage_reviews_mvp266') IS NOT NULL),
  (267,to_regprocedure('public.cotironda_piloto_operator_queue_auth_mvp267()') IS NOT NULL)
),
module_status AS (
 SELECT count(*) AS checked,
  count(*) FILTER (WHERE installed) AS installed,
  coalesce(jsonb_agg(version ORDER BY version)
    FILTER (WHERE NOT installed),'[]'::jsonb) AS missing_modules
 FROM modules
),
flags AS (
 SELECT
  (SELECT count(*)=1 AND coalesce(bool_and(enabled IS FALSE),false)
   FROM cotironda_piloto_privado.ai_central_control_mvp226) AS central_off,
  (SELECT count(*)=1 AND coalesce(bool_and(enabled IS FALSE),false)
   FROM cotironda_piloto_privado.ai_dispatch_gate_mvp222) AS dispatch_off,
  (SELECT count(*)=1 AND coalesce(bool_and(enabled IS FALSE),false)
   FROM cotironda_piloto_privado.ai_trial_control_mvp229) AS trial_off,
  (SELECT count(*)=1 AND coalesce(bool_and(enabled IS FALSE),false)
   FROM cotironda_piloto_privado.original_share_policy_mvp178) AS originals_off
),
snapshot AS (
 SELECT
  (SELECT count(*) FROM cotironda_piloto_privado.requests) AS rounds,
  (SELECT count(*) FROM cotironda_piloto_privado.whapi_outbox
   WHERE state='api_accepted') AS whapi_api_accepted_not_delivered,
  (SELECT count(*) FROM cotironda_piloto_privado.whapi_outbox
   WHERE state='uncertain') AS whapi_uncertain,
  (SELECT count(*) FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222
   WHERE state='uncertain') AS dispatch_uncertain,
  (SELECT count(*) FROM auth.users) AS auth_accounts,
  (SELECT count(*) FROM cron.job
   WHERE active AND jobname LIKE '%mvp263%') AS active_stage7_watchdogs,
  (SELECT count(*) FROM cron.job WHERE active) AS active_cron_jobs,
  (SELECT extversion FROM pg_extension WHERE extname='pg_cron')
   AS pg_cron_version
)
SELECT jsonb_build_object(
 'state','pilot_readiness_preflight_mvp268',
 'audit_mode','read_only',
 'source_project_verified_by_sql',false,
 'target_expected','cotironda-piloto',
 'database_version',current_setting('server_version'),
 'technical_flags_all_off',
    f.central_off AND f.dispatch_off AND f.trial_off AND f.originals_off,
 'gates',jsonb_build_object(
   'central_off',f.central_off,
   'dispatch_off',f.dispatch_off,
   'trial_off',f.trial_off,
   'originals_off',f.originals_off),
 'modules_checked',m.checked,
 'modules_installed',m.installed,
 'modules_missing',m.missing_modules,
 'pg_cron_available',s.pg_cron_version IS NOT NULL,
 'active_existing_cron_jobs',s.active_cron_jobs,
 'new_supervisor_cron_inactive',s.active_stage7_watchdogs=0,
 'auth_accounts_count',s.auth_accounts,
 'operator_auth_e2e_verified',false,
 'whatsapp_round_e2e_verified',false,
 'rounds_count',s.rounds,
 'whapi_api_accepted_not_delivered',s.whapi_api_accepted_not_delivered,
 'whapi_outbound_uncertain',s.whapi_uncertain,
 'ai_dispatch_uncertain',s.dispatch_uncertain,
 'ready_for_controlled_schema_install',
   f.central_off AND f.dispatch_off AND f.trial_off AND f.originals_off
   AND s.pg_cron_version IS NOT NULL AND s.active_stage7_watchdogs=0
   AND s.whapi_uncertain=0 AND s.dispatch_uncertain=0,
 'ready_for_real_whatsapp_pilot',false,
 'release_authorized',false,
 'production_touched',false,
 'automatic_dispatch_allowed',false,
 'no_live_outbound_action_was_taken',true
) AS report
FROM module_status m CROSS JOIN flags f CROSS JOIN snapshot s;
