-- Prueba SQL REAL PostgreSQL 17: buyer con Whapi auténtico simulado,
-- catálogos de tres rubros, persistencia ATÓMICA sin invitaciones/outbox.
-- Todo es SINTÉTICO, rollback completo.
BEGIN;
DO $bootstrap$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  CREATE ROLE anon NOLOGIN;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
  CREATE ROLE authenticated NOLOGIN;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
  CREATE ROLE service_role NOLOGIN;
 END IF;
END $bootstrap$;
CREATE SCHEMA cotironda_piloto_privado;
CREATE TABLE cotironda_piloto_privado.participants(
 key text PRIMARY KEY,participant_role text,delivery_city text,
 chat_hmac text,consent_at timestamptz,opted_out_at timestamptz,
 catalogue_confirmed_at timestamptz
);
CREATE TABLE cotironda_piloto_privado.catalogue_lines(
 participant_key text NOT NULL REFERENCES cotironda_piloto_privado.participants(key),
 line_no smallint NOT NULL,literal_description text NOT NULL,
 family_code text,recognition_state text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(participant_key,line_no)
);
CREATE TABLE cotironda_piloto_privado.requests(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 buyer_key text NOT NULL REFERENCES cotironda_piloto_privado.participants(key),
 delivery_city text NOT NULL,
 original_request text NOT NULL,
 source_hmac text UNIQUE,
 state text NOT NULL DEFAULT 'draft',
 created_at timestamptz NOT NULL DEFAULT now(),
 closes_at timestamptz NOT NULL DEFAULT (now()+interval '4 days')
);
CREATE TABLE cotironda_piloto_privado.request_lines(
 request_id uuid NOT NULL REFERENCES cotironda_piloto_privado.requests(id),
 line_no smallint NOT NULL,original_description text NOT NULL,
 quantity numeric NOT NULL,unit text NOT NULL,family_code text,
 PRIMARY KEY(request_id,line_no)
);
CREATE TABLE cotironda_piloto_privado.whapi_inbox(
 message_hmac text PRIMARY KEY,
 participant_key text NOT NULL REFERENCES cotironda_piloto_privado.participants(key),
 chat_hmac text NOT NULL,
 kind text NOT NULL,
 processing_state text NOT NULL,
 plaintext_sha256 text NOT NULL,
 request_id uuid REFERENCES cotironda_piloto_privado.requests(id),
 received_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE cotironda_piloto_privado.invitations(
 request_id uuid,supplier_key text,
 PRIMARY KEY(request_id,supplier_key)
);
CREATE TABLE cotironda_piloto_privado.whapi_outbox(
 request_id uuid,supplier_key text,
 PRIMARY KEY(request_id,supplier_key)
);
ALTER TABLE cotironda_piloto_privado.participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE cotironda_piloto_privado.catalogue_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE cotironda_piloto_privado.requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE cotironda_piloto_privado.request_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE cotironda_piloto_privado.whapi_inbox ENABLE ROW LEVEL SECURITY;

INSERT INTO cotironda_piloto_privado.participants
(key,participant_role,delivery_city,chat_hmac,consent_at,opted_out_at,catalogue_confirmed_at)
VALUES
 ('arquitecto','buyer',null,repeat('a',64),now(),null,null),
 ('corralon_ailin','supplier','La Plata',repeat('1',64),now(),null,now()),
 ('corralon_nahuel','supplier','La Plata',repeat('2',64),now(),null,null),
 ('electricidad_gamma','supplier','La Plata',repeat('3',64),now(),null,now()),
 ('sin_confirmar','supplier','La Plata',repeat('4',64),now(),null,null),
 ('revocado','supplier','La Plata',repeat('5',64),now(),now(),now());
INSERT INTO cotironda_piloto_privado.catalogue_lines
 (participant_key,line_no,literal_description,family_code,recognition_state)
VALUES
 ('corralon_ailin',1,'Cemento CPC bolsa 50 kilos','cemento_gris_obra','curated_family'),
 ('corralon_nahuel',1,'Látex para interior 5L',null,'pending_review'),
 ('electricidad_gamma',1,'Cable unipolar 2,5 mm',null,'pending_review'),
 ('sin_confirmar',1,'Cemento gris genérico',null,'pending_review'),
 ('revocado',1,'Cemento que no debe usarse',null,'pending_review');
\ir ../../piloto/mvp221_rondas_ia_sombra_y_pdf_por_proveedor.sql

-- Datos de un nuevo mensaje, cifrado real fuera del test, aquí representado
-- exclusivamente por SHA256 original y chat HMAC sintético.
CREATE TEMP TABLE source_fixture(v text);
INSERT INTO source_fixture VALUES(
 'Obra: 20 bols cem cpc, 5 lts latex y 50 mts cable 2.5. Entrega en La Plata.'
);
INSERT INTO cotironda_piloto_privado.whapi_inbox
 (message_hmac,participant_key,chat_hmac,kind,processing_state,plaintext_sha256)
SELECT repeat('b',64),'arquitecto',repeat('a',64),'text','needs_review',
 encode(sha256(convert_to(v,'UTF8')),'hex') FROM source_fixture;

DO $test$
DECLARE
 src text; items jsonb; destinations jsonb; result jsonb;
 rid uuid; preview jsonb;
BEGIN
 SELECT v INTO src FROM source_fixture;
 items:=jsonb_build_array(
  jsonb_build_object('descripcion','Cemento CPC 50 kg','cantidad','20',
    'unidad','bag','rubro','obra_gruesa','evidencia','20 bols cem cpc'),
  jsonb_build_object('descripcion','Pintura látex interior','cantidad','5',
    'unidad','l','rubro','pintura','evidencia','5 lts latex'),
  jsonb_build_object('descripcion','Cable 2,5 mm²','cantidad','50',
    'unidad','m','rubro','electricidad','evidencia','50 mts cable 2.5')
 );
 destinations:=jsonb_build_array(
  jsonb_build_object('proveedor','corralon_ailin','correspondencias',
    jsonb_build_array(jsonb_build_object('indicePedido',0,'numeroCatalogo',1,
      'descripcionCatalogo','Cemento CPC bolsa 50 kilos','rubroCatalogo','obra_gruesa',
      'tipo','producto_declarado','explicacion','Cemento coincidente'))),
  jsonb_build_object('proveedor','corralon_nahuel','correspondencias',
    jsonb_build_array(jsonb_build_object('indicePedido',1,'numeroCatalogo',1,
      'descripcionCatalogo','Látex para interior 5L','rubroCatalogo','pintura',
      'tipo','alternativa_razonable','explicacion','Pintura látex por litro'))),
  jsonb_build_object('proveedor','electricidad_gamma','correspondencias',
    jsonb_build_array(jsonb_build_object('indicePedido',2,'numeroCatalogo',1,
      'descripcionCatalogo','Cable unipolar 2,5 mm','rubroCatalogo','electricidad',
      'tipo','producto_declarado','explicacion','Cable solicitado')))
 );
 IF public.cotironda_piloto_ia_shadow_prepare_mvp221(
   repeat('a',64),repeat('b',64),src||' MODIFICADO','La Plata',items,destinations
  )->>'state' <> 'source_not_authorized'
 THEN RAISE EXCEPTION 'mvp221_falsificacion_fuente_aceptada';END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.requests)<>0
 THEN RAISE EXCEPTION 'mvp221_guardado_parcial_en_rechazo';END IF;

 result:=public.cotironda_piloto_ia_shadow_prepare_mvp221(
  repeat('a',64),repeat('b',64),src,'La Plata',items,destinations
 );
 IF result->>'state'<>'shadow_staged'
 OR (result->>'items_staged')::int<>3
 OR (result->>'matches_staged')::int<>3
 OR (result->>'invitations_sent')::int<>0
 THEN RAISE EXCEPTION 'mvp221_no_guardado_%',result;END IF;
 rid:=(result->>'request_id')::uuid;
 IF (SELECT count(*) FROM cotironda_piloto_privado.requests
     WHERE id=rid AND state='draft')<>1
 OR (SELECT count(*) FROM cotironda_piloto_privado.request_lines
     WHERE request_id=rid)<>3
 OR (SELECT count(*) FROM cotironda_piloto_privado.ai_shadow_rubros_mvp221
     WHERE request_id=rid)<>3
 OR (SELECT count(*) FROM cotironda_piloto_privado.ai_shadow_destinos_mvp221
     WHERE request_id=rid)<>3
 OR (SELECT count(*) FROM cotironda_piloto_privado.invitations)<>0
 OR (SELECT count(*) FROM cotironda_piloto_privado.whapi_outbox)<>0
 THEN RAISE EXCEPTION 'mvp221_persistencia_inconsistente_o_envio';END IF;
 FOR preview IN SELECT public.cotironda_piloto_ia_pdf_preview_mvp221(
    rid, unnest(ARRAY['corralon_ailin','corralon_nahuel','electricidad_gamma']))
 LOOP
  IF preview->>'state'<>'preview_only'
    OR jsonb_array_length(preview->'items')<>1
    OR preview->>'whatsappEnabled'<>'false'
  THEN RAISE EXCEPTION 'mvp221_pdf_mezcla_rubros';END IF;
 END LOOP;
 IF public.cotironda_piloto_ia_pdf_preview_mvp221(rid,'revocado') IS NOT NULL
 THEN RAISE EXCEPTION 'mvp221_filtra_pdf_no_invitado';END IF;
 IF public.cotironda_piloto_ia_shadow_prepare_mvp221(
   repeat('a',64),repeat('b',64),src,'La Plata',items,destinations
  )->>'state'<>'already_staged'
 THEN RAISE EXCEPTION 'mvp221_reproceso_no_idempotente';END IF;
 IF has_function_privilege('anon',
   'public.cotironda_piloto_ia_shadow_prepare_mvp221(text,text,text,text,jsonb,jsonb)',
   'EXECUTE')
 OR has_function_privilege('authenticated',
   'public.cotironda_piloto_ia_pdf_preview_mvp221(uuid,text)','EXECUTE')
 OR NOT has_function_privilege('service_role',
   'public.cotironda_piloto_ia_shadow_prepare_mvp221(text,text,text,text,jsonb,jsonb)',
   'EXECUTE')
 THEN RAISE EXCEPTION 'mvp221_acceso_no_autorizado';END IF;
