-- MVP261 · PostgreSQL 17 reversible, two companies, no actual Whapi.
BEGIN;
DO $roles$BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN;END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN;END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN;END IF;
END$roles$;
CREATE SCHEMA cotironda_piloto_privado;
CREATE TABLE cotironda_piloto_privado.participants(
 key text PRIMARY KEY,chat_hmac text,participant_role text,
 consent_at timestamptz,opted_out_at timestamptz);
CREATE TABLE cotironda_piloto_privado.requests(
 id uuid PRIMARY KEY,state text,closes_at timestamptz);
CREATE TABLE cotironda_piloto_privado.whapi_inbox(
 message_hmac text PRIMARY KEY,request_id uuid,participant_key text,
 chat_hmac text,plaintext_sha256 text,received_at timestamptz);
CREATE TABLE cotironda_piloto_privado.ai_supplier_links_mvp225(
 message_hmac text PRIMARY KEY,request_id uuid,supplier_key text,
 source_sha256 text);
CREATE TABLE cotironda_piloto_privado.ai_supplier_review_mvp227(
 message_hmac text PRIMARY KEY,request_id uuid,supplier_key text,
 source_sha256 text,state text,finished_at timestamptz);
\ir ../../piloto/mvp261_source_versions_commercial.sql
INSERT INTO cotironda_piloto_privado.participants VALUES
 ('supplier_a',repeat('a',64),'supplier',clock_timestamp()-interval '1 day',NULL),
 ('supplier_b',repeat('b',64),'supplier',clock_timestamp()-interval '1 day',NULL),
 ('buyer_a',repeat('c',64),'buyer',clock_timestamp()-interval '1 day',NULL);
INSERT INTO cotironda_piloto_privado.requests VALUES
 ('00000000-0000-4000-8000-000000000001','prepared',clock_timestamp()+interval '5 days'),
 ('00000000-0000-4000-8000-000000000002','prepared',clock_timestamp()+interval '5 days');
INSERT INTO cotironda_piloto_privado.whapi_inbox VALUES
 (repeat('1',64),'00000000-0000-4000-8000-000000000001',
  'supplier_a',repeat('a',64),repeat('d',64),clock_timestamp()-interval '10 minutes'),
 (repeat('3',64),'00000000-0000-4000-8000-000000000002',
  'supplier_b',repeat('b',64),repeat('f',64),clock_timestamp()-interval '8 minutes');
INSERT INTO cotironda_piloto_privado.ai_supplier_links_mvp225 VALUES
 (repeat('1',64),'00000000-0000-4000-8000-000000000001','supplier_a',repeat('d',64)),
 (repeat('3',64),'00000000-0000-4000-8000-000000000002','supplier_b',repeat('f',64));
INSERT INTO cotironda_piloto_privado.ai_supplier_review_mvp227 VALUES
 (repeat('1',64),'00000000-0000-4000-8000-000000000001',
  'supplier_a',repeat('d',64),'verified',clock_timestamp()-interval '5 minutes'),
 (repeat('3',64),'00000000-0000-4000-8000-000000000002',
  'supplier_b',repeat('f',64),'verified',clock_timestamp()-interval '5 minutes');

DO $first$
DECLARE r jsonb;
BEGIN
 r:=public.cotironda_piloto_record_source_version_mvp261(
 repeat('a',64),repeat('1',64),repeat('d',64));
 IF r->>'state'<>'version_recorded' OR (r->>'revision_no')::integer<>1
 OR r->>'has_previous_source'<>'false' OR
 r->>'reviewed'<>'true' OR r->>'automatic_merge_allowed'<>'false'
 THEN RAISE EXCEPTION 'mvp261_first_version_failed_%',r;END IF;
 r:=public.cotironda_piloto_record_source_version_mvp261(
 repeat('b',64),repeat('1',64),repeat('d',64));
 IF r->>'state'<>'not_authorized' THEN
  RAISE EXCEPTION 'mvp261_cross_supplier_access_%',r;END IF;
 r:=public.cotironda_piloto_record_source_version_mvp261(
 repeat('a',64),repeat('1',64),repeat('e',64));
 IF r->>'state'<>'not_authorized' THEN
  RAISE EXCEPTION 'mvp261_altered_sha_%',r;END IF;
 r:=public.cotironda_piloto_record_source_version_mvp261(
 repeat('a',64),repeat('1',64),repeat('d',64));
 IF r->>'state'<>'already_versioned' OR (r->>'revision_no')::integer<>1
 THEN RAISE EXCEPTION 'mvp261_replay_is_not_idempotent_%',r;END IF;
