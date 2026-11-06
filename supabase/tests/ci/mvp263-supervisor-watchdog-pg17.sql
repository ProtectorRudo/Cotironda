-- MVP262: PostgreSQL 17 isolated/private, all synthetic, ROLLBACK.
BEGIN;
DO $roles$BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN;END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN;END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN;END IF;
END$roles$;
CREATE SCHEMA cotironda_piloto_privado;
CREATE TABLE cotironda_piloto_privado.ai_dispatch_jobs_mvp222(
 state text,leased_at timestamptz);
CREATE TABLE cotironda_piloto_privado.whapi_outbox(
 state text,leased_at timestamptz);
CREATE TABLE cotironda_piloto_privado.ai_supplier_review_mvp227(
 state text,finished_at timestamptz,reserved_at timestamptz);
CREATE TABLE cotironda_piloto_privado.document_ai_diagnostics_mvp127(
 state text,attempt_count int,next_retry_at timestamptz,
 last_attempt_at timestamptz,reason_code text);
CREATE TABLE cotironda_piloto_privado.uncertain_triage_cases_mvp258(
 case_id uuid PRIMARY KEY);
CREATE TABLE cotironda_piloto_privado.uncertain_review_notes_mvp258(
 case_id uuid);
CREATE TABLE cotironda_piloto_privado.uncertain_whapi_receipts_mvp257(
 message_id_sha256 text);
CREATE TABLE cotironda_piloto_privado.commercial_context_events_mvp259(
 expires_at timestamptz);
CREATE FUNCTION public.cotironda_piloto_retryable_document_error_mvp256(
 code text) RETURNS boolean LANGUAGE sql IMMUTABLE
 SET search_path='' AS $helper$
 SELECT coalesce(code IN(
  'legacy_unclassified','api_rate_limited','api_server_error',
  'api_unavailable','api_timeout','response_incomplete'),false)
$helper$;
\ir ../../piloto/mvp262_private_supervisor_readonly.sql
\ir ../../piloto/mvp263_supervisor_bounded_watchdog.sql


DO $disabled$
DECLARE v jsonb;
BEGIN
 v:=public.cotironda_piloto_supervisor_tick_mvp263();
 IF v->>'state'<>'disabled' OR v->>'messages_sent'<>'false'
   OR v->>'external_api_calls'<>'0'
 THEN RAISE EXCEPTION 'mvp263_default_not_disabled_%',v;END IF;
 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.supervisor_runs_mvp263)
 OR EXISTS(SELECT 1 FROM cotironda_piloto_privado.supervisor_alerts_mvp263)
 THEN RAISE EXCEPTION 'mvp263_disabled_wrote_anything';END IF;
 IF has_function_privilege('anon',
  'public.cotironda_piloto_supervisor_tick_mvp263()','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.cotironda_piloto_supervisor_alerts_mvp263()','EXECUTE')
 OR NOT has_function_privilege('service_role',
  'public.cotironda_piloto_supervisor_tick_mvp263()','EXECUTE')
 OR has_table_privilege('service_role',
  'cotironda_piloto_privado.supervisor_runs_mvp263','SELECT')
 OR has_table_privilege('anon',
  'cotironda_piloto_privado.supervisor_alerts_mvp263','SELECT')
 THEN RAISE EXCEPTION 'mvp263_acl_leak';END IF;
END$disabled$;
INSERT INTO cotironda_piloto_privado.ai_dispatch_jobs_mvp222 VALUES
 ('uncertain',clock_timestamp()-interval '1 hour'),
 ('leased',clock_timestamp()-interval '1 hour'),
 ('pending',NULL);
INSERT INTO cotironda_piloto_privado.whapi_outbox VALUES
 ('uncertain',clock_timestamp()-interval '30 minutes'),
 ('api_accepted',clock_timestamp()-interval '1 hour');
INSERT INTO cotironda_piloto_privado.ai_supplier_review_mvp227 VALUES
 ('review',clock_timestamp()-interval '2 hours',clock_timestamp()-interval '2 hours'),
 ('reserved',NULL,clock_timestamp()-interval '35 minutes');
INSERT INTO cotironda_piloto_privado.document_ai_diagnostics_mvp127 VALUES
 ('failed',2,clock_timestamp()-interval '2 minutes',
  clock_timestamp()-interval '30 minutes','api_timeout'),
 ('failed',2,NULL,clock_timestamp()-interval '1 hour','api_unauthorized');
INSERT INTO cotironda_piloto_privado.uncertain_triage_cases_mvp258 VALUES
 ('00000000-0000-4000-8000-000000000001');
INSERT INTO cotironda_piloto_privado.commercial_context_events_mvp259 VALUES
 (clock_timestamp()+interval '12 hours');
-- Simulate the prior cron arriving milliseconds before this bucket:
-- the next fixed 15-minute bucket must run even if <15 min elapsed.
UPDATE cotironda_piloto_privado.supervisor_policy_mvp263
 SET enabled=true,
 last_run_at=date_bin('15 minutes',clock_timestamp(),
   '2000-01-01 00:00:00+00'::timestamptz)-interval '1 millisecond'
 WHERE only_row=true;

