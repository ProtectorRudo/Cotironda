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

DO $empty$
DECLARE result jsonb;
BEGIN
 result:=public.cotironda_piloto_supervisor_snapshot_mvp262();
 IF result->>'state'<>'private_supervisor_snapshot' OR
 result->>'severity'<>'ok' OR
 result->'signals'->>'outbound_uncertain'<>'0' OR
 result->>'records_modified'<>'false' OR
 result->>'messages_sent'<>'false' OR
 result->>'automatic_award_allowed'<>'false' OR
 result->>'contacts_revealed'<>'false' OR
 result->>'costs_verified'<>'false'
 THEN RAISE EXCEPTION 'mvp262_empty_snapshot_incorrect_%',result;END IF;
 result:=public.cotironda_piloto_supervisor_snapshot_mvp262(0);
 IF result->>'state'<>'invalid' THEN RAISE EXCEPTION 'mvp262_window_zero';END IF;
 result:=public.cotironda_piloto_supervisor_snapshot_mvp262(169);
 IF result->>'state'<>'invalid' THEN RAISE EXCEPTION 'mvp262_window_high';END IF;
 result:=public.cotironda_piloto_supervisor_snapshot_mvp262(NULL);
 IF result->>'state'<>'invalid' THEN RAISE EXCEPTION 'mvp262_window_null';END IF;
END$empty$;

INSERT INTO cotironda_piloto_privado.ai_dispatch_jobs_mvp222 VALUES
 ('uncertain',clock_timestamp()-interval '1 hour'),
 ('leased',clock_timestamp()-interval '30 minutes'),
 ('pending',NULL);
INSERT INTO cotironda_piloto_privado.whapi_outbox VALUES
 ('uncertain',clock_timestamp()-interval '2 hours'),
 ('api_accepted',clock_timestamp()-interval '1 hour');
INSERT INTO cotironda_piloto_privado.ai_supplier_review_mvp227 VALUES
 ('review',clock_timestamp()-interval '1 hour',clock_timestamp()-interval '2 hours'),
 ('reserved',NULL,clock_timestamp()-interval '25 minutes'),
 ('verified',clock_timestamp()-interval '1 hour',clock_timestamp()-interval '2 hours');
INSERT INTO cotironda_piloto_privado.document_ai_diagnostics_mvp127 VALUES
 ('failed',2,clock_timestamp()-interval '2 minutes',clock_timestamp()-interval '1 hour','api_timeout'),
 ('failed',1,NULL,clock_timestamp()-interval '1 hour','api_unauthorized'),
 ('failed',3,NULL,clock_timestamp()-interval '1 day','api_timeout');
INSERT INTO cotironda_piloto_privado.uncertain_triage_cases_mvp258 VALUES
 ('00000000-0000-4000-8000-000000000001'),
 ('00000000-0000-4000-8000-000000000002');
INSERT INTO cotironda_piloto_privado.uncertain_review_notes_mvp258 VALUES
 ('00000000-0000-4000-8000-000000000002');
INSERT INTO cotironda_piloto_privado.uncertain_whapi_receipts_mvp257 VALUES
 (repeat('f',64));
INSERT INTO cotironda_piloto_privado.commercial_context_events_mvp259 VALUES
 (clock_timestamp()+interval '12 hours'),
 (clock_timestamp()+interval '4 days');

DO $checks$
DECLARE result jsonb;repeated jsonb;
BEGIN
 result:=public.cotironda_piloto_supervisor_snapshot_mvp262(24);
 IF result->>'state'<>'private_supervisor_snapshot'
 OR result->>'severity'<>'blocked'
 OR result->'signals'->>'outbound_uncertain'<>'2'
 OR result->'signals'->>'outbound_stalled_lease'<>'1'
 OR result->'signals'->>'outbound_pending'<>'1'
 OR result->'signals'->>'supplier_quotes_review'<>'1'
 OR result->'signals'->>'supplier_quotes_stale_reservation'<>'1'
 OR result->'signals'->>'document_retry_due'<>'1'
 OR result->'signals'->>'document_manual_review'<>'1'
 OR result->'signals'->>'whapi_triage_cases'<>'2'
 OR result->'signals'->>'whapi_triage_without_note'<>'1'
 OR result->'signals'->>'whapi_status_evidence'<>'1'
 OR result->'signals'->>'commercial_memories_expiring_24h'<>'1'
 THEN RAISE EXCEPTION 'mvp262_broken_rules_%',result;END IF;
 IF result->'operator_actions'->>0<>
  'investigate_uncertain_whapi_without_resend'
 OR result->'operator_actions'->>1<>
  'inspect_permanent_document_failure'
 OR result->'operator_actions'->>2<>
  'review_supplier_quote_source'
 OR result->'operator_actions'->>3<>
  'inspect_safe_document_retry_worker'
 OR result->>'automatic_resend_allowed'<>'false'
 OR result->>'messages_sent'<>'false'
 OR result->>'records_modified'<>'false'
 THEN RAISE EXCEPTION 'mvp262_unsafe_action_%',result;END IF;
 repeated:=public.cotironda_piloto_supervisor_snapshot_mvp262(24);
 IF result IS DISTINCT FROM repeated
 THEN RAISE EXCEPTION 'mvp262_snapshot_not_idempotent';END IF;
 IF result::text LIKE '%00000000-0000-4000-8000%'
 OR result::text LIKE '%'||repeat('f',64)||'%'
 THEN RAISE EXCEPTION 'mvp262_identifier_leak';END IF;
 IF has_function_privilege('anon',
  'public.cotironda_piloto_supervisor_snapshot_mvp262(integer)','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.cotironda_piloto_supervisor_snapshot_mvp262(integer)','EXECUTE')
 OR NOT has_function_privilege('service_role',
  'public.cotironda_piloto_supervisor_snapshot_mvp262(integer)','EXECUTE')
 THEN RAISE EXCEPTION 'mvp262_acl_broken';END IF;
END$checks$;
-- The supervisor must never clear uncertainty merely because an event receipt
-- was observed in a separate private evidence ledger.
ROLLBACK;
