-- MVP238: PostgreSQL 17 aislado. Ningún envío, fuente sintética. ROLLBACK.
BEGIN;
DO $roles$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN;END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN;END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN;END IF;
END $roles$;
CREATE SCHEMA cotironda_piloto_privado;
CREATE TABLE cotironda_piloto_privado.participants(
 key text PRIMARY KEY,chat_hmac text,participant_role text,
 consent_at timestamptz,opted_out_at timestamptz);
CREATE TABLE cotironda_piloto_privado.requests(
 id uuid PRIMARY KEY,buyer_key text,state text,created_at timestamptz,closes_at timestamptz);
CREATE TABLE cotironda_piloto_privado.invitations(
 request_id uuid,supplier_key text,state text,PRIMARY KEY(request_id,supplier_key));
CREATE TABLE cotironda_piloto_privado.ai_dispatch_jobs_mvp222(
 request_id uuid,supplier_key text,state text,finished_at timestamptz);
CREATE TABLE cotironda_piloto_privado.whapi_outbox(
 request_id uuid,supplier_key text,state text,sent_at timestamptz);
CREATE TABLE cotironda_piloto_privado.whapi_inbox(
 message_hmac text PRIMARY KEY,chat_hmac text,participant_key text,
 kind text,processing_state text,request_id uuid,
 plaintext_sha256 text,received_at timestamptz,source_unix bigint);
CREATE TABLE cotironda_piloto_privado.media_archive_mvp095(
 message_hmac text PRIMARY KEY,chat_hmac text,participant_key text,
 state text,request_id uuid,content_sha256 text,storage_path text,size_bytes integer);
CREATE TABLE cotironda_piloto_privado.ai_supplier_links_mvp225(
 message_hmac text PRIMARY KEY,request_id uuid,supplier_key text,
 kind text,association text,source_sha256 text,
 status text NOT NULL DEFAULT 'awaiting_semantic_review',
 CONSTRAINT ai_supplier_links_mvp225_association_check
 CHECK(association IN('quoted_whapi_id','single_active_round')));
CREATE TABLE cotironda_piloto_privado.ai_supplier_review_mvp227(message_hmac text PRIMARY KEY);
CREATE TABLE cotironda_piloto_privado.ai_supplier_unresolved_mvp237(
 message_hmac text PRIMARY KEY,supplier_key text,source_sha256 text,
 kind text,state text CHECK(state IN('ambiguous_round','not_matched',
 'media_context_conflict')),candidate_count integer,
 association_method text CHECK(association_method IN('quoted_whapi_id',
 'single_active_round')),recorded_at timestamptz DEFAULT clock_timestamp()
);
\ir ../../piloto/mvp238_aviso_proveedor_adjunto_una_ronda.sql

INSERT INTO cotironda_piloto_privado.participants VALUES
 ('arquitecto',repeat('8',64),'buyer',now(),NULL),
 ('corralon_ailin',repeat('9',64),'supplier',now(),NULL),
 ('corralon_nahuel',repeat('7',64),'supplier',now(),NULL);
INSERT INTO cotironda_piloto_privado.requests VALUES
 ('11111111-1111-4111-8111-111111111111','arquitecto','prepared',now()-interval '40 minutes',now()+interval '2 days'),
 ('22222222-2222-4222-8222-222222222222','arquitecto','prepared',now()-interval '40 minutes',now()+interval '2 days');
INSERT INTO cotironda_piloto_privado.invitations VALUES
 ('11111111-1111-4111-8111-111111111111','corralon_ailin','prepared'),
 ('22222222-2222-4222-8222-222222222222','corralon_ailin','prepared');
INSERT INTO cotironda_piloto_privado.ai_dispatch_jobs_mvp222 VALUES
 ('11111111-1111-4111-8111-111111111111','corralon_ailin','api_accepted',now()-interval '20 minutes');
-- Mensaje avisando que enviará el PDF, escrito por proveedor autenticado.
INSERT INTO cotironda_piloto_privado.whapi_inbox VALUES
 (repeat('a',64),repeat('9',64),'corralon_ailin','text','needs_review',
  '11111111-1111-4111-8111-111111111111',
  encode(sha256(convert_to('Te paso el presupuesto','UTF8')),'hex'),
  now()-interval '5 minutes',
  extract(epoch from now()-interval '5 minutes')::bigint);
INSERT INTO cotironda_piloto_privado.ai_supplier_links_mvp225
 (message_hmac,request_id,supplier_key,kind,association,source_sha256)
