-- B5d: PG17 synthetic, transaction never committed to real data.
\set ON_ERROR_STOP on
BEGIN;
DO $roles$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  CREATE ROLE anon NOLOGIN;END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
  CREATE ROLE authenticated NOLOGIN;END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
  CREATE ROLE service_role NOLOGIN;END IF;
END $roles$;
CREATE SCHEMA cotironda_piloto_privado;
CREATE TABLE cotironda_piloto_privado.integration_flags (
 only_row boolean PRIMARY KEY,
 whatsapp_inbound_enabled boolean,
 media_archive_enabled_mvp095 boolean
);
CREATE TABLE cotironda_piloto_privado.v2_shadow_settings (
 only_row boolean PRIMARY KEY,enabled boolean
);
CREATE TABLE cotironda_piloto_privado.participants (
 key text PRIMARY KEY,chat_hmac text,participant_role text,
 consent_at timestamptz,opted_out_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.requests (
 id uuid PRIMARY KEY,buyer_key text,created_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.invitations (
 request_id uuid,supplier_key text,state text
);
CREATE TABLE cotironda_piloto_privado.ai_dispatch_jobs_mvp222 (
 request_id uuid,supplier_key text,state text,
 whapi_message_id text,finished_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.whapi_outbox (
 request_id uuid,supplier_key text,state text,
 whapi_message_id text,sent_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.whapi_inbox (
 message_hmac text PRIMARY KEY,chat_hmac text,participant_key text,
 request_id uuid,kind text,received_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.media_archive_mvp095 (
 message_hmac text PRIMARY KEY,chat_hmac text,participant_key text,
 request_id uuid,kind text,mime text,state text,
 size_bytes integer,content_sha256 text,storage_path text
);
CREATE TABLE cotironda_piloto_privado.v2_supplier_shadow_runs (
 source_hmac text,processor_version text,source_sha256 text,
 supplier_key text,state text,candidate jsonb,
 PRIMARY KEY(source_hmac,processor_version)
);
\i supabase/piloto/v2_b5d_private_reaudit_and_linked_sources.sql
INSERT INTO cotironda_piloto_privado.integration_flags
 VALUES(true,true,true);
INSERT INTO cotironda_piloto_privado.v2_shadow_settings
 VALUES(true,false);
INSERT INTO cotironda_piloto_privado.participants
 VALUES('sup',repeat('c',64),'supplier',now(),null),
       ('buyer',repeat('d',64),'buyer',now(),null),
       ('revoked',repeat('e',64),'supplier',now(),now());
INSERT INTO cotironda_piloto_privado.requests VALUES
 ('11111111-1111-4111-8111-111111111111','buyer',now()-interval '2 days');
INSERT INTO cotironda_piloto_privado.invitations VALUES
 ('11111111-1111-4111-8111-111111111111','sup','prepared');
INSERT INTO cotironda_piloto_privado.ai_dispatch_jobs_mvp222 VALUES
 ('11111111-1111-4111-8111-111111111111','sup','api_accepted',
  'confirmed_message',now()-interval '1 day');
INSERT INTO cotironda_piloto_privado.whapi_inbox
 SELECT repeat(label,64),repeat('c',64),'sup',
   CASE WHEN label='a' THEN null
    WHEN label='d' THEN '11111111-1111-4111-8111-111111111111'::uuid
    ELSE null END,
   'document',now()-interval '1 hour'
 FROM (VALUES ('a'),('b'),('c'),('d')) x(label);
INSERT INTO cotironda_piloto_privado.media_archive_mvp095
 SELECT repeat(label,64),repeat('c',64),'sup',
  CASE WHEN label='a' THEN null
   ELSE '11111111-1111-4111-8111-111111111111'::uuid END,
  'document',
  CASE WHEN label='c' THEN
   'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
   ELSE 'application/pdf' END,
  'stored',512,repeat(label,64),'media/'||repeat(label,64)
 FROM (VALUES ('a'),('b'),('c'),('d')) x(label);
-- "d" conflicts: inbox is linked to real request, no conflict, but tests
-- below use revoked supplier to prove source cannot be silently accepted.
INSERT INTO cotironda_piloto_privado.whapi_inbox
 VALUES(repeat('e',64),repeat('e',64),'revoked',null,
  'document',now()-interval '1 hour');
INSERT INTO cotironda_piloto_privado.media_archive_mvp095
 VALUES(repeat('e',64),repeat('e',64),'revoked',
 '11111111-1111-4111-8111-111111111111','document',
 'application/pdf','stored',512,repeat('e',64),'media/'||repeat('e',64));
INSERT INTO cotironda_piloto_privado.v2_supplier_shadow_runs
 VALUES(repeat('a',64),'v2_b2_20261110',repeat('a',64),'sup',
 'candidate_private',
 '{"document_kind":"supplier_quote","lines":[{"ordinal":1,"kind":"material","original_line_raw":"cemento 2 $200","original_description_raw":"cemento","quantity_raw":"2","unit_raw":null,"unit_price_raw":"$100","unit_price_role":"effective_explicit","line_total_raw":"$200","source_location_raw":"pagina 1"}],"total_declared_raw":"$200","currency_declared_raw":null,"commercial_conditions_raw":[]}'::jsonb);
DO $verify$
DECLARE v jsonb; quote jsonb; diag jsonb;
BEGIN
 IF NOT (SELECT relrowsecurity FROM pg_class
         WHERE oid='cotironda_piloto_privado.v2_source_review_b5d'::regclass)
 THEN RAISE EXCEPTION 'B5d RLS disabled';END IF;
 IF has_table_privilege('anon',
  'cotironda_piloto_privado.v2_source_review_b5d','SELECT')
 OR has_table_privilege('authenticated',
  'cotironda_piloto_privado.v2_source_review_b5d','SELECT')
 THEN RAISE EXCEPTION 'private ledger exposed';END IF;
 IF has_function_privilege('anon','public.cotironda_piloto_claim_v2_review_b5d()','EXECUTE')
 OR has_function_privilege('authenticated',
 'public.cotironda_piloto_finish_v2_review_b5d(text,text,text,text,jsonb,jsonb)',
 'EXECUTE') THEN RAISE EXCEPTION 'RPC exposed';END IF;
 IF NOT has_function_privilege('service_role',
  'public.cotironda_piloto_claim_v2_review_b5d()','EXECUTE')
 THEN RAISE EXCEPTION 'service unavailable';END IF;
 IF public.cotironda_piloto_claim_v2_review_b5d()->>'state'<>'disabled'
 THEN RAISE EXCEPTION 'shadow guard bypass';END IF;
 UPDATE cotironda_piloto_privado.v2_shadow_settings SET enabled=true;
 v:=public.cotironda_piloto_claim_v2_review_b5d();
 IF v->>'state'<>'claimed' OR v->>'source_mode'<>'historical_pdf'
 OR v->>'source_hmac'<>repeat('a',64)
 OR v->'historic_candidate' IS NULL THEN
  RAISE EXCEPTION 'historical B2 not reauditable: %',v;END IF;
 v:=public.cotironda_piloto_claim_v2_review_b5d();
 IF v->>'state'<>'claimed' OR v->>'source_mode'<>'linked_quote'
 OR v->>'source_hmac'<>repeat('b',64)
 OR (v->'historic_candidate') IS DISTINCT FROM 'null'::jsonb THEN
  RAISE EXCEPTION 'linked PDF wrong: %',v;END IF;
 v:=public.cotironda_piloto_claim_v2_review_b5d();
 IF v->>'state'<>'claimed' OR v->>'source_hmac'<>repeat('c',64)
 OR v->>'mime'<>'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
 THEN RAISE EXCEPTION 'linked Excel excluded: %',v;END IF;
 v:=public.cotironda_piloto_claim_v2_review_b5d();
 IF v->>'state'<>'claimed' OR v->>'source_hmac'<>repeat('d',64)
 THEN RAISE EXCEPTION 'linked PDF with inbox request excluded: %',v;END IF;
 v:=public.cotironda_piloto_claim_v2_review_b5d();
 IF v->>'state'<>'empty' THEN RAISE EXCEPTION 'duplicate/revoked claim: %',v;END IF;
 quote:=(SELECT candidate FROM
  cotironda_piloto_privado.v2_supplier_shadow_runs
  WHERE source_hmac=repeat('a',64));
 diag:='[{"ordinal":1,"state":"needs_field_review","reason":"not_source_verified"}]'::jsonb;
 v:=public.cotironda_piloto_finish_v2_review_b5d(
  repeat('a',64),repeat('b',64),'candidate_private',
  'b5d_pdf_review_pending',quote,diag);
 IF v->>'state'<>'not_leased' THEN RAISE EXCEPTION 'SHA bypass';END IF;
 v:=public.cotironda_piloto_finish_v2_review_b5d(
  repeat('a',64),repeat('a',64),'candidate_private',
  'b5d_pdf_review_pending','{}'::jsonb,diag);
 IF v->>'state'<>'invalid' THEN RAISE EXCEPTION 'incomplete JSON allowed';END IF;
 v:=public.cotironda_piloto_finish_v2_review_b5d(
  repeat('a',64),repeat('a',64),'candidate_private',
  'b5d_pdf_review_pending',quote,diag);
 IF v->>'state'<>'recorded' THEN RAISE EXCEPTION 'valid finish rejected: %',v;END IF;
 v:=public.cotironda_piloto_finish_v2_review_b5d(
  repeat('a',64),repeat('a',64),'candidate_private',
  'b5d_pdf_review_pending',quote,diag);
 IF v->>'state'<>'not_leased' THEN RAISE EXCEPTION 'duplicate finish';END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.v2_supplier_shadow_runs)<>1
 OR (SELECT count(*) FROM cotironda_piloto_privado.media_archive_mvp095)<>5
 THEN RAISE EXCEPTION 'historical tables modified';END IF;
END $verify$;
ROLLBACK;
SELECT to_regnamespace('cotironda_piloto_privado') IS NULL;
