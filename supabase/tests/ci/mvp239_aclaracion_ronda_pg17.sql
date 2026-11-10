-- Etapa 2 / MVP236. Datos sintéticos; toda la prueba se revierte.
BEGIN;
DO $role$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN;END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN;END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN;END IF;
END $role$;
CREATE SCHEMA cotironda_piloto_privado;
CREATE TABLE cotironda_piloto_privado.participants(
 key text PRIMARY KEY, chat_hmac text, participant_role text,
 consent_at timestamptz,opted_out_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.requests(
 id uuid PRIMARY KEY,buyer_key text,state text,created_at timestamptz,closes_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.invitations(
 request_id uuid,supplier_key text,state text, PRIMARY KEY(request_id,supplier_key)
);
CREATE TABLE cotironda_piloto_privado.ai_shadow_requests_mvp221(
 request_id uuid PRIMARY KEY,status text
);
CREATE TABLE cotironda_piloto_privado.ai_dispatch_jobs_mvp222(
 request_id uuid,supplier_key text,state text,
 whapi_message_id text, finished_at timestamptz,
 PRIMARY KEY(request_id,supplier_key)
);
CREATE TABLE cotironda_piloto_privado.whapi_outbox(
 request_id uuid,supplier_key text,state text,whapi_message_id text,sent_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.whapi_inbox(
 message_hmac text PRIMARY KEY,chat_hmac text,participant_key text,
 kind text,received_at timestamptz,processing_state text,request_id uuid,
 plaintext_sha256 text
);
CREATE TABLE cotironda_piloto_privado.media_archive_mvp095(
 message_hmac text,chat_hmac text,participant_key text,state text,
 content_sha256 text,request_id uuid
);
CREATE TABLE cotironda_piloto_privado.ai_supplier_links_mvp225(
 message_hmac text PRIMARY KEY,request_id uuid,supplier_key text,
 kind text,association text,source_sha256 text
);
\ir ../../piloto/mvp236_asociacion_respuestas_invitaciones_acreditadas.sql
\ir ../../piloto/mvp237_ledger_asociacion_no_resuelta.sql
CREATE TABLE cotironda_piloto_privado.integration_flags(
 only_row boolean PRIMARY KEY,whatsapp_inbound_enabled boolean,
 whatsapp_outbound_enabled boolean);
INSERT INTO cotironda_piloto_privado.integration_flags VALUES(true,true,true);
CREATE FUNCTION public.cotironda_piloto_ia_trial_flags_mvp229(text)
RETURNS jsonb LANGUAGE sql AS $mock$ SELECT '{"quote_link":true}'::jsonb $mock$;
\ir ../../piloto/mvp239_aclarar_ronda_con_cita_whapi.sql
INSERT INTO cotironda_piloto_privado.participants VALUES
 ('arquitecto',repeat('a',64),'buyer',now(),NULL),
 ('corralon_ailin',repeat('b',64),'supplier',now(),NULL),
 ('corralon_nahuel',repeat('c',64),'supplier',now(),NULL);
INSERT INTO cotironda_piloto_privado.requests VALUES
 ('11111111-1111-4111-8111-111111111111','arquitecto','prepared',now()-interval '30 minutes',now()+interval '2 days'),
 ('22222222-2222-4222-8222-222222222222','arquitecto','prepared',now()-interval '30 minutes',now()+interval '2 days'),
 ('33333333-3333-4333-8333-333333333333','arquitecto','prepared',now()-interval '30 minutes',now()+interval '2 days');
INSERT INTO cotironda_piloto_privado.invitations VALUES
 ('11111111-1111-4111-8111-111111111111','corralon_ailin','prepared'),
 ('22222222-2222-4222-8222-222222222222','corralon_ailin','prepared'),
 ('33333333-3333-4333-8333-333333333333','corralon_ailin','prepared');
INSERT INTO cotironda_piloto_privado.ai_shadow_requests_mvp221 VALUES
 ('11111111-1111-4111-8111-111111111111','shadow'),
 ('33333333-3333-4333-8333-333333333333','shadow');
INSERT INTO cotironda_piloto_privado.ai_dispatch_jobs_mvp222 VALUES
 ('11111111-1111-4111-8111-111111111111','corralon_ailin','api_accepted','whapi-ai-msg-12345',now()-interval '12 minutes');
INSERT INTO cotironda_piloto_privado.whapi_inbox
(message_hmac,chat_hmac,participant_key,kind,received_at,processing_state,request_id,plaintext_sha256)
SELECT repeat(k,64),supplier,'corralon_ailin','text',now()-interval '2 minutes','needs_review',NULL,
 encode(sha256(convert_to('cemento 8000 bolsa','UTF8')),'hex')
 FROM (VALUES('d',repeat('b',64)),('e',repeat('b',64)),('f',repeat('b',64)),
             ('0',repeat('c',64)),('1',repeat('b',64)),('2',repeat('b',64))) v(k,supplier);
-- Alterar remitente del mensaje g a segundo proveedor; nunca usar la cita de Ailín.
UPDATE cotironda_piloto_privado.whapi_inbox SET participant_key='corralon_nahuel'
 WHERE message_hmac=repeat('0',64);

DO $tests$
DECLARE res jsonb; target uuid;
BEGIN
 -- Ronda IA aceptada + segunda legacy PREPARADA pero NO enviada: solo IA es candidata.
 res:=public.cotironda_piloto_ia_link_supplier_mvp225(repeat('d',64),repeat('b',64),NULL,'cemento 8000 bolsa');
 IF res->>'state'<>'linked_for_semantic_review'
  OR res->>'association'<>'single_active_round'
  OR res->>'request_id'<>'11111111-1111-4111-8111-111111111111'
 THEN RAISE EXCEPTION 'mvp236 prepared legacy stole candidate: %',res; END IF;
 -- Repetición del mismo mensaje: no crea un segundo vínculo.
 res:=public.cotironda_piloto_ia_link_supplier_mvp225(repeat('d',64),repeat('b',64),NULL,'cemento 8000 bolsa');
 IF res->>'state'<>'already_linked' THEN RAISE EXCEPTION 'mvp236 replay duplicated: %',res;END IF;
 -- Se acepta LEGACY de verdad: ahora hay dos rondas candidatas y no se adjudica arbitrariamente.
 INSERT INTO cotironda_piloto_privado.whapi_outbox VALUES
 ('22222222-2222-4222-8222-222222222222','corralon_ailin','api_accepted','whapi-legacy-54321',now()-interval '10 minutes');
 res:=public.cotironda_piloto_ia_link_supplier_mvp225(repeat('e',64),repeat('b',64),NULL,'cemento 8000 bolsa');
 IF res->>'state'<>'ambiguous_round' THEN RAISE EXCEPTION 'mvp236 missed real ambiguity: %',res;END IF;
 IF (SELECT request_id FROM cotironda_piloto_privado.whapi_inbox
     WHERE message_hmac=repeat('e',64)) IS NOT NULL
 THEN RAISE EXCEPTION 'mvp236 ambiguous message assigned';END IF;
 -- Mensaje que cita explícitamente al PDF IA: vence ambigüedad sin cruzar clientes.
 res:=public.cotironda_piloto_ia_link_supplier_mvp225(repeat('f',64),repeat('b',64),'whapi-ai-msg-12345','cemento 8000 bolsa');
 IF res->>'state'<>'linked_for_semantic_review'
  OR res->>'request_id'<>'11111111-1111-4111-8111-111111111111'
  OR res->>'association'<>'quoted_whapi_id'
 THEN RAISE EXCEPTION 'mvp236 quoted source mismatch: %',res; END IF;
 -- El segundo proveedor no puede robar un ID Whapi de Ailín.
 res:=public.cotironda_piloto_ia_link_supplier_mvp225(repeat('0',64),repeat('c',64),'whapi-ai-msg-12345','cemento 8000 bolsa');
 IF res->>'state'<>'not_matched' THEN RAISE EXCEPTION 'mvp236 cross supplier misassigned: %',res;END IF;
 -- Una cita inventada por el remitente nunca se interpreta como autorización.
 res:=public.cotironda_piloto_ia_link_supplier_mvp225(repeat('1',64),repeat('b',64),'whapi-false-12345','cemento 8000 bolsa');
 IF res->>'state'<>'not_matched' THEN RAISE EXCEPTION 'mvp236 unknown quote misassigned: %',res;END IF;
 -- Dos trabajos IA aceptados sin quote = situación ambigua aun con un solo legacy.
 INSERT INTO cotironda_piloto_privado.ai_dispatch_jobs_mvp222 VALUES
 ('33333333-3333-4333-8333-333333333333','corralon_ailin','api_accepted','whapi-ai-33333333',now()-interval '8 minutes');
 res:=public.cotironda_piloto_ia_link_supplier_mvp225(repeat('2',64),repeat('b',64),NULL,'cemento 8000 bolsa');
 IF res->>'state'<>'ambiguous_round' THEN RAISE EXCEPTION 'mvp236 multiple IA rounds not protected: %',res;END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.ai_supplier_links_mvp225)<>2
 THEN RAISE EXCEPTION 'mvp236 created unauthorized link';END IF;
 -- La ambigüedad queda en registro privado sin ronda sugerida ni precio.
 IF (SELECT count(*) FROM cotironda_piloto_privado.ai_supplier_unresolved_mvp237)<>4
 THEN RAISE EXCEPTION 'mvp237 unresolved sources not persisted';END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.ai_supplier_unresolved_mvp237
      WHERE state='ambiguous_round')<>2
 THEN RAISE EXCEPTION 'mvp237 ambiguous sources missing';END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.ai_supplier_unresolved_mvp237
      WHERE state='not_matched')<>2
 THEN RAISE EXCEPTION 'mvp237 no_match sources missing';END IF;
 res:=public.cotironda_piloto_ia_link_supplier_mvp225(repeat('e',64),repeat('b',64),NULL,'cemento 8000 bolsa');
 IF res->>'state'<>'ambiguous_round' OR
    (SELECT count(*) FROM cotironda_piloto_privado.ai_supplier_unresolved_mvp237)<>4
 THEN RAISE EXCEPTION 'mvp237 duplicate unresolved source';END IF;
 IF (SELECT relrowsecurity FROM pg_class
     WHERE oid='cotironda_piloto_privado.ai_supplier_unresolved_mvp237'::regclass) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'mvp237 no RLS';END IF;
 IF has_table_privilege('anon','cotironda_piloto_privado.ai_supplier_unresolved_mvp237','SELECT')
 OR has_table_privilege('authenticated','cotironda_piloto_privado.ai_supplier_unresolved_mvp237','SELECT')
 OR has_table_privilege('service_role','cotironda_piloto_privado.ai_supplier_unresolved_mvp237','SELECT')
 THEN RAISE EXCEPTION 'mvp237 ledger exposed';END IF;
 IF has_function_privilege('anon','public.cotironda_piloto_ia_link_supplier_mvp225(text,text,text,text)','EXECUTE')
 OR has_function_privilege('authenticated','public.cotironda_piloto_ia_link_supplier_mvp225(text,text,text,text)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.cotironda_piloto_ia_link_supplier_mvp225(text,text,text,text)','EXECUTE')
 THEN RAISE EXCEPTION 'mvp236 unsafe privileges'; END IF;