SELECT message_hmac,request_id,participant_key,kind,'single_active_round',plaintext_sha256
FROM cotironda_piloto_privado.whapi_inbox WHERE message_hmac=repeat('a',64);
-- Archivo original, previamente guardado y verificado en Storage.
INSERT INTO cotironda_piloto_privado.whapi_inbox VALUES
 (repeat('b',64),repeat('9',64),'corralon_ailin','document','needs_review',NULL,
  repeat('f',64),now()-interval '4 minutes',
  extract(epoch from now()-interval '4 minutes')::bigint);
INSERT INTO cotironda_piloto_privado.media_archive_mvp095 VALUES
 (repeat('b',64),repeat('9',64),'corralon_ailin','stored',NULL,
  repeat('f',64),'media/'||repeat('b',64),1024);
DO $cases$
DECLARE r jsonb; n integer;
BEGIN
 r:=public.cotironda_piloto_ia_note_supplier_preamble_mvp238(
   repeat('a',64),repeat('9',64),'Te mando la cotización');
 IF r->>'state'<>'not_eligible' THEN RAISE EXCEPTION 'mvp238 source SHA bypass: %',r;END IF;
 r:=public.cotironda_piloto_ia_note_supplier_preamble_mvp238(
   repeat('a',64),repeat('7',64),'Te paso el presupuesto');
 IF r->>'state'<>'not_eligible' THEN RAISE EXCEPTION 'mvp238 other sender: %',r;END IF;
 r:=public.cotironda_piloto_ia_note_supplier_preamble_mvp238(
   repeat('a',64),repeat('9',64),'Te paso el presupuesto');
 IF r->>'state'<>'noted' THEN RAISE EXCEPTION 'mvp238 preamble not recorded: %',r;END IF;
 r:=public.cotironda_piloto_ia_note_supplier_preamble_mvp238(
   repeat('a',64),repeat('9',64),'Te paso el presupuesto');
 IF r->>'state'<>'already_noted' THEN RAISE EXCEPTION 'mvp238 preamble duplicate: %',r;END IF;
 r:=public.cotironda_piloto_ia_attach_supplier_media_mvp238(
   repeat('b',64),repeat('9',64));
 IF r->>'state'<>'linked_from_preamble' OR r ? 'request_id'
 THEN RAISE EXCEPTION 'mvp238 attachment not linked privately: %',r;END IF;
 IF (SELECT request_id FROM cotironda_piloto_privado.whapi_inbox WHERE message_hmac=repeat('b',64))
   IS DISTINCT FROM '11111111-1111-4111-8111-111111111111'::uuid
 OR (SELECT request_id FROM cotironda_piloto_privado.media_archive_mvp095 WHERE message_hmac=repeat('b',64))
   IS DISTINCT FROM '11111111-1111-4111-8111-111111111111'::uuid
 OR (SELECT association FROM cotironda_piloto_privado.ai_supplier_links_mvp225 WHERE message_hmac=repeat('b',64))
   <>'prior_supplier_preamble'
 THEN RAISE EXCEPTION 'mvp238 file and original not persisted atomically';END IF;
 r:=public.cotironda_piloto_ia_attach_supplier_media_mvp238(repeat('b',64),repeat('9',64));
 IF r->>'state'<>'already_attached' THEN RAISE EXCEPTION 'mvp238 media replay: %',r;END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.ai_supplier_links_mvp225 WHERE message_hmac=repeat('b',64))<>1
 THEN RAISE EXCEPTION 'mvp238 duplicate source linked';END IF;
 -- El aviso anterior no se puede volver a gastar para otro archivo.
 INSERT INTO cotironda_piloto_privado.whapi_inbox VALUES
 (repeat('0',64),repeat('9',64),'corralon_ailin','document','needs_review',NULL,
  repeat('f',64),now()-interval '3 minutes',extract(epoch from now()-interval '3 minutes')::bigint);
 INSERT INTO cotironda_piloto_privado.media_archive_mvp095 VALUES
 (repeat('0',64),repeat('9',64),'corralon_ailin','stored',NULL,
  repeat('f',64),'media/'||repeat('0',64),1024);
 r:=public.cotironda_piloto_ia_attach_supplier_media_mvp238(repeat('0',64),repeat('9',64));
 IF r->>'state'<>'no_context' THEN RAISE EXCEPTION 'mvp238 preamble reused: %',r;END IF;
 -- Un proveedor ajeno no hereda el contexto de otro chat.
 INSERT INTO cotironda_piloto_privado.whapi_inbox VALUES
 (repeat('1',64),repeat('7',64),'corralon_nahuel','document','needs_review',NULL,
  repeat('f',64),now()-interval '3 minutes',extract(epoch from now()-interval '3 minutes')::bigint);
 INSERT INTO cotironda_piloto_privado.media_archive_mvp095 VALUES
 (repeat('1',64),repeat('7',64),'corralon_nahuel','stored',NULL,
  repeat('f',64),'media/'||repeat('1',64),1024);
 r:=public.cotironda_piloto_ia_attach_supplier_media_mvp238(repeat('1',64),repeat('7',64));
 IF r->>'state'<>'no_context' THEN RAISE EXCEPTION 'mvp238 other supplier took file: %',r;END IF;
 IF has_function_privilege('anon','public.cotironda_piloto_ia_attach_supplier_media_mvp238(text,text)','EXECUTE')
 OR has_function_privilege('authenticated','public.cotironda_piloto_ia_attach_supplier_media_mvp238(text,text)','EXECUTE')
 OR has_function_privilege('anon','public.cotironda_piloto_ia_note_supplier_preamble_mvp238(text,text,text)','EXECUTE')
 OR has_table_privilege('service_role','cotironda_piloto_privado.ai_supplier_preambles_mvp238','SELECT')
 OR (SELECT relrowsecurity FROM pg_class WHERE oid='cotironda_piloto_privado.ai_supplier_preambles_mvp238'::regclass) IS DISTINCT FROM TRUE
 THEN RAISE EXCEPTION 'mvp238 permissions not isolated';END IF;
