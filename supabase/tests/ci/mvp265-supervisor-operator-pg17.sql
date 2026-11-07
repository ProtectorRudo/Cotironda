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



\ir ../../piloto/mvp265_supervisor_operator_casebook.sql

INSERT INTO cotironda_piloto_privado.whapi_outbox VALUES
 ('uncertain',clock_timestamp()-interval '2 hours');
UPDATE cotironda_piloto_privado.supervisor_policy_mvp263 SET enabled=true
 WHERE only_row=true;
SELECT public.cotironda_piloto_supervisor_tick_mvp263();
-- Synthetic time travel for an overdue operator SLA; does not touch PILOT.
UPDATE cotironda_piloto_privado.supervisor_alerts_mvp263
 SET first_seen_at=clock_timestamp()-interval '2 hours'
 WHERE signal_code='outbound_uncertain';
INSERT INTO cotironda_piloto_privado.supervisor_operators_mvp265(
 operator_ref,active,role) VALUES
 ('00000000-0000-4000-8000-000000000010',true,'incident_manager'),
 ('00000000-0000-4000-8000-000000000011',false,'incident_manager');

DO $active$
DECLARE v jsonb; ep timestamptz; u uuid:='00000000-0000-4000-8000-000000000010';
BEGIN
 SELECT first_seen_at INTO ep FROM
 cotironda_piloto_privado.supervisor_alerts_mvp263
 WHERE signal_code='outbound_uncertain';
 IF ep IS NULL THEN RAISE EXCEPTION 'mvp265_no_live_alert';END IF;
 v:=public.cotironda_piloto_supervisor_case_queue_mvp265();
 IF v->>'state'<>'private_operator_cases' OR
 jsonb_array_length(v->'cases')<>1 OR
 v->'cases'->0->>'review_state'<>'awaiting_operator' OR
 v->'cases'->0->>'unacknowledged_over_sla'<>'true' OR
 v->'cases'->0->>'sla_minutes'<>'30'
 THEN RAISE EXCEPTION 'mvp265_sla_or_queue_wrong_%',v;END IF;
 IF v::text LIKE '%00000000-0000-4000-8000%' OR
 v::text LIKE '%'||repeat('b',64)||'%'
 THEN RAISE EXCEPTION 'mvp265_operator_queue_exposes_identity';END IF;

 v:=public.cotironda_piloto_supervisor_case_action_mvp265(
 'outbound_uncertain',ep,u,'review_resolution',repeat('a',64));
 IF v->>'state'<>'invalid_transition'
 THEN RAISE EXCEPTION 'mvp265_active_cannot_be_closed_%',v;END IF;
 v:=public.cotironda_piloto_supervisor_case_action_mvp265(
 'outbound_uncertain',ep,u,'escalate',repeat('a',64));
 IF v->>'state'<>'invalid_transition'
 THEN RAISE EXCEPTION 'mvp265_escalation_requires_ack_%',v;END IF;
 v:=public.cotironda_piloto_supervisor_case_action_mvp265(
 'outbound_uncertain',ep,'00000000-0000-4000-8000-000000000011',
 'acknowledge',repeat('b',64));
 IF v->>'state'<>'operator_not_authorized'
 THEN RAISE EXCEPTION 'mvp265_disabled_operator_was_allowed_%',v;END IF;
 v:=public.cotironda_piloto_supervisor_case_action_mvp265(
 'outbound_uncertain',ep,u,'acknowledge',repeat('c',64));
 IF v->>'state'<>'recorded_private' OR
 v->>'incident_resolved_by_operator'<>'false' OR
 v->>'messages_sent'<>'false'
 THEN RAISE EXCEPTION 'mvp265_ack_not_recorded_%',v;END IF;
 v:=public.cotironda_piloto_supervisor_case_action_mvp265(
 'outbound_uncertain',ep,u,'acknowledge',repeat('c',64));
 IF v->>'state'<>'already_recorded'
 THEN RAISE EXCEPTION 'mvp265_duplicate_ack_not_idempotent_%',v;END IF;
 v:=public.cotironda_piloto_supervisor_case_action_mvp265(
 'outbound_uncertain',ep,u,'investigate',repeat('d',64));
 IF v->>'state'<>'recorded_private'
 THEN RAISE EXCEPTION 'mvp265_investigation_not_saved_%',v;END IF;
 v:=public.cotironda_piloto_supervisor_case_action_mvp265(
 'outbound_uncertain',ep,u,'manual_reconciliation_needed',repeat('e',64));
 IF v->>'state'<>'recorded_private'
 THEN RAISE EXCEPTION 'mvp265_reconciliation_note_not_saved_%',v;END IF;
 v:=public.cotironda_piloto_supervisor_case_action_mvp265(
 'outbound_uncertain',ep,u,'escalate',repeat('f',64));
 IF v->>'state'<>'recorded_private'
 THEN RAISE EXCEPTION 'mvp265_escalation_not_saved_%',v;END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.supervisor_case_events_mvp265)<>4
 OR (SELECT active FROM cotironda_piloto_privado.supervisor_alerts_mvp263
 WHERE signal_code='outbound_uncertain') IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'mvp265_human_changed_source_signal';END IF;
 v:=public.cotironda_piloto_supervisor_case_queue_mvp265();
 IF v->'cases'->0->>'review_state'<>'escalate'
 THEN RAISE EXCEPTION 'mvp265_queue_did_not_update_%',v;END IF;
