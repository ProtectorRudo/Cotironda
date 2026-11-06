-- MVP267 PG17: signed-JWT boundary simulated, DB must still verify live session.
-- No real Supabase project/secret/WhatsApp. All test data ROLLBACK.
BEGIN;
DO $roles$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon')
 THEN CREATE ROLE anon NOLOGIN;END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated')
 THEN CREATE ROLE authenticated NOLOGIN;END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role')
 THEN CREATE ROLE service_role NOLOGIN;END IF;
END$roles$;
CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO authenticated;
CREATE TABLE auth.users(
 id uuid PRIMARY KEY,deleted_at timestamptz,banned_until timestamptz,
 is_anonymous boolean NOT NULL DEFAULT false
);
CREATE TABLE auth.sessions(
 id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES auth.users(id),
 not_after timestamptz
);
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $auth$
 SELECT coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)
$auth$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $auth$
 SELECT CASE WHEN (auth.jwt()->>'sub') ~*
 '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
 THEN (auth.jwt()->>'sub')::uuid ELSE NULL::uuid END
$auth$;
GRANT EXECUTE ON FUNCTION auth.jwt(),auth.uid() TO authenticated;

CREATE SCHEMA cotironda_piloto_privado;
CREATE TABLE cotironda_piloto_privado.ai_dispatch_jobs_mvp222(
 state text,leased_at timestamptz);
CREATE TABLE cotironda_piloto_privado.whapi_outbox(
 state text,leased_at timestamptz);
CREATE TABLE cotironda_piloto_privado.ai_supplier_review_mvp227(
 message_hmac text PRIMARY KEY,supplier_key text,
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
 code text) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $f$
 SELECT coalesce(code IN(
  'legacy_unclassified','api_rate_limited','api_server_error',
  'api_unavailable','api_timeout','response_incomplete'),false)
