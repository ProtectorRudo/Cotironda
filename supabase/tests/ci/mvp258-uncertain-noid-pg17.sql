-- MVP258 / PostgreSQL 17 reversible triage contract. No Whapi or data sent.
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
CREATE SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE SCHEMA cotironda_piloto_privado;
CREATE TABLE cotironda_piloto_privado.requests(id uuid PRIMARY KEY,buyer_key text);
CREATE TABLE cotironda_piloto_privado.whapi_outbox(
 request_id uuid,supplier_key text,state text,whapi_message_id text,leased_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.ai_dispatch_jobs_mvp222(
 request_id uuid,supplier_key text,state text,whapi_message_id text,leased_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.buyer_tracking_mvp091(
 request_id uuid,send_state text,whapi_message_id text,send_attempted_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.supplier_ack_mvp104(
 message_hmac text,state text,whapi_message_id text,reserved_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.whapi_inbox(
 message_hmac text,request_id uuid,participant_key text
);
CREATE TABLE cotironda_piloto_privado.finalist_whapi_outbox_mvp110(
 request_id uuid,recipient_key text,state text,whapi_message_id text,leased_at timestamptz
);
\ir ../../piloto/mvp258_uncertain_noid_triage.sql

INSERT INTO cotironda_piloto_privado.requests VALUES
 ('00000000-0000-4000-8000-000000000001','buyer_a'),
 ('00000000-0000-4000-8000-000000000002','buyer_b');
INSERT INTO cotironda_piloto_privado.whapi_outbox VALUES
 ('00000000-0000-4000-8000-000000000001','supplier_a','uncertain',NULL,
  clock_timestamp()-interval '25 minutes'),
 ('00000000-0000-4000-8000-000000000002','supplier_b','api_accepted','message_accepted_01',
  clock_timestamp()-interval '25 minutes');
INSERT INTO cotironda_piloto_privado.ai_dispatch_jobs_mvp222 VALUES
 ('00000000-0000-4000-8000-000000000001','supplier_a','leased',NULL,
  clock_timestamp()-interval '30 minutes'),
 ('00000000-0000-4000-8000-000000000002','supplier_b','leased',NULL,
  clock_timestamp()-interval '2 minutes');
INSERT INTO cotironda_piloto_privado.buyer_tracking_mvp091 VALUES
 ('00000000-0000-4000-8000-000000000001','uncertain',NULL,
  clock_timestamp()-interval '30 minutes');
INSERT INTO cotironda_piloto_privado.whapi_inbox VALUES
 (repeat('e',64),'00000000-0000-4000-8000-000000000001','supplier_a');
INSERT INTO cotironda_piloto_privado.supplier_ack_mvp104 VALUES
 (repeat('e',64),'uncertain',NULL,clock_timestamp()-interval '20 minutes');
INSERT INTO cotironda_piloto_privado.finalist_whapi_outbox_mvp110 VALUES
 ('00000000-0000-4000-8000-000000000001','supplier_a','pending',NULL,
  clock_timestamp()-interval '1 day');

DO $checks$
DECLARE a jsonb;b jsonb;k uuid;
BEGIN
 a:=public.cotironda_piloto_scan_uncertain_mvp258(0);
 IF a->>'state'<>'invalid' THEN RAISE EXCEPTION 'mvp258_scan_unbounded';END IF;
 a:=public.cotironda_piloto_scan_uncertain_mvp258(25);
 IF a->>'state'<>'triage_scanned_private' OR
 (a->>'scanned')::integer<>4 OR
 a->>'automatic_resend_allowed'<>'false'
 THEN RAISE EXCEPTION 'mvp258_scan_unexpected_%',a;END IF;
 b:=public.cotironda_piloto_list_uncertain_mvp258(50);
 IF b->>'state'<>'operator_review_only' OR
 jsonb_array_length(b->'cases')<>4 OR
 b->>'automatic_resend_allowed'<>'false'
 THEN RAISE EXCEPTION 'mvp258_list_unexpected_%',b;END IF;
 IF b::text LIKE '%"buyer_a"%' OR b::text LIKE '%"supplier_a"%' OR
 b::text LIKE '%00000000-0000-4000%' OR b::text LIKE '%'||repeat('e',64)||'%'
 THEN RAISE EXCEPTION 'mvp258_private_keys_exposed';END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.uncertain_triage_cases_mvp258
 WHERE reason='uncertain_without_id')<>3 OR
 (SELECT count(*) FROM cotironda_piloto_privado.uncertain_triage_cases_mvp258
 WHERE reason='stale_lease_unverified')<>1
 THEN RAISE EXCEPTION 'mvp258_wrong_reason_count';END IF;
 a:=public.cotironda_piloto_scan_uncertain_mvp258(25);
 IF (a->>'scanned')::integer<>4 OR
 (SELECT count(*) FROM cotironda_piloto_privado.uncertain_triage_cases_mvp258)<>4
 THEN RAISE EXCEPTION 'mvp258_duplicate_cases';END IF;

 SELECT case_id INTO k FROM cotironda_piloto_privado.uncertain_triage_cases_mvp258
 WHERE source_kind='supplier_ack';
 a:=public.cotironda_piloto_note_uncertain_mvp258(
  k,'delivered',repeat('a',64));
 IF a->>'state'<>'invalid'
 THEN RAISE EXCEPTION 'mvp258_false_delivery_note_%',a;END IF;
 a:=public.cotironda_piloto_note_uncertain_mvp258(
  k,'operator_escalation_required',repeat('a',64));
 IF a->>'state'<>'review_noted'
 THEN RAISE EXCEPTION 'mvp258_note_failed_%',a;END IF;
 a:=public.cotironda_piloto_note_uncertain_mvp258(
  k,'operator_escalation_required',repeat('a',64));
 IF a->>'state'<>'no_change'
 THEN RAISE EXCEPTION 'mvp258_duplicate_note_%',a;END IF;
 a:=public.cotironda_piloto_list_uncertain_mvp258(25);
 IF (SELECT count(*) FROM cotironda_piloto_privado.uncertain_review_notes_mvp258)<>1 OR
 NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.uncertain_triage_cases_mvp258
   WHERE case_id=k)
 THEN RAISE EXCEPTION 'mvp258_audit_did_not_persist';END IF;
 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.whapi_outbox
  WHERE state='pending') OR
 EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222
  WHERE state='pending') OR
 (SELECT state FROM cotironda_piloto_privado.whapi_outbox
  WHERE supplier_key='supplier_a')<>'uncertain'
 THEN RAISE EXCEPTION 'mvp258_resend_side_effect';END IF;
 IF has_function_privilege('anon',
   'public.cotironda_piloto_scan_uncertain_mvp258(integer)','EXECUTE') OR
 has_function_privilege('authenticated',
   'public.cotironda_piloto_note_uncertain_mvp258(uuid,text,text)','EXECUTE') OR
 NOT has_function_privilege('service_role',
   'public.cotironda_piloto_scan_uncertain_mvp258(integer)','EXECUTE') OR
 has_table_privilege('service_role',
   'cotironda_piloto_privado.uncertain_triage_cases_mvp258','SELECT')
 THEN RAISE EXCEPTION 'mvp258_privilege_leak';END IF;
END$checks$;
ROLLBACK;
