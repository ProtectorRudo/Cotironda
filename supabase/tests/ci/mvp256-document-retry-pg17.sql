-- MVP256: verdadero PostgreSQL 17, fixtures privados, ROLLBACK.
BEGIN;
DO $roles$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon')
 THEN CREATE ROLE anon NOLOGIN;END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated')
 THEN CREATE ROLE authenticated NOLOGIN;END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role')
 THEN CREATE ROLE service_role NOLOGIN;END IF;
END$roles$;
CREATE SCHEMA cotironda_piloto_privado;
CREATE TABLE cotironda_piloto_privado.participants(
 key text PRIMARY KEY,chat_hmac text NOT NULL,
 participant_role text NOT NULL,consent_at timestamptz,
 opted_out_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.media_archive_mvp095(
 message_hmac text PRIMARY KEY,
 participant_key text NOT NULL,chat_hmac text NOT NULL,
 state text NOT NULL,ai_reserved_at timestamptz,
 kind text NOT NULL,mime text NOT NULL,content_sha256 text NOT NULL,
 size_bytes int NOT NULL,request_id uuid,
 proposal jsonb,review_state text,storage_path text
);
CREATE TABLE cotironda_piloto_privado.document_ai_diagnostics_mvp127(
 message_hmac text PRIMARY KEY
  REFERENCES cotironda_piloto_privado.media_archive_mvp095(message_hmac),
 state text NOT NULL DEFAULT 'pending',
 reason_code text NOT NULL DEFAULT 'not_attempted',
 phase text NOT NULL DEFAULT 'initial',
 attempt_count smallint NOT NULL DEFAULT 0,
 first_failure_at timestamptz,
 last_attempt_at timestamptz,
 next_retry_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE cotironda_piloto_privado.operational_caps_mvp097(
 only_row boolean PRIMARY KEY,max_document_ai_per_24h int
);
CREATE TABLE cotironda_piloto_privado.integration_flags(
 only_row boolean PRIMARY KEY,whatsapp_inbound_enabled boolean
);
CREATE TABLE cotironda_piloto_privado.requests(
 id uuid PRIMARY KEY,state text,closes_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.invitations(
 request_id uuid,supplier_key text,state text
);
INSERT INTO cotironda_piloto_privado.operational_caps_mvp097 VALUES(true,100);
INSERT INTO cotironda_piloto_privado.integration_flags VALUES(true,true);
INSERT INTO cotironda_piloto_privado.participants
 (key,chat_hmac,participant_role,consent_at)
 VALUES('buyer_1',repeat('b',64),'buyer',clock_timestamp()-interval '1 hour');
INSERT INTO cotironda_piloto_privado.media_archive_mvp095(
 message_hmac,participant_key,chat_hmac,state,ai_reserved_at,
 kind,mime,content_sha256,size_bytes,request_id,
 proposal,review_state,storage_path
) VALUES(repeat('a',64),'buyer_1',repeat('b',64),'stored',
 clock_timestamp()-interval '10 minutes',
 'document','application/pdf',repeat('d',64),512,NULL,
 NULL,'review_required','media/'||repeat('a',64));
\ir ../../piloto/mvp256_document_retry_policy_safe.sql

DO $test$
DECLARE
 r jsonb;
 next_time timestamptz;
 attempts int;
BEGIN
 IF NOT public.cotironda_piloto_retryable_document_error_mvp256('api_timeout')
 OR NOT public.cotironda_piloto_retryable_document_error_mvp256('api_rate_limited')
 OR NOT public.cotironda_piloto_retryable_document_error_mvp256('legacy_unclassified')
 OR public.cotironda_piloto_retryable_document_error_mvp256('api_unauthorized')
 OR public.cotironda_piloto_retryable_document_error_mvp256('api_credentials_missing')
 OR public.cotironda_piloto_retryable_document_error_mvp256('response_invalid')
 OR public.cotironda_piloto_retryable_document_error_mvp256('response_too_large')
 OR public.cotironda_piloto_retryable_document_error_mvp256('source_review_required')
 OR public.cotironda_piloto_retryable_document_error_mvp256('quota_blocked')
 OR public.cotironda_piloto_retryable_document_error_mvp256('draft_persistence_failed')
 OR public.cotironda_piloto_retryable_document_error_mvp256('api_rejected')
 OR public.cotironda_piloto_retryable_document_error_mvp256('some_new_error')
 OR public.cotironda_piloto_retryable_document_error_mvp256(NULL)
 THEN RAISE EXCEPTION 'mvp256_closed_error_policy_broken';END IF;

 IF NOT public.cotironda_piloto_note_document_failure_mvp127(
  repeat('a',64),'api_credentials_missing','retry')
 THEN RAISE EXCEPTION 'mvp256_cannot_store_permanent_failure';END IF;
 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.document_ai_diagnostics_mvp127
 WHERE message_hmac=repeat('a',64) AND next_retry_at IS NOT NULL)
 THEN RAISE EXCEPTION 'mvp256_permanent_error_has_retry';END IF;
 r:=public.cotironda_piloto_system_document_trigger_mvp131();
 IF r->>'state'<>'none'
 THEN RAISE EXCEPTION 'mvp256_scheduler_retried_permanent_%',r;END IF;
 r:=public.cotironda_piloto_next_document_retry_mvp128(repeat('b',64));
 IF r->>'state'<>'none'
 THEN RAISE EXCEPTION 'mvp256_queue_retried_permanent_%',r;END IF;
 r:=public.cotironda_piloto_reserve_document_retry_mvp127(repeat('a',64));
 IF r->>'state'<>'not_due'
 THEN RAISE EXCEPTION 'mvp256_reserve_retried_permanent_%',r;END IF;

 IF NOT public.cotironda_piloto_note_document_failure_mvp127(
  repeat('a',64),'api_timeout','retry')
 THEN RAISE EXCEPTION 'mvp256_cannot_store_transient_failure';END IF;
 SELECT next_retry_at INTO next_time
 FROM cotironda_piloto_privado.document_ai_diagnostics_mvp127
 WHERE message_hmac=repeat('a',64);
 IF next_time NOT BETWEEN clock_timestamp()+interval '8 minutes'
   AND clock_timestamp()+interval '10 minutes'
 THEN RAISE EXCEPTION 'mvp256_second_attempt_backoff_invalid';END IF;
 r:=public.cotironda_piloto_system_document_trigger_mvp131();
 IF r->>'state'<>'none'
 THEN RAISE EXCEPTION 'mvp256_backoff_ignored_%',r;END IF;

 UPDATE cotironda_piloto_privado.document_ai_diagnostics_mvp127
 SET next_retry_at=clock_timestamp()-interval '1 second'
 WHERE message_hmac=repeat('a',64);
 r:=public.cotironda_piloto_system_document_trigger_mvp131();
 IF r->>'state'<>'candidate'
 THEN RAISE EXCEPTION 'mvp256_scheduler_did_not_choose_transient_%',r;END IF;
 r:=public.cotironda_piloto_next_document_retry_mvp128(repeat('b',64));
 IF r->>'state'<>'candidate' OR r->>'message_hmac'<>repeat('a',64)
 THEN RAISE EXCEPTION 'mvp256_queue_did_not_choose_transient_%',r;END IF;
 r:=public.cotironda_piloto_reserve_document_retry_mvp127(repeat('a',64));
 IF r->>'state'<>'reserved' OR r->>'source_sha256'<>repeat('d',64)
 THEN RAISE EXCEPTION 'mvp256_reserve_did_not_choose_transient_%',r;END IF;
 r:=public.cotironda_piloto_reserve_document_retry_mvp127(repeat('a',64));
 IF r->>'state'='reserved'
 THEN RAISE EXCEPTION 'mvp256_double_reservation';END IF;

 IF NOT public.cotironda_piloto_note_document_failure_mvp127(
  repeat('a',64),'api_timeout','retry')
 THEN RAISE EXCEPTION 'mvp256_cannot_store_final_failure';END IF;
 SELECT attempt_count INTO attempts
 FROM cotironda_piloto_privado.document_ai_diagnostics_mvp127
 WHERE message_hmac=repeat('a',64);
 IF attempts<>3 OR EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.document_ai_diagnostics_mvp127
  WHERE message_hmac=repeat('a',64) AND next_retry_at IS NOT NULL)
 THEN RAISE EXCEPTION 'mvp256_three_attempts_cap_broken';END IF;
 r:=public.cotironda_piloto_next_document_retry_mvp128(repeat('b',64));
 IF r->>'state'<>'none'
 THEN RAISE EXCEPTION 'mvp256_queue_after_cap_%',r;END IF;

 IF has_function_privilege('anon',
  'public.cotironda_piloto_next_document_retry_mvp128(text)','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.cotironda_piloto_retryable_document_error_mvp256(text)','EXECUTE')
 OR NOT has_function_privilege('service_role',
  'public.cotironda_piloto_next_document_retry_mvp128(text)','EXECUTE')
 OR has_function_privilege('anon',
  'public.cotironda_piloto_note_document_failure_mvp127(text,text,text)','EXECUTE')
 THEN RAISE EXCEPTION 'mvp256_privilege_leak';END IF;
END $test$;

ROLLBACK;
