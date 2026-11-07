-- MVP276 ROLLBACK MANUAL: only after ALL IA dispatch & central gates disabled.
-- Never use as an automatic production migration.
BEGIN;
DO $gate$
BEGIN
 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_central_control_mvp226 WHERE enabled)
 OR EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_dispatch_gate_mvp222 WHERE enabled)
 THEN RAISE EXCEPTION 'mvp276_rollback_requires_all_ia_gates_off';END IF;
 IF EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.requests r
  JOIN cotironda_piloto_privado.whapi_inbox m
   ON m.message_hmac=r.source_hmac AND m.request_id=r.id
  JOIN cotironda_piloto_privado.ai_shadow_requests_mvp221 sh
   ON sh.request_id=r.id
  WHERE m.kind='document' AND r.state IN('draft','prepared')
    AND r.closes_at>clock_timestamp()
 ) THEN RAISE EXCEPTION 'mvp276_rollback_has_active_document_rounds';END IF;
END $gate$;
CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_reserve_buyer_mvp226(
 p_chat_hmac text,p_message_hmac text,p_source_sha256 text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v_buyer text;v_count integer;v_rows integer;
BEGIN
 IF p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$'
 OR p_message_hmac IS NULL OR p_message_hmac !~ '^[a-f0-9]{64}$'
 OR p_source_sha256 IS NULL OR p_source_sha256 !~ '^[a-f0-9]{64}$'
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 IF NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_central_control_mvp226
  WHERE only_row AND enabled AND activated_at IS NOT NULL)
 OR NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.integration_flags
  WHERE only_row AND whatsapp_inbound_enabled)
 THEN RETURN jsonb_build_object('state','disabled');END IF;

 SELECT p.key INTO v_buyer FROM cotironda_piloto_privado.participants p
 JOIN cotironda_piloto_privado.whapi_inbox m
   ON m.participant_key=p.key AND m.chat_hmac=p.chat_hmac
 WHERE p.chat_hmac=p_chat_hmac AND p.participant_role='buyer'
   AND p.consent_at IS NOT NULL AND p.opted_out_at IS NULL
   AND m.message_hmac=p_message_hmac AND m.chat_hmac=p_chat_hmac
   AND m.plaintext_sha256=p_source_sha256
   AND m.kind='text' AND m.processing_state='needs_review'
   AND m.request_id IS NULL
   AND m.received_at>clock_timestamp()-interval '10 minutes'
 FOR UPDATE OF p;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_authorized');END IF;

 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_central_attempts_mvp226
  WHERE message_hmac=p_message_hmac)
 THEN RETURN jsonb_build_object('state','already_reserved');END IF;
 SELECT count(*) INTO v_count
 FROM cotironda_piloto_privado.ai_central_attempts_mvp226 a
 WHERE a.buyer_key=v_buyer AND a.created_at>clock_timestamp()-interval '24 hours';
 -- Each request may trigger 4 AI calls; hard rate limit to contain costs.
 IF v_count>=6 THEN RETURN jsonb_build_object('state','quota_exceeded');END IF;
 INSERT INTO cotironda_piloto_privado.ai_central_attempts_mvp226(
  message_hmac,buyer_key,chat_hmac,source_sha256)
 VALUES(p_message_hmac,v_buyer,p_chat_hmac,p_source_sha256)
 ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS v_rows=ROW_COUNT;
 RETURN jsonb_build_object('state',
  CASE WHEN v_rows=1 THEN 'reserved' ELSE 'already_reserved' END);
