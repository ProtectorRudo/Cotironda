-- MVP233: PG17 sintético, reversible. Sin WhatsApp ni cambios en piloto.
BEGIN;
DO $roles$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN;END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN;END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN;END IF;
END $roles$;
CREATE SCHEMA cotironda_piloto_privado;
CREATE TABLE cotironda_piloto_privado.participants(
 key text PRIMARY KEY,participant_role text,chat_hmac text,
 consent_at timestamptz,opted_out_at timestamptz);
CREATE TABLE cotironda_piloto_privado.whapi_inbox(
 message_hmac text PRIMARY KEY,participant_key text REFERENCES cotironda_piloto_privado.participants(key),
 chat_hmac text,kind text,processing_state text,plaintext_sha256 text,
 nonce_b64 text,ciphertext_b64 text,request_id uuid,
 received_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE cotironda_piloto_privado.ai_central_attempts_mvp226(
 message_hmac text PRIMARY KEY REFERENCES cotironda_piloto_privado.whapi_inbox(message_hmac),
 buyer_key text REFERENCES cotironda_piloto_privado.participants(key),
 chat_hmac text,source_sha256 text,state text,failure_code text,
 created_at timestamptz DEFAULT clock_timestamp(),finished_at timestamptz);
CREATE TABLE cotironda_piloto_privado.ai_trial_control_mvp229(
 only_row boolean PRIMARY KEY,enabled boolean,activated_at timestamptz,expires_at timestamptz);
CREATE TABLE cotironda_piloto_privado.ai_central_control_mvp226(
 only_row boolean PRIMARY KEY,enabled boolean,activated_at timestamptz);
CREATE TABLE cotironda_piloto_privado.ai_dispatch_gate_mvp222(
 only_row boolean PRIMARY KEY,enabled boolean,activated_at timestamptz);
CREATE TABLE cotironda_piloto_privado.integration_flags(
 only_row boolean PRIMARY KEY,whatsapp_inbound_enabled boolean,whatsapp_outbound_enabled boolean);
\ir ../../piloto/mvp233_localidad_central_continuacion.sql
INSERT INTO cotironda_piloto_privado.participants VALUES
 ('arquitecto','buyer',repeat('a',64),now(),null),
 ('corralon_ailin','supplier',repeat('1',64),now(),null);
INSERT INTO cotironda_piloto_privado.ai_trial_control_mvp229 VALUES
 (true,true,now()-interval '10 minutes',now()+interval '80 minutes');
INSERT INTO cotironda_piloto_privado.ai_central_control_mvp226 VALUES(true,true,now());
INSERT INTO cotironda_piloto_privado.ai_dispatch_gate_mvp222 VALUES(true,true,now());
INSERT INTO cotironda_piloto_privado.integration_flags VALUES(true,true,true);
INSERT INTO cotironda_piloto_privado.whapi_inbox
 (message_hmac,participant_key,chat_hmac,kind,processing_state,plaintext_sha256,
 nonce_b64,ciphertext_b64,received_at)
 VALUES
 (repeat('b',64),'arquitecto',repeat('a',64),'text','needs_review',
 encode(sha256(convert_to('20 bolsas cemento CPC','UTF8')),'hex'),
 'c291cmNlLW5vbmNl','Y2lwaGVydGV4dA==',now()-interval '3 minutes'),
 (repeat('c',64),'arquitecto',repeat('a',64),'text','needs_review',
 encode(sha256(convert_to('La Plata','UTF8')),'hex'),null,null,now()),
 (repeat('d',64),'corralon_ailin',repeat('1',64),'text','needs_review',
 encode(sha256(convert_to('La Plata','UTF8')),'hex'),null,null,now());
INSERT INTO cotironda_piloto_privado.ai_central_attempts_mvp226
 (message_hmac,buyer_key,chat_hmac,source_sha256,state,failure_code,finished_at)
 SELECT message_hmac,'arquitecto',repeat('a',64),plaintext_sha256,
 'needs_zone','delivery_city_missing',now()
 FROM cotironda_piloto_privado.whapi_inbox WHERE message_hmac=repeat('b',64);
DO $tests$
DECLARE r jsonb;
BEGIN
 r:=public.cotironda_piloto_ia_claim_zone_mvp233(
 repeat('1',64),repeat('d',64),'La Plata','La Plata');
 IF r->>'state'<>'not_authorized' THEN RAISE EXCEPTION 'foreign_sender_claim';END IF;
 r:=public.cotironda_piloto_ia_claim_zone_mvp233(
 repeat('a',64),repeat('c',64),'La Plata','Rosario');
 IF r->>'state'<>'invalid' THEN RAISE EXCEPTION 'invented_city_claim';END IF;
 UPDATE cotironda_piloto_privado.ai_dispatch_gate_mvp222 SET enabled=false;
 r:=public.cotironda_piloto_ia_claim_zone_mvp233(
 repeat('a',64),repeat('c',64),'La Plata','La Plata');
 IF r->>'state'<>'disabled' THEN RAISE EXCEPTION 'gates_off_did_not_stop';END IF;
 UPDATE cotironda_piloto_privado.ai_dispatch_gate_mvp222 SET enabled=true;
 r:=public.cotironda_piloto_ia_claim_zone_mvp233(
 repeat('a',64),repeat('c',64),'La Plata','La Plata');
 IF r->>'state'<>'resumed' OR r->>'source_hmac'<>repeat('b',64)
 OR r->>'delivery_city'<>'La Plata' OR r->>'nonce'<>'c291cmNlLW5vbmNl'
 OR r->>'source_sha256' IS NULL
 THEN RAISE EXCEPTION 'pending_original_not_resumed';END IF;
 IF (SELECT state FROM cotironda_piloto_privado.ai_central_attempts_mvp226
  WHERE message_hmac=repeat('b',64))<>'reserved'
 OR (SELECT count(*) FROM cotironda_piloto_privado.ai_zone_replies_mvp233)<>1
 THEN RAISE EXCEPTION 'state_not_claimed_atomically';END IF;
 r:=public.cotironda_piloto_ia_claim_zone_mvp233(
 repeat('a',64),repeat('c',64),'La Plata','La Plata');
 IF r->>'state'<>'already_consumed' THEN RAISE EXCEPTION 'duplicate_claim';END IF;
 IF has_function_privilege('anon',
 'public.cotironda_piloto_ia_claim_zone_mvp233(text,text,text,text)','EXECUTE')
 OR has_function_privilege('authenticated',
 'public.cotironda_piloto_ia_claim_zone_mvp233(text,text,text,text)','EXECUTE')
 OR NOT has_function_privilege('service_role',
 'public.cotironda_piloto_ia_claim_zone_mvp233(text,text,text,text)','EXECUTE')
 THEN RAISE EXCEPTION 'unsafe_rpc_permissions';END IF;
 IF (SELECT relrowsecurity FROM pg_class
  WHERE oid='cotironda_piloto_privado.ai_zone_replies_mvp233'::regclass) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'rls_not_enabled';END IF;
END $tests$;
ROLLBACK;
