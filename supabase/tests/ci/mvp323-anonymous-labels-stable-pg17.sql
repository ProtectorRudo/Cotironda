-- MVP323: actual PostgreSQL17 functions, isolated fictitious participants.
-- CI ONLY, transaction rolls back; no WhatsApp/AI/cost, no persistent data.
\set ON_ERROR_STOP on
BEGIN;
DO $roles$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $roles$;
CREATE SCHEMA cotironda_piloto_privado;
CREATE TABLE cotironda_piloto_privado.participants(
 key text PRIMARY KEY,participant_role text,consent_at timestamptz,
 opted_out_at timestamptz,chat_hmac text,display_label text
);
CREATE TABLE cotironda_piloto_privado.requests(
 id uuid PRIMARY KEY,buyer_key text,state text,source_hmac text,
 closes_at timestamptz,created_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.invitations(
 request_id uuid,supplier_key text,state text,
 PRIMARY KEY(request_id,supplier_key)
);
CREATE TABLE cotironda_piloto_privado.ai_supplier_links_mvp225(
 message_hmac text PRIMARY KEY,request_id uuid,supplier_key text,
 source_sha256 text,kind text,status text
);
CREATE TABLE cotironda_piloto_privado.whapi_inbox(
 message_hmac text PRIMARY KEY,request_id uuid,participant_key text,
 chat_hmac text,received_at timestamptz,plaintext_sha256 text,
 nonce_b64 text,ciphertext_b64 text,kind text,processing_state text
);
CREATE TABLE cotironda_piloto_privado.request_lines(
 request_id uuid,line_no smallint,original_description text,
 quantity numeric,unit text
);
CREATE TABLE cotironda_piloto_privado.ai_shadow_rubros_mvp221(
 request_id uuid,line_no smallint,rubro text
);
CREATE TABLE cotironda_piloto_privado.ai_shadow_requests_mvp221(request_id uuid);
CREATE TABLE cotironda_piloto_privado.buyer_tracking_mvp091(
 request_id uuid,token_hash text,revoked_at timestamptz,expires_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.ai_dispatch_jobs_mvp222(
 request_id uuid,supplier_key text,state text,finished_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.ai_buyer_review_mvp279(request_id uuid,state text);
-- MVP306 exists in the live closing RPC's alternative authorization branch.
-- These tables remain empty/OFF; do not invent automatic authorization.
CREATE TABLE cotironda_piloto_privado.ai_buyer_auto_release_mvp306(
 request_id uuid,buyer_key text,source_hmac text,approved_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.ai_auto_release_gate_mvp306(
 only_row boolean,enabled boolean,activated_at timestamptz
);
INSERT INTO cotironda_piloto_privado.ai_auto_release_gate_mvp306
 VALUES(true,false,null);
\ir ../../piloto/mvp227_presupuestos_rubros_ia_privados.sql
\ir ../../piloto/mvp303_revelar_todos_los_proveedores_al_cierre.sql
-- Preserve additional security fixes applied to these RPCs in the real
-- pilot after their original creation; use exact canonical PG17 source.
\ir mvp323-current-pilot-rpc-baseline-pg17.sql
-- The genuine current pilot baseline must satisfy exact SHA guards.
\ir ../../piloto/mvp323_numeracion_anonima_estable.sql

INSERT INTO cotironda_piloto_privado.participants
(key,participant_role,consent_at,opted_out_at,chat_hmac,display_label)
VALUES('comprador','buyer',now(),null,repeat('b',64),'Comprador privado'),
 ('proveedor_a','supplier',now(),null,repeat('1',64),'Comercio A'),
 ('proveedor_b','supplier',now(),null,repeat('2',64),'Comercio B'),
 ('proveedor_c','supplier',now(),null,repeat('3',64),'Comercio C');
INSERT INTO cotironda_piloto_privado.requests
 (id,buyer_key,state,created_at,closes_at)
VALUES('11111111-1111-4111-8111-111111111111','comprador',
 'prepared',now()-interval '15 minutes',now()+interval '1 hour');
INSERT INTO cotironda_piloto_privado.ai_shadow_requests_mvp221
 VALUES('11111111-1111-4111-8111-111111111111');
INSERT INTO cotironda_piloto_privado.buyer_tracking_mvp091
 VALUES('11111111-1111-4111-8111-111111111111',repeat('e',64),null,
 now()+interval '7 days');
INSERT INTO cotironda_piloto_privado.request_lines
 VALUES('11111111-1111-4111-8111-111111111111',1,'Cemento CPC 50 kg',20,'bag');
INSERT INTO cotironda_piloto_privado.ai_shadow_rubros_mvp221
 VALUES('11111111-1111-4111-8111-111111111111',1,'obra_gruesa');
INSERT INTO cotironda_piloto_privado.ai_buyer_review_mvp279
 VALUES('11111111-1111-4111-8111-111111111111','confirmed');
INSERT INTO cotironda_piloto_privado.invitations
 VALUES('11111111-1111-4111-8111-111111111111','proveedor_a','prepared'),
 ('11111111-1111-4111-8111-111111111111','proveedor_b','prepared'),
 ('11111111-1111-4111-8111-111111111111','proveedor_c','prepared');
INSERT INTO cotironda_piloto_privado.ai_dispatch_jobs_mvp222
 VALUES('11111111-1111-4111-8111-111111111111','proveedor_a','api_accepted',now()-interval '1 hour'),
 ('11111111-1111-4111-8111-111111111111','proveedor_b','api_accepted',now()-interval '1 hour'),
 ('11111111-1111-4111-8111-111111111111','proveedor_c','api_accepted',now()-interval '1 hour');
INSERT INTO cotironda_piloto_privado.whapi_inbox
(message_hmac,request_id,participant_key,chat_hmac,received_at,plaintext_sha256)
VALUES(repeat('a',64),'11111111-1111-4111-8111-111111111111','proveedor_a',
 repeat('1',64),now()-interval '40 minutes',repeat('a',64)),
 (repeat('b',64),'11111111-1111-4111-8111-111111111111','proveedor_b',
 repeat('2',64),now()-interval '30 minutes',repeat('b',64)),
 (repeat('c',64),'11111111-1111-4111-8111-111111111111','proveedor_c',
 repeat('3',64),now()-interval '25 minutes',repeat('c',64));
INSERT INTO cotironda_piloto_privado.ai_supplier_links_mvp225
 (message_hmac,request_id,supplier_key,source_sha256,kind,status)
VALUES(repeat('a',64),'11111111-1111-4111-8111-111111111111','proveedor_a',repeat('a',64),'text','awaiting_semantic_review'),
 (repeat('b',64),'11111111-1111-4111-8111-111111111111','proveedor_b',repeat('b',64),'text','awaiting_semantic_review'),
 (repeat('c',64),'11111111-1111-4111-8111-111111111111','proveedor_c',repeat('c',64),'text','awaiting_semantic_review');
INSERT INTO cotironda_piloto_privado.ai_supplier_review_mvp227
 (message_hmac,request_id,supplier_key,source_sha256,state,reason_code,summary,finished_at)
VALUES
 (repeat('a',64),'11111111-1111-4111-8111-111111111111','proveedor_a',repeat('a',64),
 'verified','source_and_math_checked',
 jsonb_build_object('estado','verificada_para_comparacion','moneda','ARS',
  'iva','no_informado','flete','no_informado','pago','no_informado',
  'rubros',jsonb_build_array(jsonb_build_object('rubro','obra_gruesa',
     'solicitados',1,'respondidos',1,'cobertura','completa')),
  'precios',jsonb_build_array(jsonb_build_object('pedidoId','item_1','centavos','10000'))),
 now()-interval '10 minutes'),
 (repeat('b',64),'11111111-1111-4111-8111-111111111111','proveedor_b',repeat('b',64),
 'verified','source_and_math_checked',
 jsonb_build_object('estado','verificada_para_comparacion','moneda','ARS',
  'iva','no_informado','flete','no_informado','pago','no_informado',
  'rubros',jsonb_build_array(jsonb_build_object('rubro','obra_gruesa',
   'solicitados',1,'respondidos',1,'cobertura','completa')),
  'precios',jsonb_build_array(jsonb_build_object('pedidoId','item_1','centavos','20000'))),
 now()-interval '5 minutes'),
 (repeat('c',64),'11111111-1111-4111-8111-111111111111','proveedor_c',repeat('c',64),
 'review','conditions_need_review',NULL,now()-interval '4 minutes');
DO $test$
DECLARE d jsonb;
BEGIN
 d:=public.cotironda_piloto_ia_buyer_rubros_mvp227(repeat('e',64));
 IF jsonb_array_length(d->'ofertas')<>2 OR d->'ofertas'->0->>'label'<>'Presupuesto 1'
   OR d->'ofertas'->1->>'label'<>'Presupuesto 2'
 THEN RAISE EXCEPTION 'mvp323_two_offers_misnumbered_%',d->'ofertas';END IF;
 IF (d->'ofertas'->0->'precios'->0->>'centavos')<>'10000'
 THEN RAISE EXCEPTION 'mvp323_first_price_wrong';END IF;
 IF d::text ~ 'proveedor_a|proveedor_b|Comercio A|Comercio B'
 THEN RAISE EXCEPTION 'mvp323_privacy_leak';END IF;
 IF public.cotironda_piloto_ia_buyer_rubros_mvp227(repeat('f',64))->>'state'<>'not_found'
 THEN RAISE EXCEPTION 'mvp323_invalid_token';END IF;
END $test$;
-- Supplier C's new verified source must append #3 despite an earlier
-- originally received message. No existing label may be renumbered.
INSERT INTO cotironda_piloto_privado.whapi_inbox
 (message_hmac,request_id,participant_key,chat_hmac,received_at,plaintext_sha256)
 VALUES(repeat('d',64),'11111111-1111-4111-8111-111111111111','proveedor_c',
 repeat('3',64),now()-interval '2 minutes',repeat('d',64));
INSERT INTO cotironda_piloto_privado.ai_supplier_links_mvp225
 VALUES(repeat('d',64),'11111111-1111-4111-8111-111111111111',
 'proveedor_c',repeat('d',64),'text','awaiting_semantic_review');
INSERT INTO cotironda_piloto_privado.ai_supplier_review_mvp227
 (message_hmac,request_id,supplier_key,source_sha256,state,reason_code,summary,finished_at)
 SELECT repeat('d',64),'11111111-1111-4111-8111-111111111111',
 'proveedor_c',repeat('d',64),'verified','source_and_math_checked',
 summary,now() FROM cotironda_piloto_privado.ai_supplier_review_mvp227
 WHERE message_hmac=repeat('a',64);
DO $test$
DECLARE d jsonb;
BEGIN
 d:=public.cotironda_piloto_ia_buyer_rubros_mvp227(repeat('e',64));
 IF jsonb_array_length(d->'ofertas')<>3 OR
    (SELECT string_agg(x->>'label',',' ORDER BY rn)
     FROM jsonb_array_elements(d->'ofertas') WITH ORDINALITY a(x,rn))
    <>'Presupuesto 1,Presupuesto 2,Presupuesto 3'
 THEN RAISE EXCEPTION 'mvp323_new_quote_renumbered_existing_%',d->'ofertas';END IF;
END $test$;
-- Supplier A sends a later correction under review: do not expose older A
-- price, but reserve A's original number so B and C never change.
INSERT INTO cotironda_piloto_privado.whapi_inbox
 (message_hmac,request_id,participant_key,chat_hmac,received_at,plaintext_sha256)
 VALUES(repeat('1',64),'11111111-1111-4111-8111-111111111111','proveedor_a',
 repeat('1',64),now()-interval '2 minutes',repeat('1',64));
INSERT INTO cotironda_piloto_privado.ai_supplier_links_mvp225
 VALUES(repeat('1',64),'11111111-1111-4111-8111-111111111111',
 'proveedor_a',repeat('1',64),'text','awaiting_semantic_review');
INSERT INTO cotironda_piloto_privado.ai_supplier_review_mvp227
 (message_hmac,request_id,supplier_key,source_sha256,state,reason_code,summary,finished_at)
 VALUES(repeat('1',64),'11111111-1111-4111-8111-111111111111',
 'proveedor_a',repeat('1',64),'review','conditions_need_review',NULL,now());
DO $test$
DECLARE d jsonb;
BEGIN
 d:=public.cotironda_piloto_ia_buyer_rubros_mvp227(repeat('e',64));
 IF jsonb_array_length(d->'ofertas')<>2 OR
    (SELECT string_agg(x->>'label',',' ORDER BY rn)
     FROM jsonb_array_elements(d->'ofertas') WITH ORDINALITY a(x,rn))
    <>'Presupuesto 2,Presupuesto 3'
 THEN RAISE EXCEPTION 'mvp323_pending_revision_renumbered_%',d->'ofertas';END IF;
END $test$;
-- A's corrected source is now source-verified with a different price:
-- the label MUST return as #1, while B/C never move or inherit A's price.
INSERT INTO cotironda_piloto_privado.whapi_inbox
 (message_hmac,request_id,participant_key,chat_hmac,received_at,plaintext_sha256)
 VALUES(repeat('9',64),'11111111-1111-4111-8111-111111111111','proveedor_a',
 repeat('1',64),now()-interval '1 minute',repeat('9',64));
INSERT INTO cotironda_piloto_privado.ai_supplier_links_mvp225
 VALUES(repeat('9',64),'11111111-1111-4111-8111-111111111111',
 'proveedor_a',repeat('9',64),'text','awaiting_semantic_review');
INSERT INTO cotironda_piloto_privado.ai_supplier_review_mvp227
 (message_hmac,request_id,supplier_key,source_sha256,state,reason_code,summary,finished_at)
 SELECT repeat('9',64),'11111111-1111-4111-8111-111111111111',
 'proveedor_a',repeat('9',64),'verified','source_and_math_checked',
 jsonb_set(summary,'{precios,0,centavos}','"77777"'::jsonb),now()
 FROM cotironda_piloto_privado.ai_supplier_review_mvp227
 WHERE message_hmac=repeat('a',64);
DO $reverified$
DECLARE d jsonb;
BEGIN
 d:=public.cotironda_piloto_ia_buyer_rubros_mvp227(repeat('e',64));
 IF jsonb_array_length(d->'ofertas')<>3 OR
    (d->'ofertas'->0->>'label')<>'Presupuesto 1' OR
    (d->'ofertas'->1->>'label')<>'Presupuesto 2' OR
    (d->'ofertas'->2->>'label')<>'Presupuesto 3' OR
    (d->'ofertas'->0->'precios'->0->>'centavos')<>'77777' OR
    (d->'ofertas'->1->'precios'->0->>'centavos')<>'20000' OR
    (d->'ofertas'->2->'precios'->0->>'centavos')<>'10000'
 THEN RAISE EXCEPTION 'mvp323_reverified_correction_lost_label_or_mixed_price_%',d->'ofertas';END IF;
END $reverified$;
-- The next uncertain quote must hide A again WITHOUT exposing stale
-- amount 77777 and without renumbering B/C. At close A remains review.
INSERT INTO cotironda_piloto_privado.whapi_inbox
 (message_hmac,request_id,participant_key,chat_hmac,received_at,plaintext_sha256)
 VALUES(repeat('8',64),'11111111-1111-4111-8111-111111111111','proveedor_a',
 repeat('1',64),now(),repeat('8',64));
INSERT INTO cotironda_piloto_privado.ai_supplier_links_mvp225
 VALUES(repeat('8',64),'11111111-1111-4111-8111-111111111111',
 'proveedor_a',repeat('8',64),'text','awaiting_semantic_review');
INSERT INTO cotironda_piloto_privado.ai_supplier_review_mvp227
 (message_hmac,request_id,supplier_key,source_sha256,state,reason_code,summary,finished_at)
 VALUES(repeat('8',64),'11111111-1111-4111-8111-111111111111',
 'proveedor_a',repeat('8',64),'review','conditions_need_review',NULL,now());
DO $hidden_again$
DECLARE d jsonb;
BEGIN
 d:=public.cotironda_piloto_ia_buyer_rubros_mvp227(repeat('e',64));
 IF jsonb_array_length(d->'ofertas')<>2 OR
    (d->'ofertas'->0->>'label')<>'Presupuesto 2' OR
    (d->'ofertas'->1->>'label')<>'Presupuesto 3' OR
    d::text LIKE '%77777%'
 THEN RAISE EXCEPTION 'mvp323_second_pending_leaked_or_renumbered_%',d->'ofertas';END IF;
END $hidden_again$;
-- At confirmed closing, seller names and their corresponding verified
-- anonymous labels must still be coherent. Buyer contact never revealed.
UPDATE cotironda_piloto_privado.all_supplier_reveal_activation_mvp303
 SET enabled=true,activated_at=now()-interval '1 hour' WHERE only_row;
UPDATE cotironda_piloto_privado.requests SET state='closed',
 closes_at=now()-interval '1 minute';
DO $test$
DECLARE d jsonb;
BEGIN
 d:=public.cotironda_piloto_all_suppliers_closed_mvp303(repeat('e',64));
 IF d->>'state'<>'proveedores_revelados_al_cierre' OR
    (SELECT x->>'oferta' FROM jsonb_array_elements(d->'proveedores') x
      WHERE x->>'nombre'='Comercio B')<>'Presupuesto 2' OR
    (SELECT x->>'oferta' FROM jsonb_array_elements(d->'proveedores') x
      WHERE x->>'nombre'='Comercio C')<>'Presupuesto 3' OR
    (SELECT x->>'estado' FROM jsonb_array_elements(d->'proveedores') x
      WHERE x->>'nombre'='Comercio A')<>'respuesta_en_revision' OR
    (SELECT x->>'oferta' FROM jsonb_array_elements(d->'proveedores') x
      WHERE x->>'nombre'='Comercio A') IS NOT NULL
 THEN RAISE EXCEPTION 'mvp323_close_name_label_inconsistent_%',d;END IF;
 IF d::text ~ 'comprador|chat_hmac|"whatsapp":|"telefono":'
 THEN RAISE EXCEPTION 'mvp323_closed_contact_exposed';END IF;
 IF public.cotironda_piloto_all_suppliers_closed_mvp303(repeat('f',64))->>'state'<>'not_found'
 THEN RAISE EXCEPTION 'mvp323_close_token_not_checked';END IF;
 IF has_function_privilege('anon','public.cotironda_piloto_ia_buyer_rubros_mvp227(text)','EXECUTE')
 OR has_function_privilege('authenticated','public.cotironda_piloto_all_suppliers_closed_mvp303(text)','EXECUTE')
 THEN RAISE EXCEPTION 'mvp323_acl_regression';END IF;
END $test$;
ROLLBACK;