END$first$;
-- New supplier reply says "corrijo" or "cambio" but is INCOMPLETE; this
-- test mimics the already-linked independent review (still needs_review).
INSERT INTO cotironda_piloto_privado.whapi_inbox VALUES
 (repeat('2',64),'00000000-0000-4000-8000-000000000001',
  'supplier_a',repeat('a',64),repeat('e',64),clock_timestamp()-interval '1 minute');
INSERT INTO cotironda_piloto_privado.ai_supplier_links_mvp225 VALUES
 (repeat('2',64),'00000000-0000-4000-8000-000000000001','supplier_a',repeat('e',64));
INSERT INTO cotironda_piloto_privado.ai_supplier_review_mvp227 VALUES
 (repeat('2',64),'00000000-0000-4000-8000-000000000001',
  'supplier_a',repeat('e',64),'review',clock_timestamp());
DO $second$
DECLARE r jsonb;
BEGIN
 r:=public.cotironda_piloto_record_source_version_mvp261(
 repeat('a',64),repeat('2',64),repeat('e',64));
 IF r->>'state'<>'version_recorded' OR (r->>'revision_no')::integer<>2
 OR r->>'has_previous_source'<>'true' OR r->>'reviewed'<>'false'
 OR r->>'automatic_merge_allowed'<>'false'
 THEN RAISE EXCEPTION 'mvp261_partial_revision_failed_%',r;END IF;
 IF NOT EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.supplier_source_versions_mvp261 v
  WHERE v.message_hmac=repeat('2',64) AND v.revision_no=2
    AND v.previous_message_hmac=repeat('1',64) AND v.review_state='review')
 THEN RAISE EXCEPTION 'mvp261_chain_not_preserved';END IF;
 IF (SELECT state FROM cotironda_piloto_privado.ai_supplier_review_mvp227
  WHERE message_hmac=repeat('1',64))<>'verified'
 THEN RAISE EXCEPTION 'mvp261_mutated_previous_quote';END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.supplier_source_versions_mvp261
  WHERE request_id='00000000-0000-4000-8000-000000000001')<>2
 THEN RAISE EXCEPTION 'mvp261_duplicate_version';END IF;
 -- A late second processing attempt of an older unversioned source cannot
 -- silently replace the newer inbox source.
END$second$;
INSERT INTO cotironda_piloto_privado.whapi_inbox VALUES
 (repeat('4',64),'00000000-0000-4000-8000-000000000001',
  'supplier_a',repeat('a',64),repeat('9',64),clock_timestamp()-interval '7 minutes');
INSERT INTO cotironda_piloto_privado.ai_supplier_links_mvp225 VALUES
 (repeat('4',64),'00000000-0000-4000-8000-000000000001','supplier_a',repeat('9',64));
INSERT INTO cotironda_piloto_privado.ai_supplier_review_mvp227 VALUES
 (repeat('4',64),'00000000-0000-4000-8000-000000000001',
  'supplier_a',repeat('9',64),'verified',clock_timestamp());
DO $last$
DECLARE r jsonb;
BEGIN
 r:=public.cotironda_piloto_record_source_version_mvp261(
 repeat('a',64),repeat('4',64),repeat('9',64));
 IF r->>'state'<>'newer_source_exists' OR r->>'automatic_merge_allowed'<>'false'
 THEN RAISE EXCEPTION 'mvp261_old_late_source_misordered_%',r;END IF;
 r:=public.cotironda_piloto_record_source_version_mvp261(
 repeat('b',64),repeat('3',64),repeat('f',64));
 IF r->>'state'<>'version_recorded' OR (r->>'revision_no')::integer<>1
 THEN RAISE EXCEPTION 'mvp261_other_company_chain_corrupt_%',r;END IF;
 UPDATE cotironda_piloto_privado.participants
 SET opted_out_at=clock_timestamp() WHERE key='supplier_a';
 r:=public.cotironda_piloto_record_source_version_mvp261(
 repeat('a',64),repeat('2',64),repeat('e',64));
 IF r->>'state'<>'not_authorized'
 THEN RAISE EXCEPTION 'mvp261_revocation_ignored_%',r;END IF;
 IF has_function_privilege('anon',
  'public.cotironda_piloto_record_source_version_mvp261(text,text,text)','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.cotironda_piloto_record_source_version_mvp261(text,text,text)','EXECUTE')
 OR NOT has_function_privilege('service_role',
  'public.cotironda_piloto_record_source_version_mvp261(text,text,text)','EXECUTE')
 OR has_table_privilege('service_role',
  'cotironda_piloto_privado.supplier_source_versions_mvp261','SELECT')
 THEN RAISE EXCEPTION 'mvp261_privilege_leak';END IF;
END$last$;
ROLLBACK;
