-- MVP326 isolated PG17; all data fictitious, complete ROLLBACK.
-- No calls to Whapi, OpenAI, real Supabase or storage.
\set ON_ERROR_STOP on
BEGIN;
DO $roles$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN;END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN;END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN;END IF;
END $roles$;
CREATE SCHEMA cotironda_piloto_privado;
CREATE TABLE cotironda_piloto_privado.participants(
 key text PRIMARY KEY,participant_role text,consent_at timestamptz,
 opted_out_at timestamptz,chat_hmac text
);
CREATE TABLE cotironda_piloto_privado.requests(
 id uuid PRIMARY KEY,buyer_key text,state text
);
CREATE TABLE cotironda_piloto_privado.ai_shadow_requests_mvp221(request_id uuid);
CREATE TABLE cotironda_piloto_privado.buyer_tracking_mvp091(
 request_id uuid,token_hash text,revoked_at timestamptz,expires_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.ai_supplier_links_mvp225(
 message_hmac text PRIMARY KEY,request_id uuid,supplier_key text,
 source_sha256 text,kind text
);
CREATE TABLE cotironda_piloto_privado.whapi_inbox(
 message_hmac text PRIMARY KEY,request_id uuid,participant_key text,
 chat_hmac text,received_at timestamptz,kind text,
 plaintext_sha256 text
);
CREATE TABLE cotironda_piloto_privado.ai_dispatch_jobs_mvp222(
 request_id uuid,supplier_key text,state text,finished_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.ai_supplier_review_mvp227(
 message_hmac text PRIMARY KEY,request_id uuid,supplier_key text,
 source_sha256 text,state text,summary jsonb,finished_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.media_archive_mvp095(
 message_hmac text,request_id uuid,participant_key text,chat_hmac text,
 state text,content_sha256 text
);
\ir ../../piloto/mvp326_estado_revision_comercial_comprador.sql
INSERT INTO cotironda_piloto_privado.participants
 VALUES('buyer','buyer',now(),NULL,repeat('b',64)),
 ('supplier_a','supplier',now(),NULL,repeat('a',64)),
 ('supplier_b','supplier',now(),NULL,repeat('c',64)),
 ('supplier_c','supplier',now(),NULL,repeat('d',64)),
 ('supplier_d','supplier',now(),NULL,repeat('e',64)),
 ('other_buyer','buyer',now(),NULL,repeat('f',64));
INSERT INTO cotironda_piloto_privado.requests VALUES
 ('11111111-1111-4111-8111-111111111111','buyer','prepared'),
 ('22222222-2222-4222-8222-222222222222','other_buyer','prepared');
INSERT INTO cotironda_piloto_privado.ai_shadow_requests_mvp221 VALUES
 ('11111111-1111-4111-8111-111111111111'),
 ('22222222-2222-4222-8222-222222222222');
INSERT INTO cotironda_piloto_privado.buyer_tracking_mvp091 VALUES
 ('11111111-1111-4111-8111-111111111111',repeat('1',64),NULL,now()+interval '2 days'),
 ('22222222-2222-4222-8222-222222222222',repeat('2',64),NULL,now()+interval '2 days');
INSERT INTO cotironda_piloto_privado.ai_dispatch_jobs_mvp222
 VALUES('11111111-1111-4111-8111-111111111111','supplier_a','api_accepted',now()-interval '2 hours'),
 ('11111111-1111-4111-8111-111111111111','supplier_b','api_accepted',now()-interval '2 hours'),
 ('11111111-1111-4111-8111-111111111111','supplier_c','api_accepted',now()-interval '2 hours'),
 ('11111111-1111-4111-8111-111111111111','supplier_d','api_accepted',now()-interval '2 hours');
INSERT INTO cotironda_piloto_privado.whapi_inbox
 VALUES(repeat('a',64),'11111111-1111-4111-8111-111111111111','supplier_a',
 repeat('a',64),now()-interval '40 minutes','text',repeat('a',64)),
 (repeat('b',64),'11111111-1111-4111-8111-111111111111','supplier_b',
 repeat('c',64),now()-interval '35 minutes','text',repeat('b',64)),
 (repeat('c',64),'11111111-1111-4111-8111-111111111111','supplier_c',
 repeat('d',64),now()-interval '30 minutes','text',repeat('c',64)),
 (repeat('d',64),'11111111-1111-4111-8111-111111111111','supplier_d',
 repeat('e',64),now()-interval '25 minutes','text',repeat('d',64));
INSERT INTO cotironda_piloto_privado.ai_supplier_links_mvp225
 VALUES(repeat('a',64),'11111111-1111-4111-8111-111111111111','supplier_a',repeat('a',64),'text'),
 (repeat('b',64),'11111111-1111-4111-8111-111111111111','supplier_b',repeat('b',64),'text'),
 (repeat('c',64),'11111111-1111-4111-8111-111111111111','supplier_c',repeat('c',64),'text'),
 (repeat('d',64),'11111111-1111-4111-8111-111111111111','supplier_d',repeat('d',64),'text');
INSERT INTO cotironda_piloto_privado.ai_supplier_review_mvp227
 VALUES(repeat('a',64),'11111111-1111-4111-8111-111111111111','supplier_a',
 repeat('a',64),'review',NULL,now()-interval '20 minutes'),
 (repeat('c',64),'11111111-1111-4111-8111-111111111111','supplier_c',
 repeat('c',64),'verified','{"moneda":"ARS"}'::jsonb,now()-interval '19 minutes');
-- D is a tampered source and must NOT be considered linked.
UPDATE cotironda_piloto_privado.whapi_inbox
 SET plaintext_sha256=repeat('0',64)
 WHERE message_hmac=repeat('d',64);
DO $test$
DECLARE s jsonb;
BEGIN
 s:=public.cotironda_piloto_ia_review_status_mvp326(repeat('1',64));
 IF s->>'state'<>'estado_comercial_sin_precios'
    OR (s->>'vinculados')::int<>3
    OR (s->>'requieren_revision')::int<>1
    OR (s->>'en_proceso')::int<>1
    OR (s->>'verificados')::int<>1
    OR s->>'precios_incluidos'<>'false'
    OR s->>'identidades_reveladas'<>'false'
    OR s->>'reproceso_automatico'<>'false'
 THEN RAISE EXCEPTION 'mvp326_stage_counts_wrong_%',s;END IF;
 IF s::text ~ 'supplier|message_hmac|source_sha|reason|10000|telefono'
 THEN RAISE EXCEPTION 'mvp326_sensitive_metadata_leak';END IF;
 IF public.cotironda_piloto_ia_review_status_mvp326(repeat('0',64))->>'state'<>'not_found'
 THEN RAISE EXCEPTION 'mvp326_bad_token_disclosed';END IF;
 IF public.cotironda_piloto_ia_review_status_mvp326('bad')->>'state'<>'not_found'
 THEN RAISE EXCEPTION 'mvp326_token_format_not_checked';END IF;
 IF public.cotironda_piloto_ia_review_status_mvp326(repeat('2',64))->>'vinculados'<>'0'
 THEN RAISE EXCEPTION 'mvp326_cross_buyer_leak';END IF;
 IF has_function_privilege('anon','public.cotironda_piloto_ia_review_status_mvp326(text)','EXECUTE')
 OR has_function_privilege('authenticated','public.cotironda_piloto_ia_review_status_mvp326(text)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.cotironda_piloto_ia_review_status_mvp326(text)','EXECUTE')
 THEN RAISE EXCEPTION 'mvp326_bad_rpc_acl';END IF;
END $test$;
-- A new message supersedes the old terminated review: it is PROCESSING.
INSERT INTO cotironda_piloto_privado.whapi_inbox
 VALUES(repeat('e',64),'11111111-1111-4111-8111-111111111111','supplier_a',
 repeat('a',64),now()-interval '2 minutes','text',repeat('e',64));
INSERT INTO cotironda_piloto_privado.ai_supplier_links_mvp225
 VALUES(repeat('e',64),'11111111-1111-4111-8111-111111111111','supplier_a',repeat('e',64),'text');
DO $new$
DECLARE s jsonb;
BEGIN
 s:=public.cotironda_piloto_ia_review_status_mvp326(repeat('1',64));
 IF (s->>'requieren_revision')::int<>0 OR
    (s->>'en_proceso')::int<>2 OR
    (s->>'verificados')::int<>1
 THEN RAISE EXCEPTION 'mvp326_old_terminal_review_reappeared_%',s;END IF;
END $new$;
-- This review finishes: back to terminal review; do not run any AI.
INSERT INTO cotironda_piloto_privado.ai_supplier_review_mvp227
 VALUES(repeat('e',64),'11111111-1111-4111-8111-111111111111','supplier_a',
 repeat('e',64),'review',NULL,now());
DO $again$
DECLARE s jsonb;
BEGIN
 s:=public.cotironda_piloto_ia_review_status_mvp326(repeat('1',64));
 IF (s->>'requieren_revision')::int<>1 OR
    (s->>'en_proceso')::int<>1
 THEN RAISE EXCEPTION 'mvp326_latest_review_not_terminal_%',s;END IF;
END $again$;
UPDATE cotironda_piloto_privado.buyer_tracking_mvp091
 SET revoked_at=now() WHERE token_hash=repeat('1',64);
DO $revoke$
BEGIN
 IF public.cotironda_piloto_ia_review_status_mvp326(repeat('1',64))->>'state'<>'not_found'
 THEN RAISE EXCEPTION 'mvp326_revocation_not_applied';END IF;
END $revoke$;
UPDATE cotironda_piloto_privado.buyer_tracking_mvp091
 SET revoked_at=NULL WHERE token_hash=repeat('1',64);
UPDATE cotironda_piloto_privado.requests SET state='cancelled'
 WHERE id='11111111-1111-4111-8111-111111111111';
DO $cancel$
BEGIN
 IF public.cotironda_piloto_ia_review_status_mvp326(repeat('1',64))->>'state'<>'cancelled'
 THEN RAISE EXCEPTION 'mvp326_cancelled_not_restricted';END IF;
END $cancel$;
ROLLBACK;
