-- Versioned B5g historical-only recheck, PG17 isolated fixture ROLLBACK.
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
CREATE TABLE cotironda_piloto_privado.v2_shadow_settings(
 only_row boolean PRIMARY KEY,enabled boolean);
CREATE TABLE cotironda_piloto_privado.integration_flags(
 only_row boolean PRIMARY KEY,
 whatsapp_inbound_enabled boolean,media_archive_enabled_mvp095 boolean);
CREATE TABLE cotironda_piloto_privado.participants(
 key text PRIMARY KEY,chat_hmac text,participant_role text,
 consent_at timestamptz,opted_out_at timestamptz);
CREATE TABLE cotironda_piloto_privado.media_archive_mvp095(
 message_hmac text PRIMARY KEY,content_sha256 text,
 participant_key text,request_id uuid,chat_hmac text,
 kind text,mime text,size_bytes integer,storage_path text,state text);
CREATE TABLE cotironda_piloto_privado.whapi_inbox(
 message_hmac text PRIMARY KEY,chat_hmac text,participant_key text,
 kind text,request_id uuid,received_at timestamptz);
CREATE TABLE cotironda_piloto_privado.v2_source_review_b5d(
 source_hmac text,processor_version text,source_sha256 text,
 supplier_key text,request_id uuid,source_mode text,
 mime text,size_bytes integer,state text,candidate jsonb,
 claimed_at timestamptz,
 PRIMARY KEY(source_hmac,processor_version)
);
\i supabase/piloto/v2_b5g_pdf_private_reaudit_versioned.sql
INSERT INTO cotironda_piloto_privado.v2_shadow_settings VALUES(true,false);
INSERT INTO cotironda_piloto_privado.integration_flags VALUES(true,true,true);
INSERT INTO cotironda_piloto_privado.participants VALUES
 ('supplier',repeat('c',64),'supplier',now(),null),
 ('revoked',repeat('r',64),'supplier',now(),now());
INSERT INTO cotironda_piloto_privado.whapi_inbox
 SELECT repeat(label,64),
   CASE WHEN label='d' THEN repeat('r',64) ELSE repeat('c',64) END,
   CASE WHEN label='d' THEN 'revoked' ELSE 'supplier' END,
   'document',NULL,clock_timestamp()-interval '1 hour'
 FROM (VALUES('a'),('b'),('c'),('d')) q(label);
INSERT INTO cotironda_piloto_privado.media_archive_mvp095
 SELECT repeat(label,64),repeat(label,64),
   CASE WHEN label='d' THEN 'revoked' ELSE 'supplier' END,NULL,
   CASE WHEN label='d' THEN repeat('r',64) ELSE repeat('c',64) END,
   'document','application/pdf',500,
   'media/'||repeat(label,64),'stored'
 FROM (VALUES('a'),('b'),('c'),('d')) q(label);
INSERT INTO cotironda_piloto_privado.v2_source_review_b5d
 SELECT repeat(label,64),'v2_b5d_20261110',repeat(label,64),
   CASE WHEN label='d' THEN 'revoked' ELSE 'supplier' END,
   NULL,CASE WHEN label='c' THEN 'linked_quote' ELSE 'historical_pdf' END,
   'application/pdf',500,'candidate_private',
   '{"document_kind":"supplier_quote","lines":[{"ordinal":1,"kind":"material","original_line_raw":"cemento 1 $ 100","original_description_raw":"cemento","quantity_raw":"1","unit_raw":null,"unit_price_raw":"$ 100","unit_price_role":"list_explicit","line_total_raw":"$ 100","source_location_raw":"pagina 1"}],"total_declared_raw":"$ 100","currency_declared_raw":"$","commercial_conditions_raw":[]}'::jsonb,
   now()-interval '1 hour'
 FROM (VALUES('a'),('b'),('c'),('d')) q(label);
