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
DO $test$
DECLARE n integer;v_before integer;v_denied boolean:=false;
BEGIN
 IF has_table_privilege('anon',
 'cotironda_piloto_privado.v2_d016_supplier_original_optout_events','SELECT')
 OR has_table_privilege('service_role',
 'cotironda_piloto_privado.v2_d016_supplier_original_optout_events','SELECT')
 OR has_function_privilege('anon',
 'public.cotironda_piloto_v2_d016_revoke_by_whapi_text_private(text,text)',
 'EXECUTE') OR
 has_function_privilege('authenticated',
 'public.cotironda_piloto_v2_d016_revoke_by_whapi_text_private(text,text)',
 'EXECUTE') OR NOT has_function_privilege('service_role',
 'public.cotironda_piloto_v2_d016_revoke_by_whapi_text_private(text,text)',
 'EXECUTE')
 THEN RAISE EXCEPTION 'GLOBAL_REVOKE_PRIVILEGES';END IF;
 IF NOT (SELECT relrowsecurity
 FROM pg_class WHERE oid=
 'cotironda_piloto_privado.v2_d016_supplier_original_optout_events'::regclass)
 THEN RAISE EXCEPTION 'GLOBAL_REVOKE_RLS_OFF';END IF;

 n:=public.cotironda_piloto_v2_d016_revoke_by_whapi_text_private(
 repeat('e',64),repeat('2',64));
 IF n<>0 THEN RAISE EXCEPTION 'OTHER_CHAT_REVOKED';END IF;
 n:=public.cotironda_piloto_v2_d016_revoke_by_whapi_text_private(
 repeat('1',64),repeat('2',64));
 IF n<>0 THEN RAISE EXCEPTION 'ARBITRARY_TEXT_REVOKED';END IF;
 n:=public.cotironda_piloto_v2_d016_revoke_by_whapi_text_private(NULL,NULL);
 IF n<>0 THEN RAISE EXCEPTION 'NULL_REVOKED';END IF;

 -- A recibió pedido, por tanto 1 evento global + 1 consentimiento + 1 aviso.
 n:=public.cotironda_piloto_v2_d016_revoke_by_whapi_text_private(
 repeat('e',64),repeat('1',64));
 IF n<>3 THEN RAISE EXCEPTION 'GLOBAL_WITH_NOTICE_EXPECTED_THREE:%',n;END IF;
 IF NOT EXISTS(SELECT 1
 FROM cotironda_piloto_privado.v2_supplier_original_consents
 WHERE supplier_key='supplier_a' AND revoked_at IS NOT NULL)
 THEN RAISE EXCEPTION 'GLOBAL_CONSENT_A_NOT_REVOKED';END IF;
 IF NOT EXISTS(SELECT 1
 FROM cotironda_piloto_privado.v2_d016_original_notice_revocations
 WHERE supplier_key='supplier_a' AND message_hmac=repeat('e',64))
 THEN RAISE EXCEPTION 'CURRENT_ROUND_NOT_REVOKED';END IF;
 n:=public.cotironda_piloto_v2_d016_revoke_by_whapi_text_private(
 repeat('e',64),repeat('1',64));
 IF n<>0 THEN RAISE EXCEPTION 'REPLAY_DUPLICATED:%',n;END IF;

 -- B NO recibió un aviso ni tiene ronda: revocación igual afecta el futuro.
 n:=public.cotironda_piloto_v2_d016_revoke_by_whapi_text_private(
 repeat('f',64),repeat('2',64));
 IF n<>2 THEN RAISE EXCEPTION 'GLOBAL_WITHOUT_NOTICE_EXPECTED_TWO:%',n;END IF;
 IF NOT EXISTS(SELECT 1 FROM
 cotironda_piloto_privado.v2_supplier_original_consents
 WHERE supplier_key='supplier_b' AND revoked_at IS NOT NULL)
 THEN RAISE EXCEPTION 'GLOBAL_CONSENT_B_NOT_REVOKED';END IF;
 IF (SELECT count(*) FROM
 cotironda_piloto_privado.v2_d016_supplier_original_optout_events)<>2
 THEN RAISE EXCEPTION 'GLOBAL_OPT_OUT_AUDIT_COUNT';END IF;

 -- Una UPDATE retroactiva jamás resucita un consentimiento anterior.
 BEGIN
  UPDATE cotironda_piloto_privado.v2_supplier_original_consents
  SET revoked_at=NULL WHERE supplier_key='supplier_a';
 EXCEPTION WHEN check_violation THEN v_denied:=true;
 END;
 IF NOT v_denied THEN RAISE EXCEPTION 'RETROACTIVE_CONSENT_RESURRECTION';END IF;

 -- Un NUEVO consentimiento genuino, posterior a la baja, puede reactivar
 -- solo rondas futuras. No reinterpretar los avisos anteriores.
 INSERT INTO cotironda_piloto_privado.whapi_inbox VALUES
 (repeat('7',64),NULL,'supplier_a',repeat('1',64),'text',
 repeat('3',64),clock_timestamp()-interval '3 seconds');
 UPDATE cotironda_piloto_privado.v2_supplier_original_consents
 SET consent_message_hmac=repeat('7',64),
 accepted_at=clock_timestamp()-interval '3 seconds',
 revoked_at=NULL WHERE supplier_key='supplier_a';
 IF NOT EXISTS(SELECT 1 FROM
 cotironda_piloto_privado.v2_supplier_original_consents
 WHERE supplier_key='supplier_a' AND revoked_at IS NULL)
 THEN RAISE EXCEPTION 'NEW_CONSENT_AFTER_OPT_OUT_BLOCKED';END IF;
 n:=public.cotironda_piloto_v2_d016_revoke_by_whapi_text_private(
 repeat('e',64),repeat('1',64));
 IF n<>0 THEN RAISE EXCEPTION 'OLD_REPLAY_REVOKED_NEW_CONSENT';END IF;

 -- Una segunda baja con otro HMAC queda auditada sin duplicar aviso.
 INSERT INTO cotironda_piloto_privado.whapi_inbox VALUES
 (repeat('8',64),NULL,'supplier_a',repeat('1',64),'text',
 encode(pg_catalog.sha256(pg_catalog.convert_to('NO COMPARTIR.','UTF8')),'hex'),
 clock_timestamp()-interval '1 second');
 n:=public.cotironda_piloto_v2_d016_revoke_by_whapi_text_private(
 repeat('8',64),repeat('1',64));
 IF n<>2 THEN RAISE EXCEPTION 'RECONSENT_NOT_REVOKED_AGAIN:%',n;END IF;
 IF (SELECT count(*) FROM
 cotironda_piloto_privado.v2_d016_supplier_original_optout_events)<>3
 THEN RAISE EXCEPTION 'GLOBAL_OPT_OUT_AUDIT_LOST';END IF;
 IF (SELECT count(*) FROM
 cotironda_piloto_privado.v2_d016_original_notice_revocations)<>1
 THEN RAISE EXCEPTION 'NOTICES_DUPLICATED';END IF;
 RAISE NOTICE 'D016_GLOBAL_OPT_OUT_PG17_PASS';
END $test$;
ROLLBACK;