END $test$;

-- MVP222: probar la publicación de la misma ronda en tres proveedores.
ALTER TABLE cotironda_piloto_privado.requests
 ADD COLUMN requested_delivery_note text;
ALTER TABLE cotironda_piloto_privado.invitations
 ADD COLUMN state text NOT NULL DEFAULT 'prepared';
CREATE TABLE cotironda_piloto_privado.invitation_lines_mvp099(
 request_id uuid NOT NULL,
 supplier_key text NOT NULL,
 line_no smallint NOT NULL,
 PRIMARY KEY(request_id,supplier_key,line_no),
 FOREIGN KEY(request_id,supplier_key)
 REFERENCES cotironda_piloto_privado.invitations(request_id,supplier_key)
);
CREATE TABLE cotironda_piloto_privado.integration_flags(
 only_row boolean PRIMARY KEY,
 whatsapp_outbound_enabled boolean NOT NULL
);
INSERT INTO cotironda_piloto_privado.integration_flags VALUES(true,true);
ALTER TABLE cotironda_piloto_privado.integration_flags
 ADD COLUMN whatsapp_inbound_enabled boolean NOT NULL DEFAULT true;

CREATE TABLE cotironda_piloto_privado.media_archive_mvp095(
 message_hmac text PRIMARY KEY REFERENCES cotironda_piloto_privado.whapi_inbox(message_hmac),
 chat_hmac text NOT NULL,participant_key text NOT NULL,
 state text NOT NULL,content_sha256 text NOT NULL,
 request_id uuid REFERENCES cotironda_piloto_privado.requests(id)
);
\ir ../../piloto/mvp222_ia_despacho_seguro_sin_activar.sql
\ir ../../piloto/mvp223_ia_buyer_dispatch_lookup_private.sql
\ir ../../piloto/mvp226_ia_central_ingesta_durable.sql
\ir ../../piloto/mvp228_proteger_respuestas_libres_ia_central.sql
\ir ../../piloto/mvp229_piloto_ia_central_control_temporal.sql
\ir ../../piloto/mvp230_respuestas_proveedor_tras_vencimiento.sql
CREATE TRIGGER enqueue_on_invitation
 AFTER INSERT ON cotironda_piloto_privado.invitations
 FOR EACH ROW EXECUTE FUNCTION cotironda_piloto_privado.queue_invitation_whapi_v1();

