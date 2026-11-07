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
 ('corralon_alfa','supplier','La Plata',repeat('1',64),now(),null,now()),
 ('pintureria_beta','supplier','La Plata',repeat('2',64),now(),null,null),
 ('electricidad_gamma','supplier','La Plata',repeat('3',64),now(),null,now()),
 ('sin_confirmar','supplier','La Plata',repeat('4',64),now(),null,null),
 ('revocado','supplier','La Plata',repeat('5',64),now(),now(),now());
INSERT INTO cotironda_piloto_privado.catalogue_lines
 (participant_key,line_no,literal_description,family_code,recognition_state)
VALUES
 ('corralon_alfa',1,'Cemento CPC bolsa 50 kilos','cemento_gris_obra','curated_family'),
 ('pintureria_beta',1,'Látex para interior 5L',null,'pending_review'),
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
  jsonb_build_object('proveedor','corralon_alfa','correspondencias',
    jsonb_build_array(jsonb_build_object('indicePedido',0,'numeroCatalogo',1,
      'descripcionCatalogo','Cemento CPC bolsa 50 kilos','rubroCatalogo','obra_gruesa',
      'tipo','producto_declarado','explicacion','Cemento coincidente'))),
  jsonb_build_object('proveedor','pintureria_beta','correspondencias',
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
    rid, unnest(ARRAY['corralon_alfa','pintureria_beta','electricidad_gamma']))
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

\ir ../../piloto/mvp222_ia_despacho_seguro_sin_activar.sql
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
 r:=public.cotironda_piloto_ia_publish_mvp222(rid);
 IF r->>'state'<>'dispatch_disabled'
 THEN RAISE EXCEPTION 'mvp222_publish_without_gate';END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.invitations)<>0 OR
 (SELECT count(*) FROM cotironda_piloto_privado.whapi_outbox)<>0
 THEN RAISE EXCEPTION 'mvp222_accidental_send_before_gate';END IF;
 UPDATE cotironda_piloto_privado.ai_dispatch_gate_mvp222
 SET enabled=true,activated_at=now() WHERE only_row;
 r:=public.cotironda_piloto_ia_publish_mvp222(rid);
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
   rid,supplier,lease,'api_accepted','abc12345678')
  THEN RAISE EXCEPTION 'mvp222_finish_failed';END IF;
  IF public.cotironda_piloto_ia_finish_mvp222(
   rid,supplier,lease,'api_accepted','abc12345678')
  THEN RAISE EXCEPTION 'mvp222_double_send_accepted';END IF;
  sent:=sent+1;
 END LOOP;
 IF sent<>3 OR public.cotironda_piloto_ia_claim_mvp222(rid)->>'state'<>'empty'
 THEN RAISE EXCEPTION 'mvp222_claim_after_finished';END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.whapi_outbox)<>0
 THEN RAISE EXCEPTION 'mvp222_legacy_outbox_was_mutated';END IF;
 UPDATE cotironda_piloto_privado.ai_dispatch_gate_mvp222
 SET enabled=false,activated_at=null WHERE only_row;
 IF public.cotironda_piloto_ia_claim_mvp222(rid)->>'state'<>'disabled'
 THEN RAISE EXCEPTION 'mvp222_gate_off_ignored';END IF;
 IF has_function_privilege('anon','public.cotironda_piloto_ia_publish_mvp222(uuid)','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.cotironda_piloto_ia_pdf_snapshot_mvp222(uuid,text,uuid)','EXECUTE')
 OR NOT has_function_privilege('service_role',
  'public.cotironda_piloto_ia_claim_mvp222(uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'mvp222_privileges_invalid';END IF;
END $test222$;
ROLLBACK;
