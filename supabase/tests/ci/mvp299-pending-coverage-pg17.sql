-- MVP299: entirely synthetic PostgreSQL 17, transaction + ROLLBACK.
-- Cannot touch live Supabase or send any message.
BEGIN;
DO $roles$ BEGIN
 CREATE ROLE anon NOLOGIN;
 CREATE ROLE authenticated NOLOGIN;
 CREATE ROLE service_role NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;END $roles$;
CREATE SCHEMA cotironda_piloto_privado;
CREATE TABLE cotironda_piloto_privado.requests(
 id uuid PRIMARY KEY,state text,buyer_key text);
CREATE TABLE cotironda_piloto_privado.participants(
 key text PRIMARY KEY,participant_role text,chat_hmac text,
 consent_at timestamptz,opted_out_at timestamptz);
CREATE TABLE cotironda_piloto_privado.buyer_tracking_mvp091(
 token_hash text PRIMARY KEY,request_id uuid,revoked_at timestamptz,
 expires_at timestamptz);
CREATE TABLE cotironda_piloto_privado.ai_shadow_requests_mvp221(request_id uuid);
CREATE TABLE cotironda_piloto_privado.ai_supplier_links_mvp225(
 supplier_key text,request_id uuid,message_hmac text,source_sha256 text,kind text);
CREATE TABLE cotironda_piloto_privado.whapi_inbox(
 message_hmac text,request_id uuid,participant_key text,chat_hmac text,
 received_at timestamptz,plaintext_sha256 text,kind text);
CREATE TABLE cotironda_piloto_privado.ai_dispatch_jobs_mvp222(
 request_id uuid,supplier_key text,state text,finished_at timestamptz);
CREATE TABLE cotironda_piloto_privado.ai_supplier_review_mvp227(
 message_hmac text,request_id uuid,supplier_key text,source_sha256 text,
 state text,reason_code text,summary jsonb,finished_at timestamptz);
CREATE TABLE cotironda_piloto_privado.supplier_source_versions_mvp261(
 request_id uuid,supplier_key text,message_hmac text,
 source_sha256 text,revision_no integer);
CREATE TABLE cotironda_piloto_privado.ai_shadow_destinos_mvp221(
 request_id uuid,supplier_key text,line_no integer);
CREATE TABLE cotironda_piloto_privado.ai_shadow_rubros_mvp221(
 request_id uuid,line_no integer,rubro text);
CREATE TABLE cotironda_piloto_privado.media_archive_mvp095(
 message_hmac text,chat_hmac text,participant_key text,
 request_id uuid,state text,content_sha256 text);
CREATE TABLE cotironda_piloto_privado.supplier_source_checks_mvp106(
 message_hmac text,source_sha256 text,state text,reason text);
CREATE TABLE cotironda_piloto_privado.supplier_media_quotes_mvp098(
 message_hmac text,request_id uuid,supplier_key text,
 source_sha256 text,state text);
CREATE TABLE cotironda_piloto_privado.anonymous_supplier_docs_mvp107(
 message_hmac text,request_id uuid,supplier_key text,source_sha256 text);

\i supabase/piloto/mvp299_pending_coverage_without_prices.sql

INSERT INTO cotironda_piloto_privado.participants VALUES
 ('buyer_a','buyer',null,now(),null),
 ('buyer_b','buyer',null,now(),null),
 ('supplier_a','supplier',repeat('e',64),now(),null),
 ('supplier_b','supplier',repeat('f',64),now(),null);
INSERT INTO cotironda_piloto_privado.requests VALUES
 ('00000000-0000-4000-8000-000000000001','prepared','buyer_a'),
 ('00000000-0000-4000-8000-000000000002','prepared','buyer_b');
INSERT INTO cotironda_piloto_privado.buyer_tracking_mvp091 VALUES
 (repeat('a',64),'00000000-0000-4000-8000-000000000001',null,now()+interval '7 days'),
 (repeat('c',64),'00000000-0000-4000-8000-000000000002',null,now()+interval '7 days');
INSERT INTO cotironda_piloto_privado.ai_shadow_requests_mvp221 VALUES
 ('00000000-0000-4000-8000-000000000001'),
 ('00000000-0000-4000-8000-000000000002');
INSERT INTO cotironda_piloto_privado.ai_shadow_destinos_mvp221 VALUES
 ('00000000-0000-4000-8000-000000000001','supplier_a',1);
INSERT INTO cotironda_piloto_privado.ai_shadow_rubros_mvp221 VALUES
 ('00000000-0000-4000-8000-000000000001',1,'obra_gruesa');
INSERT INTO cotironda_piloto_privado.ai_dispatch_jobs_mvp222 VALUES
 ('00000000-0000-4000-8000-000000000001','supplier_a',
  'api_accepted',now()-interval '2 hours');
INSERT INTO cotironda_piloto_privado.ai_supplier_links_mvp225 VALUES
 ('supplier_a','00000000-0000-4000-8000-000000000001',
  repeat('b',64),repeat('1',64),'text');
INSERT INTO cotironda_piloto_privado.whapi_inbox VALUES
 (repeat('b',64),'00000000-0000-4000-8000-000000000001',
  'supplier_a',repeat('e',64),now()-interval '1 hour',repeat('1',64),'text');
