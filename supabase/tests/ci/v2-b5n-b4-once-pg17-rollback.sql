-- B5n replay after B5m, PG17 isolated synthetic fixture, full ROLLBACK.
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

-- Populate only two already-diagnosed historical source candidates.
INSERT INTO cotironda_piloto_privado.v2_pdf_total_diagnostics_b5h
(source_hmac,source_sha256,supplier_key,state,reason_code,
 diagnostics,finished_at)
SELECT source_hmac,source_sha256,supplier_key,'private_diagnosed',
 'b5h_private_total_diagnosis',
 '{
 "code":"unlabeled_amount_found","label_rows":0,"header_rows":0,
 "document_pages":1,"detected_amount_cells":0,"matching_amount_cells":1,
 "source_verified":false,"can_publish":false,"can_rank":false,
 "can_reveal_contacts":false,"proof_reason":"source_total_unverified",
 "matched_lines":1,"expected_lines":1}'::jsonb,
 clock_timestamp()
FROM cotironda_piloto_privado.v2_pdf_reaudits_b5g;
\i supabase/piloto/v2_b5i_private_total_geometry_versioned.sql


-- B5j uses only prior B5i geometric source, no new IA or WhatsApp.
INSERT INTO cotironda_piloto_privado.v2_pdf_geometry_diagnostics_b5i
 (source_hmac,source_sha256,supplier_key,state,reason_code,
  diagnostics,finished_at)
 SELECT source_hmac,source_sha256,supplier_key,'private_diagnosed',
 'b5i_private_geometry_diagnosis',
 '{
 "code":"amount_after_material_table",
 "context":"no_recognizable_label","column":"aligned_material_total",
 "candidate_rows":1,"exact_cells":1,"material_rows":1,"pages":1,
 "source_verified":false,"can_publish":false,"can_rank":false,
 "can_reveal_contacts":false,"proof_reason":"source_total_unverified",
 "matched_lines":1,"expected_lines":1}'::jsonb,
 clock_timestamp()
 FROM cotironda_piloto_privado.v2_pdf_total_diagnostics_b5h;
\i supabase/piloto/v2_b5j_private_economic_reconciliation_versioned.sql

-- Create B5j private results: source a is currency-blocked, source b
-- already balances and MUST NOT be reprocessed by B5k.
INSERT INTO cotironda_piloto_privado.v2_pdf_economic_diagnostics_b5j
 (source_hmac,source_sha256,supplier_key,state,reason_code,
  diagnostics,finished_at)
 SELECT g.source_hmac,g.source_sha256,g.supplier_key,
 'private_diagnosed','b5j_private_economic_diagnosis',
 jsonb_build_object('code',CASE WHEN g.source_hmac=repeat('a',64)
  THEN 'currency_ambiguous' ELSE 'grand_total_balances_private' END,
 'material_count',1,'material_arithmetic_matches',0,
 'note_count',0,'additional_charge_count',0,'standalone_discount_count',0,
 'source_condition_count',0,'conditions_corroborated',0,
 'iva','not_mentioned','freight','not_mentioned',
 'material_total_matches_declared',false,
 'source_verified',false,'full_document_covered',false,
 'can_publish',false,'can_rank',false,'can_reveal_contacts',false,
 'proof_reason','source_total_unverified','matched_lines',1,'expected_lines',1),
 clock_timestamp()
 FROM cotironda_piloto_privado.v2_pdf_geometry_diagnostics_b5i g;
\i supabase/piloto/v2_b5k_private_currency_source_versioned.sql