END$active$;

-- Actual metric is cleared; the next 15-min simulated snapshot resolves it.
DELETE FROM cotironda_piloto_privado.whapi_outbox;
UPDATE cotironda_piloto_privado.supervisor_policy_mvp263
 SET last_run_at=clock_timestamp()-interval '1 hour' WHERE only_row=true;
UPDATE cotironda_piloto_privado.supervisor_runs_mvp263
 SET bucket_utc=bucket_utc-interval '15 minutes';
SELECT public.cotironda_piloto_supervisor_tick_mvp263();

DO $resolved$
DECLARE v jsonb;ep timestamptz;u uuid:='00000000-0000-4000-8000-000000000010';
BEGIN
 SELECT first_seen_at INTO ep FROM
 cotironda_piloto_privado.supervisor_alerts_mvp263
 WHERE signal_code='outbound_uncertain';
 IF (SELECT active FROM cotironda_piloto_privado.supervisor_alerts_mvp263
 WHERE signal_code='outbound_uncertain') IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'mvp265_source_not_resolved';END IF;
 v:=public.cotironda_piloto_supervisor_case_queue_mvp265();
 IF v->'cases'->0->>'review_state'<>'source_resolved'
 THEN RAISE EXCEPTION 'mvp265_resolved_queue_not_updated_%',v;END IF;
 v:=public.cotironda_piloto_supervisor_case_action_mvp265(
 'outbound_uncertain',ep,u,'review_resolution',repeat('1',64));
 IF v->>'state'<>'recorded_private'
 THEN RAISE EXCEPTION 'mvp265_resolution_review_not_saved_%',v;END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.supervisor_case_events_mvp265)<>5
 THEN RAISE EXCEPTION 'mvp265_lost_audit_history';END IF;
END$resolved$;

-- New episode reopens with a NEW first_seen_at; must acknowledge anew.
UPDATE cotironda_piloto_privado.supervisor_policy_mvp263
 SET last_run_at=clock_timestamp()-interval '1 hour' WHERE only_row=true;
UPDATE cotironda_piloto_privado.supervisor_runs_mvp263
 SET bucket_utc=bucket_utc-interval '30 minutes'
 WHERE bucket_utc=date_bin('15 minutes',clock_timestamp(),
  '2000-01-01 00:00:00+00'::timestamptz);
INSERT INTO cotironda_piloto_privado.whapi_outbox VALUES
 ('uncertain',clock_timestamp()-interval '1 hour');
SELECT public.cotironda_piloto_supervisor_tick_mvp263();
DO $reopened$
DECLARE v jsonb;new_ep timestamptz;old_ep timestamptz;
 u uuid:='00000000-0000-4000-8000-000000000010';
BEGIN
 SELECT first_seen_at INTO new_ep FROM cotironda_piloto_privado.supervisor_alerts_mvp263
 WHERE signal_code='outbound_uncertain';
 SELECT episode_started_at INTO old_ep FROM
 cotironda_piloto_privado.supervisor_case_events_mvp265 ORDER BY event_id LIMIT 1;
 IF new_ep=old_ep THEN RAISE EXCEPTION 'mvp265_episode_not_rotated';END IF;
 v:=public.cotironda_piloto_supervisor_case_action_mvp265(
 'outbound_uncertain',old_ep,u,'acknowledge',repeat('2',64));
 IF v->>'state'<>'stale_episode'
 THEN RAISE EXCEPTION 'mvp265_old_episode_can_modify_new_%',v;END IF;
 v:=public.cotironda_piloto_supervisor_case_action_mvp265(
 'outbound_uncertain',new_ep,u,'escalate',repeat('3',64));
 IF v->>'state'<>'invalid_transition'
 THEN RAISE EXCEPTION 'mvp265_reopened_escalated_without_ack_%',v;END IF;
 v:=public.cotironda_piloto_supervisor_case_action_mvp265(
 'outbound_uncertain',new_ep,u,'acknowledge',repeat('4',64));
 IF v->>'state'<>'recorded_private'
 THEN RAISE EXCEPTION 'mvp265_reopened_ack_not_recorded_%',v;END IF;
 IF has_function_privilege('anon',
  'public.cotironda_piloto_supervisor_case_queue_mvp265()','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.cotironda_piloto_supervisor_case_action_mvp265(text,timestamptz,uuid,text,text)','EXECUTE')
 OR has_table_privilege('service_role',
  'cotironda_piloto_privado.supervisor_case_events_mvp265','SELECT')
 OR NOT has_function_privilege('service_role',
  'public.cotironda_piloto_supervisor_case_queue_mvp265()','EXECUTE')
 THEN RAISE EXCEPTION 'mvp265_permissions_leak';END IF;
END$reopened$;
ROLLBACK;
