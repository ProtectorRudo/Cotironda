-- V2 B2 — synthetic PostgreSQL17; all changes ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;
DO $roles$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  CREATE ROLE anon NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
  CREATE ROLE authenticated NOLOGIN;END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
  CREATE ROLE service_role NOLOGIN;END IF;
END $roles$;
CREATE SCHEMA cotironda_piloto_privado;
CREATE TABLE cotironda_piloto_privado.integration_flags(
 only_row boolean PRIMARY KEY,whatsapp_inbound_enabled boolean,
 media_archive_enabled_mvp095 boolean
);
CREATE TABLE cotironda_piloto_privado.participants(
 key text PRIMARY KEY,chat_hmac text,participant_role text,
 consent_at timestamptz,opted_out_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.requests(
 id uuid PRIMARY KEY,state text,created_at timestamptz,
 closes_at timestamptz,buyer_key text
);
CREATE TABLE cotironda_piloto_privado.invitations(
 request_id uuid,supplier_key text,state text
);
CREATE TABLE cotironda_piloto_privado.ai_dispatch_jobs_mvp222(
 request_id uuid,supplier_key text,state text,
 whapi_message_id text,finished_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.whapi_outbox(
 request_id uuid,supplier_key text,state text,
 whapi_message_id text,sent_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.whapi_inbox(
 message_hmac text PRIMARY KEY,chat_hmac text,participant_key text,
 request_id uuid,processing_state text,kind text,received_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.media_archive_mvp095(
 message_hmac text PRIMARY KEY,chat_hmac text,participant_key text,
 request_id uuid,kind text,mime text,state text,review_state text,
 size_bytes integer,content_sha256 text,storage_path text
);
CREATE TABLE cotironda_piloto_privado.ai_supplier_auto_recovery_mvp292(
 source_hmac text PRIMARY KEY,supplier_key text,
 state text,finished_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.ai_supplier_unresolved_mvp237(
 message_hmac text PRIMARY KEY,supplier_key text,
 source_sha256 text,kind text,state text,resolved_request_id uuid
);
\i supabase/piloto/v2_b2_shadow_archived_supplier_read.sql
\i supabase/piloto/v2_b4_existing_cron_readonly_gate.sql

INSERT INTO cotironda_piloto_privado.integration_flags
 VALUES(true,true,true);
INSERT INTO cotironda_piloto_privado.participants(
 key,chat_hmac,participant_role,consent_at)
 VALUES('supplier_a',repeat('c',64),'supplier',now()),
 ('buyer_a',repeat('d',64),'buyer',now());
INSERT INTO cotironda_piloto_privado.requests
 VALUES('11111111-1111-4111-8111-111111111111','prepared',
 now()-interval '2 days',now()+interval '1 day','buyer_a');
INSERT INTO cotironda_piloto_privado.invitations
 VALUES('11111111-1111-4111-8111-111111111111','supplier_a','prepared');
INSERT INTO cotironda_piloto_privado.whapi_outbox
 VALUES('11111111-1111-4111-8111-111111111111','supplier_a',
 'api_accepted','synthetic_message',now()-interval '1 day');
INSERT INTO cotironda_piloto_privado.whapi_inbox
 SELECT repeat(label,64),repeat('c',64),'supplier_a',null,'needs_review',
 'document',now()-interval '1 hour'
 FROM (VALUES ('a'),('b')) v(label);
INSERT INTO cotironda_piloto_privado.media_archive_mvp095
 SELECT repeat(label,64),repeat('c',64),'supplier_a',null,
 'document','application/pdf','stored','suggested_only',500,
 repeat(label,64),'media/'||repeat(label,64)
 FROM (VALUES ('a'),('b')) v(label);
INSERT INTO cotironda_piloto_privado.ai_supplier_auto_recovery_mvp292
 SELECT repeat(label,64),'supplier_a','review',now()-interval '30 minutes'
 FROM (VALUES ('a'),('b')) v(label);
INSERT INTO cotironda_piloto_privado.ai_supplier_unresolved_mvp237
 SELECT repeat(label,64),'supplier_a',repeat(label,64),
 'document','ambiguous_round',null
 FROM (VALUES ('a'),('b')) v(label);

DO $checks$
DECLARE v jsonb; q jsonb;d jsonb; b record;
BEGIN
 IF NOT (SELECT relrowsecurity FROM pg_class
  WHERE oid='cotironda_piloto_privado.v2_supplier_shadow_runs'::regclass)
 THEN RAISE EXCEPTION 'RLS not enabled';END IF;
 IF has_table_privilege('anon','cotironda_piloto_privado.v2_supplier_shadow_runs','SELECT')
 OR has_table_privilege('authenticated','cotironda_piloto_privado.v2_supplier_shadow_runs','SELECT')
 THEN RAISE EXCEPTION 'shadow table exposed';END IF;
 IF has_function_privilege('anon',
  'public.cotironda_piloto_claim_v2_shadow_b2()','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.cotironda_piloto_finish_v2_shadow_b2(text,text,text,text,jsonb,jsonb,text)',
  'EXECUTE')
 THEN RAISE EXCEPTION 'privileged RPC exposed';END IF;
 IF NOT has_function_privilege('service_role',
  'public.cotironda_piloto_claim_v2_shadow_b2()','EXECUTE')
 THEN RAISE EXCEPTION 'service role cannot call';END IF;
 IF has_function_privilege('anon',
  'public.cotironda_piloto_v2_shadow_enabled_b4()','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.cotironda_piloto_v2_shadow_enabled_b4()','EXECUTE')
 OR NOT has_function_privilege('service_role',
  'public.cotironda_piloto_v2_shadow_enabled_b4()','EXECUTE')
 THEN RAISE EXCEPTION 'cron bridge flag RPC permissions invalid';END IF;
 IF public.cotironda_piloto_v2_shadow_enabled_b4() IS NOT FALSE
 THEN RAISE EXCEPTION 'bridge must default off';END IF;

 v:=public.cotironda_piloto_claim_v2_shadow_b2();
 IF v->>'state'<>'disabled' THEN RAISE EXCEPTION 'flag must default disabled';END IF;

 UPDATE cotironda_piloto_privado.v2_shadow_settings SET enabled=true;
 IF public.cotironda_piloto_v2_shadow_enabled_b4() IS NOT TRUE
 THEN RAISE EXCEPTION 'private gate does not read enabled flag';END IF;

 v:=public.cotironda_piloto_claim_v2_shadow_b2();
 IF v->>'state'<>'claimed'
 OR v->>'source_hmac'<>repeat('a',64)
 OR v->>'processor_version'<>'v2_b2_20261110'
 THEN RAISE EXCEPTION 'first claim wrong: %',v;END IF;
 v:=public.cotironda_piloto_claim_v2_shadow_b2();
 IF v->>'state'<>'claimed' OR v->>'source_hmac'<>repeat('b',64)
 THEN RAISE EXCEPTION 'second claim wrong: %',v;END IF;
 v:=public.cotironda_piloto_claim_v2_shadow_b2();
 IF v->>'state'<>'empty' THEN RAISE EXCEPTION 'duplicate claim possible: %',v;END IF;

 q:='{"document_kind":"supplier_quote","lines":[{"ordinal":1,
 "kind":"material","original_line_raw":"Cemento CPC 50 kg 2 bolsas",
 "original_description_raw":"Cemento CPC 50 kg",
 "quantity_raw":"2","unit_raw":"bolsas","unit_price_raw":"$100",
 "unit_price_role":"effective_explicit","line_total_raw":"$200",
 "source_location_raw":"p1-r1"}],
 "total_declared_raw":"$200","currency_declared_raw":null,
 "commercial_conditions_raw":[]}'::jsonb;
 d:='[{"ordinal":1,"state":"extracted_pending_source_check",
 "reason":"field_present_not_source_verified"}]'::jsonb;

 v:=public.cotironda_piloto_finish_v2_shadow_b2(
  repeat('a',64),repeat('f',64),'candidate_private',
  'shadow_candidate_unverified',q,d,'model_reported_complete');
 IF v->>'state'<>'not_leased' THEN
  RAISE EXCEPTION 'wrong hash finished a lease';END IF;
 v:=public.cotironda_piloto_finish_v2_shadow_b2(
  repeat('a',64),repeat('a',64),'candidate_private',
  'shadow_candidate_unverified','{}'::jsonb,d,'model_reported_complete');
 IF v->>'state'<>'invalid' THEN
  RAISE EXCEPTION 'empty candidate accepted';END IF;
 -- Missing/null/wrong type JSON is never accepted (SQL UNKNOWN trap).
 FOR b IN SELECT payload FROM (VALUES
  ('{"document_kind":"supplier_quote"}'::jsonb),
  ('{"document_kind":"supplier_quote","lines":null}'::jsonb),
  ('{"document_kind":"supplier_quote","lines":[]}'::jsonb),
  ('{"document_kind":"supplier_quote","lines":{}}'::jsonb)
 ) as bad(payload)
 LOOP
  v:=public.cotironda_piloto_finish_v2_shadow_b2(
   repeat('a',64),repeat('a',64),'candidate_private',
   'shadow_candidate_unverified',b.payload,d,'model_reported_complete');
  IF v->>'state'<>'invalid' THEN
   RAISE EXCEPTION 'missing JSON attributes bypass guard: %',v;END IF;
 END LOOP;
 v:=public.cotironda_piloto_finish_v2_shadow_b2(
  repeat('a',64),repeat('a',64),'candidate_private',
  'shadow_candidate_unverified',q,null,'model_reported_complete');
 IF v->>'state'<>'invalid' THEN
  RAISE EXCEPTION 'missing line diagnostics accepted';END IF;
 v:=public.cotironda_piloto_finish_v2_shadow_b2(
  repeat('a',64),repeat('a',64),'candidate_private',
  'shadow_candidate_unverified',q,d,null);
 IF v->>'state'<>'invalid' THEN
  RAISE EXCEPTION 'missing completeness accepted';END IF;
 v:=public.cotironda_piloto_finish_v2_shadow_b2(
  repeat('a',64),repeat('a',64),'candidate_private',
  'shadow_candidate_unverified',q,d,'model_reported_complete');
 IF v->>'state'<>'recorded' THEN
  RAISE EXCEPTION 'valid candidate not recorded: %',v;END IF;
 v:=public.cotironda_piloto_finish_v2_shadow_b2(
  repeat('a',64),repeat('a',64),'candidate_private',
  'shadow_candidate_unverified',q,d,'model_reported_complete');
 IF v->>'state'<>'not_leased' THEN
  RAISE EXCEPTION 'double finish allowed';END IF;
 v:=public.cotironda_piloto_finish_v2_shadow_b2(
  repeat('b',64),repeat('b',64),'review',
  'shadow_reader_review_required');
 IF v->>'state'<>'recorded' THEN
  RAISE EXCEPTION 'review record not saved';END IF;

 IF (SELECT count(*) FROM cotironda_piloto_privado.v2_supplier_shadow_runs
   WHERE state='candidate_private')<>1
 OR (SELECT count(*) FROM cotironda_piloto_privado.v2_supplier_shadow_runs
   WHERE state='review')<>1
 THEN RAISE EXCEPTION 'bad shadow outcomes';END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.ai_supplier_auto_recovery_mvp292
   WHERE state='review')<>2
 THEN RAISE EXCEPTION 'original MVP292 history changed';END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.media_archive_mvp095
   WHERE state='stored')<>2
 THEN RAISE EXCEPTION 'archive mutated';END IF;
 -- This stage contains NO supplier offer/tracking/publication writes.
END $checks$;
ROLLBACK;
SELECT to_regnamespace('cotironda_piloto_privado') IS NULL;