END $tests$;
SELECT 'PASS 7 cases + private unresolved ledger: deliveries, ambiguity, exact quotes, isolation, idempotence and ACL' as result;

-- La fuente "e" es ambigua entre una solicitud IA y otra LEGACY válida.
INSERT INTO cotironda_piloto_privado.whapi_inbox
 (message_hmac,chat_hmac,participant_key,kind,received_at,processing_state,
  request_id,plaintext_sha256)
VALUES
 (repeat('3',64),repeat('b',64),'corralon_ailin','text',now(),
  'needs_review',NULL,
  encode(sha256(convert_to('Es de este pedido','UTF8')),'hex')),
 (repeat('4',64),repeat('c',64),'corralon_nahuel','text',now(),
  'needs_review',NULL,
  encode(sha256(convert_to('Es de este pedido','UTF8')),'hex'));
DO $mvp239$
DECLARE r jsonb;n integer;
BEGIN
 UPDATE cotironda_piloto_privado.integration_flags SET whatsapp_outbound_enabled=false WHERE only_row;
 r:=public.cotironda_piloto_ia_reserve_clarification_mvp239(repeat('e',64),repeat('b',64));
 IF r->>'state'<>'disabled' THEN RAISE EXCEPTION 'mvp239 ignored outbound gate: %',r;END IF;
 UPDATE cotironda_piloto_privado.integration_flags SET whatsapp_outbound_enabled=true WHERE only_row;
 r:=public.cotironda_piloto_ia_reserve_clarification_mvp239(repeat('e',64),repeat('b',64));
 IF r->>'state'<>'reserved' THEN RAISE EXCEPTION 'mvp239 prompt not reserved: %',r;END IF;
 r:=public.cotironda_piloto_ia_reserve_clarification_mvp239(repeat('e',64),repeat('b',64));
 IF r->>'state'<>'already_reserved' THEN RAISE EXCEPTION 'mvp239 prompt replay: %',r;END IF;
 r:=public.cotironda_piloto_ia_finish_clarification_mvp239(repeat('e',64),'uncertain');
 IF r->>'state'<>'recorded' THEN RAISE EXCEPTION 'mvp239 uncertain not terminal: %',r;END IF;
 r:=public.cotironda_piloto_ia_finish_clarification_mvp239(repeat('e',64),'api_accepted');
 IF r->>'state'<>'not_leased' THEN RAISE EXCEPTION 'mvp239 uncertain retried: %',r;END IF;
 r:=public.cotironda_piloto_ia_resolve_clarification_mvp239(
  repeat('3',64),repeat('b',64),'whapi-invented-54321','Es de este pedido');
 IF r->>'state'<>'quoted_request_not_unique' THEN
 RAISE EXCEPTION 'mvp239 false ID attributed: %',r;END IF;
 r:=public.cotironda_piloto_ia_resolve_clarification_mvp239(
  repeat('4',64),repeat('c',64),'whapi-ai-msg-12345','Es de este pedido');
 IF r->>'state'<>'quoted_request_not_unique' THEN
 RAISE EXCEPTION 'mvp239 wrong supplier inherited quote: %',r;END IF;
 r:=public.cotironda_piloto_ia_resolve_clarification_mvp239(
  repeat('3',64),repeat('b',64),'whapi-ai-msg-12345','Es de este pedido');
 IF r->>'state'<>'ambiguous_source' THEN
 RAISE EXCEPTION 'mvp239 guessed among multiple pending sources: %',r;END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.ai_supplier_links_mvp225)<>2
 THEN RAISE EXCEPTION 'mvp239 false early link';END IF;
