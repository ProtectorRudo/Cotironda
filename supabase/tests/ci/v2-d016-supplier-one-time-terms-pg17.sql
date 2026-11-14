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
CREATE TABLE cotironda_piloto_privado.v2_supplier_original_consents(
 supplier_key text PRIMARY KEY REFERENCES
 cotironda_piloto_privado.participants(key),
 consent_message_hmac text NOT NULL REFERENCES
 cotironda_piloto_privado.whapi_inbox(message_hmac),
 version text NOT NULL CHECK(version='cotironda-originales-v2'),
 accepted_at timestamptz NOT NULL,revoked_at timestamptz,
 CHECK(revoked_at IS NULL OR revoked_at>=accepted_at)
);
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

\ir ../../piloto/v2_d016_global_original_optout_CANDIDATE.sql
-- Mensajes de A y B recibidos ANTES de la invitación; en el fixture solo
-- se simula la integridad FK del consentimiento, no una aprobación legal.
INSERT INTO cotironda_piloto_privado.whapi_inbox VALUES
 (repeat('c',64),NULL,'supplier_a',repeat('1',64),
 'text',repeat('3',64),clock_timestamp()-interval '2 hours'),
 (repeat('d',64),NULL,'supplier_b',repeat('2',64),
 'text',repeat('3',64),clock_timestamp()-interval '2 hours');
INSERT INTO cotironda_piloto_privado.v2_supplier_original_consents
 VALUES
 ('supplier_a',repeat('c',64),'cotironda-originales-v2',
 clock_timestamp()-interval '2 hours',NULL),
 ('supplier_b',repeat('d',64),'cotironda-originales-v2',
 clock_timestamp()-interval '2 hours',NULL);
INSERT INTO cotironda_piloto_privado.whapi_inbox VALUES
 (repeat('e',64),NULL,'supplier_a',repeat('1',64),'text',
 encode(pg_catalog.sha256(pg_catalog.convert_to('NO COMPARTIR','UTF8')),'hex'),
 clock_timestamp()-interval '1 minute'),
 (repeat('f',64),NULL,'supplier_b',repeat('2',64),'text',
 encode(pg_catalog.sha256(pg_catalog.convert_to('No compartir.','UTF8')),'hex'),
 clock_timestamp()-interval '30 seconds'),
 (repeat('1',64),NULL,'supplier_b',repeat('2',64),'text',repeat('a',64),
 clock_timestamp()-interval '20 seconds');

\ir ../../piloto/v2_d016_supplier_one_time_terms_CANDIDATE.sql
INSERT INTO cotironda_piloto_privado.participants(key,participant_role,chat_hmac,consent_at,opted_out_at)
VALUES('supplier_c','supplier',repeat('6',64),clock_timestamp()-interval '1 day',NULL);
DO $test_signup$
DECLARE
 notice uuid; notice2 uuid; n integer; guard_failed boolean:=false;
 acceptance_hash text:=encode(pg_catalog.sha256(pg_catalog.convert_to(
 'ACEPTO COMPARTIR ORIGINALES COTIRONDA V2','UTF8')),'hex');
 optout_hash text:=encode(pg_catalog.sha256(pg_catalog.convert_to(
 'NO COMPARTIR','UTF8')),'hex');