END
$fn$;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_shadow_prepare_mvp221(
 p_buyer_chat_hmac text, p_message_hmac text,
 p_original_text text, p_city text,
 p_items jsonb, p_destinos jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $f$
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
  AND m.kind='text' AND m.request_id IS NULL
  AND m.processing_state='needs_review'
  AND m.plaintext_sha256=encode(sha256(convert_to(p_original_text,'UTF8')),'hex')
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
$f$;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_publish_mvp222(
 p_request uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $publish$
DECLARE v_round record; source record; buyer record; sup record;
 v_supplier_count int; v_lines int; v_pairs int; v_added int;
BEGIN
 IF p_request IS NULL THEN RETURN jsonb_build_object('state','invalid_request');END IF;
 IF NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_dispatch_gate_mvp222
  WHERE only_row AND enabled AND activated_at IS NOT NULL)
 THEN RETURN jsonb_build_object('state','dispatch_disabled');END IF;
 IF NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.integration_flags
  WHERE only_row AND whatsapp_outbound_enabled)
 THEN RETURN jsonb_build_object('state','transport_disabled');END IF;

 SELECT r.id,r.state,r.buyer_key,r.source_hmac,r.original_request,
  r.delivery_city,r.closes_at
 INTO v_round FROM cotironda_piloto_privado.requests r
 JOIN cotironda_piloto_privado.ai_shadow_requests_mvp221 a ON a.request_id=r.id
 WHERE r.id=p_request AND a.status='shadow'
 FOR UPDATE OF r;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_shadow_request');END IF;
 IF v_round.state='prepared' THEN RETURN jsonb_build_object('state','already_published');END IF;
 IF v_round.state<>'draft' OR v_round.closes_at<=clock_timestamp()
 THEN RETURN jsonb_build_object('state','request_not_ready');END IF;

 SELECT b.key,b.chat_hmac INTO buyer FROM cotironda_piloto_privado.participants b
 WHERE b.key=v_round.buyer_key AND b.participant_role='buyer'
  AND b.chat_hmac IS NOT NULL AND b.consent_at IS NOT NULL
  AND b.opted_out_at IS NULL;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','buyer_not_authorized');END IF;
 IF v_round.source_hmac IS NULL OR v_round.source_hmac !~ '^[0-9a-f]{64}$'
 THEN RETURN jsonb_build_object('state','source_invalid');END IF;
 SELECT m.message_hmac,m.chat_hmac,m.participant_key,m.plaintext_sha256
 INTO source FROM cotironda_piloto_privado.whapi_inbox m
 WHERE m.message_hmac=v_round.source_hmac AND m.request_id=v_round.id
  AND m.participant_key=buyer.key AND m.chat_hmac=buyer.chat_hmac
  AND m.kind='text' AND m.processing_state='needs_review'
  AND m.plaintext_sha256=encode(sha256(convert_to(v_round.original_request,'UTF8')),'hex');
 IF NOT FOUND THEN RETURN jsonb_build_object('state','source_not_verified');END IF;

 SELECT count(*) INTO v_lines FROM cotironda_piloto_privado.request_lines l
 WHERE l.request_id=v_round.id;
 IF v_lines NOT BETWEEN 1 AND 25 THEN
  RETURN jsonb_build_object('state','request_exceeds_pdf_limit'); END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.ai_shadow_rubros_mvp221 l
     WHERE l.request_id=v_round.id)<>v_lines THEN
  RETURN jsonb_build_object('state','rubros_incomplete');END IF;

 -- Cobertura: no ocultar silenciosamente materiales sin destino.
 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.request_lines l
  WHERE l.request_id=v_round.id AND NOT EXISTS(
   SELECT 1 FROM cotironda_piloto_privado.ai_shadow_destinos_mvp221 d
   WHERE d.request_id=l.request_id AND d.line_no=l.line_no))
 THEN RETURN jsonb_build_object('state','uncovered_items'); END IF;
 SELECT count(DISTINCT d.supplier_key),count(*) INTO v_supplier_count,v_pairs
 FROM cotironda_piloto_privado.ai_shadow_destinos_mvp221 d
 WHERE d.request_id=v_round.id;
 IF v_supplier_count NOT BETWEEN 1 AND 25 OR v_pairs>625
 THEN RETURN jsonb_build_object('state','too_many_suppliers'); END IF;

 -- Revalidar catálogo/zonas bajo lock. La falta de confirmación formal
 -- NO impide INVITAR a cotizar si el proveedor ya consintió el contacto.
 FOR sup IN
  SELECT p.key,p.delivery_city
  FROM cotironda_piloto_privado.participants p
  JOIN (SELECT DISTINCT supplier_key FROM
    cotironda_piloto_privado.ai_shadow_destinos_mvp221
    WHERE request_id=v_round.id) d ON d.supplier_key=p.key
  ORDER BY p.key FOR UPDATE OF p
 LOOP
  IF sup.delivery_city IS NULL
  THEN RETURN jsonb_build_object('state','supplier_without_zone');END IF;
 END LOOP;
 IF EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.ai_shadow_destinos_mvp221 d
  JOIN cotironda_piloto_privado.request_lines l ON
    l.request_id=d.request_id AND l.line_no=d.line_no
  JOIN cotironda_piloto_privado.participants p ON p.key=d.supplier_key
  LEFT JOIN cotironda_piloto_privado.catalogue_lines c
    ON c.participant_key=d.supplier_key AND c.line_no=d.catalogue_line_no
  WHERE d.request_id=v_round.id AND (
    p.participant_role<>'supplier' OR p.chat_hmac IS NULL OR
    p.consent_at IS NULL OR p.opted_out_at IS NOT NULL OR
    lower(btrim(p.delivery_city))<>lower(btrim(v_round.delivery_city)) OR
    c.line_no IS NULL OR c.literal_description<>d.catalogue_description
  )
 ) THEN RETURN jsonb_build_object('state','catalogue_or_identity_changed');END IF;
 IF EXISTS(SELECT 1 FROM
  (SELECT supplier_key,count(*) AS n
   FROM cotironda_piloto_privado.ai_shadow_destinos_mvp221
   WHERE request_id=v_round.id GROUP BY supplier_key) x
  WHERE x.n NOT BETWEEN 1 AND 25)
 THEN RETURN jsonb_build_object('state','supplier_pdf_limit');END IF;

 -- El trigger legacy omite SOLO el sidecar IA. No insertar por fuera.
 INSERT INTO cotironda_piloto_privado.invitations(request_id,supplier_key)
 SELECT v_round.id,d.supplier_key FROM (
  SELECT DISTINCT supplier_key FROM cotironda_piloto_privado.ai_shadow_destinos_mvp221
  WHERE request_id=v_round.id) d ORDER BY d.supplier_key;
 GET DIAGNOSTICS v_added=ROW_COUNT;
 IF v_added<>v_supplier_count THEN RAISE EXCEPTION 'mvp222_invitation_count';END IF;
 INSERT INTO cotironda_piloto_privado.invitation_lines_mvp099(
  request_id,supplier_key,line_no)
 SELECT request_id,supplier_key,line_no
 FROM cotironda_piloto_privado.ai_shadow_destinos_mvp221
 WHERE request_id=v_round.id ORDER BY supplier_key,line_no;
 GET DIAGNOSTICS v_added=ROW_COUNT;
 IF v_added<>v_pairs THEN RAISE EXCEPTION 'mvp222_pair_count';END IF;
 INSERT INTO cotironda_piloto_privado.ai_dispatch_jobs_mvp222(request_id,supplier_key)
 SELECT v_round.id,supplier_key FROM (
  SELECT DISTINCT supplier_key FROM cotironda_piloto_privado.ai_shadow_destinos_mvp221
  WHERE request_id=v_round.id) d ORDER BY supplier_key;
 GET DIAGNOSTICS v_added=ROW_COUNT;
 IF v_added<>v_supplier_count THEN RAISE EXCEPTION 'mvp222_job_count';END IF;
 UPDATE cotironda_piloto_privado.requests SET state='prepared' WHERE id=v_round.id;
 RETURN jsonb_build_object('state','ready_for_delivery',
  'suppliers',v_supplier_count,'source_lines',v_lines,
  'mapped_lines',v_pairs,'legacy_whapi_jobs',0);