DO $verify$
DECLARE v jsonb;d jsonb;
BEGIN
 IF NOT(SELECT relrowsecurity FROM pg_class WHERE
  oid='cotironda_piloto_privado.v2_pdf_currency_diagnostics_b5k'::regclass)
 THEN RAISE EXCEPTION 'B5k RLS disabled';END IF;
 IF has_table_privilege('anon',
  'cotironda_piloto_privado.v2_pdf_currency_diagnostics_b5k','SELECT')
 OR has_table_privilege('authenticated',
  'cotironda_piloto_privado.v2_pdf_currency_diagnostics_b5k','SELECT')
 THEN RAISE EXCEPTION 'B5k ledger exposed';END IF;
 IF has_function_privilege('anon',
  'public.cotironda_piloto_claim_v2_currency_b5k()','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.cotironda_piloto_finish_v2_currency_b5k(text,text,text,text,jsonb)',
  'EXECUTE')
 THEN RAISE EXCEPTION 'B5k privileged RPC exposed';END IF;
 IF NOT has_function_privilege('service_role',
  'public.cotironda_piloto_claim_v2_currency_b5k()','EXECUTE')
 THEN RAISE EXCEPTION 'service role locked out';END IF;
 IF public.cotironda_piloto_v2_b5k_only_enabled()
 THEN RAISE EXCEPTION 'B5k enabled by default';END IF;
 v:=public.cotironda_piloto_claim_v2_currency_b5k();
 IF v->>'state'<>'disabled' THEN RAISE EXCEPTION 'B5k OFF bypass';END IF;
 UPDATE cotironda_piloto_privado.v2_shadow_settings SET enabled=true;
 v:=public.cotironda_piloto_claim_v2_currency_b5k();
 IF v->>'state'<>'disabled' THEN RAISE EXCEPTION 'B5k only flag bypass';END IF;
 UPDATE cotironda_piloto_privado.v2_shadow_settings SET b5k_only=true;
 IF NOT public.cotironda_piloto_v2_b5k_only_enabled()
 OR public.cotironda_piloto_v2_b5j_only_enabled()
 OR public.cotironda_piloto_v2_b5i_only_enabled()
 THEN RAISE EXCEPTION 'exclusive mode invalid';END IF;
 v:=public.cotironda_piloto_claim_v2_currency_b5k();
 IF v->>'state'<>'claimed' OR v->>'source_hmac'<>repeat('a',64)
 OR v->>'processor_version'<>'v2_b5k_20261111'
 THEN RAISE EXCEPTION 'failed to claim sole currency blocked PDF: %',v;END IF;
 v:=public.cotironda_piloto_claim_v2_currency_b5k();
 IF v->>'state' NOT IN('empty','quota')
 THEN RAISE EXCEPTION 'B5k reprocessed balanced PDF or extra source %',v;END IF;
 d:='{
 "currency_code":"uniform_dollar_symbol_iso_unstated",
 "iso_verified":false,
 "currency_material_count":1,"currency_lines_with_symbol":1,
 "currency_units_with_symbol":1,"currency_footer_with_symbol":true,
 "economic_code":"grand_total_balances_private",
 "economic_material_count":1,"economic_material_matches":1,
 "economic_conditions_count":0,"economic_conditions_matches":0,
 "economic_total_balances":true,
 "coverage_code":"visible_rows_accounted_private",
 "coverage_source_rows":3,"coverage_attributed_rows":3,
 "coverage_unattributed_rows":0,
 "coverage_lines":1,"coverage_lines_matched":1,
 "coverage_conditions":0,"coverage_conditions_matched":0,
 "coverage_pages":1,
 "proof_reason":"source_total_unverified",
 "matched_lines":1,"expected_lines":1,
 "source_verified":false,"full_document_covered":false,
 "can_publish":false,"can_rank":false,"can_reveal_contacts":false
 }'::jsonb;
 v:=public.cotironda_piloto_finish_v2_currency_b5k(
  repeat('a',64),repeat('b',64),'private_diagnosed',
  'b5k_private_currency_diagnosis',d);
 IF v->>'state'<>'not_leased' THEN RAISE EXCEPTION 'SHA check bypass';END IF;
 v:=public.cotironda_piloto_finish_v2_currency_b5k(
  repeat('a',64),repeat('a',64),'private_diagnosed',
  'b5k_private_currency_diagnosis',d||'{"supplier_phone":"2215550000"}'::jsonb);
 IF v->>'state'<>'invalid' THEN RAISE EXCEPTION 'PII leak accepted';END IF;
 v:=public.cotironda_piloto_finish_v2_currency_b5k(
  repeat('a',64),repeat('a',64),'private_diagnosed',
  'b5k_private_currency_diagnosis',
  jsonb_set(d,'{can_publish}','true'::jsonb));
 IF v->>'state'<>'invalid' THEN RAISE EXCEPTION 'public offer forgery accepted';END IF;
 v:=public.cotironda_piloto_finish_v2_currency_b5k(
  repeat('a',64),repeat('a',64),'private_diagnosed',
  'b5k_private_currency_diagnosis',
  jsonb_set(d,'{coverage_code}','"invented_success"'::jsonb));
 IF v->>'state'<>'invalid' THEN RAISE EXCEPTION 'coverage forgery accepted';END IF;
 v:=public.cotironda_piloto_finish_v2_currency_b5k(
  repeat('a',64),repeat('a',64),'private_diagnosed',
  'b5k_private_currency_diagnosis',
  jsonb_set(d,'{coverage_unattributed_rows}','1'::jsonb));
 IF v->>'state'<>'invalid' THEN RAISE EXCEPTION 'impossible coverage census accepted';END IF;

 v:=public.cotironda_piloto_finish_v2_currency_b5k(
  repeat('a',64),repeat('a',64),'private_diagnosed',
  'b5k_private_currency_diagnosis',d);
 IF v->>'state'<>'recorded' THEN RAISE EXCEPTION 'B5k finish failed %',v;END IF;
 v:=public.cotironda_piloto_finish_v2_currency_b5k(
  repeat('a',64),repeat('a',64),'private_diagnosed',
  'b5k_private_currency_diagnosis',d);
 IF v->>'state'<>'not_leased' THEN RAISE EXCEPTION 'duplicate finalization';END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.v2_pdf_economic_diagnostics_b5j)<>2
 OR (SELECT count(*) FROM cotironda_piloto_privado.v2_pdf_geometry_diagnostics_b5i)<>2
 OR (SELECT count(*) FROM cotironda_piloto_privado.v2_pdf_total_diagnostics_b5h)<>2
 THEN RAISE EXCEPTION 'history modified';END IF;
 UPDATE cotironda_piloto_privado.v2_shadow_settings
 SET enabled=false,b5h_only=false,b5i_only=false,b5j_only=false,
 b5k_only=false;
 IF public.cotironda_piloto_v2_b5k_only_enabled()
 THEN RAISE EXCEPTION 'B5k gate did not close';END IF;