DO $test222$
DECLARE rid uuid; r jsonb; claim jsonb; snap jsonb;
 j integer; n integer; supplier text; lease uuid; sent int:=0;
BEGIN
 SELECT request_id INTO rid FROM cotironda_piloto_privado.ai_shadow_requests_mvp221;
 IF rid IS NULL THEN RAISE EXCEPTION 'mvp222_missing_shadow_round';END IF;
 IF (SELECT enabled FROM cotironda_piloto_privado.ai_dispatch_gate_mvp222
 WHERE only_row) IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'mvp222_default_not_off';END IF;
 IF public.cotironda_piloto_ia_ready_for_chat_mvp223(repeat('a',64))->>'state'<>'disabled'
 THEN RAISE EXCEPTION 'mvp223_dispatch_lookup_enabled_without_gate';END IF;
 r:=public.cotironda_piloto_ia_publish_mvp222(rid);
 IF r->>'state'<>'dispatch_disabled'
 THEN RAISE EXCEPTION 'mvp222_publish_without_gate';END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.invitations)<>0 OR
 (SELECT count(*) FROM cotironda_piloto_privado.whapi_outbox)<>0
 THEN RAISE EXCEPTION 'mvp222_accidental_send_before_gate';END IF;
 UPDATE cotironda_piloto_privado.ai_dispatch_gate_mvp222
 SET enabled=true,activated_at=now() WHERE only_row;
 r:=public.cotironda_piloto_ia_publish_mvp222(rid);
 IF public.cotironda_piloto_ia_ready_for_chat_mvp223(repeat('a',64))->>'state'<>'ready'
 THEN RAISE EXCEPTION 'mvp223_failed_to_find_buyer_pending_job';END IF;
 IF public.cotironda_piloto_ia_ready_for_chat_mvp223(repeat('b',64))->>'state'<>'empty'
 THEN RAISE EXCEPTION 'mvp223_foreign_buyer_woke_dispatch';END IF;
 IF r->>'state'<>'ready_for_delivery'
 OR (r->>'suppliers')::int<>3 OR (r->>'mapped_lines')::int<>3
 THEN RAISE EXCEPTION 'mvp222_publish_failed_%',r;END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.invitations)<>3
 OR (SELECT count(*) FROM cotironda_piloto_privado.invitation_lines_mvp099)<>3
 OR (SELECT count(*) FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222)<>3
 OR (SELECT count(*) FROM cotironda_piloto_privado.whapi_outbox)<>0
 THEN RAISE EXCEPTION 'mvp222_wrong_queue_count'; END IF;
 IF (SELECT state FROM cotironda_piloto_privado.requests WHERE id=rid)<>'prepared'
 THEN RAISE EXCEPTION 'mvp222_did_not_prepare_round';END IF;
 IF public.cotironda_piloto_ia_is_supplier_mvp226(repeat('1',64))
    ->>'state'<>'central_supplier'
 THEN RAISE EXCEPTION 'mvp228_supplier_unprotected_when_gate_off';END IF;
 IF public.cotironda_piloto_ia_is_supplier_mvp226(repeat('9',64))
    ->>'state'<>'not_central_supplier'
 THEN RAISE EXCEPTION 'mvp226_unknown_supplier_can_route';END IF;
 IF public.cotironda_piloto_ia_publish_mvp222(rid)->>'state'<>'already_published'
 THEN RAISE EXCEPTION 'mvp222_duplicate_publish';END IF;
 FOR j IN 1..3 LOOP
  claim:=public.cotironda_piloto_ia_claim_mvp222(rid);
  IF claim->>'state'<>'leased' THEN
   RAISE EXCEPTION 'mvp222_no_lease_%',claim; END IF;
  supplier:=claim->>'supplier_key';
  lease:=(claim->>'lease_token')::uuid;
  snap:=public.cotironda_piloto_ia_pdf_snapshot_mvp222(rid,supplier,lease);
  IF snap IS NULL OR jsonb_array_length(snap->'items')<>1
  THEN RAISE EXCEPTION 'mvp222_cross_supplier_pdf'; END IF;
  IF NOT public.cotironda_piloto_ia_finish_mvp222(
   rid,supplier,lease,'api_accepted',(CASE WHEN j=1 THEN 'wamid.HBgAAA111' ELSE 'abc1234567'||j::text END))
  THEN RAISE EXCEPTION 'mvp222_finish_failed';END IF;
  IF public.cotironda_piloto_ia_finish_mvp222(
   rid,supplier,lease,'api_accepted',(CASE WHEN j=1 THEN 'wamid.HBgAAA111' ELSE 'abc1234567'||j::text END))
  THEN RAISE EXCEPTION 'mvp222_double_send_accepted';END IF;
  sent:=sent+1;
 END LOOP;
 IF public.cotironda_piloto_ia_ready_for_chat_mvp223(repeat('a',64))->>'state'<>'empty'
 THEN RAISE EXCEPTION 'mvp223_finished_jobs_found';END IF;
 IF sent<>3 OR public.cotironda_piloto_ia_claim_mvp222(rid)->>'state'<>'empty'
 THEN RAISE EXCEPTION 'mvp222_claim_after_finished';END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.whapi_outbox)<>0
 THEN RAISE EXCEPTION 'mvp222_legacy_outbox_was_mutated';END IF;
 UPDATE cotironda_piloto_privado.ai_dispatch_gate_mvp222
 SET enabled=false,activated_at=null WHERE only_row;
 IF public.cotironda_piloto_ia_claim_mvp222(rid)->>'state'<>'disabled'
 THEN RAISE EXCEPTION 'mvp222_gate_off_ignored';END IF;
 IF public.cotironda_piloto_ia_is_supplier_mvp226(repeat('1',64))
    ->>'state'<>'central_supplier'
 THEN RAISE EXCEPTION 'mvp228_loses_guard_when_dispatch_off';END IF;
 IF has_function_privilege('anon',
     'public.cotironda_piloto_ia_is_supplier_mvp226(text)','EXECUTE')
 OR has_function_privilege('authenticated',
     'public.cotironda_piloto_ia_is_supplier_mvp226(text)','EXECUTE')
 THEN RAISE EXCEPTION 'mvp228_guard_exposed';END IF;
 IF has_function_privilege('anon','public.cotironda_piloto_ia_publish_mvp222(uuid)','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.cotironda_piloto_ia_pdf_snapshot_mvp222(uuid,text,uuid)','EXECUTE')
 OR has_function_privilege('anon',
  'public.cotironda_piloto_ia_ready_for_chat_mvp223(text)','EXECUTE')
 OR NOT has_function_privilege('service_role',
  'public.cotironda_piloto_ia_claim_mvp222(uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'mvp222_privileges_invalid';END IF;
END $test222$;

-- Source association: whapi ID quoted, two simultaneous rounds,
-- no fallback inference from product words, media original immutable.
\ir ../../piloto/mvp225_asociar_presupuestos_ia_central_solo_piloto.sql
-- MVP226: cuota y reserva durable del texto del comprador,
-- sin volver a procesar fuente de un mensaje viejo.
DO $mvp226$
DECLARE r jsonb; rid uuid; src text;
BEGIN
 SELECT request_id INTO rid
 FROM cotironda_piloto_privado.ai_shadow_requests_mvp221 LIMIT 1;
 IF (SELECT enabled FROM cotironda_piloto_privado.ai_central_control_mvp226
   WHERE only_row) IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'mvp226_starts_enabled';END IF;
 IF public.cotironda_piloto_ia_reserve_buyer_mvp226(
   repeat('a',64),repeat('7',64),repeat('1',64))->>'state'<>'disabled'
 THEN RAISE EXCEPTION 'mvp226_gate_ignored';END IF;

 UPDATE cotironda_piloto_privado.ai_central_control_mvp226
 SET enabled=true,activated_at=now() WHERE only_row;
 IF public.cotironda_piloto_ia_is_supplier_mvp226(repeat('1',64))
   ->>'state'<>'central_supplier'
 THEN RAISE EXCEPTION 'mvp226_supplier_router_gate_on';END IF;
 src:='Necesito cotizar 7 bolsas cement y 2 bolsones. Entrega en La Plata.';
 INSERT INTO cotironda_piloto_privado.whapi_inbox(
  message_hmac,participant_key,chat_hmac,kind,processing_state,plaintext_sha256)
 VALUES(repeat('7',64),'arquitecto',repeat('a',64),'text','needs_review',
  encode(sha256(convert_to(src,'UTF8')),'hex'));
 r:=public.cotironda_piloto_ia_reserve_buyer_mvp226(
   repeat('a',64),repeat('7',64),encode(sha256(convert_to(src,'UTF8')),'hex'));
 IF r->>'state'<>'reserved' THEN RAISE EXCEPTION 'mvp226_did_not_reserve_%',r;END IF;
 IF public.cotironda_piloto_ia_reserve_buyer_mvp226(
   repeat('a',64),repeat('7',64),encode(sha256(convert_to(src,'UTF8')),'hex'))
   ->>'state'<>'already_reserved'
 THEN RAISE EXCEPTION 'mvp226_duplicate_billed';END IF;
 IF public.cotironda_piloto_ia_reserve_buyer_mvp226(
   repeat('b',64),repeat('7',64),encode(sha256(convert_to(src,'UTF8')),'hex'))
   ->>'state'<>'not_authorized'
 THEN RAISE EXCEPTION 'mvp226_cross_buyer_authorized';END IF;
 IF public.cotironda_piloto_ia_reserve_buyer_mvp226(
   repeat('a',64),repeat('7',64),repeat('2',64))
   ->>'state'<>'not_authorized'
 THEN RAISE EXCEPTION 'mvp226_sha_changed_authorized';END IF;
 IF public.cotironda_piloto_ia_finish_buyer_mvp226(
   repeat('a',64),repeat('7',64),'review','semantic_review_required')
   ->>'state'<>'finished'
 THEN RAISE EXCEPTION 'mvp226_failed_review_finish';END IF;
 IF public.cotironda_piloto_ia_finish_buyer_mvp226(
   repeat('a',64),repeat('7',64),'review','semantic_review_required')
   ->>'state'<>'already_finalized'
 THEN RAISE EXCEPTION 'mvp226_finish_twice';END IF;
 IF public.cotironda_piloto_ia_lookup_round_mvp226(
   repeat('a',64),repeat('7',64))->>'state'<>'not_found'
 THEN RAISE EXCEPTION 'mvp226_review_no_round_falsified';END IF;

 -- Ronda IA en sombra existente: la búsqueda solo la muestra
 -- cuando el buyer firmado y la propia fuente HMAC están asociados.
 INSERT INTO cotironda_piloto_privado.ai_central_attempts_mvp226(
  message_hmac,buyer_key,chat_hmac,source_sha256)
 SELECT m.message_hmac,'arquitecto',m.chat_hmac,m.plaintext_sha256
 FROM cotironda_piloto_privado.whapi_inbox m
 WHERE m.message_hmac=repeat('b',64);
 r:=public.cotironda_piloto_ia_lookup_round_mvp226(
   repeat('a',64),repeat('b',64));
 IF r->>'state'<>'linked' OR (r->>'request_id')::uuid<>rid
 THEN RAISE EXCEPTION 'mvp226_fails_round_link_%',r;END IF;
 IF public.cotironda_piloto_ia_lookup_round_mvp226(
   repeat('f',64),repeat('b',64))->>'state'<>'not_found'
 THEN RAISE EXCEPTION 'mvp226_cross_buyer_lookup';END IF;
 IF has_function_privilege('anon',
  'public.cotironda_piloto_ia_reserve_buyer_mvp226(text,text,text)','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.cotironda_piloto_ia_lookup_round_mvp226(text,text)','EXECUTE')
 OR NOT has_function_privilege('service_role',
  'public.cotironda_piloto_ia_reserve_buyer_mvp226(text,text,text)','EXECUTE')
 THEN RAISE EXCEPTION 'mvp226_bad_acl';END IF;
END $mvp226$;

DO $mvp225$
DECLARE rid uuid; other_rid uuid; result jsonb; text_quote text;
BEGIN
 SELECT request_id INTO rid FROM cotironda_piloto_privado.ai_shadow_requests_mvp221
 LIMIT 1;
 IF rid IS NULL THEN RAISE EXCEPTION 'mvp225_no_original_round';END IF;
 text_quote:='Hola, cemento CPC a 8900 por bolsa, por favor';
 INSERT INTO cotironda_piloto_privado.whapi_inbox(
 message_hmac,participant_key,chat_hmac,kind,processing_state,
 plaintext_sha256,received_at)
 VALUES (
 repeat('d',64),'corralon_ailin',repeat('1',64),'text','unmatched_quote',
 encode(sha256(convert_to(text_quote,'UTF8')),'hex'),
 clock_timestamp()+interval '2 seconds'
 );
 -- Wrong original text and wrong quoted ID must never write links.
 result:=public.cotironda_piloto_ia_link_supplier_mvp225(
  repeat('d',64),repeat('1',64),'wamid.HBgAAA111',text_quote||' mal');
 IF result->>'state'<>'text_source_mismatch'
 THEN RAISE EXCEPTION 'mvp225_original_not_verified';END IF;
 result:=public.cotironda_piloto_ia_link_supplier_mvp225(
  repeat('d',64),repeat('1',64),'notfound999999',text_quote);
 IF result->>'state'<>'not_matched'
 THEN RAISE EXCEPTION 'mvp225_wrong_quote_link';END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.ai_supplier_links_mvp225)<>0
 THEN RAISE EXCEPTION 'mvp225_wrong_quote_did_mutate'; END IF;
 result:=public.cotironda_piloto_ia_link_supplier_mvp225(
  repeat('d',64),repeat('1',64),'wamid.HBgAAA111',text_quote);
 IF result->>'state'<>'linked_for_semantic_review' OR
  (result->>'request_id')::uuid<>rid OR
  result->>'association'<>'quoted_whapi_id'
 THEN RAISE EXCEPTION 'mvp225_quoted_source_not_linked_%',result;END IF;
 IF public.cotironda_piloto_ia_link_supplier_mvp225(
  repeat('d',64),repeat('1',64),'wamid.HBgAAA111',text_quote
 )->>'state'<>'already_linked'
 THEN RAISE EXCEPTION 'mvp225_duplicate_quote';END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.ai_supplier_links_mvp225)<>1
 THEN RAISE EXCEPTION 'mvp225_duplicate_insert';END IF;

 -- Two open rounds for Ailín: unquoted text MUST be ambiguous,
 -- but a quoted whapi ID still uniquely selects its own round.
 INSERT INTO cotironda_piloto_privado.requests(
  buyer_key,delivery_city,original_request,source_hmac,state)
 VALUES('arquitecto','La Plata','Otra lista de materiales',repeat('e',64),'prepared')
 RETURNING id INTO other_rid;
 INSERT INTO cotironda_piloto_privado.ai_shadow_requests_mvp221(
  request_id,source_hmac) VALUES(other_rid,repeat('e',64));
 INSERT INTO cotironda_piloto_privado.invitations(request_id,supplier_key)
 VALUES(other_rid,'corralon_ailin');
 INSERT INTO cotironda_piloto_privado.ai_dispatch_jobs_mvp222(
  request_id,supplier_key,state,lease_token,leased_at,
  finished_at,whapi_message_id)
 VALUES(other_rid,'corralon_ailin','api_accepted',
  gen_random_uuid(),clock_timestamp()-interval '1 hour',
  clock_timestamp(),'abc11111111');
 INSERT INTO cotironda_piloto_privado.whapi_inbox(
  message_hmac,participant_key,chat_hmac,kind,processing_state,
  plaintext_sha256,received_at)
 VALUES (
  repeat('f',64),'corralon_ailin',repeat('1',64),'text','unmatched_quote',
  encode(sha256(convert_to(text_quote,'UTF8')),'hex'),
  clock_timestamp()+interval '3 seconds'
 );
 result:=public.cotironda_piloto_ia_link_supplier_mvp225(
  repeat('f',64),repeat('1',64),null,text_quote);
 IF result->>'state'<>'ambiguous_round'
 THEN RAISE EXCEPTION 'mvp225_unquoted_ambiguity_not_blocked_%',result;END IF;
 IF (SELECT request_id FROM cotironda_piloto_privado.whapi_inbox
  WHERE message_hmac=repeat('f',64)) IS NOT NULL
 THEN RAISE EXCEPTION 'mvp225_attached_wrong_client';END IF;
 result:=public.cotironda_piloto_ia_link_supplier_mvp225(
  repeat('f',64),repeat('1',64),'abc11111111',text_quote);
 IF result->>'state'<>'linked_for_semantic_review' OR
  (result->>'request_id')::uuid<>other_rid
 THEN RAISE EXCEPTION 'mvp225_explicit_message_did_not_disambiguate';END IF;

 -- A PDF in archive: content hash is source of truth, not manifest text.
 INSERT INTO cotironda_piloto_privado.whapi_inbox(
 message_hmac,participant_key,chat_hmac,kind,processing_state,
 plaintext_sha256,received_at)
 VALUES (
 repeat('9',64),'corralon_nahuel',repeat('2',64),'document','needs_review',
 repeat('a',64),clock_timestamp()+interval '4 seconds'
 );
 INSERT INTO cotironda_piloto_privado.media_archive_mvp095(
 message_hmac,chat_hmac,participant_key,state,content_sha256)
 VALUES(repeat('9',64),repeat('2',64),'corralon_nahuel','stored',repeat('b',64));
 result:=public.cotironda_piloto_ia_link_supplier_mvp225(
  repeat('9',64),repeat('2',64),'abc12345672',null);
 IF result->>'state'<>'linked_for_semantic_review' OR
   (SELECT request_id FROM cotironda_piloto_privado.media_archive_mvp095
    WHERE message_hmac=repeat('9',64))<>rid
 THEN RAISE EXCEPTION 'mvp225_media_original_not_associated';END IF;
 IF (SELECT source_sha256 FROM cotironda_piloto_privado.ai_supplier_links_mvp225
  WHERE message_hmac=repeat('9',64))<>repeat('b',64)
 THEN RAISE EXCEPTION 'mvp225_media_source_digest_wrong';END IF;

 -- Unknown supplier and client cannot read or mutate the association.
 IF has_function_privilege('anon',
  'public.cotironda_piloto_ia_link_supplier_mvp225(text,text,text,text)','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.cotironda_piloto_ia_link_supplier_mvp225(text,text,text,text)','EXECUTE')
 OR NOT has_function_privilege('service_role',
  'public.cotironda_piloto_ia_link_supplier_mvp225(text,text,text,text)','EXECUTE')
 THEN RAISE EXCEPTION 'mvp225_rpc_exposed_publicly'; END IF;
