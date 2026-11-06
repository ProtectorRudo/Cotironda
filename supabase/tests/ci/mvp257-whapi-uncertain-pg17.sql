-- MVP257: PostgreSQL 17 isolated, no real WhatsApp, all ROLLBACK.
BEGIN;
DO $roles$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon')
 THEN CREATE ROLE anon NOLOGIN;END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated')
 THEN CREATE ROLE authenticated NOLOGIN;END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role')
 THEN CREATE ROLE service_role NOLOGIN;END IF;
END $roles$;
CREATE SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE SCHEMA cotironda_piloto_privado;
CREATE TABLE cotironda_piloto_privado.participants(
 key text PRIMARY KEY,chat_hmac text NOT NULL
);
CREATE TABLE cotironda_piloto_privado.requests(
 id uuid PRIMARY KEY,buyer_key text
);
CREATE TABLE cotironda_piloto_privado.whapi_outbox(
 request_id uuid,supplier_key text,state text,
 whapi_message_id text,leased_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.ai_dispatch_jobs_mvp222(
 request_id uuid,supplier_key text,state text,
 whapi_message_id text,leased_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.buyer_tracking_mvp091(
 request_id uuid,send_state text,
 whapi_message_id text,send_attempted_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.supplier_ack_mvp104(
 message_hmac text,state text,
 whapi_message_id text,reserved_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.whapi_inbox(
 message_hmac text,request_id uuid,participant_key text
);
CREATE TABLE cotironda_piloto_privado.finalist_whapi_outbox_mvp110(
 request_id uuid,recipient_key text,state text,
 whapi_message_id text,leased_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.delivery_receipts_mvp119(
 message_id_sha256 text PRIMARY KEY
);
\ir ../../piloto/mvp257_whapi_uncertain_evidence.sql
INSERT INTO cotironda_piloto_privado.participants VALUES
 ('supplier_a',repeat('a',64)),('supplier_b',repeat('b',64)),
 ('buyer_a',repeat('c',64));
INSERT INTO cotironda_piloto_privado.requests VALUES
 ('00000000-0000-4000-8000-000000000001','buyer_a');
INSERT INTO cotironda_piloto_privado.whapi_outbox VALUES
 ('00000000-0000-4000-8000-000000000001','supplier_a',
  'uncertain','message_unknown_delivery_01',clock_timestamp()-interval '20 minutes'),
 ('00000000-0000-4000-8000-000000000001','supplier_b',
  'uncertain',NULL,clock_timestamp()-interval '20 minutes'),
 ('00000000-0000-4000-8000-000000000001','supplier_b',
  'api_accepted','message_confirmed_01',clock_timestamp()-interval '5 minutes');
INSERT INTO cotironda_piloto_privado.ai_dispatch_jobs_mvp222 VALUES
 ('00000000-0000-4000-8000-000000000001','supplier_a',
  'leased',NULL,clock_timestamp()-interval '30 minutes');
DO $checks$
DECLARE
 result jsonb;
 nowunix bigint:=extract(epoch from clock_timestamp())::bigint;
 digest text:=encode(extensions.digest('message_unknown_delivery_01','sha256'),'hex');
BEGIN
 result:=public.cotironda_piloto_uncertain_summary_mvp257();
 IF result->>'state'<>'private_uncertain_summary' OR
 (result->>'uncertain')::integer<>2 OR
 (result->>'without_whapi_id')::integer<>1 OR
 (result->>'with_whapi_id')::integer<>1 OR
 (result->>'stalled_leases')::integer<>1 OR
 (result->>'observed_with_authenticated_status')::integer<>0 OR
 result->>'automatic_resend_allowed'<>'false'
 THEN RAISE EXCEPTION 'mvp257_private_summary_mismatch_%',result;END IF;

 result:=public.cotironda_piloto_observe_uncertain_whapi_mvp257(
  'message_unknown_delivery_01','sent',2,repeat('b',64),nowunix);
 IF result->>'state'<>'unmatched'
 THEN RAISE EXCEPTION 'mvp257_spoofed_recipient_%',result;END IF;
 result:=public.cotironda_piloto_observe_uncertain_whapi_mvp257(
  'message_unknown_delivery_01','delivered',2,repeat('a',64),nowunix);
 IF result->>'state'<>'invalid'
 THEN RAISE EXCEPTION 'mvp257_status_code_mismatch_%',result;END IF;
 result:=public.cotironda_piloto_observe_uncertain_whapi_mvp257(
  'message_not_in_outbox','delivered',3,repeat('a',64),nowunix);
 IF result->>'state'<>'unmatched'
 THEN RAISE EXCEPTION 'mvp257_unknown_id_was_matched_%',result;END IF;
 result:=public.cotironda_piloto_observe_uncertain_whapi_mvp257(
  'message_confirmed_01','delivered',3,repeat('b',64),nowunix);
 IF result->>'state'<>'unmatched'
 THEN RAISE EXCEPTION 'mvp257_accepted_was_confused_%',result;END IF;
 result:=public.cotironda_piloto_observe_uncertain_whapi_mvp257(
  'message_unknown_delivery_01','sent',2,repeat('a',64),nowunix);
 IF result->>'state'<>'observed_uncertain'
 THEN RAISE EXCEPTION 'mvp257_no_first_receipt_%',result;END IF;
 result:=public.cotironda_piloto_observe_uncertain_whapi_mvp257(
  'message_unknown_delivery_01','sent',2,repeat('a',64),nowunix);
 IF result->>'state'<>'unchanged'
 THEN RAISE EXCEPTION 'mvp257_replay_advanced_%',result;END IF;
 result:=public.cotironda_piloto_observe_uncertain_whapi_mvp257(
  'message_unknown_delivery_01','delivered',3,repeat('a',64),nowunix);
 IF result->>'state'<>'advanced'
 THEN RAISE EXCEPTION 'mvp257_delivery_not_recorded_%',result;END IF;
 result:=public.cotironda_piloto_observe_uncertain_whapi_mvp257(
  'message_unknown_delivery_01','failed',0,repeat('a',64),nowunix);
 IF result->>'state'<>'unchanged'
 THEN RAISE EXCEPTION 'mvp257_failed_overrode_delivered_%',result;END IF;
 IF (SELECT state FROM cotironda_piloto_privado.whapi_outbox
  WHERE whapi_message_id='message_unknown_delivery_01')<>'uncertain'
 THEN RAISE EXCEPTION 'mvp257_changed_outbound_send_state';END IF;
 IF (SELECT state FROM cotironda_piloto_privado.uncertain_whapi_receipts_mvp257
  WHERE message_id_sha256=digest)<>'delivered'
 THEN RAISE EXCEPTION 'mvp257_lost_delivered_evidence';END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.uncertain_whapi_receipts_mvp257)<>1
 THEN RAISE EXCEPTION 'mvp257_duplicate_evidence';END IF;
 -- ID collision in another outbox (different supplier) must not be trusted.
 INSERT INTO cotironda_piloto_privado.ai_dispatch_jobs_mvp222 VALUES
 ('00000000-0000-4000-8000-000000000001','supplier_b',
  'uncertain','message_unknown_delivery_01',clock_timestamp());
 result:=public.cotironda_piloto_observe_uncertain_whapi_mvp257(
  'message_unknown_delivery_01','read',4,repeat('a',64),nowunix);
 IF result->>'state'<>'unmatched'
 THEN RAISE EXCEPTION 'mvp257_id_reused_across_companies_%',result;END IF;
 DELETE FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222
 WHERE whapi_message_id='message_unknown_delivery_01';
 IF (SELECT state FROM cotironda_piloto_privado.uncertain_whapi_receipts_mvp257
  WHERE message_id_sha256=digest)<>'delivered'
 THEN RAISE EXCEPTION 'mvp257_reused_id_tampered_proof';END IF;


 result:=public.cotironda_piloto_uncertain_summary_mvp257();
 IF (result->>'observed_with_authenticated_status')::integer<>1 OR
 (result->>'uncertain')::integer<>2
 THEN RAISE EXCEPTION 'mvp257_ledger_count_changed_%',result;END IF;
 IF has_function_privilege('anon',
   'public.cotironda_piloto_observe_uncertain_whapi_mvp257(text,text,integer,text,bigint)',
   'EXECUTE') OR
 has_function_privilege('authenticated',
   'public.cotironda_piloto_uncertain_summary_mvp257()','EXECUTE') OR
 NOT has_function_privilege('service_role',
   'public.cotironda_piloto_observe_uncertain_whapi_mvp257(text,text,integer,text,bigint)',
   'EXECUTE') OR
 has_table_privilege('service_role',
   'cotironda_piloto_privado.uncertain_whapi_receipts_mvp257','SELECT')
 THEN RAISE EXCEPTION 'mvp257_privilege_leak';END IF;
END$checks$;
ROLLBACK;
