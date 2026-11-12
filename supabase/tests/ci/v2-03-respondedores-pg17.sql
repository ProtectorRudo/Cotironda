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
 request_id uuid,kind text,received_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.ai_supplier_links_mvp225 (
 message_hmac text,request_id uuid,supplier_key text,
 source_sha256 text,kind text,status text,association text
);
CREATE TABLE cotironda_piloto_privado.ai_supplier_unresolved_mvp237 (
 message_hmac text,state text
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

\ir ../../piloto/v2_03_catalogo_respondedores_privado.sql

DO $test$
DECLARE got jsonb;
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
 -- Ningun cliente normal puede llamar a la RPC privada.
 IF has_function_privilege('anon',
  'public.cotironda_piloto_v2_responders_private(uuid,uuid,uuid)','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.cotironda_piloto_v2_responders_private(uuid,uuid,uuid)','EXECUTE')
 OR NOT has_function_privilege('service_role',
  'public.cotironda_piloto_v2_responders_private(uuid,uuid,uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'rpc_not_private';END IF;
 RAISE NOTICE 'V2_03_RESPONDER_CATALOG_PG17_PASS';
END $test$;
ROLLBACK;
