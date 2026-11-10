-- MVP211 / PR: PG17 AISLADO sin tocar PILOTO y con rollback total.
-- Todos los nombres, HMAC y documentos son sintéticos. Red: ninguna.
BEGIN;
DO $r$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN;END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN;END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN;END IF;
END$r$;
CREATE SCHEMA IF NOT EXISTS cotironda_piloto_privado;
CREATE TABLE cotironda_piloto_privado.requests(
 id uuid PRIMARY KEY,buyer_key text,state text,created_at timestamptz,closes_at timestamptz);
CREATE TABLE cotironda_piloto_privado.participants(
 key text PRIMARY KEY,participant_role text,consent_at timestamptz,
 opted_out_at timestamptz,chat_hmac text);
CREATE TABLE cotironda_piloto_privado.request_lines(
 request_id uuid,line_no smallint CHECK(line_no BETWEEN 1 AND 200),
 original_description text,quantity numeric,unit text,family_code text);
CREATE TABLE cotironda_piloto_privado.supplier_media_quotes_mvp098(
 message_hmac text,request_id uuid,supplier_key text,source_sha256 text,
 declared_total_literal text,line_count integer,received_at timestamptz);
CREATE TABLE cotironda_piloto_privado.supplier_evidence_mvp138(
 message_hmac text,verifier_version integer,request_id uuid,
 supplier_key text,source_sha256 text,state text,reason text,
 sum_line_cents bigint,declared_total_cents bigint,public_text text);
CREATE TABLE cotironda_piloto_privado.supplier_source_facts_mvp163(
 message_hmac text,request_id uuid,supplier_key text,source_sha256 text,
 state text,facts jsonb);
CREATE TABLE cotironda_piloto_privado.supplier_economic_facts_mvp168(
 message_hmac text,request_id uuid,supplier_key text,source_sha256 text,
 state text,facts jsonb);
CREATE TABLE cotironda_piloto_privado.media_archive_mvp095(
 message_hmac text,request_id uuid,participant_key text,content_sha256 text,
 chat_hmac text,state text,storage_path text);
CREATE TABLE cotironda_piloto_privado.invitations(
 request_id uuid,supplier_key text,state text);
CREATE TABLE cotironda_piloto_privado.supplier_quote_lines_mvp101(
 message_hmac text,line_no smallint CHECK(line_no BETWEEN 1 AND 25),
 description_literal text,quantity_literal text,unit_literal text,
 unit_price_literal text,line_total_literal text);

\ir ../../piloto/mvp211_private_round_inputs_capacity_12x30.sql

INSERT INTO cotironda_piloto_privado.participants
 VALUES('buyer_test','buyer',clock_timestamp()-interval '10 days',null,'buyer_chat');
INSERT INTO cotironda_piloto_privado.requests VALUES(
 '469cb459-5f00-49c2-b0b9-bc8b11e5c911','buyer_test','closed',
 clock_timestamp()-interval '5 days',clock_timestamp()-interval '1 day');
INSERT INTO cotironda_piloto_privado.request_lines
 SELECT '469cb459-5f00-49c2-b0b9-bc8b11e5c911'::uuid,
 n,CASE WHEN n=1 THEN 'arena fina' ELSE 'producto generico '||n END,
 1,'m3',CASE WHEN n=1 THEN 'arena_fina' ELSE 'material_generico' END
 FROM generate_series(1,30) n;
INSERT INTO cotironda_piloto_privado.participants
 SELECT 'supplier_test_'||n,'supplier',
 clock_timestamp()-interval '10 days',null,'chat_test_'||n
 FROM generate_series(1,12) n;
INSERT INTO cotironda_piloto_privado.invitations
 SELECT '469cb459-5f00-49c2-b0b9-bc8b11e5c911'::uuid,
 'supplier_test_'||n,'prepared' FROM generate_series(1,12) n;
INSERT INTO cotironda_piloto_privado.supplier_media_quotes_mvp098
 SELECT lpad(to_hex(n),64,'a'),
 '469cb459-5f00-49c2-b0b9-bc8b11e5c911'::uuid,
 'supplier_test_'||n,lpad(to_hex(n+20),64,'b'),
 '100.00',1,clock_timestamp()-interval '2 days'
 FROM generate_series(1,12) n;
INSERT INTO cotironda_piloto_privado.supplier_evidence_mvp138
 SELECT lpad(to_hex(n),64,'a'),9,
 '469cb459-5f00-49c2-b0b9-bc8b11e5c911'::uuid,
 'supplier_test_'||n,lpad(to_hex(n+20),64,'b'),
 'verified','covered',10000,10000,'Presupuesto anónimo probado #'||n
 FROM generate_series(1,12) n;
INSERT INTO cotironda_piloto_privado.supplier_source_facts_mvp163
 SELECT lpad(to_hex(n),64,'a'),
 '469cb459-5f00-49c2-b0b9-bc8b11e5c911'::uuid,
 'supplier_test_'||n,lpad(to_hex(n+20),64,'b'),
 'source_checked',jsonb_build_object('rankingAllowed',false,
 'sourceImmutabilityPreserved',true,
 'lines',jsonb_build_array(jsonb_build_object(
  'lineNo',1,'unitStatus','not_explicit','unit',null,
  'presentation','big_bag','page',1,'row',1)))
 FROM generate_series(1,12) n;
