-- V2-03a · PostgreSQL 17 synthetic / ROLLBACK. No production data.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS extensions;
-- Supabase's extensions.digest uses installed pgcrypto here for CI.
CREATE OR REPLACE FUNCTION extensions.digest(bytea,text)
RETURNS bytea LANGUAGE sql IMMUTABLE AS 'SELECT public.digest($1,$2)';
DO $roles$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $roles$;
CREATE SCHEMA auth;
CREATE TABLE auth.users (
 id uuid PRIMARY KEY,deleted_at timestamptz,banned_until timestamptz,
 is_anonymous boolean,phone_confirmed_at timestamptz,phone text
);
CREATE TABLE auth.sessions (
 id uuid PRIMARY KEY,user_id uuid,not_after timestamptz
);
CREATE SCHEMA cotironda_piloto_privado;
CREATE TABLE cotironda_piloto_privado.participants (
 key text PRIMARY KEY,display_label text,chat_hmac text,
 participant_role text,consent_at timestamptz,opted_out_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.requests (
 id uuid PRIMARY KEY,buyer_key text,state text,
 created_at timestamptz,closes_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.participant_channels_mvp109 (
 participant_key text,chat_hmac text,contact_sha256 text,
 authenticated_message_hmac text
);
CREATE TABLE cotironda_piloto_privado.whapi_inbox (
 message_hmac text PRIMARY KEY,chat_hmac text,participant_key text,
 request_id uuid,kind text,received_at timestamptz,
 nonce_b64 text,ciphertext_b64 text,plaintext_sha256 text,
 processing_state text
);
CREATE TABLE cotironda_piloto_privado.ai_supplier_links_mvp225 (
 message_hmac text,request_id uuid,supplier_key text,
 source_sha256 text,kind text,status text,association text
);
CREATE TABLE cotironda_piloto_privado.ai_supplier_unresolved_mvp237 (
 message_hmac text,state text
);
-- MVP291 ya existe en PILOTO. Tabla mínima para validar la procedencia
-- de una correlación semántica, sin crear las estructuras de producción.
CREATE TABLE cotironda_piloto_privado.ai_supplier_auto_correlation_mvp291(
 source_hmac text,supplier_key text,source_sha256 text,state text,
 selected_request_id uuid,finished_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.media_archive_mvp095 (
 message_hmac text,request_id uuid,participant_key text,
 chat_hmac text,kind text,mime text,content_sha256 text,
 state text,finished_at timestamptz,storage_path text,size_bytes int
);
CREATE TABLE cotironda_piloto_privado.invitations (
 request_id uuid,supplier_key text,state text,created_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.ai_dispatch_jobs_mvp222 (
 request_id uuid,supplier_key text,state text,whapi_message_id text,
 finished_at timestamptz
);

INSERT INTO auth.users VALUES
 ('11111111-1111-4111-8111-111111111111',null,null,false,now()-interval '7 days','5491123456789'),
 ('22222222-2222-4222-8222-222222222222',null,null,false,now()-interval '7 days','5491199999999');
INSERT INTO auth.sessions VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 '11111111-1111-4111-8111-111111111111',now()+interval '1 day'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 '22222222-2222-4222-8222-222222222222',now()+interval '1 day');
INSERT INTO cotironda_piloto_privado.participants VALUES
 ('buyer_a','Estudio Obra',repeat('1',64),'buyer',now()-interval '7 days',null),
 ('supplier_a','Corralón Oriente',repeat('2',64),'supplier',now()-interval '7 days',null),
 ('supplier_b','Pinturería Prisma',repeat('3',64),'supplier',now()-interval '7 days',null),
 ('supplier_c','Proveedor Sin Consentir',repeat('4',64),'supplier',now()-interval '7 days',null);
INSERT INTO cotironda_piloto_privado.participant_channels_mvp109 VALUES
 ('buyer_a',repeat('1',64),
  encode(extensions.digest(convert_to('5491123456789@s.whatsapp.net','UTF8'),'sha256'),'hex'),
  repeat('a',64));
INSERT INTO cotironda_piloto_privado.whapi_inbox
 (message_hmac,chat_hmac,participant_key,request_id,kind,received_at)
 VALUES
 (repeat('a',64),repeat('1',64),'buyer_a',null,'text',now()-interval '6 days'),
 (repeat('b',64),repeat('2',64),'supplier_a',null,'text',now()-interval '4 days'),
 (repeat('c',64),repeat('3',64),'supplier_b',null,'text',now()-interval '4 days');
INSERT INTO cotironda_piloto_privado.requests VALUES
 ('aaaaaaaa-1111-4111-8111-111111111111','buyer_a','prepared',
 now()-interval '3 days',now()+interval '1 day'),
 ('bbbbbbbb-2222-4222-8222-222222222222','buyer_a','prepared',
 now()-interval '3 days',now()+interval '1 day');
INSERT INTO cotironda_piloto_privado.invitations VALUES
 ('aaaaaaaa-1111-4111-8111-111111111111','supplier_a','prepared',now()-interval '2 days'),
 ('aaaaaaaa-1111-4111-8111-111111111111','supplier_b','prepared',now()-interval '2 days'),
 ('aaaaaaaa-1111-4111-8111-111111111111','supplier_c','prepared',now()-interval '2 days'),
 ('bbbbbbbb-2222-4222-8222-222222222222','supplier_a','prepared',now()-interval '2 days');
INSERT INTO cotironda_piloto_privado.ai_dispatch_jobs_mvp222 VALUES
 ('aaaaaaaa-1111-4111-8111-111111111111','supplier_a','api_accepted','wamid.AAAA1234',now()-interval '1 day'),
 ('aaaaaaaa-1111-4111-8111-111111111111','supplier_b','api_accepted','wamid.BBBB1234',now()-interval '1 day'),
 ('aaaaaaaa-1111-4111-8111-111111111111','supplier_c','api_accepted','wamid.CCCC1234',now()-interval '1 day'),
 ('bbbbbbbb-2222-4222-8222-222222222222','supplier_a','api_accepted','wamid.OTHER12',now()-interval '1 day');
INSERT INTO cotironda_piloto_privado.whapi_inbox VALUES
 (repeat('d',64),repeat('2',64),'supplier_a',
 'aaaaaaaa-1111-4111-8111-111111111111','document',now()-interval '12 hours'),
 (repeat('e',64),repeat('3',64),'supplier_b',
 'aaaaaaaa-1111-4111-8111-111111111111','document',now()-interval '12 hours'),
 (repeat('f',64),repeat('4',64),'supplier_c',
 'aaaaaaaa-1111-4111-8111-111111111111','document',now()-interval '12 hours');
INSERT INTO cotironda_piloto_privado.media_archive_mvp095 VALUES
 (repeat('d',64),'aaaaaaaa-1111-4111-8111-111111111111','supplier_a',
 repeat('2',64),'document','application/pdf',repeat('0',64),
 'stored',now()-interval '11 hours','media/'||repeat('d',64),1234),
 (repeat('e',64),'aaaaaaaa-1111-4111-8111-111111111111','supplier_b',
 repeat('3',64),'document',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
 repeat('9',64),'stored',now()-interval '11 hours','media/'||repeat('e',64),2312),
 (repeat('f',64),'aaaaaaaa-1111-4111-8111-111111111111','supplier_c',
 repeat('4',64),'document','application/pdf',repeat('8',64),
 'stored',now()-interval '11 hours','media/'||repeat('f',64),124);
INSERT INTO cotironda_piloto_privado.ai_supplier_links_mvp225 VALUES
 (repeat('d',64),'aaaaaaaa-1111-4111-8111-111111111111',
 'supplier_a',repeat('0',64),'document','awaiting_semantic_review','quoted_whapi_id'),
 (repeat('e',64),'aaaaaaaa-1111-4111-8111-111111111111',
 'supplier_b',repeat('9',64),'document','awaiting_semantic_review','quoted_whapi_id'),
 (repeat('f',64),'aaaaaaaa-1111-4111-8111-111111111111',
 'supplier_c',repeat('8',64),'document','awaiting_semantic_review','quoted_whapi_id');

-- Fixture V2-13: el aviso MVP238 antecede a un PDF almacenado.
-- No se instala SQL en entornos reales; todo termina con ROLLBACK.
CREATE TABLE cotironda_piloto_privado.ai_supplier_preambles_mvp238 (
 preamble_hmac text PRIMARY KEY,
 request_id uuid,supplier_key text,chat_hmac text,
 source_sha256 text,received_at timestamptz,
 attachment_hmac text,attached_at timestamptz
);

\ir ../../piloto/v2_03_catalogo_respondedores_privado.sql
\ir ../../piloto/v2_03b_fuente_original_auditoria_privada.sql

DO $test$
DECLARE got jsonb; source_record jsonb; doc uuid; audit_total int;
BEGIN
 got:=public.cotironda_piloto_v2_responders_private(
  'aaaaaaaa-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 IF got IS NOT NULL THEN RAISE EXCEPTION 'policy_on_by_default';END IF;
 -- Solo activacion futura explicita; fixture sintetico simula esa aprobacion.
 UPDATE cotironda_piloto_privado.v2_original_share_policy
 SET enabled=true,activated_at=now()-interval '5 days';
 got:=public.cotironda_piloto_v2_responders_private(
  'aaaaaaaa-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 IF got->>'state'<>'authorized_responders_v2'
 OR jsonb_array_length(got->'originals')<>0
 THEN RAISE EXCEPTION 'without_consent_must_be_empty:%',got;END IF;
 -- Consentimiento V2 anticipado, respaldado por mensaje de Whapi anterior.
 INSERT INTO cotironda_piloto_privado.v2_supplier_original_consents VALUES
 ('supplier_a',repeat('b',64),'cotironda-originales-v2',
 now()-interval '4 days',null);
 got:=public.cotironda_piloto_v2_responders_private(
  'aaaaaaaa-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 IF jsonb_array_length(got->'originals')<>1
 OR got->'originals'->0->>'supplierName'<>'Corralón Oriente'
 THEN RAISE EXCEPTION 'one_responder_expected:%',got;END IF;
 -- V2-03b: source exact of the sole consented responder; no economic parser.
 SELECT (got->'originals'->0->>'documentId')::uuid INTO doc;
 source_record:=public.cotironda_piloto_v2_original_source_private(
  'aaaaaaaa-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',doc);
 IF source_record->>'state'<>'authorized_original_v2'
 OR source_record->>'sha256'<>repeat('0',64)
 OR source_record->>'path'<>'media/'||repeat('d',64)
 OR source_record->>'mime'<>'application/pdf'
 OR (source_record->>'byteCount')::int<>1234
 THEN RAISE EXCEPTION 'v2_source_exact_failed:%',source_record;END IF;

 IF public.cotironda_piloto_v2_original_source_private(
  'aaaaaaaa-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',doc) IS NOT NULL
 THEN RAISE EXCEPTION 'v2_cross_buyer_download';END IF;
 IF public.cotironda_piloto_v2_original_source_private(
  'bbbbbbbb-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',doc) IS NOT NULL
 THEN RAISE EXCEPTION 'v2_cross_round_download';END IF;

 IF public.cotironda_piloto_v2_record_download(
  'aaaaaaaa-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',doc,
  repeat('7',64),1234) IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'v2_wrong_sha_audited';END IF;
 IF public.cotironda_piloto_v2_record_download(
  'aaaaaaaa-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',doc,
  repeat('0',64),999) IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'v2_wrong_size_audited';END IF;
 IF public.cotironda_piloto_v2_record_download(
  'aaaaaaaa-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',doc,
  repeat('0',64),1234) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'v2_good_audit_refused';END IF;
 SELECT count(*) INTO audit_total
 FROM cotironda_piloto_privado.v2_original_download_audit;
 IF audit_total<>1 THEN RAISE EXCEPTION 'v2_audit_count_invalid_%',audit_total;END IF;
 UPDATE cotironda_piloto_privado.v2_supplier_original_consents
 SET revoked_at=now() WHERE supplier_key='supplier_a';
 IF public.cotironda_piloto_v2_original_source_private(
  'aaaaaaaa-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',doc) IS NOT NULL
 OR public.cotironda_piloto_v2_record_download(
  'aaaaaaaa-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',doc,
  repeat('0',64),1234) IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'v2_revocation_race_allowed';END IF;
 UPDATE cotironda_piloto_privado.v2_supplier_original_consents
 SET revoked_at=null WHERE supplier_key='supplier_a';

 INSERT INTO cotironda_piloto_privado.v2_supplier_original_consents VALUES
 ('supplier_b',repeat('c',64),'cotironda-originales-v2',
 now()-interval '4 days',null);
 got:=public.cotironda_piloto_v2_responders_private(
  'aaaaaaaa-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 IF jsonb_array_length(got->'originals')<>2
 OR got::text LIKE '%supplier_c%'
 OR got::text LIKE '%storage_path%'
 OR got::text LIKE '%message_hmac%'
 OR got::text LIKE '%whapi_message_id%'
 THEN RAISE EXCEPTION 'two_only_verified_responses_expected:%',got;END IF;
 -- No hay acreditacion de prueba en la otra obra concurrente.
 got:=public.cotironda_piloto_v2_responders_private(
  'bbbbbbbb-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 IF jsonb_array_length(got->'originals')<>0
 THEN RAISE EXCEPTION 'cross_round_leak:%',got;END IF;
 -- Buyer distinto, sesion inexistente y revocacion: negar.
 got:=public.cotironda_piloto_v2_responders_private(
  'aaaaaaaa-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
 IF got IS NOT NULL THEN RAISE EXCEPTION 'cross_buyer_leak';END IF;
 got:=public.cotironda_piloto_v2_responders_private(
  'aaaaaaaa-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
 IF got IS NOT NULL THEN RAISE EXCEPTION 'session_spoof_allowed';END IF;
 UPDATE cotironda_piloto_privado.v2_supplier_original_consents
 SET revoked_at=now() WHERE supplier_key='supplier_b';
 got:=public.cotironda_piloto_v2_responders_private(
  'aaaaaaaa-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 IF jsonb_array_length(got->'originals')<>1
 THEN RAISE EXCEPTION 'revocation_not_enforced:%',got;END IF;
 -- V2-13: proveedor envió aviso identificado y después un PDF.
 -- La asociación viene de MVP238, no de precio/nombre/fecha del archivo.
 INSERT INTO cotironda_piloto_privado.participants VALUES
 ('supplier_d','Casa de materiales Del Sur',repeat('5',64),
  'supplier',now()-interval '7 days',null);
 INSERT INTO cotironda_piloto_privado.invitations VALUES
 ('aaaaaaaa-1111-4111-8111-111111111111','supplier_d',
  'prepared',now()-interval '2 days');
 INSERT INTO cotironda_piloto_privado.ai_dispatch_jobs_mvp222 VALUES
 ('aaaaaaaa-1111-4111-8111-111111111111','supplier_d',
  'api_accepted','wamid.DDDD1234',now()-interval '1 day');
 INSERT INTO cotironda_piloto_privado.whapi_inbox
 (message_hmac,chat_hmac,participant_key,request_id,kind,
  received_at,plaintext_sha256) VALUES
 (repeat('9',64),repeat('5',64),'supplier_d',
  null,'text',now()-interval '4 days',repeat('c',64)),
 (repeat('7',64),repeat('5',64),'supplier_d',
  'aaaaaaaa-1111-4111-8111-111111111111',
  'text',now()-interval '14 hours',repeat('4',64)),
 (repeat('8',64),repeat('5',64),'supplier_d',
  'aaaaaaaa-1111-4111-8111-111111111111',
  'document',now()-interval '12 hours',repeat('5',64));
 INSERT INTO cotironda_piloto_privado.media_archive_mvp095 VALUES
 (repeat('8',64),'aaaaaaaa-1111-4111-8111-111111111111',
  'supplier_d',repeat('5',64),'document','application/pdf',
  repeat('6',64),'stored',now()-interval '11 hours',
  'media/'||repeat('8',64),1337);
 INSERT INTO cotironda_piloto_privado.ai_supplier_links_mvp225 VALUES
 (repeat('8',64),'aaaaaaaa-1111-4111-8111-111111111111',
  'supplier_d',repeat('6',64),'document',
  'awaiting_semantic_review','prior_supplier_preamble');
 INSERT INTO cotironda_piloto_privado.ai_supplier_preambles_mvp238 VALUES
 (repeat('7',64),'aaaaaaaa-1111-4111-8111-111111111111',
  'supplier_d',repeat('5',64),repeat('4',64),
  now()-interval '14 hours',repeat('8',64),now()-interval '11 hours');

 -- Ningún original sin consentimiento prospectivo debe filtrarse.
 got:=public.cotironda_piloto_v2_responders_private(
  'aaaaaaaa-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 IF jsonb_array_length(got->'originals')<>1
 THEN RAISE EXCEPTION 'v2_13_unconsented_preamble_visible:%',got;END IF;
 INSERT INTO cotironda_piloto_privado.v2_supplier_original_consents VALUES
 ('supplier_d',repeat('9',64),'cotironda-originales-v2',
  now()-interval '4 days',null);
 got:=public.cotironda_piloto_v2_responders_private(
  'aaaaaaaa-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 IF jsonb_array_length(got->'originals')<>2
 THEN RAISE EXCEPTION 'v2_13_preamble_quote_missing:%',got;END IF;
 SELECT (value->>'documentId')::uuid INTO doc
 FROM jsonb_array_elements(got->'originals')
 WHERE value->>'supplierName'='Casa de materiales Del Sur';
 IF doc IS NULL THEN RAISE EXCEPTION 'v2_13_no_document_id';END IF;
 source_record:=public.cotironda_piloto_v2_original_source_private(
  'aaaaaaaa-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',doc);
 IF source_record->>'sha256'<>repeat('6',64)
 OR source_record->>'path'<>'media/'||repeat('8',64)
 THEN RAISE EXCEPTION 'v2_13_original_not_exact:%',source_record;END IF;

 -- Alterar sólo la huella del aviso rompe vínculo y descarga, fail closed.
 UPDATE cotironda_piloto_privado.ai_supplier_preambles_mvp238
 SET source_sha256=repeat('f',64) WHERE preamble_hmac=repeat('7',64);
 got:=public.cotironda_piloto_v2_responders_private(
  'aaaaaaaa-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 IF jsonb_array_length(got->'originals')<>1
 OR public.cotironda_piloto_v2_original_source_private(
  'aaaaaaaa-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',doc) IS NOT NULL
 THEN RAISE EXCEPTION 'v2_13_forged_notice_accepted';END IF;
 UPDATE cotironda_piloto_privado.ai_supplier_preambles_mvp238
 SET source_sha256=repeat('4',64) WHERE preamble_hmac=repeat('7',64);

 -- Cualquier cambio de chat, tiempo o evidencia del aviso debe excluir.
 UPDATE cotironda_piloto_privado.ai_supplier_preambles_mvp238
 SET chat_hmac=repeat('3',64) WHERE preamble_hmac=repeat('7',64);
 got:=public.cotironda_piloto_v2_responders_private(
  'aaaaaaaa-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 IF jsonb_array_length(got->'originals')<>1
 THEN RAISE EXCEPTION 'v2_13_cross_chat_preamble_visible';END IF;
 UPDATE cotironda_piloto_privado.ai_supplier_preambles_mvp238
 SET chat_hmac=repeat('5',64),received_at=now()-interval '10 hours'
 WHERE preamble_hmac=repeat('7',64);
 got:=public.cotironda_piloto_v2_responders_private(
  'aaaaaaaa-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 IF jsonb_array_length(got->'originals')<>1
 THEN RAISE EXCEPTION 'v2_13_future_preamble_visible';END IF;
 UPDATE cotironda_piloto_privado.ai_supplier_preambles_mvp238
 SET received_at=now()-interval '14 hours',attachment_hmac=null
 WHERE preamble_hmac=repeat('7',64);
 got:=public.cotironda_piloto_v2_responders_private(
  'aaaaaaaa-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 IF jsonb_array_length(got->'originals')<>1
 THEN RAISE EXCEPTION 'v2_13_unpaired_file_visible';END IF;
 UPDATE cotironda_piloto_privado.ai_supplier_preambles_mvp238
 SET attachment_hmac=repeat('8',64) WHERE preamble_hmac=repeat('7',64);

 UPDATE cotironda_piloto_privado.v2_supplier_original_consents
 SET revoked_at=now() WHERE supplier_key='supplier_d';
 IF public.cotironda_piloto_v2_original_source_private(
  'aaaaaaaa-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',doc) IS NOT NULL
 THEN RAISE EXCEPTION 'v2_13_consent_revoked_original_leaked';END IF;
 RAISE NOTICE 'V2_13_PREAMBLE_DOCUMENT_PG17_PASS';

 -- Ningun cliente normal puede llamar a la RPC privada.
 IF has_function_privilege('anon',
  'public.cotironda_piloto_v2_responders_private(uuid,uuid,uuid)','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.cotironda_piloto_v2_responders_private(uuid,uuid,uuid)','EXECUTE')
 OR NOT has_function_privilege('service_role',
  'public.cotironda_piloto_v2_responders_private(uuid,uuid,uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'rpc_not_private';END IF;
 IF has_function_privilege('anon',
  'public.cotironda_piloto_v2_original_source_private(uuid,uuid,uuid,uuid)','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.cotironda_piloto_v2_original_source_private(uuid,uuid,uuid,uuid)','EXECUTE')
 OR has_function_privilege('anon',
  'public.cotironda_piloto_v2_record_download(uuid,uuid,uuid,uuid,text,integer)','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.cotironda_piloto_v2_record_download(uuid,uuid,uuid,uuid,text,integer)','EXECUTE')
 OR NOT has_function_privilege('service_role',
  'public.cotironda_piloto_v2_record_download(uuid,uuid,uuid,uuid,text,integer)','EXECUTE')
 THEN RAISE EXCEPTION 'v2_download_rpc_acl_broken';END IF;
 RAISE NOTICE 'V2_03B_ORIGINAL_AUDIT_PG17_PASS';
 RAISE NOTICE 'V2_03_RESPONDER_CATALOG_PG17_PASS';
END $test$;
\ir ../../piloto/v2_04b_analisis_original_idempotente_privado.sql
\ir ../fixtures/v2-04b-analysis-checks.sql
\ir ../../piloto/v2_07_buyer_auth_bootstrap_check_private.sql
\ir ../fixtures/v2-07-buyer-auth-checks.sql
-- Pruebas adicionales V2-14: texto WhatsApp, con sobre cifrado SIMULADO.
-- No se descifra nada en PostgreSQL ni se usa un proveedor real.
DO $v214$
DECLARE got jsonb;src jsonb;doc uuid; token jsonb; count_audit integer;
BEGIN
 INSERT INTO cotironda_piloto_privado.whapi_inbox(
  message_hmac,chat_hmac,participant_key,request_id,kind,
  received_at,nonce_b64,ciphertext_b64,plaintext_sha256,processing_state
 ) VALUES(
  repeat('0',64),repeat('2',64),'supplier_a',
  'aaaaaaaa-1111-4111-8111-111111111111','text',
  now()-interval '6 hours',repeat('A',16),repeat('B',64),
  repeat('6',64),'needs_review'
 );
 INSERT INTO cotironda_piloto_privado.ai_supplier_links_mvp225
 VALUES(repeat('0',64),'aaaaaaaa-1111-4111-8111-111111111111',
  'supplier_a',repeat('6',64),'text',
  'awaiting_semantic_review','quoted_whapi_id');
 got:=public.cotironda_piloto_v2_responders_private(
  'aaaaaaaa-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 IF jsonb_array_length(got->'originals')<>2
 OR got::text LIKE '%ciphertextB64%'
 OR got::text LIKE '%nonceB64%'
 OR got::text LIKE '%chatHmac%'
 THEN RAISE EXCEPTION 'v2_14_text_catalog_invalid:%',got;END IF;
 SELECT (value->>'documentId')::uuid INTO doc
 FROM jsonb_array_elements(got->'originals')
 WHERE value->>'kind'='text';
 IF doc IS NULL THEN RAISE EXCEPTION 'v2_14_text_id_absent:%',got;END IF;
 src:=public.cotironda_piloto_v2_original_source_private(
  'aaaaaaaa-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',doc);
 IF src->>'state'<>'authorized_text_v2'
 OR src->>'sha256'<>repeat('6',64)
 OR src->>'nonceB64'<>repeat('A',16)
 OR src->>'ciphertextB64'<>repeat('B',64)
 THEN RAISE EXCEPTION 'v2_14_text_source_invalid:%',src;END IF;
 IF public.cotironda_piloto_v2_record_text_download(
  'aaaaaaaa-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',doc,
  repeat('0',64),120) IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'v2_14_wrong_text_sha_audited';END IF;
 IF public.cotironda_piloto_v2_record_text_download(
  'aaaaaaaa-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',doc,
  repeat('6',64),120) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'v2_14_text_audit_refused';END IF;

 -- Claims SQL de la guía aceptan texto sólo por este mismo origen.
 token:=public.cotironda_piloto_v2_analysis_claim_private(
  'aaaaaaaa-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',doc);
 IF token->>'state'<>'analysis_claimed_v2'
 OR token->>'sourceSha256'<>repeat('6',64)
 THEN RAISE EXCEPTION 'v2_14_text_analysis_claim_failed:%',token;END IF;

 -- Correlación por IA NO basta: exige decisión de ambas lecturas
 -- previamente asentada y una sola solicitud seleccionada.
 INSERT INTO cotironda_piloto_privado.whapi_inbox(
  message_hmac,chat_hmac,participant_key,request_id,kind,
  received_at,nonce_b64,ciphertext_b64,plaintext_sha256,processing_state
 ) VALUES(
  repeat('1',64),repeat('2',64),'supplier_a',
  'aaaaaaaa-1111-4111-8111-111111111111','text',
  now()-interval '5 hours',repeat('A',16),repeat('B',64),
  repeat('7',64),'needs_review'
 );
 INSERT INTO cotironda_piloto_privado.ai_supplier_links_mvp225
 VALUES(repeat('1',64),'aaaaaaaa-1111-4111-8111-111111111111',
  'supplier_a',repeat('7',64),'text',
  'awaiting_semantic_review','semantic_unique_mvp291');
 got:=public.cotironda_piloto_v2_responders_private(
  'aaaaaaaa-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 IF jsonb_array_length(got->'originals')<>2
 THEN RAISE EXCEPTION 'v2_14_semantic_unproven_visible';END IF;
 INSERT INTO cotironda_piloto_privado.ai_supplier_auto_correlation_mvp291
 VALUES(repeat('1',64),'supplier_a',repeat('7',64),'linked',
  'aaaaaaaa-1111-4111-8111-111111111111',now());
 got:=public.cotironda_piloto_v2_responders_private(
  'aaaaaaaa-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 IF jsonb_array_length(got->'originals')<>3
 THEN RAISE EXCEPTION 'v2_14_semantic_proven_hidden';END IF;
 UPDATE cotironda_piloto_privado.ai_supplier_auto_correlation_mvp291
 SET state='review' WHERE source_hmac=repeat('1',64);
 got:=public.cotironda_piloto_v2_responders_private(
  'aaaaaaaa-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 IF jsonb_array_length(got->'originals')<>2
 THEN RAISE EXCEPTION 'v2_14_semantic_review_exposed';END IF;

 -- Revocación y suplantación de comprador invalidan la fuente textual.
 UPDATE cotironda_piloto_privado.v2_supplier_original_consents
 SET revoked_at=now() WHERE supplier_key='supplier_a';
 IF public.cotironda_piloto_v2_original_source_private(
  'aaaaaaaa-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',doc) IS NOT NULL
 OR public.cotironda_piloto_v2_record_text_download(
  'aaaaaaaa-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',doc,
  repeat('6',64),120) IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'v2_14_text_revocation_leaked';END IF;
 IF public.cotironda_piloto_v2_original_source_private(
  'aaaaaaaa-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',doc) IS NOT NULL
 THEN RAISE EXCEPTION 'v2_14_cross_buyer_text_leaked';END IF;
 IF has_function_privilege('anon',
  'public.cotironda_piloto_v2_record_text_download(uuid,uuid,uuid,uuid,text,integer)','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.cotironda_piloto_v2_record_text_download(uuid,uuid,uuid,uuid,text,integer)','EXECUTE')
 OR NOT has_function_privilege('service_role',
  'public.cotironda_piloto_v2_record_text_download(uuid,uuid,uuid,uuid,text,integer)','EXECUTE')
 THEN RAISE EXCEPTION 'v2_14_text_audit_acl_exposed';END IF;
 RAISE NOTICE 'V2_14_TEXT_ORIGINAL_PG17_PASS';
END $v214$;
ROLLBACK;