DO $verify$
DECLARE v jsonb; d jsonb;
BEGIN
 IF NOT (SELECT relrowsecurity FROM pg_class
 WHERE oid='cotironda_piloto_privado.v2_pdf_reaudits_b5g'::regclass)
 THEN RAISE EXCEPTION 'B5g RLS off';END IF;
 IF has_table_privilege('anon','cotironda_piloto_privado.v2_pdf_reaudits_b5g','SELECT')
 OR has_table_privilege('authenticated','cotironda_piloto_privado.v2_pdf_reaudits_b5g','SELECT')
 THEN RAISE EXCEPTION 'private table exposed';END IF;
 IF has_function_privilege('anon','public.cotironda_piloto_claim_v2_pdf_b5g()','EXECUTE')
 OR has_function_privilege('authenticated',
 'public.cotironda_piloto_finish_v2_pdf_b5g(text,text,text,text,jsonb)',
 'EXECUTE')
 THEN RAISE EXCEPTION 'private RPC exposed';END IF;
 IF NOT has_function_privilege('service_role',
  'public.cotironda_piloto_claim_v2_pdf_b5g()','EXECUTE')
 THEN RAISE EXCEPTION 'service_role denied';END IF;
 v:=public.cotironda_piloto_claim_v2_pdf_b5g();
 IF v->>'state'<>'disabled' THEN RAISE EXCEPTION 'gate bypass';END IF;
 UPDATE cotironda_piloto_privado.v2_shadow_settings SET enabled=true;
 v:=public.cotironda_piloto_claim_v2_pdf_b5g();
 IF v->>'state'<>'claimed' OR v->>'source_hmac'<>repeat('a',64)
 OR v->>'processor_version'<>'v2_b5g_20261111'
 OR jsonb_typeof(v->'historic_candidate')<>'object'
 THEN RAISE EXCEPTION 'historical original not selected: %',v;END IF;
 v:=public.cotironda_piloto_claim_v2_pdf_b5g();
 IF v->>'state'<>'claimed' OR v->>'source_hmac'<>repeat('b',64)
 THEN RAISE EXCEPTION 'second original not selected: %',v;END IF;
 v:=public.cotironda_piloto_claim_v2_pdf_b5g();
 IF v->>'state' NOT IN ('empty','quota') THEN
  RAISE EXCEPTION 'linked or revoked source eligible: %',v;END IF;
 d:='[{"ordinal":1,"source_verified":false,
       "can_publish":false,"can_rank":false,
       "source_reason_b5":"source_total_unverified"}]'::jsonb;
 v:=public.cotironda_piloto_finish_v2_pdf_b5g(
  repeat('a',64),repeat('b',64),'review','b5g_source_review_required',d);
 IF v->>'state'<>'not_leased' THEN RAISE EXCEPTION 'SHA mismatch accepted';END IF;
 v:=public.cotironda_piloto_finish_v2_pdf_b5g(
  repeat('a',64),repeat('a',64),'private_source_observed',
  'b5g_pdf_source_private',
  '[{"source_verified":true,"can_publish":false,"can_rank":false}]'::jsonb);
 IF v->>'state'<>'invalid' THEN RAISE EXCEPTION 'fabricated source accepted';END IF;
 v:=public.cotironda_piloto_finish_v2_pdf_b5g(
  repeat('a',64),repeat('a',64),'review','b5g_source_review_required',d);
 IF v->>'state'<>'recorded' THEN RAISE EXCEPTION 'valid review failed: %',v;END IF;
 v:=public.cotironda_piloto_finish_v2_pdf_b5g(
  repeat('a',64),repeat('a',64),'review','b5g_source_review_required',d);
 IF v->>'state'<>'not_leased' THEN RAISE EXCEPTION 'duplicate finish';END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.v2_source_review_b5d)<>4
 OR (SELECT count(*) FROM cotironda_piloto_privado.media_archive_mvp095)<>4
 THEN RAISE EXCEPTION 'original ledger mutated';END IF;
END $verify$;
ROLLBACK;
SELECT to_regnamespace('cotironda_piloto_privado') IS NULL;