BEGIN
 IF (SELECT count(*) FROM cotironda_piloto_privado.v2_d016_supplier_terms_approval)<>0
 THEN RAISE EXCEPTION 'LEGAL_APPROVAL_INSERTED_BY_DEFAULT';END IF;
 IF public.cotironda_piloto_v2_d016_reserve_signup_terms_private(
 'supplier_c',repeat('6',64),repeat('5',64)) IS NOT NULL
 THEN RAISE EXCEPTION 'UNAPPROVED_TERMS_ALLOWED';END IF;
 INSERT INTO cotironda_piloto_privado.v2_d016_supplier_terms_approval
 VALUES('cotironda-originales-v2',repeat('4',64),repeat('5',64),
 clock_timestamp()-interval '2 hours','TEST-LEGAL-APPROVAL-NOT-REAL');
 IF public.cotironda_piloto_v2_d016_reserve_signup_terms_private(
 'supplier_c',repeat('7',64),repeat('5',64)) IS NOT NULL
 OR public.cotironda_piloto_v2_d016_reserve_signup_terms_private(
 'supplier_c',repeat('6',64),repeat('3',64)) IS NOT NULL
 THEN RAISE EXCEPTION 'BAD_CHAT_OR_UNAPPROVED_NOTICE';END IF;
 notice:=public.cotironda_piloto_v2_d016_reserve_signup_terms_private(
 'supplier_c',repeat('6',64),repeat('5',64));
 IF notice IS NULL THEN RAISE EXCEPTION 'VALID_NOTICE_MISSING';END IF;
 IF public.cotironda_piloto_v2_d016_reserve_signup_terms_private(
 'supplier_c',repeat('6',64),repeat('5',64)) IS NOT NULL
 THEN RAISE EXCEPTION 'DUPLICATE_NOTICE';END IF;
 IF public.cotironda_piloto_v2_d016_confirm_signup_notice_private(
 notice,'wamid.ONBOARD0001',repeat('3',64)) IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'ACK_WRONG_BODY';END IF;
 IF public.cotironda_piloto_v2_d016_confirm_signup_notice_private(
 notice,'wamid.ONBOARD0001',repeat('5',64)) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'ACK_VALID_REJECTED';END IF;
 IF public.cotironda_piloto_v2_d016_confirm_signup_notice_private(
 notice,'wamid.ONBOARD0001',repeat('5',64)) IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'ACK_REPLAY';END IF;

 INSERT INTO cotironda_piloto_privado.whapi_inbox
 (message_hmac,request_id,participant_key,chat_hmac,kind,plaintext_sha256,received_at)
 VALUES
 (repeat('9',64),NULL,'supplier_c',repeat('6',64),'text',
 acceptance_hash,clock_timestamp()-interval '1 minute'),
 (repeat('a',64),NULL,'supplier_c',repeat('6',64),'text',
 acceptance_hash,clock_timestamp()),
 (repeat('b',64),NULL,'supplier_c',repeat('6',64),'text',
 repeat('8',64),clock_timestamp()),
 (repeat('c',64),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 'supplier_c',repeat('6',64),'text',acceptance_hash,clock_timestamp());
 IF public.cotironda_piloto_v2_d016_accept_signup_terms_private(
 repeat('9',64),repeat('6',64),'wamid.ONBOARD0001',false) IS DISTINCT FROM false
 OR public.cotironda_piloto_v2_d016_accept_signup_terms_private(
 repeat('a',64),repeat('7',64),'wamid.ONBOARD0001',false) IS DISTINCT FROM false
 OR public.cotironda_piloto_v2_d016_accept_signup_terms_private(
 repeat('a',64),repeat('6',64),'wamid.WRONG0001',false) IS DISTINCT FROM false
 OR public.cotironda_piloto_v2_d016_accept_signup_terms_private(
 repeat('a',64),repeat('6',64),'wamid.ONBOARD0001',true) IS DISTINCT FROM false
 OR public.cotironda_piloto_v2_d016_accept_signup_terms_private(
 repeat('b',64),repeat('6',64),'wamid.ONBOARD0001',false) IS DISTINCT FROM false
 OR public.cotironda_piloto_v2_d016_accept_signup_terms_private(
 repeat('c',64),repeat('6',64),'wamid.ONBOARD0001',false) IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'ACCEPTANCE_PROOF_BYPASS';END IF;
 IF public.cotironda_piloto_v2_d016_accept_signup_terms_private(
 repeat('a',64),repeat('6',64),'wamid.ONBOARD0001',false) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'VALID_ACCEPTANCE_DENIED';END IF;
 IF public.cotironda_piloto_v2_d016_accept_signup_terms_private(
 repeat('a',64),repeat('6',64),'wamid.ONBOARD0001',false) IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'ACCEPTANCE_REPLAY';END IF;
 IF NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.v2_supplier_original_consents c
 JOIN cotironda_piloto_privado.whapi_inbox m ON m.message_hmac=c.consent_message_hmac
 WHERE c.supplier_key='supplier_c' AND c.accepted_at=m.received_at
 AND c.revoked_at IS NULL AND c.consent_message_hmac=repeat('a',64))
 THEN RAISE EXCEPTION 'ACCEPTANCE_NOT_ANCHORED';END IF;

 -- Baja global: no impedir futuras cotizaciones ni reactivar aviso viejo.
 INSERT INTO cotironda_piloto_privado.whapi_inbox
 (message_hmac,request_id,participant_key,chat_hmac,kind,plaintext_sha256,received_at)
 VALUES(repeat('d',64),NULL,'supplier_c',repeat('6',64),'text',optout_hash,clock_timestamp());
 n:=public.cotironda_piloto_v2_d016_revoke_by_whapi_text_private(repeat('d',64),repeat('6',64));
 IF n<>2 THEN RAISE EXCEPTION 'GLOBAL_OPT_OUT_FAILED:%',n;END IF;
 IF NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.v2_supplier_original_consents
 WHERE supplier_key='supplier_c' AND revoked_at IS NOT NULL)
 THEN RAISE EXCEPTION 'CONSENT_NOT_REVOKED';END IF;
 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.participants
 WHERE key='supplier_c' AND opted_out_at IS NOT NULL)
 THEN RAISE EXCEPTION 'SUPPLIER_COMMERCIAL_ACCESS_REVOKED';END IF;
 IF public.cotironda_piloto_v2_d016_accept_signup_terms_private(
 repeat('a',64),repeat('6',64),'wamid.ONBOARD0001',false) IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'OLD_NOTICE_RESURRECTED';END IF;
 BEGIN
 UPDATE cotironda_piloto_privado.v2_supplier_original_consents
 SET revoked_at=NULL WHERE supplier_key='supplier_c';
 EXCEPTION WHEN check_violation THEN guard_failed:=true; END;
 IF NOT guard_failed THEN RAISE EXCEPTION 'RETROACTIVE_RECONSENT_ALLOWED';END IF;

 notice2:=public.cotironda_piloto_v2_d016_reserve_signup_terms_private(
 'supplier_c',repeat('6',64),repeat('5',64));
 IF notice2 IS NULL OR notice2=notice
 THEN RAISE EXCEPTION 'NEW_NOTICE_AFTER_OPT_OUT_MISSING';END IF;
 IF public.cotironda_piloto_v2_d016_confirm_signup_notice_private(
 notice2,'wamid.ONBOARD0002',repeat('5',64)) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'RECONSENT_NOTICE_ACK_FAILED';END IF;
 INSERT INTO cotironda_piloto_privado.whapi_inbox
 (message_hmac,request_id,participant_key,chat_hmac,kind,plaintext_sha256,received_at)
 VALUES(repeat('e',64),NULL,'supplier_c',repeat('6',64),'text',
 acceptance_hash,clock_timestamp());
 IF public.cotironda_piloto_v2_d016_accept_signup_terms_private(
 repeat('e',64),repeat('6',64),'wamid.ONBOARD0002',false) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'VALID_NEW_ACCEPTANCE_FAILED';END IF;
 IF NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.v2_supplier_original_consents
 WHERE supplier_key='supplier_c' AND revoked_at IS NULL
 AND consent_message_hmac=repeat('e',64))
 THEN RAISE EXCEPTION 'NEW_ACCEPTANCE_NOT_SAVED';END IF;

 IF has_table_privilege('anon',
 'cotironda_piloto_privado.v2_d016_supplier_terms_approval','SELECT')
 OR has_table_privilege('authenticated',
 'cotironda_piloto_privado.v2_d016_supplier_terms_notices','SELECT')
 OR has_table_privilege('service_role',
 'cotironda_piloto_privado.v2_d016_supplier_terms_notices','SELECT')
 OR has_function_privilege('anon',
 'public.cotironda_piloto_v2_d016_accept_signup_terms_private(text,text,text,boolean)','EXECUTE')
 OR has_function_privilege('authenticated',
 'public.cotironda_piloto_v2_d016_reserve_signup_terms_private(text,text,text)','EXECUTE')
 OR NOT has_function_privilege('service_role',
 'public.cotironda_piloto_v2_d016_accept_signup_terms_private(text,text,text,boolean)','EXECUTE')
 THEN RAISE EXCEPTION 'INVALID_ENROLLMENT_PERMISSIONS';END IF;
 RAISE NOTICE 'D016_SUPPLIER_ONE_TIME_TERMS_PG17_PASS';
END $test_signup$;
ROLLBACK;
