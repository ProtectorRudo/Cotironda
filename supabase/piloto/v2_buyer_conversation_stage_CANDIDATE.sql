-- CANDIDATO. Requiere cola 005d08c. Solo texto verificable por fragmento.
ALTER TABLE cotironda_piloto_privado.v2_buyer_conversations
 ADD COLUMN request_id uuid UNIQUE REFERENCES cotironda_piloto_privado.requests(id),
 ADD COLUMN requested_payment text, ADD COLUMN requested_vat text,
 ADD COLUMN payment_origin text, ADD COLUMN vat_origin text,
 ADD CONSTRAINT v2_conversation_done_has_request CHECK((state='done')=(request_id IS NOT NULL)),
 ADD CONSTRAINT v2_conversation_conditions CHECK(request_id IS NULL OR
 (requested_payment IS NOT NULL AND requested_vat IS NOT NULL AND payment_origin IS NOT NULL AND vat_origin IS NOT NULL
 AND payment_origin IN ('predeterminado','comprador') AND vat_origin IN ('predeterminado','comprador')));
ALTER TABLE cotironda_piloto_privado.v2_buyer_conversation_sources ADD COLUMN text_length integer CHECK(text_length>0),
 ADD COLUMN media_sha256 text CHECK(media_sha256 ~ '^[a-f0-9]{64}$'),
 ADD COLUMN derived_sha256 text CHECK(derived_sha256 ~ '^[a-f0-9]{64}$');