END $cases$;
-- Dos avisos simultáneos, aunque el último parezca más próximo.
INSERT INTO cotironda_piloto_privado.whapi_inbox
 (message_hmac,chat_hmac,participant_key,kind,processing_state,request_id,
  plaintext_sha256,received_at,source_unix)
SELECT repeat(c,64),repeat('9',64),'corralon_ailin','text','needs_review',
 '11111111-1111-4111-8111-111111111111',
 encode(sha256(convert_to('Te paso el presupuesto','UTF8')),'hex'),
 now()-delta,extract(epoch from now()-delta)::bigint
FROM (VALUES('c',interval '2 minutes 40 seconds'),
            ('d',interval '2 minutes 20 seconds')) v(c,delta);
INSERT INTO cotironda_piloto_privado.ai_supplier_links_mvp225
(message_hmac,request_id,supplier_key,kind,association,source_sha256)
SELECT message_hmac,request_id,participant_key,kind,'single_active_round',plaintext_sha256
FROM cotironda_piloto_privado.whapi_inbox WHERE message_hmac IN(repeat('c',64),repeat('d',64));
SELECT public.cotironda_piloto_ia_note_supplier_preamble_mvp238(repeat('c',64),repeat('9',64),'Te paso el presupuesto');
SELECT public.cotironda_piloto_ia_note_supplier_preamble_mvp238(repeat('d',64),repeat('9',64),'Te paso el presupuesto');
INSERT INTO cotironda_piloto_privado.whapi_inbox VALUES
(repeat('e',64),repeat('9',64),'corralon_ailin','document','needs_review',NULL,
 repeat('f',64),now()-interval '2 minutes',extract(epoch from now()-interval '2 minutes')::bigint);
INSERT INTO cotironda_piloto_privado.media_archive_mvp095 VALUES
(repeat('e',64),repeat('9',64),'corralon_ailin','stored',NULL,
 repeat('f',64),'media/'||repeat('e',64),1024);
DO $two$
DECLARE r jsonb;
BEGIN
 r:=public.cotironda_piloto_ia_attach_supplier_media_mvp238(repeat('e',64),repeat('9',64));
 IF r->>'state' NOT IN ('context_blocked','ambiguous') THEN
  RAISE EXCEPTION 'mvp238 guessed between two messages: %',r;END IF;
 IF (SELECT request_id FROM cotironda_piloto_privado.whapi_inbox WHERE message_hmac=repeat('e',64)) IS NOT NULL
 THEN RAISE EXCEPTION 'mvp238 assigned despite two pending notices'; END IF;
END $two$;
DELETE FROM cotironda_piloto_privado.ai_supplier_preambles_mvp238
 WHERE preamble_hmac IN(repeat('c',64),repeat('d',64));
-- Aviso y archivo, pero un mensaje intermedio rompe el vínculo.
INSERT INTO cotironda_piloto_privado.whapi_inbox
(message_hmac,chat_hmac,participant_key,kind,processing_state,request_id,plaintext_sha256,received_at,source_unix)
SELECT repeat(k,64),repeat('9',64),'corralon_ailin',kind,'needs_review',rid,sha,now()-delta,
 extract(epoch from now()-delta)::bigint