INSERT INTO cotironda_piloto_privado.ai_supplier_review_mvp227 VALUES
 (repeat('b',64),'00000000-0000-4000-8000-000000000001',
  'supplier_a',repeat('1',64),'review','conditions_need_review',
  '{"estado":"requiere_revision","cobertura_pendiente_mvp299":true,
    "rubros":[{"rubro":"obra_gruesa","solicitados":1,
      "respondidos":1,"cobertura":"completa"}],
    "precios":[{"centavos":"999999","identidad":"never_publish"}]}'::jsonb,now());

DO $test$
DECLARE a jsonb;b jsonb;
BEGIN
 IF has_function_privilege('anon',
   'public.cotironda_piloto_ia_pending_coverage_mvp299(text)','EXECUTE') OR
    has_function_privilege('authenticated',
   'public.cotironda_piloto_ia_pending_coverage_mvp299(text)','EXECUTE') OR
    NOT has_function_privilege('service_role',
   'public.cotironda_piloto_ia_pending_coverage_mvp299(text)','EXECUTE')
 THEN RAISE EXCEPTION 'mvp299_function_grants_wrong';END IF;
 a:=public.cotironda_piloto_ia_pending_coverage_mvp299(repeat('a',64));
 IF a->>'state'<>'respuestas_pendientes_por_rubro' OR
    jsonb_array_length(a->'respuestas')<>1 OR
    a->'respuestas'->0->>'label'<>'Respuesta en revisión 1' OR
    (a->'respuestas'->0->'rubros'->0->>'respondidos')::int<>1 OR
    (a::text LIKE '%999999%' OR a::text LIKE '%supplier_a%' OR
     a::text LIKE '%identidad%') OR
    a->'ranking_permitido'<>'false'::jsonb
 THEN RAISE EXCEPTION 'mvp299_valid_private_projection_failed: %',a;END IF;
 b:=public.cotironda_piloto_ia_pending_coverage_mvp299(repeat('c',64));
 IF b->>'state'<>'respuestas_pendientes_por_rubro' OR
    jsonb_array_length(b->'respuestas')<>0
 THEN RAISE EXCEPTION 'mvp299_cross_company_leak';END IF;
 IF public.cotironda_piloto_ia_pending_coverage_mvp299(repeat('d',64))
    ->>'state'<>'not_found'
 THEN RAISE EXCEPTION 'mvp299_invalid_token_opened';END IF;
END $test$;

UPDATE cotironda_piloto_privado.ai_supplier_review_mvp227
 SET reason_code='semantic_review_required';
DO $test$ BEGIN
 IF jsonb_array_length(
 public.cotironda_piloto_ia_pending_coverage_mvp299(repeat('a',64))
 ->'respuestas')<>0 THEN RAISE EXCEPTION 'mvp299_semantic_review_leaked';END IF;
END $test$;
UPDATE cotironda_piloto_privado.ai_supplier_review_mvp227
 SET reason_code='conditions_need_review';

UPDATE cotironda_piloto_privado.buyer_tracking_mvp091
 SET revoked_at=now() WHERE token_hash=repeat('a',64);
DO $test$ BEGIN
 IF public.cotironda_piloto_ia_pending_coverage_mvp299(repeat('a',64))
  ->>'state'<>'not_found' THEN RAISE EXCEPTION 'mvp299_revocation_failed';END IF;
END $test$;
UPDATE cotironda_piloto_privado.buyer_tracking_mvp091
 SET revoked_at=null WHERE token_hash=repeat('a',64);

-- A newer incoming supplier source supersedes the reviewed one, even if
-- the newer response has no review yet.
INSERT INTO cotironda_piloto_privado.ai_supplier_links_mvp225 VALUES
 ('supplier_a','00000000-0000-4000-8000-000000000001',
  repeat('2',64),repeat('3',64),'text');
INSERT INTO cotironda_piloto_privado.whapi_inbox VALUES
 (repeat('2',64),'00000000-0000-4000-8000-000000000001',
  'supplier_a',repeat('e',64),now(),repeat('3',64),'text');
DO $test$ BEGIN
 IF jsonb_array_length(
 public.cotironda_piloto_ia_pending_coverage_mvp299(repeat('a',64))
 ->'respuestas')<>0 THEN RAISE EXCEPTION 'mvp299_old_quote_resurfaced';END IF;
END $test$;
DELETE FROM cotironda_piloto_privado.ai_supplier_links_mvp225
 WHERE message_hmac=repeat('2',64);

-- If source-version history exists, it must match the current source.
INSERT INTO cotironda_piloto_privado.supplier_source_versions_mvp261 VALUES
 ('00000000-0000-4000-8000-000000000001','supplier_a',
  repeat('2',64),repeat('3',64),2);
DO $test$ BEGIN
 IF jsonb_array_length(
 public.cotironda_piloto_ia_pending_coverage_mvp299(repeat('a',64))
 ->'respuestas')<>0 THEN RAISE EXCEPTION 'mvp299_stale_version_shown';END IF;
END $test$;

-- Rollback ensures no test data or grants persist.
ROLLBACK;