END;
$publish$;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_ready_for_chat_mvp223(
 p_buyer_chat_hmac text
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $lookup$
DECLARE rid uuid; n int;
BEGIN
 IF p_buyer_chat_hmac IS NULL OR
  p_buyer_chat_hmac !~ '^[a-f0-9]{64}$'
 THEN RETURN jsonb_build_object('state','invalid_input');END IF;
 IF NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_dispatch_gate_mvp222
  WHERE only_row AND enabled AND activated_at IS NOT NULL)
 OR NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.integration_flags
  WHERE only_row AND whatsapp_outbound_enabled)
 THEN RETURN jsonb_build_object('state','disabled');END IF;
 SELECT count(DISTINCT r.id),min(r.id::text)::uuid INTO n,rid
 FROM cotironda_piloto_privado.requests r
 JOIN cotironda_piloto_privado.ai_shadow_requests_mvp221 shadow
  ON shadow.request_id=r.id AND shadow.status='shadow'
 JOIN cotironda_piloto_privado.participants b
  ON b.key=r.buyer_key
 JOIN cotironda_piloto_privado.whapi_inbox src
  ON src.message_hmac=r.source_hmac AND src.request_id=r.id
  AND src.participant_key=b.key AND src.chat_hmac=b.chat_hmac
 JOIN cotironda_piloto_privado.ai_dispatch_jobs_mvp222 job
  ON job.request_id=r.id AND job.state='pending'
 WHERE r.state='prepared' AND r.closes_at>clock_timestamp()
  AND r.created_at>clock_timestamp()-interval '30 minutes'
  AND b.participant_role='buyer'
  AND b.chat_hmac=p_buyer_chat_hmac
  AND b.consent_at IS NOT NULL AND b.opted_out_at IS NULL
  AND src.kind='text' AND src.processing_state='needs_review'
  AND src.plaintext_sha256=
    encode(sha256(convert_to(r.original_request,'UTF8')),'hex');
 IF n=0 THEN RETURN jsonb_build_object('state','empty');END IF;
 IF n<>1 THEN RETURN jsonb_build_object('state','ambiguous');END IF;
 RETURN jsonb_build_object('state','ready','request_id',rid);
END;
$lookup$;

REVOKE ALL ON FUNCTION
 public.cotironda_piloto_ia_reserve_buyer_mvp226(text,text,text),
 public.cotironda_piloto_ia_shadow_prepare_mvp221(text,text,text,text,jsonb,jsonb),
 public.cotironda_piloto_ia_publish_mvp222(uuid),
 public.cotironda_piloto_ia_ready_for_chat_mvp223(text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_ia_reserve_buyer_mvp226(text,text,text),
 public.cotironda_piloto_ia_shadow_prepare_mvp221(text,text,text,text,jsonb,jsonb),
 public.cotironda_piloto_ia_publish_mvp222(uuid),
 public.cotironda_piloto_ia_ready_for_chat_mvp223(text)
 TO service_role;
DROP FUNCTION IF EXISTS cotironda_piloto_privado.fuente_original_documental_mvp276(
 text,text,text,text
);
COMMIT;