END $verify$;
SAVEPOINT both_modes;
DO $deny$
BEGIN
 BEGIN
  UPDATE cotironda_piloto_privado.v2_shadow_settings
  SET b5j_only=true,b5k_only=true;
  RAISE EXCEPTION 'combined economic and currency modes allowed';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
END $deny$;
ROLLBACK TO SAVEPOINT both_modes;
\i supabase/piloto/v2_b5m_private_pdf_replay_versioned.sql

DO $replay$
DECLARE v jsonb; before_result jsonb; diagnostic jsonb;
BEGIN
 IF public.cotironda_piloto_v2_b5k_only_enabled() THEN
  RAISE EXCEPTION 'B5m maintenance mode enabled itself';END IF;
 IF NOT(SELECT relrowsecurity FROM pg_class WHERE
  oid='cotironda_piloto_privado.v2_pdf_currency_diagnostics_b5k'::regclass)
 THEN RAISE EXCEPTION 'B5m lost RLS';END IF;
 IF has_table_privilege('anon',
  'cotironda_piloto_privado.v2_pdf_currency_diagnostics_b5k','SELECT')
 OR has_table_privilege('authenticated',
  'cotironda_piloto_privado.v2_pdf_currency_diagnostics_b5k','SELECT')
 OR has_function_privilege('anon',
  'public.cotironda_piloto_claim_v2_currency_b5k()','EXECUTE')
 THEN RAISE EXCEPTION 'B5m private ledger exposed';END IF;
 v:=public.cotironda_piloto_claim_v2_currency_b5k();
 IF v->>'state'<>'disabled' THEN RAISE EXCEPTION 'disabled bypass';END IF;
 UPDATE cotironda_piloto_privado.v2_shadow_settings
 SET enabled=true,b5k_only=true;
 v:=public.cotironda_piloto_claim_v2_currency_b5k();
 IF v->>'state'<>'empty'
 THEN RAISE EXCEPTION 'replayed PDF without prior B5k blocker: %',v;END IF;
 -- The synthetic B5k fixture originally balanced: make this CI-only prior
 -- diagnosis mirror the two actual blocking codes observed in Acta 504.
 UPDATE cotironda_piloto_privado.v2_pdf_currency_diagnostics_b5k
 SET diagnostics=jsonb_set(jsonb_set(diagnostics,
  '{economic_code}','"fiscal_or_freight_ambiguous"'::jsonb),
  '{coverage_code}','"line_assignment_ambiguous"'::jsonb)
 WHERE source_hmac=repeat('a',64) AND processor_version='v2_b5k_20261111';
 SELECT diagnostics INTO before_result
 FROM cotironda_piloto_privado.v2_pdf_currency_diagnostics_b5k
 WHERE source_hmac=repeat('a',64) AND processor_version='v2_b5k_20261111';
 v:=public.cotironda_piloto_claim_v2_currency_b5k();
 IF v->>'state'<>'claimed' OR v->>'source_hmac'<>repeat('a',64)
 OR v->>'processor_version'<>'v2_b5m_20261111'
 THEN RAISE EXCEPTION 'wrong B5m recheck claim: %',v;END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.v2_pdf_currency_diagnostics_b5k
  WHERE processor_version='v2_b5k_20261111')<>1
 THEN RAISE EXCEPTION 'original B5k evidence removed';END IF;
 diagnostic:=before_result;
 v:=public.cotironda_piloto_finish_v2_currency_b5k(
  repeat('a',64),repeat('b',64),'private_diagnosed',
  'b5k_private_currency_diagnosis',diagnostic);
 IF v->>'state'<>'not_leased' THEN RAISE EXCEPTION 'wrong SHA accepted';END IF;
 v:=public.cotironda_piloto_finish_v2_currency_b5k(
  repeat('a',64),repeat('a',64),'private_diagnosed',
  'b5k_private_currency_diagnosis',diagnostic);
 IF v->>'state'<>'recorded' THEN RAISE EXCEPTION 'replay finish failed %',v;END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.v2_pdf_currency_diagnostics_b5k)<>2
 OR (SELECT diagnostics FROM cotironda_piloto_privado.v2_pdf_currency_diagnostics_b5k
  WHERE source_hmac=repeat('a',64)
  AND processor_version='v2_b5k_20261111') IS DISTINCT FROM before_result
 THEN RAISE EXCEPTION 'B5m corrupted historic evidence';END IF;
 v:=public.cotironda_piloto_finish_v2_currency_b5k(
  repeat('a',64),repeat('a',64),'private_diagnosed',
  'b5k_private_currency_diagnosis',diagnostic);
 IF v->>'state'<>'not_leased' THEN RAISE EXCEPTION 'duplicate finish';END IF;
 -- Immediate second claim must be throttled or empty; no duplicate source.
 v:=public.cotironda_piloto_claim_v2_currency_b5k();
 IF v->>'state' NOT IN ('quota','empty')
 THEN RAISE EXCEPTION 'duplicate B5m claim accepted: %',v;END IF;
 -- Simulate quota expiration within this ROLLBACK-only fixture. Even after
 -- the hour, a finished B5m result must make the same SHA ineligible forever.
 UPDATE cotironda_piloto_privado.v2_pdf_currency_diagnostics_b5k
 SET claimed_at=clock_timestamp()-interval '2 hours'
 WHERE source_hmac=repeat('a',64)
 AND processor_version='v2_b5m_20261111'
 AND state='private_diagnosed';
 v:=public.cotironda_piloto_claim_v2_currency_b5k();
 IF v->>'state'<>'empty'
 THEN RAISE EXCEPTION 'B5m source replayed after quota expired: %',v;END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.v2_pdf_currency_diagnostics_b5k
  WHERE processor_version='v2_b5k_20261111'
  AND diagnostics IS NOT DISTINCT FROM before_result)<>1
 THEN RAISE EXCEPTION 'B5k previous evidence unexpectedly changed';END IF;
 UPDATE cotironda_piloto_privado.v2_shadow_settings
 SET enabled=false,b5k_only=false;
 v:=public.cotironda_piloto_claim_v2_currency_b5k();
 IF v->>'state'<>'disabled'
 THEN RAISE EXCEPTION 'B5m flags did not shut off';END IF;