$f$;
CREATE TABLE cotironda_piloto_privado.participants(
 key text PRIMARY KEY,chat_hmac text,participant_role text,
 consent_at timestamptz,opted_out_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.whapi_inbox(
 message_hmac text PRIMARY KEY,participant_key text,chat_hmac text
);
CREATE TABLE cotironda_piloto_privado.ai_central_attempts_mvp226(
 message_hmac text PRIMARY KEY,buyer_key text,chat_hmac text,state text
);
\ir ../../piloto/mvp262_private_supervisor_readonly.sql
\ir ../../piloto/mvp263_supervisor_bounded_watchdog.sql
\ir ../../piloto/mvp264_openai_usage_meters.sql
\ir ../../piloto/mvp265_supervisor_operator_casebook.sql
\ir ../../piloto/mvp266_openai_unknown_persistent_review.sql
\ir ../../piloto/mvp267_operator_supabase_auth_mfa_bridge.sql

INSERT INTO auth.users(id,is_anonymous) VALUES
 ('10000000-0000-4000-8000-000000000001',false),
 ('10000000-0000-4000-8000-000000000002',false),
 ('10000000-0000-4000-8000-000000000003',true);
INSERT INTO auth.sessions(id,user_id,not_after) VALUES
 ('20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',NULL),
 ('20000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000002',NULL),
 ('20000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000003',NULL);
INSERT INTO cotironda_piloto_privado.supervisor_operators_mvp265(
 operator_ref,active,role,auth_user_id) VALUES
 ('30000000-0000-4000-8000-000000000001',true,'incident_manager',
  '10000000-0000-4000-8000-000000000001'),
 ('30000000-0000-4000-8000-000000000002',false,'incident_manager',
  '10000000-0000-4000-8000-000000000002'),
 ('30000000-0000-4000-8000-000000000003',true,'incident_manager',
  '10000000-0000-4000-8000-000000000003');
INSERT INTO cotironda_piloto_privado.whapi_outbox VALUES
 ('uncertain',clock_timestamp()-interval '2 hours');
UPDATE cotironda_piloto_privado.supervisor_policy_mvp263
 SET enabled=true WHERE only_row=true;
SELECT public.cotironda_piloto_supervisor_tick_mvp263();
INSERT INTO cotironda_piloto_privado.participants VALUES
 ('buyer_a',repeat('a',64),'buyer',clock_timestamp(),NULL);
INSERT INTO cotironda_piloto_privado.whapi_inbox VALUES
 (repeat('1',64),'buyer_a',repeat('a',64));
INSERT INTO cotironda_piloto_privado.ai_central_attempts_mvp226 VALUES
 (repeat('1',64),'buyer_a',repeat('a',64),'reserved');
INSERT INTO cotironda_piloto_privado.ai_usage_calls_mvp264(
 message_hmac,call_no,participant_key,participant_role,model_code,
 state,reason_code,finished_at)
 VALUES(repeat('1',64),1,'buyer_a','buyer','gpt-6-luna',
 'unmetered','network_uncertain',clock_timestamp());

-- Simulated verified Supabase Auth JWT. PostgREST checks its SIGNATURE before SQL.
SELECT set_config('request.jwt.claims',jsonb_build_object(
 'sub','10000000-0000-4000-8000-000000000001',
 'session_id','20000000-0000-4000-8000-000000000001',
 'iss','https://ilggkalaafhtiysyzlmg.supabase.co/auth/v1',
 'role','authenticated','aal','aal2',
 'exp',extract(epoch from clock_timestamp()+interval '1 hour')::bigint
)::text,true);
SET ROLE authenticated;
DO $authorized$
DECLARE v jsonb;episode_ timestamptz;
BEGIN
 v:=public.cotironda_piloto_operator_queue_auth_mvp267();
 IF v->>'state'<>'private_operator_cases'
 OR jsonb_array_length(v->'cases')<>1
 THEN RAISE EXCEPTION 'mvp267_queue_denied_%',v;END IF;
 episode_:=(v->'cases'->0->>'opened_at')::timestamptz;
 v:=public.cotironda_piloto_operator_usage_auth_mvp267(24);
 IF v->>'state'<>'private_openai_usage' OR
  v->>'pricing_verified'<>'false' OR
  v->>'unknown_usage_is_zero'<>'false'
 THEN RAISE EXCEPTION 'mvp267_usage_not_private_%',v;END IF;
 v:=public.cotironda_piloto_operator_case_action_auth_mvp267(
  'outbound_uncertain',episode_,'acknowledge',repeat('b',64));
 IF v->>'state'<>'recorded_private'
 THEN RAISE EXCEPTION 'mvp267_case_actor_denied_%',v;END IF;
 v:=public.cotironda_piloto_operator_usage_review_auth_mvp267(
  repeat('1',64),1,'financial_exposure_accepted',repeat('c',64));
 IF v->>'state'<>'reviewed_private' OR
  v->>'usage_observed'<>'false' OR
  v->>'monetary_cost_verified'<>'false'
 THEN RAISE EXCEPTION 'mvp267_review_denied_%',v;END IF;
 -- Nobody can invent operator UUID via a parameter (RPC has no such arg).
 IF EXISTS(
  SELECT 1 FROM pg_proc
  WHERE proname LIKE '%_auth_mvp267' AND
    pg_get_function_identity_arguments(oid) ILIKE '%operator_ref%'
 ) THEN RAISE EXCEPTION 'mvp267_impersonation_arg';END IF;
END$authorized$;
RESET ROLE;

DO $source$
BEGIN
 IF (SELECT operator_ref FROM
 cotironda_piloto_privado.supervisor_case_events_mvp265
 LIMIT 1)<>'30000000-0000-4000-8000-000000000001'::uuid
 OR (SELECT operator_ref FROM
 cotironda_piloto_privado.ai_usage_reviews_mvp266
 LIMIT 1)<>'30000000-0000-4000-8000-000000000001'::uuid
 OR (SELECT state FROM cotironda_piloto_privado.ai_usage_calls_mvp264
 WHERE message_hmac=repeat('1',64))<>'unmetered'
 THEN RAISE EXCEPTION 'mvp267_impersonation_or_usage_falsification';END IF;
END$source$;

-- AAL1 (no MFA), invalid issuer, expired JWT or disabled operator fail closed.
SELECT set_config('request.jwt.claims',jsonb_build_object(
 'sub','10000000-0000-4000-8000-000000000001',
 'session_id','20000000-0000-4000-8000-000000000001',
 'iss','https://ilggkalaafhtiysyzlmg.supabase.co/auth/v1',
 'role','authenticated','aal','aal1',
 'exp',extract(epoch from clock_timestamp()+interval '1 hour')::bigint
)::text,true);
SET ROLE authenticated;
DO $negative$
DECLARE v jsonb;
BEGIN
 v:=public.cotironda_piloto_operator_queue_auth_mvp267();
 IF v->>'state'<>'not_authorized'
 THEN RAISE EXCEPTION 'mvp267_mfa_not_enforced_%',v;END IF;
END$negative$;
RESET ROLE;
SELECT set_config('request.jwt.claims',jsonb_build_object(
 'sub','10000000-0000-4000-8000-000000000002',
 'session_id','20000000-0000-4000-8000-000000000002',
 'iss','https://ilggkalaafhtiysyzlmg.supabase.co/auth/v1',
 'role','authenticated','aal','aal2',
 'exp',extract(epoch from clock_timestamp()+interval '1 hour')::bigint
)::text,true);
SET ROLE authenticated;
DO $disabled$
BEGIN
 IF public.cotironda_piloto_operator_queue_auth_mvp267()->>'state'
  <> 'not_authorized'
 THEN RAISE EXCEPTION 'mvp267_disabled_operator_accepted';END IF;
END$disabled$;
RESET ROLE;
SELECT set_config('request.jwt.claims',jsonb_build_object(
 'sub','10000000-0000-4000-8000-000000000003',
 'session_id','20000000-0000-4000-8000-000000000003',
 'iss','https://ilggkalaafhtiysyzlmg.supabase.co/auth/v1',
 'role','authenticated','aal','aal2',
 'exp',extract(epoch from clock_timestamp()+interval '1 hour')::bigint
)::text,true);
SET ROLE authenticated;
DO $anonymous$
BEGIN
 IF public.cotironda_piloto_operator_queue_auth_mvp267()->>'state'
  <> 'not_authorized'
 THEN RAISE EXCEPTION 'mvp267_anonymous_operator_accepted';END IF;
END$anonymous$;
RESET ROLE;

SELECT set_config('request.jwt.claims',jsonb_build_object(
 'sub','10000000-0000-4000-8000-000000000001',
 'session_id','20000000-0000-4000-8000-000000000001',
 'iss','https://ilggkalaafhtiysyzlmg.supabase.co/auth/v1',
 'role','authenticated','aal','aal2',
 'exp',extract(epoch from clock_timestamp()+interval '1 hour')::bigint
)::text,true);
DELETE FROM auth.sessions
 WHERE id='20000000-0000-4000-8000-000000000001';
SET ROLE authenticated;
DO $revoked$
BEGIN
 IF public.cotironda_piloto_operator_queue_auth_mvp267()->>'state'
  <> 'not_authorized'
 THEN RAISE EXCEPTION 'mvp267_signed_out_still_authorized';END IF;
END$revoked$;
RESET ROLE;
DO $acl$
BEGIN
 IF has_function_privilege('anon',
  'public.cotironda_piloto_operator_queue_auth_mvp267()','EXECUTE')
 OR has_function_privilege('anon',
  'public.cotironda_piloto_operator_case_action_auth_mvp267(text,timestamptz,text,text)','EXECUTE')
 OR has_function_privilege('service_role',
  'public.cotironda_piloto_operator_usage_review_auth_mvp267(text,integer,text,text)','EXECUTE')
 OR has_function_privilege('authenticated',
  'cotironda_piloto_privado.operator_session_mvp267()','EXECUTE')
 OR has_table_privilege('authenticated',
  'cotironda_piloto_privado.supervisor_operators_mvp265','SELECT')
 OR NOT has_function_privilege('authenticated',
  'public.cotironda_piloto_operator_queue_auth_mvp267()','EXECUTE')
 THEN RAISE EXCEPTION 'mvp267_permission_leak';END IF;
END$acl$;
ROLLBACK;