END $mvp239$;
-- En una revisión aislada se cierran otros dos pendientes sintéticos:
-- solo un mensaje de origen queda abierto para el proveedor.
DELETE FROM cotironda_piloto_privado.ai_supplier_unresolved_mvp237
 WHERE message_hmac IN(repeat('1',64),repeat('2',64));
-- La cotización fuente precede esta invitación: citarla después no autoriza
-- a atribuir retroactivamente el presupuesto al pedido nuevo.
UPDATE cotironda_piloto_privado.ai_dispatch_jobs_mvp222
 SET whapi_message_id='whapi-late-33333',
     finished_at=clock_timestamp()-interval '30 seconds'
 WHERE request_id='33333333-3333-4333-8333-333333333333';
DO $late_quote$
DECLARE r jsonb;
BEGIN
 r:=public.cotironda_piloto_ia_resolve_clarification_mvp239(
  repeat('3',64),repeat('b',64),'whapi-late-33333','Es de este pedido');
 IF r->>'state'<>'invitation_after_source'
 THEN RAISE EXCEPTION 'mvp239 linked quote before invitation: %',r;END IF;
 IF (SELECT request_id FROM cotironda_piloto_privado.whapi_inbox
     WHERE message_hmac=repeat('e',64)) IS NOT NULL
 THEN RAISE EXCEPTION 'mvp239 old source assigned retroactively';END IF;