-- Archive identity, private storage and byte hash must still agree at staging AND release.
CREATE FUNCTION cotironda_piloto_privado.v2_conversation_document_verified(p_hmac text,p_chat text,p_buyer text,p_media_sha text,p_request uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $fn$
 SELECT EXISTS(SELECT 1 FROM cotironda_piloto_privado.media_archive_mvp095 a
 JOIN cotironda_piloto_privado.whapi_inbox m ON m.message_hmac=a.message_hmac AND m.kind=a.kind AND m.chat_hmac=a.chat_hmac AND m.participant_key=a.participant_key
 JOIN storage.objects o ON o.bucket_id='cotironda-piloto-originals' AND o.name=a.storage_path
 JOIN storage.buckets b ON b.id=o.bucket_id AND b.public=false
 WHERE a.message_hmac=p_hmac AND a.chat_hmac=p_chat AND a.participant_key=p_buyer
 AND a.kind IN ('document','image') AND a.state='stored' AND a.finished_at IS NOT NULL
 AND ((a.kind='document' AND a.mime IN ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/plain','text/csv'))
 OR (a.kind='image' AND a.mime IN ('image/jpeg','image/png','image/webp')))
 AND a.content_sha256=p_media_sha AND a.storage_path='media/'||p_hmac
 AND a.size_bytes BETWEEN 1 AND 3145728 AND a.request_id IS NOT DISTINCT FROM p_request);
$fn$;
REVOKE ALL ON FUNCTION cotironda_piloto_privado.v2_conversation_document_verified(text,text,text,text,uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.cotironda_piloto_v2_conversation_document_source(p_chat_hmac text,p_id uuid,p_revision bigint,p_lease uuid,p_message_hmac text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $fn$
 SELECT jsonb_build_object('state','authorized_document','mime',a.mime,'size',a.size_bytes,'sha256',a.content_sha256,'manifest_id_sha256',a.media_id_sha256,'kind',a.kind)
 FROM cotironda_piloto_privado.v2_buyer_conversations g
 JOIN cotironda_piloto_privado.participants b ON b.key=g.buyer_key AND b.chat_hmac=g.chat_hmac AND b.participant_role='buyer' AND b.consent_at IS NOT NULL AND b.opted_out_at IS NULL
 JOIN cotironda_piloto_privado.v2_buyer_conversation_sources s ON s.conversation_id=g.id AND s.message_hmac=p_message_hmac AND s.kind IN ('document','image')
 JOIN cotironda_piloto_privado.whapi_inbox m ON m.message_hmac=s.message_hmac AND m.plaintext_sha256=s.source_sha256 AND m.chat_hmac=g.chat_hmac AND m.participant_key=g.buyer_key AND m.kind=s.kind AND m.request_id IS NULL
 JOIN cotironda_piloto_privado.media_archive_mvp095 a ON a.message_hmac=s.message_hmac
 WHERE a.kind=s.kind AND g.id=p_id AND g.chat_hmac=p_chat_hmac AND g.revision=p_revision AND g.lease=p_lease AND g.lease_until>clock_timestamp() AND g.state='processing'
 AND cotironda_piloto_privado.v2_conversation_document_verified(s.message_hmac,g.chat_hmac,g.buyer_key,a.content_sha256,NULL);
$fn$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_v2_conversation_document_source(text,uuid,bigint,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_v2_conversation_document_source(text,uuid,bigint,uuid,text) TO service_role;
CREATE FUNCTION cotironda_piloto_privado.v2_conversation_source_verified(p_request uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE g record; f record; pos integer:=1; n integer:=0;
BEGIN
 SELECT c.id,c.buyer_key,c.chat_hmac,r.original_request,r.source_hmac INTO g
 FROM cotironda_piloto_privado.v2_buyer_conversations c JOIN cotironda_piloto_privado.requests r ON r.id=c.request_id AND r.buyer_key=c.buyer_key
 JOIN cotironda_piloto_privado.participants b ON b.key=c.buyer_key AND b.chat_hmac=c.chat_hmac AND b.participant_role='buyer' AND b.consent_at IS NOT NULL AND b.opted_out_at IS NULL
 WHERE c.request_id=p_request AND c.state='done';
 IF NOT FOUND THEN RETURN false; END IF;
 FOR f IN SELECT s.*,m.chat_hmac,m.participant_key,m.plaintext_sha256,m.request_id,m.kind AS inbox_kind
 FROM cotironda_piloto_privado.v2_buyer_conversation_sources s JOIN cotironda_piloto_privado.whapi_inbox m USING(message_hmac)
 WHERE s.conversation_id=g.id ORDER BY s.received_at,s.message_hmac LOOP
  IF n=0 AND f.message_hmac IS DISTINCT FROM g.source_hmac THEN RETURN false; END IF;
  IF n>0 THEN IF substring(g.original_request FROM pos FOR 2)<>E'\n\n' THEN RETURN false; END IF; pos:=pos+2; END IF;
  IF f.text_length IS NULL OR f.text_length<1 OR f.kind NOT IN ('text','document','image') OR f.inbox_kind<>f.kind
   OR f.chat_hmac IS DISTINCT FROM g.chat_hmac OR f.participant_key IS DISTINCT FROM g.buyer_key
   OR f.request_id IS DISTINCT FROM p_request OR f.plaintext_sha256 IS DISTINCT FROM f.source_sha256
   OR encode(sha256(convert_to(substring(g.original_request FROM pos FOR f.text_length),'UTF8')),'hex') IS DISTINCT FROM (CASE WHEN f.kind='text' THEN f.source_sha256 ELSE f.derived_sha256 END)
   OR (f.kind IN ('document','image') AND NOT cotironda_piloto_privado.v2_conversation_document_verified(f.message_hmac,g.chat_hmac,g.buyer_key,f.media_sha256,p_request))
  THEN RETURN false; END IF;
  pos:=pos+f.text_length;n:=n+1;
 END LOOP;
 RETURN n>0 AND pos=length(g.original_request)+1;
END $fn$;
REVOKE ALL ON FUNCTION cotironda_piloto_privado.v2_conversation_source_verified(uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.cotironda_piloto_v2_conversation_stage(p_buyer_chat_hmac text,p_id uuid,p_revision bigint,p_lease uuid,p_fragments jsonb,p_city text,p_items jsonb,p_destinos jsonb,p_payment jsonb,p_vat jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_buyer text;
 p_message_hmac text;
 p_original_text text;
 v_g cotironda_piloto_privado.v2_buyer_conversations%ROWTYPE;
 v_f record; v_ord integer:=0; v_part text;
 v_payment text; v_vat text;
 v_condition jsonb; v_condition_kind text; v_condition_value text;
 v_payment_origin text; v_vat_origin text;
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
  OR p_id IS NULL OR p_revision IS NULL OR p_lease IS NULL
  OR jsonb_typeof(p_fragments) IS DISTINCT FROM 'array'
  OR p_city IS NULL OR length(btrim(p_city)) NOT BETWEEN 3 AND 80 OR p_city ~ '[[:cntrl:]]'
  OR jsonb_typeof(p_items) IS DISTINCT FROM 'array'
  OR jsonb_typeof(p_destinos) IS DISTINCT FROM 'array'
 THEN RETURN jsonb_build_object('state','invalid_conversation');END IF;
 v_line_count:=jsonb_array_length(p_items);
 IF v_line_count NOT BETWEEN 1 AND 25 OR jsonb_array_length(p_destinos) NOT BETWEEN 1 AND 25
 THEN RETURN jsonb_build_object('state','capacity_requires_batches');END IF;
 IF NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_central_control_mvp226 WHERE only_row AND enabled AND activated_at IS NOT NULL)
 OR NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.integration_flags WHERE only_row AND whatsapp_inbound_enabled)
 THEN RETURN jsonb_build_object('state','disabled');END IF;
 SELECT key INTO v_buyer FROM cotironda_piloto_privado.participants
 WHERE chat_hmac=p_buyer_chat_hmac AND participant_role='buyer'
 AND consent_at IS NOT NULL AND opted_out_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_authorized');END IF;
 SELECT * INTO v_g FROM cotironda_piloto_privado.v2_buyer_conversations
 WHERE id=p_id AND buyer_key=v_buyer AND chat_hmac=p_buyer_chat_hmac FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_authorized');END IF;
 IF v_g.request_id IS NOT NULL AND v_g.state='done' THEN
  RETURN jsonb_build_object('state','already_staged','request_id',v_g.request_id);
 END IF;
 IF v_g.state<>'processing' OR v_g.revision<>p_revision OR v_g.lease IS DISTINCT FROM p_lease
 OR v_g.lease_until<=clock_timestamp() THEN RETURN jsonb_build_object('state','stale');END IF;
 IF jsonb_array_length(p_fragments) NOT BETWEEN 1 AND 100
 OR jsonb_array_length(p_fragments)<>(SELECT count(*) FROM cotironda_piloto_privado.v2_buyer_conversation_sources WHERE conversation_id=p_id)
 THEN RETURN jsonb_build_object('state','source_count_mismatch');END IF;
 p_original_text:='';
 FOR v_f IN SELECT s.*,m.chat_hmac,m.participant_key,m.plaintext_sha256,m.request_id,m.processing_state,m.kind AS inbox_kind
 FROM cotironda_piloto_privado.v2_buyer_conversation_sources s JOIN cotironda_piloto_privado.whapi_inbox m USING(message_hmac)
 WHERE s.conversation_id=p_id ORDER BY s.received_at,s.message_hmac FOR UPDATE OF m LOOP
  v_part:=p_fragments->v_ord->>'text';
  IF v_f.kind NOT IN ('text','document','image') OR v_f.inbox_kind<>v_f.kind OR v_f.chat_hmac IS DISTINCT FROM p_buyer_chat_hmac
   OR v_f.participant_key IS DISTINCT FROM v_buyer OR v_f.request_id IS NOT NULL
   OR v_f.processing_state NOT IN ('needs_review','needs_zone')
   OR v_f.plaintext_sha256 IS DISTINCT FROM v_f.source_sha256
   OR p_fragments->v_ord->>'message_hmac' IS DISTINCT FROM v_f.message_hmac
   OR v_part IS NULL OR length(v_part)<1
   OR (v_f.kind='text' AND encode(sha256(convert_to(v_part,'UTF8')),'hex') IS DISTINCT FROM v_f.source_sha256)
   OR (v_f.kind IN ('document','image') AND (p_fragments->v_ord->>'derived_sha256' IS DISTINCT FROM encode(sha256(convert_to(v_part,'UTF8')),'hex')
     OR NOT cotironda_piloto_privado.v2_conversation_document_verified(v_f.message_hmac,p_buyer_chat_hmac,v_buyer,p_fragments->v_ord->>'media_sha256',NULL)))
  THEN RETURN jsonb_build_object('state','source_not_authorized');END IF;
  IF v_ord=0 THEN p_message_hmac:=v_f.message_hmac; ELSE p_original_text:=p_original_text||E'\n\n'; END IF;
  p_original_text:=p_original_text||v_part;
  v_ord:=v_ord+1;
 END LOOP;
 IF v_ord<>jsonb_array_length(p_fragments) OR length(p_original_text) NOT BETWEEN 10 AND 12000 THEN RETURN jsonb_build_object('state','source_count_or_length_mismatch');END IF;
 FOR v_condition_kind,v_condition IN SELECT * FROM (VALUES ('payment',p_payment),('vat',p_vat)) c(k,v) LOOP
  IF v_condition IS NULL OR v_condition='null'::jsonb THEN
   v_condition_value:=CASE WHEN v_condition_kind='payment' THEN 'Contado efectivo' ELSE 'Precios sin IVA' END;
   IF v_condition_kind='payment' THEN v_payment_origin:='predeterminado'; ELSE v_vat_origin:='predeterminado'; END IF;
  ELSE
   v_condition_value:=v_condition->>'literal';
   IF jsonb_typeof(v_condition)<>'object' OR v_condition_value IS NULL OR length(btrim(v_condition_value)) NOT BETWEEN 1 AND 120
    OR v_condition_value ~ '[[:cntrl:]]' OR v_condition_value ~* '(https?://|www[.]|@|whatsapp|tel[eé]fono|celular|cuit|cuil|correo|email|raz[oó]n social|([+]?[0-9][ .-]?){9,})'
    OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_fragments) f
     WHERE f->>'message_hmac'=v_condition->>'message_hmac' AND position(v_condition_value IN (f->>'text'))>0)
   THEN RETURN jsonb_build_object('state','condition_not_verified');END IF;
   IF v_condition_kind='payment' THEN v_payment_origin:='comprador'; ELSE v_vat_origin:='comprador'; END IF;
  END IF;
  IF v_condition_kind='payment' THEN v_payment:=btrim(v_condition_value); ELSE v_vat:=btrim(v_condition_value); END IF;
 END LOOP;
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
   OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_fragments) f WHERE position(v_evidence IN (f->>'text'))>0)
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
    OR v_match->>'rubroCatalogo' IS NULL
    OR v_match->>'rubroCatalogo' NOT IN ('obra_gruesa','pintura','electricidad','construccion_seca','sanitarios','ferreteria','otros')
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
  buyer_key,delivery_city,original_request,source_hmac,state,timing_mode)
 VALUES(v_buyer,btrim(p_city),p_original_text,p_message_hmac,'draft',
  CASE WHEN EXISTS(
   SELECT 1 FROM cotironda_piloto_privado.v2_business_policy policy
   WHERE policy.singleton=true AND policy.enabled=true
    AND policy.activated_at IS NOT NULL
  ) THEN 'business_two_days' ELSE 'legacy_calendar' END)
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
 SET request_id=v_request WHERE message_hmac IN (SELECT message_hmac FROM cotironda_piloto_privado.v2_buyer_conversation_sources WHERE conversation_id=p_id);
 UPDATE cotironda_piloto_privado.media_archive_mvp095 a SET request_id=v_request
 WHERE a.message_hmac IN (SELECT message_hmac FROM cotironda_piloto_privado.v2_buyer_conversation_sources WHERE conversation_id=p_id AND kind IN ('document','image')) AND a.request_id IS NULL;
 UPDATE cotironda_piloto_privado.v2_buyer_conversation_sources s SET text_length=length(f->>'text'),
 media_sha256=CASE WHEN s.kind IN ('document','image') THEN f->>'media_sha256' END,
 derived_sha256=CASE WHEN s.kind IN ('document','image') THEN f->>'derived_sha256' END
 FROM jsonb_array_elements(p_fragments) f WHERE s.conversation_id=p_id AND s.message_hmac=f->>'message_hmac';
 UPDATE cotironda_piloto_privado.v2_buyer_conversations SET request_id=v_request,state='done',lease=NULL,lease_until=NULL,
  requested_payment=v_payment,requested_vat=v_vat,payment_origin=v_payment_origin,vat_origin=v_vat_origin WHERE id=p_id;
 IF NOT cotironda_piloto_privado.v2_conversation_source_verified(v_request) THEN RAISE EXCEPTION 'conversation_integrity'; END IF;

 RETURN jsonb_build_object(
  'state','shadow_staged','request_id',v_request,
  'items_staged',v_line_count,'matches_staged',v_dest_count,
  'invitations_sent',0,'outbox_sent',0);
END
$function$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_v2_conversation_stage(text,uuid,bigint,uuid,jsonb,text,jsonb,jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_v2_conversation_stage(text,uuid,bigint,uuid,jsonb,text,jsonb,jsonb,jsonb,jsonb) TO service_role;
CREATE OR REPLACE FUNCTION cotironda_piloto_privado.fuente_revisable_mvp280(p_request uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT coalesce(EXISTS(
 SELECT 1 FROM cotironda_piloto_privado.requests r
 JOIN cotironda_piloto_privado.participants buyer
  ON buyer.key=r.buyer_key
 JOIN cotironda_piloto_privado.whapi_inbox msg
  ON msg.message_hmac=r.source_hmac
  AND msg.request_id=r.id
  AND msg.participant_key=buyer.key AND msg.chat_hmac=buyer.chat_hmac
 WHERE r.id=p_request AND r.state IN('draft','prepared')
  AND r.closes_at>clock_timestamp()
  AND buyer.participant_role='buyer'
  AND buyer.consent_at IS NOT NULL AND buyer.opted_out_at IS NULL
  AND msg.processing_state='needs_review'
  AND (SELECT count(*) FROM cotironda_piloto_privado.request_lines l
       WHERE l.request_id=r.id) BETWEEN 1 AND 25
  AND (
   cotironda_piloto_privado.v2_conversation_source_verified(r.id)
   OR (msg.kind='text' AND msg.plaintext_sha256=
     encode(sha256(convert_to(r.original_request,'UTF8')),'hex'))
   OR (msg.kind='document' AND (
    cotironda_piloto_privado.fuente_original_documental_mvp276(
     msg.message_hmac,msg.chat_hmac,msg.participant_key,
     encode(sha256(convert_to(r.original_request,'UTF8')),'hex'))
    OR
    cotironda_piloto_privado.fuente_binaria_comprador_mvp278(
     msg.message_hmac,msg.chat_hmac,msg.participant_key,
     encode(sha256(convert_to(r.original_request,'UTF8')),'hex'),
     (SELECT count(*)::integer FROM cotironda_piloto_privado.request_lines l
      WHERE l.request_id=r.id))
   )
   AND EXISTS(
    SELECT 1 FROM cotironda_piloto_privado.media_archive_mvp095 a
    JOIN storage.objects o ON o.bucket_id='cotironda-piloto-originals'
     AND o.name=a.storage_path
    WHERE a.message_hmac=msg.message_hmac AND a.chat_hmac=msg.chat_hmac
     AND a.participant_key=msg.participant_key AND a.state='stored'
   ))
  )
 ),false);
$function$;
CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_publish_mvp222(p_request uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  r.delivery_city,r.closes_at,r.timing_mode,r.round_days,r.v2_calendar_revision
 INTO v_round FROM cotironda_piloto_privado.requests r
 JOIN cotironda_piloto_privado.ai_shadow_requests_mvp221 a ON a.request_id=r.id
 WHERE r.id=p_request AND a.status='shadow'
 FOR UPDATE OF r;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_shadow_request');END IF;
 IF v_round.state='prepared' THEN RETURN jsonb_build_object('state','already_published');END IF;
 IF v_round.state<>'draft' OR v_round.closes_at<=clock_timestamp()
 THEN RETURN jsonb_build_object('state','request_not_ready');END IF;
 -- PDF/Office may NEVER publish without an authenticated, version-locked
 -- one-time approval. Existing TEXT and TXT/CSV flows remain unchanged.
 IF NOT cotironda_piloto_privado.confirmada_comprador_mvp280(v_round.id)
 THEN RETURN jsonb_build_object('state','buyer_review_required');END IF;

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
  AND m.processing_state='needs_review'
  AND (cotironda_piloto_privado.v2_conversation_source_verified(v_round.id)
   OR (m.kind='text' AND m.plaintext_sha256=
   encode(sha256(convert_to(v_round.original_request,'UTF8')),'hex'))
   OR (m.kind='document' AND
   cotironda_piloto_privado.fuente_original_documental_mvp276(
    m.message_hmac,m.chat_hmac,m.participant_key,encode(sha256(convert_to(v_round.original_request,'UTF8')),'hex')))
   OR (m.kind='document' AND
    cotironda_piloto_privado.fuente_binaria_comprador_mvp278(
      m.message_hmac,m.chat_hmac,m.participant_key,
      encode(sha256(convert_to(v_round.original_request,'UTF8')),'hex'),(SELECT count(*)::integer FROM cotironda_piloto_privado.request_lines l WHERE l.request_id=v_round.id))));
 IF NOT FOUND THEN RETURN jsonb_build_object('state','source_not_verified');END IF;

 SELECT count(*) INTO v_lines FROM cotironda_piloto_privado.request_lines l
 WHERE l.request_id=v_round.id;
 IF v_lines NOT BETWEEN 1 AND 25 THEN
  RETURN jsonb_build_object('state','request_exceeds_pdf_limit'); END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.ai_shadow_rubros_mvp221 l
     WHERE l.request_id=v_round.id)<>v_lines THEN
  RETURN jsonb_build_object('state','rubros_incomplete');END IF;

 -- Cobertura: no ocultar silenciosamente materiales sin destino.
 IF NOT (v_round.timing_mode IS NOT DISTINCT FROM 'business_two_days'
  AND v_round.round_days IS NOT DISTINCT FROM 2
  AND v_round.v2_calendar_revision IS NOT NULL)
 AND EXISTS(SELECT 1 FROM cotironda_piloto_privado.request_lines l
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
$function$;
CREATE OR REPLACE FUNCTION cotironda_piloto_privado.ai_buyer_snapshot_mvp279(p_request uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT jsonb_build_object(
  'requestId',r.id::text,'buyer',r.buyer_key,'source',r.source_hmac,
  'originalTextHash',encode(sha256(convert_to(r.original_request,'UTF8')),'hex'),
  'sourceKind',m.kind,'sourceMime',a.mime,
  'originalDocumentHash',a.content_sha256,
  'originalBinaryHash',e.original_sha256,
  'derivedTextHash',e.derived_text_sha256,
  'city',r.delivery_city,'note',r.requested_delivery_note,
  'deadline',to_char(r.closes_at AT TIME ZONE 'UTC',
   'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'items',(SELECT jsonb_agg(jsonb_build_object(
   'lineNo',l.line_no,'description',l.original_description,
   'quantity',l.quantity::text,'unit',l.unit,'family',l.family_code,
   'rubro',rub.rubro,'evidence',rub.evidencia
   ) ORDER BY l.line_no)
   FROM cotironda_piloto_privado.request_lines l
   LEFT JOIN cotironda_piloto_privado.ai_shadow_rubros_mvp221 rub
    ON rub.request_id=l.request_id AND rub.line_no=l.line_no
   WHERE l.request_id=r.id),
  'destinations',(SELECT jsonb_agg(jsonb_build_object(
   'supplier',d.supplier_key,'lineNo',d.line_no,
   'catalogueLineNo',d.catalogue_line_no,
   'description',d.catalogue_description,
   'kind',d.tipo,'reason',d.explicacion
   ) ORDER BY d.supplier_key,d.line_no)
   FROM cotironda_piloto_privado.ai_shadow_destinos_mvp221 d
   WHERE d.request_id=r.id)
 ) || coalesce((SELECT jsonb_build_object('requestedConditions',jsonb_build_object('payment',c.requested_payment,'vat',c.requested_vat,'paymentOrigin',c.payment_origin,'vatOrigin',c.vat_origin))
  FROM cotironda_piloto_privado.v2_buyer_conversations c WHERE c.request_id=r.id),'{}'::jsonb)
 FROM cotironda_piloto_privado.requests r
 JOIN cotironda_piloto_privado.ai_shadow_requests_mvp221 sh
  ON sh.request_id=r.id AND sh.source_hmac=r.source_hmac
 JOIN cotironda_piloto_privado.whapi_inbox m
  ON m.message_hmac=r.source_hmac AND m.request_id=r.id
   AND m.participant_key=r.buyer_key
 LEFT JOIN cotironda_piloto_privado.media_archive_mvp095 a
  ON a.message_hmac=m.message_hmac AND a.participant_key=m.participant_key
 LEFT JOIN cotironda_piloto_privado.ai_buyer_binary_evidence_mvp278 e
  ON e.message_hmac=m.message_hmac AND e.buyer_key=r.buyer_key
 WHERE r.id=p_request
  AND cotironda_piloto_privado.fuente_revisable_mvp280(r.id);
$function$;
CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_pdf_snapshot_mvp222(p_request uuid, p_supplier text, p_lease uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT jsonb_build_object(
  'requestId',r.id,'city',r.delivery_city,
  'deadlineIso',to_char(r.closes_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'deliveryNote',r.requested_delivery_note,
  'items',(SELECT jsonb_agg(jsonb_build_object(
    'description',l.original_description,
    'quantity',l.quantity::text,'unit',l.unit
   ) ORDER BY l.line_no)
   FROM cotironda_piloto_privado.request_lines l
   JOIN cotironda_piloto_privado.ai_shadow_destinos_mvp221 d
    ON d.request_id=l.request_id AND d.line_no=l.line_no
   WHERE l.request_id=r.id AND d.supplier_key=p_supplier)
 ) || coalesce((SELECT jsonb_build_object('requestedPayment',c.requested_payment,'requestedVat',c.requested_vat)
  FROM cotironda_piloto_privado.v2_buyer_conversations c WHERE c.request_id=r.id),'{}'::jsonb)
 FROM cotironda_piloto_privado.requests r
 JOIN cotironda_piloto_privado.ai_dispatch_jobs_mvp222 j
  ON j.request_id=r.id AND j.supplier_key=p_supplier
 JOIN cotironda_piloto_privado.participants s ON s.key=p_supplier
 JOIN cotironda_piloto_privado.ai_dispatch_gate_mvp222 g
   ON g.only_row AND g.enabled AND g.activated_at IS NOT NULL
 JOIN cotironda_piloto_privado.integration_flags f
   ON f.only_row AND f.whatsapp_outbound_enabled
 WHERE r.id=p_request AND j.state='leased' AND j.lease_token=p_lease
  AND r.state='prepared' AND r.closes_at>clock_timestamp()
  AND cotironda_piloto_privado.confirmada_comprador_mvp280(r.id)
  AND s.consent_at IS NOT NULL AND s.opted_out_at IS NULL
  AND lower(btrim(s.delivery_city))=lower(btrim(r.delivery_city))
  AND EXISTS(SELECT 1 FROM cotironda_piloto_privado.invitations i
    WHERE i.request_id=r.id AND i.supplier_key=p_supplier
      AND i.state='prepared')
  AND NOT EXISTS(SELECT 1 FROM
    cotironda_piloto_privado.ai_shadow_destinos_mvp221 d
    LEFT JOIN cotironda_piloto_privado.catalogue_lines c
      ON c.participant_key=d.supplier_key AND c.line_no=d.catalogue_line_no
    WHERE d.request_id=r.id AND d.supplier_key=p_supplier
      AND (c.line_no IS NULL OR c.literal_description<>d.catalogue_description));
$function$;