DO $first$
DECLARE v jsonb;v2 jsonb;list_ jsonb;
BEGIN
 v:=public.cotironda_piloto_supervisor_tick_mvp263();
 IF v->>'state'<>'recorded_private' OR v->>'severity'<>'blocked'
 OR (v->>'active_alerts')::int<>7
 OR (v->>'new_alerts')::int<>7 OR
 (v->>'reopened_alerts')::int<>0 OR
 (v->>'resolved_alerts')::int<>0 OR
 v->>'external_api_calls'<>'0' OR v->>'model_calls'<>'0' OR
 v->>'messages_sent'<>'false' OR
 v->>'automatic_award_allowed'<>'false' OR
 v->>'automatic_resend_allowed'<>'false' OR
 v->>'contacts_revealed'<>'false' OR
 v->>'costs_verified'<>'false'
 THEN RAISE EXCEPTION 'mvp263_first_tick_bad_%',v;END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.supervisor_alerts_mvp263)<>7
 OR (SELECT count(*) FROM cotironda_piloto_privado.supervisor_runs_mvp263)<>1
 THEN RAISE EXCEPTION 'mvp263_alert_count_incorrect';END IF;
 v2:=public.cotironda_piloto_supervisor_tick_mvp263();
 IF v2->>'state'<>'interval_guard'
 THEN RAISE EXCEPTION 'mvp263_duplicate_tick_not_blocked_%',v2;END IF;
 IF (SELECT min(observations) FROM
    cotironda_piloto_privado.supervisor_alerts_mvp263)<>1
 OR (SELECT max(observations) FROM
    cotironda_piloto_privado.supervisor_alerts_mvp263)<>1
 THEN RAISE EXCEPTION 'mvp263_duplicate_alert_observed';END IF;
 list_:=public.cotironda_piloto_supervisor_alerts_mvp263();
 IF list_->>'state'<>'private_alerts' OR
 jsonb_array_length(list_->'alerts')<>7
 OR list_->>'outbound_notifications_enabled'<>'false'
 THEN RAISE EXCEPTION 'mvp263_operator_projection_bad_%',list_;END IF;
 IF list_::text LIKE '%00000000-0000-4000-8000%'
 OR list_::text LIKE '%'||repeat('f',64)||'%'
 THEN RAISE EXCEPTION 'mvp263_identifier_leak';END IF;
END$first$;

-- Hard budget: no more than one run per UTC day when configured as one.
UPDATE cotironda_piloto_privado.supervisor_policy_mvp263 SET
 last_run_at=clock_timestamp()-interval '1 hour',max_runs_utc_day=1
 WHERE only_row=true;
DO $cap$
DECLARE v jsonb;
BEGIN
 v:=public.cotironda_piloto_supervisor_tick_mvp263();
 IF v->>'state'<>'daily_cap' OR v->>'external_api_calls'<>'0'
 THEN RAISE EXCEPTION 'mvp263_daily_budget_broken_%',v;END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.supervisor_runs_mvp263)<>1
 THEN RAISE EXCEPTION 'mvp263_daily_cap_created_run';END IF;
END$cap$;

-- Synthetic next interval, without changing database clock. Test a safe
-- resolution only when ALL source counts become zero.
UPDATE cotironda_piloto_privado.supervisor_policy_mvp263 SET
 last_run_at=clock_timestamp()-interval '1 hour',
 max_runs_utc_day=96 WHERE only_row=true;
UPDATE cotironda_piloto_privado.supervisor_runs_mvp263
 SET bucket_utc=bucket_utc-interval '15 minutes';
DELETE FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222;
DELETE FROM cotironda_piloto_privado.whapi_outbox;
DELETE FROM cotironda_piloto_privado.ai_supplier_review_mvp227;
DELETE FROM cotironda_piloto_privado.document_ai_diagnostics_mvp127;
DELETE FROM cotironda_piloto_privado.uncertain_triage_cases_mvp258;

DO $resolve$
DECLARE v jsonb;
BEGIN
 v:=public.cotironda_piloto_supervisor_tick_mvp263();
 IF v->>'state'<>'recorded_private' OR
 v->>'severity'<>'ok' OR
 (v->>'active_alerts')::int<>0 OR
 (v->>'resolved_alerts')::int<>7
 THEN RAISE EXCEPTION 'mvp263_resolution_incorrect_%',v;END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.supervisor_alerts_mvp263
     WHERE active OR current_count>0 OR resolved_at IS NULL)<>0
 THEN RAISE EXCEPTION 'mvp263_did_not_close_alerts';END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.supervisor_alerts_mvp263)<>7
 THEN RAISE EXCEPTION 'mvp263_lost_alert_history';END IF;
END$resolve$;

-- Next synthetic interval: exactly one alert reopens, same key, no duplicate.
UPDATE cotironda_piloto_privado.supervisor_policy_mvp263 SET
 last_run_at=clock_timestamp()-interval '1 hour' WHERE only_row=true;
UPDATE cotironda_piloto_privado.supervisor_runs_mvp263
 SET bucket_utc=bucket_utc-interval '30 minutes'
 WHERE bucket_utc=date_bin('15 minutes',clock_timestamp(),
  '2000-01-01 00:00:00+00'::timestamptz);
INSERT INTO cotironda_piloto_privado.whapi_outbox VALUES
 ('uncertain',clock_timestamp()-interval '1 hour');

DO $reopen$
DECLARE v jsonb;
BEGIN
 v:=public.cotironda_piloto_supervisor_tick_mvp263();
 IF v->>'state'<>'recorded_private' OR
 (v->>'active_alerts')::int<>1 OR
 (v->>'reopened_alerts')::int<>1 OR
 (v->>'new_alerts')::int<>0 OR
 (SELECT count(*) FROM cotironda_piloto_privado.supervisor_alerts_mvp263)<>7
 OR (SELECT reopen_count FROM cotironda_piloto_privado.supervisor_alerts_mvp263
     WHERE signal_code='outbound_uncertain')<>1
 THEN RAISE EXCEPTION 'mvp263_reopened_alert_not_deduped_%',v;END IF;
END$reopen$;

ROLLBACK;