INSERT INTO cotironda_piloto_privado.supplier_economic_facts_mvp168
 SELECT lpad(to_hex(n),64,'a'),
 '469cb459-5f00-49c2-b0b9-bc8b11e5c911'::uuid,
 'supplier_test_'||n,lpad(to_hex(n+20),64,'b'),
 'source_checked',jsonb_build_object('rankingAllowed',false,
 'sourceImmutabilityPreserved',true,
 'descuentos',jsonb_build_object(
  'estado','descuentos_conciliados_sin_iva','precios',
  jsonb_build_array(jsonb_build_object(
   'linea',1,'pagina',1,'fila',1,'estado','importe_sin_ajuste_conciliado',
   'unitarioComercialTrasDescuento','100.00'))),
 'condiciones',jsonb_build_object(
  'iva',jsonb_build_object('estado','no_informado'),
  'flete',jsonb_build_object('estado','no_informado'),
  'pago',jsonb_build_object('estado','no_informado'),
  'stockCorroborado',false,'rankingHabilitado',false))
 FROM generate_series(1,12) n;
INSERT INTO cotironda_piloto_privado.media_archive_mvp095
 SELECT lpad(to_hex(n),64,'a'),
 '469cb459-5f00-49c2-b0b9-bc8b11e5c911'::uuid,
 'supplier_test_'||n,lpad(to_hex(n+20),64,'b'),
 'chat_test_'||n,'stored','media/'||lpad(to_hex(n),64,'a')
 FROM generate_series(1,12) n;
INSERT INTO cotironda_piloto_privado.supplier_quote_lines_mvp101
 SELECT lpad(to_hex(n),64,'a'),1,'BIG BAG de Arena',
 '1.00',null,'100.00','100.00' FROM generate_series(1,12) n;

DO $test$
DECLARE r jsonb; s text;
BEGIN
 IF has_function_privilege('anon',
  'public.cotironda_piloto_private_round_inputs_mvp172(uuid)','EXECUTE')
  OR has_function_privilege('authenticated',
   'public.cotironda_piloto_private_round_inputs_mvp172(uuid)','EXECUTE')
  OR NOT has_function_privilege('service_role',
   'public.cotironda_piloto_private_round_inputs_mvp172(uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'mvp211_privilege_leak'; END IF;
 r:=public.cotironda_piloto_private_round_inputs_mvp172(
  '469cb459-5f00-49c2-b0b9-bc8b11e5c911');
 IF r->>'state'<>'private_inputs'
    OR jsonb_array_length(r->'requestItems')<>30
    OR jsonb_array_length(r->'quotations')<>12
    OR r->>'contactsRevealed'<>'false'
    OR r->>'rankingAllowed'<>'false'
 THEN RAISE EXCEPTION 'mvp211_missing_or_truncated_offers: %',r->>'state';END IF;
 IF (SELECT count(*) FROM jsonb_array_elements(r->'quotations') x
     WHERE x->'doc'->'prueba'->>'version'='9'
      AND x->'fuente'->>'sourceImmutabilityPreserved'='true')<>12
 THEN RAISE EXCEPTION 'mvp211_wrong_document_proof'; END IF;
 IF r::text LIKE '%supplier_test_%'
 THEN RAISE EXCEPTION 'mvp211_private_supplier_key_exposed'; END IF;
 -- The 13th supplier must not make the 12 first suppliers look complete.
 INSERT INTO cotironda_piloto_privado.supplier_media_quotes_mvp098
 SELECT repeat('f',64),'469cb459-5f00-49c2-b0b9-bc8b11e5c911'::uuid,
  'supplier_test_1',repeat('e',64),'100.00',1,clock_timestamp()-interval '2 days';
 r:=public.cotironda_piloto_private_round_inputs_mvp172(
  '469cb459-5f00-49c2-b0b9-bc8b11e5c911');
 IF r->>'state'<>'capacity_or_empty'
 THEN RAISE EXCEPTION 'mvp211_truncated_more_than_12';END IF;
 DELETE FROM cotironda_piloto_privado.supplier_media_quotes_mvp098
 WHERE message_hmac=repeat('f',64);
 -- The 31st requested article must not be hidden from a complete basket.
 INSERT INTO cotironda_piloto_privado.request_lines
 VALUES('469cb459-5f00-49c2-b0b9-bc8b11e5c911',31,'extra',1,'m3','material_generico');
 r:=public.cotironda_piloto_private_round_inputs_mvp172(
  '469cb459-5f00-49c2-b0b9-bc8b11e5c911');
 IF r->>'state'<>'capacity_or_empty'
 THEN RAISE EXCEPTION 'mvp211_truncated_more_than_30';END IF;
 DELETE FROM cotironda_piloto_privado.request_lines WHERE line_no=31;
 -- Missing verified source on ONE quote must not silently omit it.
 DELETE FROM cotironda_piloto_privado.supplier_economic_facts_mvp168
 WHERE message_hmac=lpad(to_hex(12),64,'a');
 r:=public.cotironda_piloto_private_round_inputs_mvp172(
  '469cb459-5f00-49c2-b0b9-bc8b11e5c911');
 IF r->>'state'<>'incomplete_evidence'
 THEN RAISE EXCEPTION 'mvp211_missing_source_was_silently_skipped';END IF;
 UPDATE cotironda_piloto_privado.participants
 SET opted_out_at=clock_timestamp() WHERE key='buyer_test';
 r:=public.cotironda_piloto_private_round_inputs_mvp172(
  '469cb459-5f00-49c2-b0b9-bc8b11e5c911');
 IF r->>'state'<>'not_permitted'
 THEN RAISE EXCEPTION 'mvp211_buyer_revocation_ignored';END IF;
END$test$;
ROLLBACK;