END $late_quote$;
UPDATE cotironda_piloto_privado.ai_dispatch_jobs_mvp222
 SET whapi_message_id='whapi-ai-33333333',
     finished_at=clock_timestamp()-interval '8 minutes'
 WHERE request_id='33333333-3333-4333-8333-333333333333';
DO $resolvetext$
DECLARE r jsonb;
BEGIN
 r:=public.cotironda_piloto_ia_resolve_clarification_mvp239(
  repeat('3',64),repeat('b',64),'whapi-ai-msg-12345','Es de este pedido');
 IF r->>'state'<>'resolved' OR r->>'source_hmac'<>repeat('e',64)
   OR r->>'source_kind'<>'text'
 THEN RAISE EXCEPTION 'mvp239 exact clarification missing: %',r;END IF;
 IF (SELECT resolved_request_id FROM cotironda_piloto_privado.ai_supplier_unresolved_mvp237
    WHERE message_hmac=repeat('e',64))
    IS DISTINCT FROM '11111111-1111-4111-8111-111111111111'::uuid
 OR (SELECT association FROM cotironda_piloto_privado.ai_supplier_links_mvp225
    WHERE message_hmac=repeat('e',64))<>'clarified_supplier_reply'
 OR (SELECT request_id FROM cotironda_piloto_privado.whapi_inbox
    WHERE message_hmac=repeat('e',64))
    IS DISTINCT FROM '11111111-1111-4111-8111-111111111111'::uuid
 THEN RAISE EXCEPTION 'mvp239 wrong original source assignment';END IF;
 r:=public.cotironda_piloto_ia_resolve_clarification_mvp239(
  repeat('3',64),repeat('b',64),'whapi-ai-msg-12345','Es de este pedido');
 IF r->>'state'<>'not_authorized'
 THEN RAISE EXCEPTION 'mvp239 reply duplicated: %',r;END IF;