END $replay$;

-- B5n synthetic prerequisite: the previous B5m replay correctly matched a
-- MATERIAL SUBTOTAL but stopped on condition 4/5. No historic real source
-- or published offers are ever written by this fixture (outer ROLLBACK).
UPDATE cotironda_piloto_privado.v2_pdf_currency_diagnostics_b5k
SET diagnostics=jsonb_set(jsonb_set(jsonb_set(diagnostics,
  '{economic_total_balances}','true'::jsonb),
  '{coverage_conditions}','5'::jsonb),
  '{coverage_conditions_matched}','3'::jsonb)
WHERE source_hmac=repeat('a',64)
 AND processor_version='v2_b5m_20261111'
 AND state='private_diagnosed';
\i supabase/piloto/v2_b5n_private_pdf_replay_versioned.sql
DO $b5n$
DECLARE v jsonb; prior_b5k jsonb; prior_b5m jsonb; new_diagnostic jsonb;
BEGIN
 SELECT diagnostics INTO prior_b5k FROM cotironda_piloto_privado.v2_pdf_currency_diagnostics_b5k
 WHERE source_hmac=repeat('a',64) AND processor_version='v2_b5k_20261111';
 SELECT diagnostics INTO prior_b5m FROM cotironda_piloto_privado.v2_pdf_currency_diagnostics_b5k
 WHERE source_hmac=repeat('a',64) AND processor_version='v2_b5m_20261111';
 IF (SELECT count(*) FROM cotironda_piloto_privado.v2_pdf_currency_diagnostics_b5k)<>2
 OR prior_b5m->>'economic_total_balances'<>'true'
 OR prior_b5m->>'coverage_conditions_matched'<>'3'
 THEN RAISE EXCEPTION 'B5n synthetic prerequisite invalid';END IF;
 IF NOT(SELECT relrowsecurity FROM pg_class WHERE
  oid='cotironda_piloto_privado.v2_pdf_currency_diagnostics_b5k'::regclass)
 OR has_table_privilege('anon',
  'cotironda_piloto_privado.v2_pdf_currency_diagnostics_b5k','SELECT')
 OR has_function_privilege('authenticated',
  'public.cotironda_piloto_claim_v2_currency_b5k()','EXECUTE')
 THEN RAISE EXCEPTION 'B5n exposed private ledger';END IF;
 IF public.cotironda_piloto_v2_b5k_only_enabled()
 THEN RAISE EXCEPTION 'B5n activated itself';END IF;
 v:=public.cotironda_piloto_claim_v2_currency_b5k();
 IF v->>'state'<>'disabled'
 THEN RAISE EXCEPTION 'B5n off bypass';END IF;
 UPDATE cotironda_piloto_privado.v2_shadow_settings SET enabled=true,b5k_only=true;
 -- Simulate an unsafe prior count before any B5n claim.
 UPDATE cotironda_piloto_privado.v2_pdf_currency_diagnostics_b5k
 SET diagnostics=jsonb_set(diagnostics,'{coverage_conditions_matched}','2'::jsonb)
 WHERE source_hmac=repeat('a',64) AND processor_version='v2_b5m_20261111';
 v:=public.cotironda_piloto_claim_v2_currency_b5k();
 IF v->>'state'<>'empty' THEN RAISE EXCEPTION 'B5n wrong predecessor accepted';END IF;
 UPDATE cotironda_piloto_privado.v2_pdf_currency_diagnostics_b5k
 SET diagnostics=prior_b5m
 WHERE source_hmac=repeat('a',64) AND processor_version='v2_b5m_20261111';
 v:=public.cotironda_piloto_claim_v2_currency_b5k();
 IF v->>'state'<>'claimed'
 OR v->>'processor_version'<>'v2_b5n_20261111'
 OR v->>'source_hmac'<>repeat('a',64)
 THEN RAISE EXCEPTION 'B5n did not claim one eligible PDF: %',v;END IF;
 -- An ordinal diagnosis must be a validated fixed-code, not PII or text.
 new_diagnostic:=prior_b5m || jsonb_build_object(
  'first_unresolved_condition_ordinal',4,
  'condition_failure_kind','source_span_not_independent');
 v:=public.cotironda_piloto_finish_v2_currency_b5k(
  repeat('a',64),repeat('a',64),'private_diagnosed',
  'b5k_private_currency_diagnosis',
  jsonb_set(new_diagnostic,'{condition_failure_kind}','"free_text_forbidden"'::jsonb));
 IF v->>'state'<>'invalid' THEN RAISE EXCEPTION 'B5n accepted free text';END IF;
 v:=public.cotironda_piloto_finish_v2_currency_b5k(
  repeat('a',64),repeat('a',64),'private_diagnosed',
  'b5k_private_currency_diagnosis',
  jsonb_set(new_diagnostic,'{first_unresolved_condition_ordinal}','8'::jsonb));
 IF v->>'state'<>'invalid' THEN RAISE EXCEPTION 'B5n accepted bad ordinal';END IF;
 v:=public.cotironda_piloto_finish_v2_currency_b5k(
  repeat('a',64),repeat('a',64),'private_diagnosed',
  'b5k_private_currency_diagnosis',
  new_diagnostic-'condition_failure_kind');
 IF v->>'state'<>'invalid' THEN RAISE EXCEPTION 'B5n accepted missing code';END IF;
 v:=public.cotironda_piloto_finish_v2_currency_b5k(
  repeat('a',64),repeat('b',64),'private_diagnosed',
  'b5k_private_currency_diagnosis',new_diagnostic);
 IF v->>'state'<>'not_leased' THEN RAISE EXCEPTION 'B5n wrong SHA accepted';END IF;
 v:=public.cotironda_piloto_finish_v2_currency_b5k(
  repeat('a',64),repeat('a',64),'private_diagnosed',
  'b5k_private_currency_diagnosis',new_diagnostic);
 IF v->>'state'<>'recorded' THEN RAISE EXCEPTION 'B5n finish failed: %',v;END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.v2_pdf_currency_diagnostics_b5k)<>3
 OR (SELECT diagnostics FROM cotironda_piloto_privado.v2_pdf_currency_diagnostics_b5k
    WHERE source_hmac=repeat('a',64) AND processor_version='v2_b5k_20261111')
    IS DISTINCT FROM prior_b5k
 OR (SELECT diagnostics FROM cotironda_piloto_privado.v2_pdf_currency_diagnostics_b5k
    WHERE source_hmac=repeat('a',64) AND processor_version='v2_b5m_20261111')
    IS DISTINCT FROM prior_b5m
 THEN RAISE EXCEPTION 'B5n overwrote historical evidence';END IF;
 v:=public.cotironda_piloto_finish_v2_currency_b5k(
  repeat('a',64),repeat('a',64),'private_diagnosed',
  'b5k_private_currency_diagnosis',new_diagnostic);
 IF v->>'state'<>'not_leased' THEN RAISE EXCEPTION 'B5n duplicate finish';END IF;
 UPDATE cotironda_piloto_privado.v2_pdf_currency_diagnostics_b5k
 SET claimed_at=clock_timestamp()-interval '2 hours'
 WHERE source_hmac=repeat('a',64)
 AND processor_version='v2_b5n_20261111' AND state='private_diagnosed';
 v:=public.cotironda_piloto_claim_v2_currency_b5k();
 IF v->>'state'<>'empty' THEN RAISE EXCEPTION 'B5n replayed after quota';END IF;
 UPDATE cotironda_piloto_privado.v2_shadow_settings
 SET enabled=false,b5k_only=false;
 v:=public.cotironda_piloto_claim_v2_currency_b5k();
 IF v->>'state'<>'disabled' THEN RAISE EXCEPTION 'B5n flag not restored';END IF;