FROM (VALUES
 ('2','text','11111111-1111-4111-8111-111111111111'::uuid,encode(sha256(convert_to('Te paso el presupuesto','UTF8')),'hex'),interval '90 seconds'),
 ('3','text',NULL::uuid,repeat('1',64),interval '75 seconds'),
 ('4','document',NULL::uuid,repeat('f',64),interval '60 seconds')) v(k,kind,rid,sha,delta);
INSERT INTO cotironda_piloto_privado.ai_supplier_links_mvp225
(message_hmac,request_id,supplier_key,kind,association,source_sha256)
SELECT message_hmac,request_id,participant_key,kind,'single_active_round',plaintext_sha256
FROM cotironda_piloto_privado.whapi_inbox WHERE message_hmac=repeat('2',64);
INSERT INTO cotironda_piloto_privado.media_archive_mvp095 VALUES
 (repeat('4',64),repeat('9',64),'corralon_ailin','stored',NULL,
 repeat('f',64),'media/'||repeat('4',64),1024);
SELECT public.cotironda_piloto_ia_note_supplier_preamble_mvp238(repeat('2',64),repeat('9',64),'Te paso el presupuesto');
DO $interleaved$
DECLARE r jsonb;
BEGIN
 r:=public.cotironda_piloto_ia_attach_supplier_media_mvp238(repeat('4',64),repeat('9',64));
 IF r->>'state' NOT IN ('context_blocked','ambiguous')
 THEN RAISE EXCEPTION 'mvp238 ignored intervening message: %',r;END IF;
END $interleaved$;
DELETE FROM cotironda_piloto_privado.ai_supplier_preambles_mvp238
 WHERE preamble_hmac=repeat('2',64);
-- Nueva invitación aceptada después del aviso, antes del archivo: no atribuir.
INSERT INTO cotironda_piloto_privado.whapi_inbox
(message_hmac,chat_hmac,participant_key,kind,processing_state,request_id,plaintext_sha256,received_at,source_unix)
SELECT repeat(k,64),repeat('9',64),'corralon_ailin',kind,'needs_review',rid,sha,now()-delta,
 extract(epoch from now()-delta)::bigint
FROM (VALUES
 ('5','text','11111111-1111-4111-8111-111111111111'::uuid,encode(sha256(convert_to('Te paso el presupuesto','UTF8')),'hex'),interval '50 seconds'),
 ('6','document',NULL::uuid,repeat('f',64),interval '10 seconds')) v(k,kind,rid,sha,delta);
INSERT INTO cotironda_piloto_privado.ai_supplier_links_mvp225
(message_hmac,request_id,supplier_key,kind,association,source_sha256)
SELECT message_hmac,request_id,participant_key,kind,'single_active_round',plaintext_sha256
FROM cotironda_piloto_privado.whapi_inbox WHERE message_hmac=repeat('5',64);
INSERT INTO cotironda_piloto_privado.media_archive_mvp095 VALUES
 (repeat('6',64),repeat('9',64),'corralon_ailin','stored',NULL,
 repeat('f',64),'media/'||repeat('6',64),1024);
SELECT public.cotironda_piloto_ia_note_supplier_preamble_mvp238(repeat('5',64),repeat('9',64),'Te paso el presupuesto');
INSERT INTO cotironda_piloto_privado.ai_dispatch_jobs_mvp222 VALUES
 ('22222222-2222-4222-8222-222222222222','corralon_ailin',
 'api_accepted',now()-interval '25 seconds');
DO $new_invite$
DECLARE r jsonb;
BEGIN
 r:=public.cotironda_piloto_ia_attach_supplier_media_mvp238(repeat('6',64),repeat('9',64));
 IF r->>'state' NOT IN ('context_blocked','ambiguous')
 THEN RAISE EXCEPTION 'mvp238 new invitation ignored: %',r;END IF;
END $new_invite$;
DO $ledger$
DECLARE n integer;
BEGIN
 SELECT count(*) INTO n FROM cotironda_piloto_privado.ai_supplier_unresolved_mvp237
 WHERE state='context_blocked' AND
 message_hmac IN(repeat('e',64),repeat('4',64),repeat('6',64))
 AND association_method='prior_supplier_preamble'
 AND source_sha256=repeat('f',64);
 IF n<>3 THEN RAISE EXCEPTION 'mvp238 ambiguous media not audited privately: %',n;END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.ai_supplier_unresolved_mvp237)<>3
 THEN RAISE EXCEPTION 'mvp238 ledger unexpected records';END IF;
END $ledger$;
SELECT 'PASS MVP238: SHA, sender, exact round, one-use, replay, double context, interleaving, new dispatch, private ledger and ACL' as result;
ROLLBACK;