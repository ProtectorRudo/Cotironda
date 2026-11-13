-- D016 / #838. Synthetic PG17 test: no real phones, no outbound, ROLLBACK.
BEGIN;
DO $roles$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN;END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN;END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN;END IF;
END $roles$;
CREATE SCHEMA cotironda_piloto_privado;
CREATE TABLE cotironda_piloto_privado.requests(id uuid PRIMARY KEY,buyer_key text,state text,created_at timestamptz,closes_at timestamptz);
CREATE TABLE cotironda_piloto_privado.v2_original_share_policy(singleton boolean PRIMARY KEY,enabled boolean,activated_at timestamptz);
CREATE TABLE cotironda_piloto_privado.invitations(request_id uuid,supplier_key text,state text,created_at timestamptz);
CREATE TABLE cotironda_piloto_privado.participants(key text PRIMARY KEY,participant_role text,chat_hmac text,consent_at timestamptz,opted_out_at timestamptz);
CREATE TABLE cotironda_piloto_privado.ai_dispatch_jobs_mvp222(request_id uuid,supplier_key text,state text,whapi_message_id text,finished_at timestamptz);
CREATE TABLE cotironda_piloto_privado.whapi_inbox(message_hmac text PRIMARY KEY,request_id uuid,participant_key text,chat_hmac text,kind text,plaintext_sha256 text,received_at timestamptz);
CREATE TABLE cotironda_piloto_privado.ai_supplier_links_mvp225(message_hmac text,request_id uuid,supplier_key text,kind text,source_sha256 text,status text,association text);
CREATE TABLE cotironda_piloto_privado.media_archive_mvp095(message_hmac text,request_id uuid,participant_key text,chat_hmac text,kind text,content_sha256 text,state text,finished_at timestamptz,storage_path text,size_bytes integer);
CREATE TABLE cotironda_piloto_privado.ai_supplier_unresolved_mvp237(message_hmac text,state text);
\ir ../../piloto/v2_d016_original_reply_proof_CANDIDATE.sql
\ir ../../piloto/v2_d016_original_whapi_inbox_CANDIDATE.sql
INSERT INTO cotironda_piloto_privado.v2_original_share_policy VALUES
(true,true,clock_timestamp()-interval '3 hours');
INSERT INTO cotironda_piloto_privado.requests VALUES
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','buyer_synthetic','prepared',
 clock_timestamp()-interval '2 hours',clock_timestamp()+interval '3 hours');
INSERT INTO cotironda_piloto_privado.participants VALUES
('supplier_a','supplier',repeat('1',64),clock_timestamp()-interval '7 days',NULL),
('supplier_b','supplier',repeat('2',64),clock_timestamp()-interval '7 days',NULL);
INSERT INTO cotironda_piloto_privado.invitations VALUES
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','supplier_a','prepared',
 clock_timestamp()-interval '1 hour');
INSERT INTO cotironda_piloto_privado.v2_d016_original_notice_ledger
(request_id,supplier_key,chat_hmac,notice_version,notice_body_sha256,
 reserved_at,state,whapi_message_id,api_accepted_at) VALUES
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','supplier_a',repeat('1',64),
 'cotironda-originales-v2-respuesta-20261113',repeat('3',64),
 clock_timestamp()-interval '31 minutes','api_accepted',
 'wamid.TEST_OUTGOING',clock_timestamp()-interval '30 minutes');
INSERT INTO cotironda_piloto_privado.whapi_inbox VALUES
(repeat('a',64),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','supplier_a',repeat('1',64),
 'text',repeat('8',64),clock_timestamp()-interval '15 minutes'),
(repeat('b',64),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','supplier_a',repeat('1',64),
 'document',repeat('8',64),clock_timestamp()-interval '13 minutes');
INSERT INTO cotironda_piloto_privado.ai_supplier_links_mvp225 VALUES
(repeat('a',64),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 'supplier_a','text',repeat('8',64),'awaiting_semantic_review','quoted_whapi_id'),
(repeat('b',64),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 'supplier_a','document',repeat('5',64),'awaiting_semantic_review','single_active_round');
INSERT INTO cotironda_piloto_privado.media_archive_mvp095 VALUES
(repeat('b',64),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 'supplier_a',repeat('1',64),'document',repeat('5',64),'stored',
 clock_timestamp()-interval '12 minutes','media/'||repeat('b',64),31415);
