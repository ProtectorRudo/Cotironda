-- MVP262: PostgreSQL 17 isolated/private, all synthetic, ROLLBACK.
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



-- Committed only to the disposable CI database cotironda_parallel.
INSERT INTO cotironda_piloto_privado.ai_dispatch_jobs_mvp222 VALUES
 ('uncertain',clock_timestamp()-interval '30 minutes');
UPDATE cotironda_piloto_privado.supervisor_policy_mvp263
 SET enabled=true WHERE only_row=true;