END $b5n$;

-- B5n B4 one-shot window: PG17 synthetic replay, entirely within ROLLBACK.
-- In production B4 is already installed. This fixture models its original
-- enabled flag; the patch MUST NOT require an additional cron or key.
ALTER TABLE cotironda_piloto_privado.v2_shadow_settings
 ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT clock_timestamp();
CREATE OR REPLACE FUNCTION public.cotironda_piloto_v2_shadow_enabled_b4()
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path TO ''
AS $fixture$
 SELECT EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.v2_shadow_settings
  WHERE only_row=true AND enabled=true
 );
$fixture$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_v2_shadow_enabled_b4()
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_v2_shadow_enabled_b4()
 TO service_role;
DELETE FROM cotironda_piloto_privado.v2_pdf_currency_diagnostics_b5k
 WHERE processor_version='v2_b5n_20261111';
\i supabase/piloto/v2_b5n_b4_one_shot_lease_window.sql

DO $once$
DECLARE v jsonb; before_b5k jsonb; before_b5m jsonb; fin jsonb;
BEGIN
 SELECT diagnostics INTO before_b5k
 FROM cotironda_piloto_privado.v2_pdf_currency_diagnostics_b5k
 WHERE source_hmac=repeat('a',64) AND processor_version='v2_b5k_20261111';
 SELECT diagnostics INTO before_b5m
 FROM cotironda_piloto_privado.v2_pdf_currency_diagnostics_b5k
 WHERE source_hmac=repeat('a',64) AND processor_version='v2_b5m_20261111';
 IF before_b5k IS NULL OR before_b5m IS NULL
 THEN RAISE EXCEPTION 'B5n historic evidence missing';END IF;
 IF public.cotironda_piloto_v2_shadow_enabled_b4()
 OR public.cotironda_piloto_v2_b5k_only_enabled()
 THEN RAISE EXCEPTION 'B4/B5n activated without arming';END IF;
 IF has_function_privilege('anon','public.cotironda_piloto_v2_shadow_enabled_b4()','EXECUTE')
 OR has_function_privilege('authenticated',
   'public.cotironda_piloto_v2_b5k_only_enabled()','EXECUTE')
 OR has_function_privilege('anon',
   'public.cotironda_piloto_claim_v2_currency_b5k()','EXECUTE')
 THEN RAISE EXCEPTION 'B5n cron bridge exposed to public roles';END IF;
 -- Preserve B2/B4 normal behavior when the B5n mode is NOT requested.
 UPDATE cotironda_piloto_privado.v2_shadow_settings
 SET enabled=true,b5k_only=false,updated_at=clock_timestamp();
 IF NOT public.cotironda_piloto_v2_shadow_enabled_b4()
 OR public.cotironda_piloto_v2_b5k_only_enabled()
 THEN RAISE EXCEPTION 'Existing B4 behavior broke';END IF;
 UPDATE cotironda_piloto_privado.v2_shadow_settings
 SET enabled=false,updated_at=clock_timestamp();
 -- Expired and future-dated armings are BOTH ineffective.
 UPDATE cotironda_piloto_privado.v2_shadow_settings
 SET enabled=true,b5k_only=true,
     updated_at=clock_timestamp()-interval '9 minutes';
 IF public.cotironda_piloto_v2_shadow_enabled_b4()
 OR public.cotironda_piloto_v2_b5k_only_enabled()
 OR public.cotironda_piloto_claim_v2_currency_b5k()->>'state'<>'disabled'
 THEN RAISE EXCEPTION 'Expired B5n arm accepted';END IF;
 UPDATE cotironda_piloto_privado.v2_shadow_settings
 SET updated_at=clock_timestamp()+interval '30 seconds';
 IF public.cotironda_piloto_v2_shadow_enabled_b4()
 OR public.cotironda_piloto_v2_b5k_only_enabled()
 THEN RAISE EXCEPTION 'Future B5n arm accepted';END IF;
 UPDATE cotironda_piloto_privado.v2_shadow_settings
 SET enabled=false,b5k_only=false,updated_at=clock_timestamp();
 -- A permitted one-shot may lease EXACTLY one known SHA and disarms itself
 -- atomically. Finishing that lease is allowed AFTER the flags are OFF.
 UPDATE cotironda_piloto_privado.v2_shadow_settings
 SET enabled=true,b5k_only=true,updated_at=clock_timestamp();
 IF NOT public.cotironda_piloto_v2_shadow_enabled_b4()
 OR NOT public.cotironda_piloto_v2_b5k_only_enabled()
 THEN RAISE EXCEPTION 'Valid B5n arm rejected';END IF;
 v:=public.cotironda_piloto_claim_v2_currency_b5k();
 IF v->>'state'<>'claimed'
 OR v->>'processor_version'<>'v2_b5n_20261111'
 OR v->>'source_hmac'<>repeat('a',64)
 THEN RAISE EXCEPTION 'One-shot B5n did not claim known PDF: %',v;END IF;
 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.v2_shadow_settings
  WHERE enabled OR b5h_only OR b5i_only OR b5j_only OR b5k_only)
 OR public.cotironda_piloto_v2_shadow_enabled_b4()
 OR public.cotironda_piloto_v2_b5k_only_enabled()
 THEN RAISE EXCEPTION 'Claim did not atomically disarm B5n';END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.v2_pdf_currency_diagnostics_b5k
     WHERE processor_version='v2_b5n_20261111' AND state='leased')<>1
 THEN RAISE EXCEPTION 'Claim did not lock exactly one source';END IF;
 fin:=before_b5m || jsonb_build_object(
  'first_unresolved_condition_ordinal',4,
  'condition_failure_kind','source_span_not_independent');
 v:=public.cotironda_piloto_finish_v2_currency_b5k(
  repeat('a',64),repeat('a',64),'private_diagnosed',
  'b5k_private_currency_diagnosis',fin);
 IF v->>'state'<>'recorded'
 THEN RAISE EXCEPTION 'B5n finish forbidden after auto-disarm: %',v;END IF;
 IF (SELECT diagnostics FROM cotironda_piloto_privado.v2_pdf_currency_diagnostics_b5k
  WHERE source_hmac=repeat('a',64) AND processor_version='v2_b5k_20261111')
 IS DISTINCT FROM before_b5k
 OR (SELECT diagnostics FROM cotironda_piloto_privado.v2_pdf_currency_diagnostics_b5k
  WHERE source_hmac=repeat('a',64) AND processor_version='v2_b5m_20261111')
 IS DISTINCT FROM before_b5m
 THEN RAISE EXCEPTION 'Earlier B5k/B5m overwritten';END IF;
 -- Even a careless second arming after the first completion cannot
 -- authorize an additional V2 execution.
 UPDATE cotironda_piloto_privado.v2_shadow_settings
 SET enabled=true,b5k_only=true,updated_at=clock_timestamp();
 IF public.cotironda_piloto_v2_shadow_enabled_b4()
 OR public.cotironda_piloto_v2_b5k_only_enabled()
 OR public.cotironda_piloto_claim_v2_currency_b5k()->>'state'<>'disabled'
 THEN RAISE EXCEPTION 'Duplicate arm accepted after B5n result';END IF;
 UPDATE cotironda_piloto_privado.v2_shadow_settings
 SET enabled=false,b5k_only=false,updated_at=clock_timestamp();
 -- If source is no longer eligible, the private RPC must also disarm.
 DELETE FROM cotironda_piloto_privado.v2_pdf_currency_diagnostics_b5k
 WHERE processor_version='v2_b5n_20261111';
 UPDATE cotironda_piloto_privado.v2_pdf_currency_diagnostics_b5k
 SET diagnostics=jsonb_set(diagnostics,
  '{coverage_conditions_matched}','2'::jsonb)
 WHERE source_hmac=repeat('a',64)
 AND processor_version='v2_b5m_20261111';
 UPDATE cotironda_piloto_privado.v2_shadow_settings
 SET enabled=true,b5k_only=true,updated_at=clock_timestamp();
 v:=public.cotironda_piloto_claim_v2_currency_b5k();
 IF v->>'state'<>'empty'
 THEN RAISE EXCEPTION 'Missing predecessor was somehow claimed: %',v;END IF;
 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.v2_shadow_settings
  WHERE enabled OR b5k_only)
 THEN RAISE EXCEPTION 'Empty claim left B5n armed';END IF;
END $once$;
ROLLBACK;
SELECT to_regnamespace('cotironda_piloto_privado') IS NULL;
