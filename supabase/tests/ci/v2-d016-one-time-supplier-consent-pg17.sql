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
\ir ../../piloto/v2_d016_supplier_one_time_consent_CANDIDATE.sql
-- Todas las marcas Whapi y tiempos son exclusivamente sintéticos.
INSERT INTO cotironda_piloto_privado.whapi_inbox VALUES
 (repeat('9',64),NULL,'supplier_a',repeat('1',64),'text',
 encode(pg_catalog.sha256(pg_catalog.convert_to(
 'ACEPTO COTIRONDA ORIGINALES V2','UTF8')),'hex'),
 clock_timestamp()-interval '60 minutes'),
 (repeat('e',64),NULL,'supplier_a',repeat('1',64),'text',
 encode(pg_catalog.sha256(pg_catalog.convert_to(
 'NO COMPARTIR','UTF8')),'hex'),
 clock_timestamp()-interval '20 minutes'),
 (repeat('1',64),NULL,'supplier_a',repeat('1',64),'text',
 encode(pg_catalog.sha256(pg_catalog.convert_to(
 'ACEPTO COTIRONDA ORIGINALES V2','UTF8')),'hex'),
 clock_timestamp()-interval '10 minutes'),
 (repeat('2',64),NULL,'supplier_b',repeat('2',64),'text',
 encode(pg_catalog.sha256(pg_catalog.convert_to(
 'ACEPTO COTIRONDA ORIGINALES V2','UTF8')),'hex'),
 clock_timestamp()-interval '8 minutes'),
 (repeat('3',64),NULL,'supplier_a',repeat('1',64),'text',
 repeat('f',64),clock_timestamp()-interval '6 minutes'),
 (repeat('4',64),NULL,'supplier_a',repeat('1',64),'text',
 encode(pg_catalog.sha256(pg_catalog.convert_to(
 'ACEPTO COTIRONDA ORIGINALES V2','UTF8')),'hex'),
 clock_timestamp()-interval '100 minutes');
DO $test$
DECLARE
 st text;n integer;ok boolean;v_sha text:=repeat('f',64);