END $mvp225$;
-- MVP229: controles de activación temporal, remitentes y ACL.
DO $mvp229$
DECLARE flags jsonb;
BEGIN
 flags:=public.cotironda_piloto_ia_trial_flags_mvp229(repeat('a',64));
 IF flags->>'state'<>'inactive' OR flags->>'buyer'<>'false'
 THEN RAISE EXCEPTION 'mvp229_started_enabled';END IF;
 IF has_function_privilege('anon','public.cotironda_piloto_ia_trial_flags_mvp229(text)','EXECUTE')
 OR has_function_privilege('authenticated','public.cotironda_piloto_ia_trial_flags_mvp229(text)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.cotironda_piloto_ia_trial_flags_mvp229(text)','EXECUTE')
 THEN RAISE EXCEPTION 'mvp229_acl_leak';END IF;
 UPDATE cotironda_piloto_privado.ai_trial_control_mvp229
 SET enabled=true,activated_at=clock_timestamp(),
     expires_at=clock_timestamp()+interval '90 minutes' WHERE only_row;
 -- Deben seguir bloqueados los dos controles adicionales.
 flags:=public.cotironda_piloto_ia_trial_flags_mvp229(repeat('a',64));
 IF flags->>'buyer'<>'true' OR flags->>'dispatch'<>'false'
 THEN RAISE EXCEPTION 'mvp229_missing_gates_wrong_%',flags;END IF;
 UPDATE cotironda_piloto_privado.ai_dispatch_gate_mvp222
 SET enabled=true,activated_at=clock_timestamp() WHERE only_row;
 flags:=public.cotironda_piloto_ia_trial_flags_mvp229(repeat('a',64));
 IF flags->>'buyer'<>'true' OR flags->>'dispatch'<>'true'
 THEN RAISE EXCEPTION 'mvp229_buyer_dispatch_not_enabled_%',flags;END IF;
 flags:=public.cotironda_piloto_ia_trial_flags_mvp229(repeat('1',64));
 IF flags->>'buyer'<>'false' OR flags->>'quote_link'<>'true'
 OR flags->>'quote_analysis'<>'true'
 THEN RAISE EXCEPTION 'mvp229_supplier_missing_%',flags;END IF;
 flags:=public.cotironda_piloto_ia_trial_flags_mvp229(repeat('3',64));
 IF flags->>'buyer'<>'false' OR flags->>'quote_link'<>'false'
 THEN RAISE EXCEPTION 'mvp229_outside_supplier_allowlist_%',flags;END IF;
 flags:=public.cotironda_piloto_ia_trial_flags_mvp229(repeat('f',64));
 IF flags->>'state'<>'inactive'
 THEN RAISE EXCEPTION 'mvp229_unknown_sender_admitted_%',flags;END IF;
 UPDATE cotironda_piloto_privado.ai_trial_control_mvp229
 SET activated_at=clock_timestamp()-interval '2 hours',
     expires_at=clock_timestamp()-interval '1 hour' WHERE only_row;
 flags:=public.cotironda_piloto_ia_trial_flags_mvp229(repeat('a',64));
 IF flags->>'state'<>'inactive' OR flags->>'dispatch'<>'false'
 THEN RAISE EXCEPTION 'mvp229_expiry_not_enforced_%',flags;END IF;
 flags:=public.cotironda_piloto_ia_trial_flags_mvp229(repeat('1',64));
 IF flags->>'state'<>'reply_only' OR flags->>'quote_analysis'<>'true'
  OR flags->>'quote_link'<>'true' OR flags->>'buyer'<>'false'
  OR flags->>'dispatch'<>'false'
 THEN RAISE EXCEPTION 'mvp230_supplier_reply_lost_after_expiry_%',flags;END IF;
 -- An already-accepted provider can still quote even after an operator
 -- explicitly turns off the buyer/distribution gates.
 UPDATE cotironda_piloto_privado.ai_central_control_mvp226
 SET enabled=false,activated_at=null WHERE only_row;
 UPDATE cotironda_piloto_privado.ai_dispatch_gate_mvp222
 SET enabled=false,activated_at=null WHERE only_row;
 UPDATE cotironda_piloto_privado.ai_trial_control_mvp229
 SET enabled=false,activated_at=null,expires_at=null WHERE only_row;
 flags:=public.cotironda_piloto_ia_trial_flags_mvp229(repeat('1',64));
 IF flags->>'state'<>'reply_only' OR flags->>'quote_link'<>'true'
  OR flags->>'quote_analysis'<>'true' OR flags->>'dispatch'<>'false'
 THEN RAISE EXCEPTION 'mvp230_gate_off_wrongly_blocks_existing_quote_%',flags;END IF;
 flags:=public.cotironda_piloto_ia_trial_flags_mvp229(repeat('a',64));
 IF flags->>'state'<>'inactive' OR flags->>'buyer'<>'false'
  OR flags->>'dispatch'<>'false'
 THEN RAISE EXCEPTION 'mvp230_stale_buyer_still_creates_round_%',flags;END IF;
 -- A supplier without an accepted outbound PDF is not authorized.
 flags:=public.cotironda_piloto_ia_trial_flags_mvp229(repeat('3',64));
 IF flags->>'state'<>'inactive' OR flags->>'quote_link'<>'false'
 THEN RAISE EXCEPTION 'mvp230_unrelated_supplier_allowed_%',flags;END IF;
END $mvp229$;

ROLLBACK;
