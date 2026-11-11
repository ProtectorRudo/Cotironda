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

-- Synthetic prior B5g audits of ONLY historical documents a and b.
INSERT INTO cotironda_piloto_privado.v2_pdf_reaudits_b5g
 (source_hmac,source_sha256,supplier_key,state,reason_code,diagnostics,finished_at)
 SELECT source_hmac,source_sha256,supplier_key,'review',
 'b5g_source_review_required',
 '[{"source_verified":false,"can_publish":false,"can_rank":false}]'::jsonb,
 clock_timestamp()
 FROM cotironda_piloto_privado.v2_source_review_b5d
 WHERE source_hmac IN(repeat('a',64),repeat('b',64));
\i supabase/piloto/v2_b5h_private_total_diagnosis_versioned.sql
DO $verify$
DECLARE v jsonb; d jsonb;
BEGIN
 IF NOT (SELECT relrowsecurity FROM pg_class
 WHERE oid='cotironda_piloto_privado.v2_pdf_total_diagnostics_b5h'::regclass)
 THEN RAISE EXCEPTION 'B5h RLS off';END IF;
 IF has_table_privilege('anon',
   'cotironda_piloto_privado.v2_pdf_total_diagnostics_b5h','SELECT')
 OR has_table_privilege('authenticated',
   'cotironda_piloto_privado.v2_pdf_total_diagnostics_b5h','SELECT')
 THEN RAISE EXCEPTION 'private B5h table exposed';END IF;
 IF has_function_privilege('anon',
  'public.cotironda_piloto_claim_v2_total_b5h()','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.cotironda_piloto_finish_v2_total_b5h(text,text,text,text,jsonb)',
  'EXECUTE')
 OR has_function_privilege('anon',
  'public.cotironda_piloto_v2_b5h_only_enabled()','EXECUTE')
 THEN RAISE EXCEPTION 'private B5h RPC exposed';END IF;
 IF NOT has_function_privilege('service_role',
  'public.cotironda_piloto_claim_v2_total_b5h()','EXECUTE')
 THEN RAISE EXCEPTION 'service role cannot execute';END IF;
 IF public.cotironda_piloto_v2_b5h_only_enabled() THEN
  RAISE EXCEPTION 'B5h exclusive flag unexpectedly ON';END IF;
 v:=public.cotironda_piloto_claim_v2_total_b5h();
 IF v->>'state'<>'disabled' THEN RAISE EXCEPTION 'OFF gate bypass';END IF;
 UPDATE cotironda_piloto_privado.v2_shadow_settings SET enabled=true;
 v:=public.cotironda_piloto_claim_v2_total_b5h();
 IF v->>'state'<>'disabled' THEN RAISE EXCEPTION 'Mode gate bypass';END IF;
 UPDATE cotironda_piloto_privado.v2_shadow_settings SET b5h_only=true;
 IF NOT public.cotironda_piloto_v2_b5h_only_enabled() THEN
  RAISE EXCEPTION 'B5h exclusive flag did not enable';END IF;
 v:=public.cotironda_piloto_claim_v2_total_b5h();
 IF v->>'state'<>'claimed' OR v->>'source_hmac'<>repeat('a',64)
 OR v->>'processor_version'<>'v2_b5h_20261111'
 OR jsonb_typeof(v->'historic_candidate')<>'object'
 THEN RAISE EXCEPTION 'first historical PDF invalid %',v;END IF;
 v:=public.cotironda_piloto_claim_v2_total_b5h();
 IF v->>'state'<>'claimed' OR v->>'source_hmac'<>repeat('b',64)
 THEN RAISE EXCEPTION 'second historical PDF invalid %',v;END IF;
 v:=public.cotironda_piloto_claim_v2_total_b5h();
 IF v->>'state' NOT IN ('quota','empty') THEN
  RAISE EXCEPTION 'linked or revoked PDF not excluded %',v;END IF;
 d:='{
 "code":"multiple_total_labels","label_rows":2,"header_rows":1,
 "document_pages":1,"detected_amount_cells":2,"matching_amount_cells":2,
 "source_verified":false,"can_publish":false,"can_rank":false,
 "can_reveal_contacts":false,"proof_reason":"source_total_unverified",
 "matched_lines":1,"expected_lines":1}'::jsonb;
 v:=public.cotironda_piloto_finish_v2_total_b5h(
  repeat('a',64),repeat('b',64),'private_diagnosed',
  'b5h_private_total_diagnosis',d);
 IF v->>'state'<>'not_leased' THEN RAISE EXCEPTION 'SHA bypass';END IF;
 v:=public.cotironda_piloto_finish_v2_total_b5h(
  repeat('a',64),repeat('a',64),'private_diagnosed',
  'b5h_private_total_diagnosis',d||
  '{"raw_pdf_text":"customer phone 2215555555"}'::jsonb);
 IF v->>'state'<>'invalid' THEN RAISE EXCEPTION 'PII key allowed';END IF;
 v:=public.cotironda_piloto_finish_v2_total_b5h(
  repeat('a',64),repeat('a',64),'private_diagnosed',
  'b5h_private_total_diagnosis',
  jsonb_set(d,'{source_verified}','true'::jsonb));
 IF v->>'state'<>'invalid' THEN RAISE EXCEPTION 'fabricated approval';END IF;
 v:=public.cotironda_piloto_finish_v2_total_b5h(
  repeat('a',64),repeat('a',64),'private_diagnosed',
  'b5h_private_total_diagnosis',d);
 IF v->>'state'<>'recorded' THEN RAISE EXCEPTION 'finish failed %',v;END IF;
 v:=public.cotironda_piloto_finish_v2_total_b5h(
  repeat('a',64),repeat('a',64),'private_diagnosed',
  'b5h_private_total_diagnosis',d);
 IF v->>'state'<>'not_leased' THEN RAISE EXCEPTION 'duplicate accepted';END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.v2_source_review_b5d)<>4
 OR (SELECT count(*) FROM cotironda_piloto_privado.v2_pdf_reaudits_b5g)<>2
 OR (SELECT count(*) FROM cotironda_piloto_privado.media_archive_mvp095)<>4
 THEN RAISE EXCEPTION 'original records modified';END IF;
 UPDATE cotironda_piloto_privado.v2_shadow_settings
 SET enabled=false,b5h_only=false;
 IF public.cotironda_piloto_v2_b5h_only_enabled() THEN
  RAISE EXCEPTION 'B5h stayed enabled';END IF;
END $verify$;
ROLLBACK;
SELECT to_regnamespace('cotironda_piloto_privado') IS NULL;
