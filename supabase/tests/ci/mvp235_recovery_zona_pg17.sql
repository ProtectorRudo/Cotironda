-- MVP235: prueba PG17 aislada y reversible; sin redes ni datos del piloto.
BEGIN;
DO $r$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END $r$;
CREATE SCHEMA cotironda_piloto_privado;
CREATE TABLE cotironda_piloto_privado.ai_central_attempts_mvp226 (
 message_hmac text PRIMARY KEY, chat_hmac text NOT NULL, buyer_key text NOT NULL,
 source_sha256 text NOT NULL, state text NOT NULL, created_at timestamptz NOT NULL,
 finished_at timestamptz, failure_code text
);
CREATE TABLE cotironda_piloto_privado.ai_zone_replies_mvp233 (
 reply_hmac text PRIMARY KEY,source_hmac text NOT NULL UNIQUE,
 buyer_key text NOT NULL,delivery_city text NOT NULL,
 claimed_at timestamptz NOT NULL
);
CREATE TABLE cotironda_piloto_privado.requests (
 id uuid PRIMARY KEY, source_hmac text, buyer_key text,state text
);
CREATE TABLE cotironda_piloto_privado.ai_shadow_requests_mvp221 (
 request_id uuid,source_hmac text
);
CREATE TABLE cotironda_piloto_privado.whapi_inbox (
 message_hmac text,chat_hmac text,request_id uuid,plaintext_sha256 text
);
CREATE TABLE cotironda_piloto_privado.ai_supplier_review_mvp227 (
 state text,reserved_at timestamptz,reason_code text,finished_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.ai_dispatch_jobs_mvp222 (
 state text,leased_at timestamptz,finished_at timestamptz
);
CREATE FUNCTION cotironda_piloto_privado.ai_central_reconcile_mvp230(boolean,integer)
RETURNS jsonb LANGUAGE plpgsql AS $f$ BEGIN RETURN '{"state":"placeholder"}'::jsonb; END $f$;
\ir ../../piloto/mvp235_recovery_compatibilidad_zona.sql
INSERT INTO cotironda_piloto_privado.ai_central_attempts_mvp226
(message_hmac,chat_hmac,buyer_key,source_sha256,state,created_at)
VALUES (repeat('a',64),repeat('c',64),'buyer',repeat('1',64),'reserved',clock_timestamp()-interval '2 hours'),
       (repeat('b',64),repeat('c',64),'buyer',repeat('2',64),'reserved',clock_timestamp()-interval '2 hours');
INSERT INTO cotironda_piloto_privado.ai_zone_replies_mvp233
(reply_hmac,source_hmac,buyer_key,delivery_city,claimed_at)
VALUES(repeat('d',64),repeat('a',64),'buyer','City Bell',clock_timestamp());
INSERT INTO cotironda_piloto_privado.ai_supplier_review_mvp227 (state,reserved_at)
VALUES ('reserved',clock_timestamp()-interval '45 minutes');
INSERT INTO cotironda_piloto_privado.ai_dispatch_jobs_mvp222 (state,leased_at)
VALUES ('leased',clock_timestamp()-interval '45 minutes'),
       ('leased',clock_timestamp()-interval '5 minutes');
DO $tests$
DECLARE r jsonb;
BEGIN
 r:=cotironda_piloto_privado.ai_central_reconcile_mvp230(true,30);
 IF (r->>'buyer_to_review')::int<>1
    OR (r->>'quotes_to_review')::int<>1
    OR (r->>'leases_to_uncertain')::int<>1
 THEN RAISE EXCEPTION 'mvp235_first_reconciliation_counts'; END IF;
 IF (SELECT state FROM cotironda_piloto_privado.ai_central_attempts_mvp226
       WHERE message_hmac=repeat('a',64))<>'reserved'
    OR (SELECT state FROM cotironda_piloto_privado.ai_central_attempts_mvp226
       WHERE message_hmac=repeat('b',64))<>'review'
 THEN RAISE EXCEPTION 'mvp235_resumed_attempt_was_discarded'; END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222
     WHERE state='leased')<>1
 THEN RAISE EXCEPTION 'mvp235_fresh_lease_modified'; END IF;
 IF has_function_privilege('anon',
   'cotironda_piloto_privado.ai_central_reconcile_mvp230(boolean,integer)','EXECUTE')
 OR has_function_privilege('authenticated',
   'cotironda_piloto_privado.ai_central_reconcile_mvp230(boolean,integer)','EXECUTE')
 THEN RAISE EXCEPTION 'mvp235_public_access'; END IF;
 r:=cotironda_piloto_privado.ai_central_reconcile_mvp230(true,30);
 IF (r->>'buyer_to_review')::int<>0
 THEN RAISE EXCEPTION 'mvp235_retry_not_idempotent'; END IF;
 UPDATE cotironda_piloto_privado.ai_zone_replies_mvp233
 SET claimed_at=clock_timestamp()-interval '45 minutes'
 WHERE source_hmac=repeat('a',64);
 r:=cotironda_piloto_privado.ai_central_reconcile_mvp230(true,30);
 IF (r->>'buyer_to_review')::int<>1 OR
   (SELECT state FROM cotironda_piloto_privado.ai_central_attempts_mvp226
    WHERE message_hmac=repeat('a',64))<>'review'
 THEN RAISE EXCEPTION 'mvp235_expired_resumption_not_reconciled'; END IF;
END $tests$;
SELECT 'PASS: reanudacion reciente segura, expiracion legitima, idempotencia, permisos, no reenvios' AS test_result;
ROLLBACK;