BEGIN
 -- Sin condiciones legales ACTIVAS, una respuesta no produce consentimiento.
 st:=public.cotironda_piloto_v2_d016_register_terms_acceptance_private(
 repeat('9',64),repeat('1',64));
 IF st<>'denied' THEN RAISE EXCEPTION 'TERMS_OFF_ACCEPTANCE';END IF;
 ok:=public.cotironda_piloto_v2_d016_record_terms_delivery_private(
 'supplier_a',repeat('1',64),v_sha,'wamid.LEGAL_A',
 clock_timestamp()-interval '90 minutes');
 IF ok IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'TERMS_OFF_DELIVERY';END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.v2_supplier_original_consents)<>0
 THEN RAISE EXCEPTION 'TERMS_OFF_SIDE_EFFECT';END IF;

 -- Sólo en este fixture: simular que un texto legal completo ya fue
 -- APROBADO. No generar aceptación real por el solo UPDATE de política.
 UPDATE cotironda_piloto_privado.v2_d016_supplier_terms_policy
 SET enabled=true,body_sha256=v_sha,
 approved_at=clock_timestamp()-interval '120 minutes',
 approval_reference='synthetic-ci-only-legal-approval';
 st:=public.cotironda_piloto_v2_d016_register_terms_acceptance_private(
 repeat('9',64),repeat('1',64));
 IF st<>'denied' THEN RAISE EXCEPTION 'NO_TERMS_DELIVERY_ACCEPTED';END IF;
 ok:=public.cotironda_piloto_v2_d016_record_terms_delivery_private(
 'supplier_a',repeat('2',64),v_sha,'wamid.LEGAL_WRONGCHAT',
 clock_timestamp()-interval '90 minutes');
 IF ok IS DISTINCT FROM false THEN RAISE EXCEPTION 'WRONG_CHAT_DELIVERY';END IF;
 ok:=public.cotironda_piloto_v2_d016_record_terms_delivery_private(
 'supplier_a',repeat('1',64),repeat('a',64),'wamid.LEGAL_BADHASH',
 clock_timestamp()-interval '90 minutes');
 IF ok IS DISTINCT FROM false THEN RAISE EXCEPTION 'WRONG_TERMS_SHA';END IF;
 ok:=public.cotironda_piloto_v2_d016_record_terms_delivery_private(
 'supplier_a',repeat('1',64),v_sha,'wamid.LEGAL_A',
 clock_timestamp()-interval '90 minutes');
 IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'REAL_TERMS_DELIVERY_DENIED';END IF;
 ok:=public.cotironda_piloto_v2_d016_record_terms_delivery_private(
 'supplier_a',repeat('1',64),v_sha,'wamid.LEGAL_A',
 clock_timestamp()-interval '90 minutes');
 IF ok IS DISTINCT FROM false THEN RAISE EXCEPTION 'TERMS_DELIVERY_DUPLICATED';END IF;

 st:=public.cotironda_piloto_v2_d016_register_terms_acceptance_private(
 repeat('4',64),repeat('1',64));
 IF st<>'denied' THEN RAISE EXCEPTION 'EARLY_REPLY_SHOULD_DENY';END IF;
 st:=public.cotironda_piloto_v2_d016_register_terms_acceptance_private(
 repeat('9',64),repeat('2',64));
 IF st<>'denied' THEN RAISE EXCEPTION 'OTHER_CHAT_ACCEPTED';END IF;
 st:=public.cotironda_piloto_v2_d016_register_terms_acceptance_private(
 repeat('2',64),repeat('2',64));
 IF st<>'denied' THEN RAISE EXCEPTION 'OTHER_SUPPLIER_NO_NOTICE';END IF;
 st:=public.cotironda_piloto_v2_d016_register_terms_acceptance_private(
 repeat('3',64),repeat('1',64));
 IF st<>'denied' THEN RAISE EXCEPTION 'ARBITRARY_TEXT_ACCEPTED';END IF;
 st:=public.cotironda_piloto_v2_d016_register_terms_acceptance_private(NULL,NULL);
 IF st<>'denied' THEN RAISE EXCEPTION 'NULL_ACCEPTED';END IF;

 st:=public.cotironda_piloto_v2_d016_register_terms_acceptance_private(
 repeat('9',64),repeat('1',64));
 IF st<>'recorded' THEN RAISE EXCEPTION 'EXPLICIT_OPT_IN_DENIED:%',st;END IF;
 IF NOT EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.v2_supplier_original_consents c
  JOIN cotironda_piloto_privado.whapi_inbox src
   ON src.message_hmac=c.consent_message_hmac
  WHERE c.supplier_key='supplier_a'
   AND c.version='cotironda-originales-v2'
   AND c.revoked_at IS NULL
   AND c.accepted_at=src.received_at
   AND c.consent_message_hmac=repeat('9',64)
 ) THEN RAISE EXCEPTION 'OPTIN_NOT_ANCHORED_TO_WHAPI';END IF;
 st:=public.cotironda_piloto_v2_d016_register_terms_acceptance_private(
 repeat('9',64),repeat('1',64));
 IF st<>'unchanged' THEN RAISE EXCEPTION 'OPTIN_DUPLICATED';END IF;

 n:=public.cotironda_piloto_v2_d016_revoke_by_whapi_text_private(
 repeat('e',64),repeat('1',64));
 IF n<>3 THEN RAISE EXCEPTION 'GLOBAL_REVOKE_EXPECT_THREE:%',n;END IF;
 IF NOT EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.v2_supplier_original_consents
  WHERE supplier_key='supplier_a' AND revoked_at IS NOT NULL
 ) THEN RAISE EXCEPTION 'REVOKE_NOT_APPLIED';END IF;
 st:=public.cotironda_piloto_v2_d016_register_terms_acceptance_private(
 repeat('9',64),repeat('1',64));
 IF st<>'denied' THEN RAISE EXCEPTION 'OLD_OPTIN_REPLAY_AFTER_REVOKE';END IF;
 st:=public.cotironda_piloto_v2_d016_register_terms_acceptance_private(
 repeat('1',64),repeat('1',64));
 IF st<>'recorded' THEN RAISE EXCEPTION 'NEW_ACCEPTANCE_NOT_ALLOWED:%',st;END IF;
 IF NOT EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.v2_supplier_original_consents
  WHERE supplier_key='supplier_a' AND revoked_at IS NULL
   AND consent_message_hmac=repeat('1',64)
 ) THEN RAISE EXCEPTION 'NEW_ACCEPTANCE_NOT_PRESERVED';END IF;
 n:=public.cotironda_piloto_v2_d016_revoke_by_whapi_text_private(
 repeat('e',64),repeat('1',64));
 IF n<>0 THEN RAISE EXCEPTION 'OLD_REVOKE_REPLAY_CHANGED_NEW_OPTIN';END IF;

 -- Si se apaga la política de originales o la legal, no hay altas.
 UPDATE cotironda_piloto_privado.v2_original_share_policy SET enabled=false;
 st:=public.cotironda_piloto_v2_d016_register_terms_acceptance_private(
 repeat('1',64),repeat('1',64));
 IF st<>'denied' THEN RAISE EXCEPTION 'SHARE_OFF_ACCEPTED';END IF;
 UPDATE cotironda_piloto_privado.v2_original_share_policy SET enabled=true;
 UPDATE cotironda_piloto_privado.v2_d016_supplier_terms_policy SET enabled=false;
 st:=public.cotironda_piloto_v2_d016_register_terms_acceptance_private(
 repeat('1',64),repeat('1',64));
 IF st<>'denied' THEN RAISE EXCEPTION 'TERMS_OFF_AFTER_OPTIN';END IF;

 IF (SELECT count(*) FROM cotironda_piloto_privado.v2_supplier_original_consents)<>1
 THEN RAISE EXCEPTION 'UNEXPECTED_SUPPLIER_REGISTERED';END IF;
 IF has_table_privilege('anon',
 'cotironda_piloto_privado.v2_d016_supplier_terms_deliveries','SELECT')
 OR has_table_privilege('authenticated',
 'cotironda_piloto_privado.v2_d016_supplier_terms_policy','SELECT')
 OR has_table_privilege('service_role',
 'cotironda_piloto_privado.v2_d016_supplier_terms_deliveries','SELECT')
 OR has_function_privilege('anon',
 'public.cotironda_piloto_v2_d016_register_terms_acceptance_private(text,text)','EXECUTE')
 OR has_function_privilege('authenticated',
 'public.cotironda_piloto_v2_d016_record_terms_delivery_private(text,text,text,text,timestamptz)','EXECUTE')
 OR NOT has_function_privilege('service_role',
 'public.cotironda_piloto_v2_d016_register_terms_acceptance_private(text,text)','EXECUTE')
 THEN RAISE EXCEPTION 'ONE_TIME_CONSENT_ACL_EXPOSED';END IF;
 RAISE NOTICE 'D016_ONE_TIME_SUPPLIER_CONSENT_PG17_PASS';
END $test$;
ROLLBACK;