END $resolvetext$;

INSERT INTO cotironda_piloto_privado.whapi_inbox
 (message_hmac,chat_hmac,participant_key,kind,received_at,processing_state,
  request_id,plaintext_sha256)
VALUES
 (repeat('5',64),repeat('b',64),'corralon_ailin','document',now()-interval '2 minutes',
  'needs_review',NULL,repeat('f',64)),
 (repeat('6',64),repeat('b',64),'corralon_ailin','text',now(),
  'needs_review',NULL,encode(sha256(convert_to('Es de este pedido','UTF8')),'hex'));
INSERT INTO cotironda_piloto_privado.media_archive_mvp095
(message_hmac,chat_hmac,participant_key,state,content_sha256,request_id)
VALUES (repeat('5',64),repeat('b',64),'corralon_ailin','stored',repeat('f',64),NULL);
INSERT INTO cotironda_piloto_privado.ai_supplier_unresolved_mvp237(
 message_hmac,supplier_key,source_sha256,kind,state,candidate_count,association_method)
VALUES(repeat('5',64),'corralon_ailin',repeat('f',64),'document',
 'ambiguous_round',2,'single_active_round');
DO $resolvemedia$
DECLARE r jsonb;
BEGIN
 r:=public.cotironda_piloto_ia_resolve_clarification_mvp239(
  repeat('6',64),repeat('b',64),'whapi-ai-msg-12345','Es de este pedido');
 IF r->>'state'<>'resolved' OR r->>'source_hmac'<>repeat('5',64)
   OR r->>'source_kind'<>'document'
 THEN RAISE EXCEPTION 'mvp239 attachment not resolved: %',r;END IF;
 IF (SELECT request_id FROM cotironda_piloto_privado.media_archive_mvp095
    WHERE message_hmac=repeat('5',64))
    IS DISTINCT FROM '11111111-1111-4111-8111-111111111111'::uuid
 OR (SELECT association FROM cotironda_piloto_privado.ai_supplier_links_mvp225
    WHERE message_hmac=repeat('5',64))<>'clarified_supplier_reply'
 THEN RAISE EXCEPTION 'mvp239 media archive and inbox not bound';END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.ai_supplier_links_mvp225
     WHERE message_hmac=repeat('5',64))<>1
 THEN RAISE EXCEPTION 'mvp239 duplicate media';END IF;
 IF has_function_privilege('anon','public.cotironda_piloto_ia_resolve_clarification_mvp239(text,text,text,text)','EXECUTE')
 OR has_function_privilege('authenticated','public.cotironda_piloto_ia_reserve_clarification_mvp239(text,text)','EXECUTE')
 OR has_table_privilege('service_role','cotironda_piloto_privado.ai_supplier_clarifications_mvp239','SELECT')
 OR (SELECT relrowsecurity FROM pg_class
     WHERE oid='cotironda_piloto_privado.ai_supplier_clarifications_mvp239'::regclass) IS DISTINCT FROM TRUE
 THEN RAISE EXCEPTION 'mvp239 unsafe ACL';END IF;
END $resolvemedia$;
SELECT 'PASS MVP239: quoted exact ID, multiple sources fail closed, text+media, no resend, supplier isolation, ACL' AS result;
ROLLBACK;
