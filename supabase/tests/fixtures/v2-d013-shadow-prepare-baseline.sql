-- Fixture SQL function source read-only from PILOT PG17 at 12/11/2026.
-- Used only in synthetic CI transaction. DO NOT deploy baseline back to pilot.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_shadow_prepare_mvp221(p_buyer_chat_hmac text, p_message_hmac text, p_original_text text, p_city text, p_items jsonb, p_destinos jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_buyer text;
 v_source cotironda_piloto_privado.whapi_inbox%ROWTYPE;
 v_request uuid;
 v_item jsonb;
 v_destination jsonb;
 v_match jsonb;
 v_index bigint;
 v_number bigint;
 v_line_count integer;
 v_dest_count integer:=0;
 v_original_catalogue text;
 v_supplier text;
 v_rubro text;
 v_description text;
 v_evidence text;
 v_qty text;
 v_unit text;
 v_num numeric;
BEGIN
 IF p_buyer_chat_hmac IS NULL OR p_buyer_chat_hmac !~ '^[a-f0-9]{64}$'
  OR p_message_hmac IS NULL OR p_message_hmac !~ '^[a-f0-9]{64}$'
  OR p_original_text IS NULL OR length(p_original_text) NOT BETWEEN 10 AND 4000
  OR p_city IS NULL OR length(btrim(p_city)) NOT BETWEEN 3 AND 80
  OR p_city ~ '[[:cntrl:]]'
 THEN RETURN jsonb_build_object('state','invalid_input');END IF;
 IF p_items IS NULL OR jsonb_typeof(p_items)<>'array' THEN
  RETURN jsonb_build_object('state','invalid_items');END IF;
 v_line_count:=jsonb_array_length(p_items);
 IF v_line_count NOT BETWEEN 1 AND 200 THEN
  RETURN jsonb_build_object('state','capacity_requires_batches');END IF;
 IF p_destinos IS NULL OR jsonb_typeof(p_destinos)<>'array' THEN
  RETURN jsonb_build_object('state','invalid_destinations');END IF;
 IF jsonb_array_length(p_destinos) NOT BETWEEN 1 AND 25 THEN
  RETURN jsonb_build_object('state','invalid_destinations');END IF;

 -- Validar el MISMO mensaje que Whapi autenticó y archivó cifrado.
 SELECT m.* INTO v_source
 FROM cotironda_piloto_privado.whapi_inbox m
 JOIN cotironda_piloto_privado.participants buyer
  ON buyer.key=m.participant_key AND buyer.chat_hmac=m.chat_hmac
 WHERE m.message_hmac=p_message_hmac AND m.chat_hmac=p_buyer_chat_hmac
  AND m.request_id IS NULL AND m.processing_state='needs_review'
  AND ((m.kind='text' AND m.plaintext_sha256=
    encode(sha256(convert_to(p_original_text,'UTF8')),'hex'))
   OR (m.kind='document' AND
   cotironda_piloto_privado.fuente_original_documental_mvp276(
    m.message_hmac,m.chat_hmac,m.participant_key,encode(sha256(convert_to(p_original_text,'UTF8')),'hex')))
   OR (m.kind='document' AND
    cotironda_piloto_privado.fuente_binaria_comprador_mvp278(
      m.message_hmac,m.chat_hmac,m.participant_key,
      encode(sha256(convert_to(p_original_text,'UTF8')),'hex'),jsonb_array_length(p_items))))
  AND buyer.participant_role='buyer'
  AND buyer.consent_at IS NOT NULL AND buyer.opted_out_at IS NULL
  AND m.received_at>clock_timestamp()-interval '48 hours'
 FOR UPDATE OF m;
 IF NOT FOUND THEN
  IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.requests r
    WHERE r.source_hmac=p_message_hmac) THEN
   RETURN jsonb_build_object('state','already_staged');
  END IF;
  RETURN jsonb_build_object('state','source_not_authorized');
 END IF;
 v_buyer:=v_source.participant_key;

 -- Verificar TODAS las líneas antes de escribir ninguna.
 FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  IF jsonb_typeof(v_item)<>'object' THEN
   RETURN jsonb_build_object('state','invalid_item_schema');END IF;
  v_description:=v_item->>'descripcion';
  v_evidence:=v_item->>'evidencia';
  v_qty:=v_item->>'cantidad';
  v_unit:=v_item->>'unidad';
  v_rubro:=v_item->>'rubro';
  IF v_description IS NULL OR length(v_description) NOT BETWEEN 3 AND 500
   OR v_evidence IS NULL OR length(v_evidence) NOT BETWEEN 2 AND 1500
   OR position(v_evidence IN p_original_text)=0
   OR v_qty IS NULL OR v_qty !~ '^(?:0|[1-9][0-9]{0,5})(?:\.[0-9]{1,3})?$'
   OR v_unit IS NULL OR v_unit NOT IN
    ('unit','bag','box','kg','g','l','ml','m','m2','m3','roll','pack')
   OR v_rubro IS NULL OR v_rubro NOT IN
    ('obra_gruesa','pintura','electricidad','construccion_seca',
     'sanitarios','ferreteria','otros')
  THEN RETURN jsonb_build_object('state','invalid_item_data');END IF;
  v_num:=v_qty::numeric;
  IF v_num<=0 OR v_num>1000000 THEN
   RETURN jsonb_build_object('state','invalid_quantity');END IF;
 END LOOP;

 -- Propuesta IA: proveedor EXISTENTE, consentido, sin repetir índice y
 -- con catálogo que coincida BYTE-A-BYTE con la versión que vio el modelo.
 FOR v_destination IN SELECT value FROM jsonb_array_elements(p_destinos) LOOP
  v_supplier:=v_destination->>'proveedor';
  IF jsonb_typeof(v_destination)<>'object' OR v_supplier IS NULL
   OR v_supplier !~ '^[a-z][a-z0-9_]{2,63}$'
   OR jsonb_typeof(v_destination->'correspondencias')<>'array'
   OR jsonb_array_length(v_destination->'correspondencias') NOT BETWEEN 1 AND v_line_count
  THEN RETURN jsonb_build_object('state','invalid_supplier_plan');END IF;
  IF NOT EXISTS(
   SELECT 1 FROM cotironda_piloto_privado.participants p
   WHERE p.key=v_supplier AND p.participant_role='supplier'
    AND p.chat_hmac IS NOT NULL AND p.consent_at IS NOT NULL
    AND p.opted_out_at IS NULL
    AND lower(btrim(p.delivery_city))=lower(btrim(p_city))
  ) THEN RETURN jsonb_build_object('state','supplier_not_authorized');END IF;
  FOR v_match IN SELECT value FROM jsonb_array_elements(v_destination->'correspondencias')
  LOOP
   IF jsonb_typeof(v_match)<>'object'
    OR (v_match->>'indicePedido') !~ '^[0-9]{1,3}$'
    OR (v_match->>'numeroCatalogo') !~ '^[0-9]{1,3}$'
    OR v_match->>'tipo' NOT IN ('producto_declarado','alternativa_razonable')
    OR length(coalesce(v_match->>'explicacion','')) NOT BETWEEN 3 AND 240
   THEN RETURN jsonb_build_object('state','invalid_catalogue_match');END IF;
   v_index:=(v_match->>'indicePedido')::bigint;
   v_number:=(v_match->>'numeroCatalogo')::bigint;
   v_original_catalogue:=v_match->>'descripcionCatalogo';
   IF v_index NOT BETWEEN 0 AND v_line_count-1 OR v_number NOT BETWEEN 1 AND 500
    OR v_original_catalogue IS NULL
    OR v_match->>'rubroCatalogo' IS DISTINCT FROM
       p_items->(v_index::integer)->>'rubro'
   THEN RETURN jsonb_build_object('state','catalogue_not_verifiable');END IF;
   IF NOT EXISTS(
    SELECT 1 FROM cotironda_piloto_privado.catalogue_lines c
    JOIN cotironda_piloto_privado.participants p ON p.key=c.participant_key
    WHERE c.participant_key=v_supplier AND c.line_no=v_number
      AND c.literal_description=v_original_catalogue
      -- Comparar la descripción fuente exacta: no inventar catálogo.
   ) THEN RETURN jsonb_build_object('state','catalogue_changed');END IF;
   v_dest_count:=v_dest_count+1;
  END LOOP;
 END LOOP;
 IF v_dest_count=0 THEN
  RETURN jsonb_build_object('state','no_valid_destinations');END IF;

 -- A partir de aquí, cualquier error SQL aborta toda la transacción.
 -- NO insertar invitaciones: los triggers heredados crearían mensajes.
 INSERT INTO cotironda_piloto_privado.requests(
  buyer_key,delivery_city,original_request,source_hmac,state)
 VALUES(v_buyer,btrim(p_city),p_original_text,p_message_hmac,'draft')
 RETURNING id INTO v_request;
 INSERT INTO cotironda_piloto_privado.request_lines(
  request_id,line_no,original_description,quantity,unit,family_code)
 SELECT v_request,idx,(value->>'descripcion'),
  (value->>'cantidad')::numeric,(value->>'unidad'),NULL::text
 FROM jsonb_array_elements(p_items) WITH ORDINALITY AS x(value,idx);
 INSERT INTO cotironda_piloto_privado.ai_shadow_requests_mvp221(
  request_id,source_hmac) VALUES(v_request,p_message_hmac);
 INSERT INTO cotironda_piloto_privado.ai_shadow_rubros_mvp221(
  request_id,line_no,rubro,evidencia)
 SELECT v_request,idx,value->>'rubro',value->>'evidencia'
 FROM jsonb_array_elements(p_items) WITH ORDINALITY AS x(value,idx);
 INSERT INTO cotironda_piloto_privado.ai_shadow_destinos_mvp221(
  request_id,supplier_key,line_no,catalogue_line_no,
  catalogue_description,tipo,explicacion)
 SELECT v_request,d->>'proveedor',
  ((m->>'indicePedido')::integer+1)::smallint,
  (m->>'numeroCatalogo')::smallint,m->>'descripcionCatalogo',
  m->>'tipo',m->>'explicacion'
 FROM jsonb_array_elements(p_destinos) d
 CROSS JOIN LATERAL jsonb_array_elements(d->'correspondencias') m;
 UPDATE cotironda_piloto_privado.whapi_inbox
 SET request_id=v_request WHERE message_hmac=p_message_hmac;

 RETURN jsonb_build_object(
  'state','shadow_staged','request_id',v_request,
  'items_staged',v_line_count,'matches_staged',v_dest_count,
  'invitations_sent',0,'outbox_sent',0);
END
$function$