DO $test$
DECLARE st text; n integer; notice text:='wamid.TEST_OUTGOING';
BEGIN
 IF has_function_privilege('anon',
 'public.cotironda_piloto_v2_d016_record_reply_event_private(text,text,text,boolean,boolean)',
 'EXECUTE') OR
 has_function_privilege('authenticated',
 'public.cotironda_piloto_v2_d016_revoke_by_whapi_text_private(text,text)',
 'EXECUTE') OR NOT has_function_privilege('service_role',
 'public.cotironda_piloto_v2_d016_record_reply_event_private(text,text,text,boolean,boolean)',
 'EXECUTE')
 THEN RAISE EXCEPTION 'UNSAFE_ACL';END IF;
 st:=public.cotironda_piloto_v2_d016_record_reply_event_private(
 repeat('a',64),repeat('2',64),notice,false,true);
 IF st<>'denied' THEN RAISE EXCEPTION 'wrong_company';END IF;
 st:=public.cotironda_piloto_v2_d016_record_reply_event_private(
 repeat('a',64),repeat('1',64),'wamid.WRONG_OUTGOING',false,true);
 IF st<>'denied' THEN RAISE EXCEPTION 'wrong_outgoing';END IF;
 st:=public.cotironda_piloto_v2_d016_record_reply_event_private(
 repeat('a',64),repeat('1',64),notice,true,true);
 IF st<>'denied' THEN RAISE EXCEPTION 'forwarded';END IF;
 st:=public.cotironda_piloto_v2_d016_record_reply_event_private(
 repeat('a',64),repeat('1',64),notice,false,false);
 IF st<>'denied' THEN RAISE EXCEPTION 'not_a_quote';END IF;
 st:=public.cotironda_piloto_v2_d016_record_reply_event_private(
 repeat('a',64),repeat('1',64),notice,false,true);
 IF st<>'verified_reply_not_authorization'
 THEN RAISE EXCEPTION 'quote_not_recorded:%',st;END IF;
 st:=public.cotironda_piloto_v2_d016_record_reply_event_private(
 repeat('a',64),repeat('1',64),notice,false,true);
 IF st<>'denied' THEN RAISE EXCEPTION 'replay_must_not_duplicate';END IF;
 st:=public.cotironda_piloto_v2_d016_record_reply_event_private(
 repeat('b',64),repeat('1',64),NULL,false,true);
 IF st<>'verified_reply_not_authorization'
 THEN RAISE EXCEPTION 'stored_document_not_recorded:%',st;END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.v2_d016_original_reply_evidence)<>2
 THEN RAISE EXCEPTION 'two_sources_expected';END IF;
 -- La revocación NO admite textos sintéticos no coincidentes ni otro chat.
 INSERT INTO cotironda_piloto_privado.whapi_inbox VALUES
 (repeat('d',64),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','supplier_a',repeat('1',64),
 'text',repeat('f',64),clock_timestamp()-interval '2 minutes');
 n:=public.cotironda_piloto_v2_d016_revoke_by_whapi_text_private(
 repeat('d',64),repeat('1',64));
 IF n<>0 THEN RAISE EXCEPTION 'random_text_is_not_optout';END IF;
 INSERT INTO cotironda_piloto_privado.whapi_inbox VALUES
 (repeat('e',64),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','supplier_a',repeat('1',64),
 'text',encode(pg_catalog.sha256(pg_catalog.convert_to('NO COMPARTIR','UTF8')),'hex'),
 clock_timestamp()-interval '1 minute');
 n:=public.cotironda_piloto_v2_d016_revoke_by_whapi_text_private(
 repeat('e',64),repeat('2',64));
 IF n<>0 THEN RAISE EXCEPTION 'foreign_chat_optout';END IF;
 n:=public.cotironda_piloto_v2_d016_revoke_by_whapi_text_private(
 repeat('e',64),repeat('1',64));
 IF n<>1 THEN RAISE EXCEPTION 'valid_optout_not_recorded:%',n;END IF;
 IF public.cotironda_piloto_v2_d016_original_evidence_status_private(
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','supplier_a',repeat('a',64))<>'denied'
 THEN RAISE EXCEPTION 'revocation_not_enforced';END IF;
 n:=public.cotironda_piloto_v2_d016_revoke_by_whapi_text_private(
 repeat('e',64),repeat('1',64));
 IF n<>0 THEN RAISE EXCEPTION 'replayed_optout';END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.v2_d016_original_notice_revocations)<>1
 THEN RAISE EXCEPTION 'multiple_revocations';END IF;
 RAISE NOTICE 'D016_INBOX_PG17_PASS';
END $test$;
ROLLBACK;
