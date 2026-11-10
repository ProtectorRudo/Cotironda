-- MVP253 / PostgreSQL 17: true SQL and ACL tests, all synthetic + ROLLBACK.
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
 key text PRIMARY KEY,participant_role text,chat_hmac text,
 consent_at timestamptz,opted_out_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.requests(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 buyer_key text REFERENCES cotironda_piloto_privado.participants(key),
 state text,closes_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.invitations(
 request_id uuid,supplier_key text,state text,
 PRIMARY KEY(request_id,supplier_key)
);
CREATE TABLE cotironda_piloto_privado.media_archive_mvp095(
 message_hmac text PRIMARY KEY,
 request_id uuid,participant_key text,chat_hmac text,
 content_sha256 text,mime text,state text,review_state text,
 size_bytes integer,proposal jsonb
);
CREATE TABLE cotironda_piloto_privado.supplier_media_quotes_mvp098(
 message_hmac text PRIMARY KEY,request_id uuid,supplier_key text,
 source_sha256 text,line_count smallint,state text
);
CREATE TABLE cotironda_piloto_privado.supplier_reading_checks_mvp102(
 message_hmac text PRIMARY KEY,source_sha256 text,state text
);
CREATE TABLE cotironda_piloto_privado.supplier_amount_checks_mvp103(
 message_hmac text PRIMARY KEY,source_sha256 text,state text
);
ALTER TABLE cotironda_piloto_privado.participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE cotironda_piloto_privado.requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE cotironda_piloto_privado.media_archive_mvp095 ENABLE ROW LEVEL SECURITY;
\ir ../../piloto/mvp253_visual_ocr_policy_provenance.sql

INSERT INTO cotironda_piloto_privado.participants(
 key,participant_role,chat_hmac,consent_at,opted_out_at)
 VALUES
 ('buyer_a','buyer',repeat('a',64),clock_timestamp(),null),
 ('buyer_b','buyer',repeat('b',64),clock_timestamp(),null),
 ('supplier_a','supplier',repeat('1',64),clock_timestamp(),null),
 ('supplier_b','supplier',repeat('2',64),clock_timestamp(),null);
INSERT INTO cotironda_piloto_privado.requests(
 id,buyer_key,state,closes_at)
 VALUES
 ('00000000-0000-4000-8000-000000000001','buyer_a','prepared',
 clock_timestamp()+interval '2 days'),
 ('00000000-0000-4000-8000-000000000002','buyer_b','prepared',
 clock_timestamp()+interval '2 days');
INSERT INTO cotironda_piloto_privado.invitations
 (request_id,supplier_key,state) VALUES
 ('00000000-0000-4000-8000-000000000001','supplier_a','prepared'),
 ('00000000-0000-4000-8000-000000000002','supplier_b','prepared');
-- PDF reserves 5 page units worst-case; images reserve 1 unit.
INSERT INTO cotironda_piloto_privado.media_archive_mvp095(
 message_hmac,request_id,participant_key,chat_hmac,
 content_sha256,mime,state,review_state,size_bytes,proposal)
 VALUES
 (repeat('1',64),'00000000-0000-4000-8000-000000000001',
  'supplier_a',repeat('1',64),repeat('d',64),'application/pdf',
  'stored','suggested_only',3000,
  '{"kind":"supplier_quote","unanswered":[]}'::jsonb),
 (repeat('2',64),'00000000-0000-4000-8000-000000000001',
  'supplier_a',repeat('1',64),repeat('e',64),'image/jpeg',
  'stored','suggested_only',1000,
  '{"kind":"supplier_quote","unanswered":[]}'::jsonb),
 (repeat('3',64),'00000000-0000-4000-8000-000000000001',
  'supplier_a',repeat('1',64),repeat('f',64),'image/png',
  'stored','suggested_only',1000,
  '{"kind":"supplier_quote","unanswered":[]}'::jsonb),
 (repeat('4',64),'00000000-0000-4000-8000-000000000002',
  'supplier_b',repeat('2',64),repeat('c',64),'image/webp',
  'stored','suggested_only',1000,
  '{"kind":"supplier_quote","unanswered":[]}'::jsonb),
 (repeat('5',64),'00000000-0000-4000-8000-000000000001',
  'supplier_a',repeat('9',64),repeat('9',64),'image/png',
  'stored','suggested_only',1000,
  '{"kind":"supplier_quote","unanswered":[]}'::jsonb);
INSERT INTO cotironda_piloto_privado.supplier_media_quotes_mvp098(
 message_hmac,request_id,supplier_key,source_sha256,line_count,state)
 VALUES
 (repeat('1',64),'00000000-0000-4000-8000-000000000001',
  'supplier_a',repeat('d',64),1,'awaiting_fidelity_check'),
 (repeat('2',64),'00000000-0000-4000-8000-000000000001',
  'supplier_a',repeat('e',64),1,'awaiting_fidelity_check'),
 (repeat('3',64),'00000000-0000-4000-8000-000000000001',
  'supplier_a',repeat('f',64),1,'awaiting_fidelity_check'),
 (repeat('4',64),'00000000-0000-4000-8000-000000000002',
  'supplier_b',repeat('c',64),1,'awaiting_fidelity_check'),
 (repeat('5',64),'00000000-0000-4000-8000-000000000001',
  'supplier_a',repeat('9',64),1,'awaiting_fidelity_check');
INSERT INTO cotironda_piloto_privado.supplier_reading_checks_mvp102
 (message_hmac,source_sha256,state)
 SELECT message_hmac,source_sha256,'model_readings_match'
 FROM cotironda_piloto_privado.supplier_media_quotes_mvp098;
INSERT INTO cotironda_piloto_privado.supplier_amount_checks_mvp103
 (message_hmac,source_sha256,state)
 SELECT message_hmac,source_sha256,'balanced'
 FROM cotironda_piloto_privado.supplier_media_quotes_mvp098;

DO $checks$
DECLARE r jsonb; lease_pdf uuid; lease_image uuid; unexpected text;
BEGIN
 IF (SELECT enabled FROM cotironda_piloto_privado.visual_ocr_control_mvp253)
 IS DISTINCT FROM false OR
 (SELECT monthly_page_limit FROM cotironda_piloto_privado.visual_ocr_control_mvp253)<>0
 THEN RAISE EXCEPTION 'mvp253_must_start_disabled';END IF;
 r:=public.cotironda_piloto_visual_ocr_permission_mvp252(
  repeat('1',64),repeat('d',64));
 IF r->>'state'<>'disabled'
 THEN RAISE EXCEPTION 'mvp253_default_gate_open_%',r;END IF;

 UPDATE cotironda_piloto_privado.visual_ocr_control_mvp253
 SET enabled=true,monthly_page_limit=6,supplier_monthly_page_limit=6,
  monthly_cost_micro_usd_limit=9000;
 r:=public.cotironda_piloto_visual_ocr_permission_mvp252(
  repeat('1',64),repeat('d',64));
 IF r->>'state'<>'not_authorized'
 THEN RAISE EXCEPTION 'mvp253_no_explicit_consent_%',r;END IF;

 INSERT INTO cotironda_piloto_privado.visual_ocr_consent_mvp253(
  participant_key,proof_sha256,granted_at,expires_at)
 VALUES('supplier_a',repeat('a',64),clock_timestamp()-interval '1 hour',
  clock_timestamp()+interval '20 days');
 r:=public.cotironda_piloto_visual_ocr_permission_mvp252(
  repeat('1',64),repeat('d',64));
 IF r->>'state'<>'not_authorized'
 THEN RAISE EXCEPTION 'mvp253_buyer_consent_missing_%',r;END IF;
 INSERT INTO cotironda_piloto_privado.visual_ocr_consent_mvp253(
  participant_key,proof_sha256,granted_at,expires_at)
 VALUES('buyer_a',repeat('b',64),clock_timestamp()-interval '1 hour',
  clock_timestamp()+interval '20 days');

 r:=public.cotironda_piloto_visual_ocr_permission_mvp252(
  repeat('1',64),repeat('c',64));
 IF r->>'state'<>'not_authorized'
 THEN RAISE EXCEPTION 'mvp253_wrong_sha_authorized_%',r;END IF;
 r:=public.cotironda_piloto_visual_ocr_permission_mvp252(
  repeat('5',64),repeat('9',64));
 IF r->>'state'<>'not_authorized'
 THEN RAISE EXCEPTION 'mvp253_wrong_chat_link_%',r;END IF;
 r:=public.cotironda_piloto_visual_ocr_permission_mvp252(
  repeat('4',64),repeat('c',64));
 IF r->>'state'<>'not_authorized'
 THEN RAISE EXCEPTION 'mvp253_cross_company_consent_%',r;END IF;

 r:=public.cotironda_piloto_visual_ocr_permission_mvp252(
  repeat('1',64),repeat('d',64));
 IF r->>'state'<>'approved_for_private_processing' OR
  r->>'source_sha256'<>repeat('d',64) OR
  (r->>'reserved_pages')::int<>5
 THEN RAISE EXCEPTION 'mvp253_pdf_lease_failed_%',r;END IF;
 lease_pdf:=(r->>'reservation_token')::uuid;
 IF lease_pdf IS NULL THEN RAISE EXCEPTION 'mvp253_missing_lease';END IF;
 r:=public.cotironda_piloto_visual_ocr_permission_mvp252(
  repeat('1',64),repeat('d',64));
 IF r->>'state'<>'already_reserved'
 THEN RAISE EXCEPTION 'mvp253_double_billing_%',r;END IF;

 -- One more image is allowed; then the fixed monthly cap is exhausted.
 r:=public.cotironda_piloto_visual_ocr_permission_mvp252(
  repeat('2',64),repeat('e',64));
 IF r->>'state'<>'approved_for_private_processing'
 OR (r->>'reserved_pages')::int<>1
 THEN RAISE EXCEPTION 'mvp253_image_lease_failed_%',r;END IF;
 lease_image:=(r->>'reservation_token')::uuid;
 r:=public.cotironda_piloto_visual_ocr_permission_mvp252(
  repeat('3',64),repeat('f',64));
 IF r->>'state'<>'quota_exceeded'
 THEN RAISE EXCEPTION 'mvp253_quota_not_enforced_%',r;END IF;

 IF (SELECT coalesce(sum(reserved_pages),0)
  FROM cotironda_piloto_privado.visual_ocr_attempt_mvp253)<>6 OR
 (SELECT coalesce(sum(reserved_cost_micro_usd),0)
  FROM cotironda_piloto_privado.visual_ocr_attempt_mvp253)<>9000
 THEN RAISE EXCEPTION 'mvp253_cost_reservation_inconsistent';END IF;

 r:=public.cotironda_piloto_visual_ocr_finish_mvp253(
  repeat('1',64),repeat('d',64),gen_random_uuid(),
  'covered_private','ocr_text_lines_covered',1,980,repeat('e',64));
 IF r->>'state'<>'not_authorized'
 THEN RAISE EXCEPTION 'mvp253_foreign_lease_%',r;END IF;
 r:=public.cotironda_piloto_visual_ocr_finish_mvp253(
  repeat('1',64),repeat('d',64),lease_pdf,
  'covered_private','ocr_text_lines_covered',1,899,repeat('e',64));
 IF r->>'state'<>'invalid'
 THEN RAISE EXCEPTION 'mvp253_low_confidence_accepted_%',r;END IF;
 r:=public.cotironda_piloto_visual_ocr_finish_mvp253(
  repeat('1',64),repeat('d',64),lease_pdf,
  'covered_private','ocr_text_lines_covered',1,980,repeat('e',64));
 IF r->>'state'<>'saved_private' OR
  r->>'result'<>'covered_private' OR r->>'publication_allowed'<>'false'
 THEN RAISE EXCEPTION 'mvp253_covered_is_not_private_%',r;END IF;
 IF (SELECT ocr_text_sha256
  FROM cotironda_piloto_privado.visual_ocr_attempt_mvp253
  WHERE message_hmac=repeat('1',64))<>repeat('e',64)
 THEN RAISE EXCEPTION 'mvp253_provenance_digest_missing';END IF;
 r:=public.cotironda_piloto_visual_ocr_finish_mvp253(
  repeat('1',64),repeat('d',64),lease_pdf,
  'needs_review','uncovered_money',1,null,null);
 IF r->>'state'<>'already_finalized'
 THEN RAISE EXCEPTION 'mvp253_duplicate_finish_%',r;END IF;

 UPDATE cotironda_piloto_privado.visual_ocr_consent_mvp253
 SET revoked_at=clock_timestamp()
 WHERE participant_key='buyer_a';
 r:=public.cotironda_piloto_visual_ocr_finish_mvp253(
  repeat('2',64),repeat('e',64),lease_image,
  'covered_private','ocr_text_lines_covered',1,990,repeat('c',64));
 IF r->>'state'<>'saved_private' OR
  r->>'result'<>'needs_review'
 THEN RAISE EXCEPTION 'mvp253_revoked_buyer_was_covered_%',r;END IF;
 IF (SELECT reason FROM cotironda_piloto_privado.visual_ocr_attempt_mvp253
  WHERE message_hmac=repeat('2',64))<>'consent_revoked'
 THEN RAISE EXCEPTION 'mvp253_revocation_not_recorded';END IF;

 IF has_function_privilege('anon',
  'public.cotironda_piloto_visual_ocr_permission_mvp252(text,text)','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.cotironda_piloto_visual_ocr_finish_mvp253(text,text,uuid,text,text,integer,integer,text)','EXECUTE')
 OR NOT has_function_privilege('service_role',
  'public.cotironda_piloto_visual_ocr_permission_mvp252(text,text)','EXECUTE')
 OR has_table_privilege('service_role',
  'cotironda_piloto_privado.visual_ocr_consent_mvp253','SELECT')
 OR has_table_privilege('anon',
  'cotironda_piloto_privado.visual_ocr_attempt_mvp253','SELECT')
 THEN RAISE EXCEPTION 'mvp253_acl_leaks';END IF;
 IF EXISTS(SELECT 1 FROM pg_policies
  WHERE schemaname='cotironda_piloto_privado' AND tablename IN (
  'visual_ocr_attempt_mvp253','visual_ocr_consent_mvp253',
  'visual_ocr_control_mvp253'))
 THEN RAISE EXCEPTION 'mvp253_unexpected_rls_policy';END IF;
END $checks$;
ROLLBACK;
