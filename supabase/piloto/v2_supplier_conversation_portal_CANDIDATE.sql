-- CANDIDATO, después de v2_supplier_conversation_quote_CANDIDATE.
-- Mantiene la autorización D016 por CADA original. No se generan archivos ni
-- se sustituyen sus SHA. Los IDs son los mismos opacos que devuelve el catálogo.
CREATE FUNCTION cotironda_piloto_privado.v2_group_original_id(p_request_id uuid,p_message_hmac text)
RETURNS uuid LANGUAGE sql IMMUTABLE STRICT SET search_path TO '' AS $fn$
 SELECT (substr(h,1,8)||'-'||substr(h,9,4)||'-4'||substr(h,14,3)||'-a'||substr(h,18,3)||'-'||substr(h,21,12))::uuid
 FROM (SELECT encode(sha256(convert_to('cotironda-v2-original|'||p_request_id::text||'|'||p_message_hmac,'UTF8')),'hex') h) t;
$fn$;
CREATE FUNCTION cotironda_piloto_privado.v2_supplier_group_catalog_enrich(p_request_id uuid,p_catalog jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE g record;ids jsonb;authorized jsonb;groupinfo jsonb;result jsonb;expected int;present int;anchor uuid;summary jsonb;quoted int;assigned int;
BEGIN
 IF p_catalog IS NULL OR p_catalog->>'state'<>'authorized_responders_v2' OR jsonb_typeof(p_catalog->'originals') IS DISTINCT FROM 'array' THEN RETURN NULL;END IF;
 IF NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.requests r WHERE r.id=p_request_id AND r.buyer_key=p_catalog->>'buyerKey') THEN RETURN NULL;END IF;
 result:=p_catalog->'originals';
 FOR g IN SELECT c.* FROM cotironda_piloto_privado.v2_supplier_conversations c WHERE c.quote_request_id=p_request_id AND c.state='done' LOOP
  SELECT coalesce(jsonb_agg(cotironda_piloto_privado.v2_group_original_id(p_request_id,f.message_hmac)::text ORDER BY f.received_at,f.message_hmac),'[]'::jsonb),count(*) INTO ids,expected
  FROM cotironda_piloto_privado.v2_supplier_conversation_sources f WHERE f.conversation_id=g.id;
  IF expected<2 THEN CONTINUE;END IF;
  anchor:=cotironda_piloto_privado.v2_group_original_id(p_request_id,g.quote_anchor_hmac);
  SELECT coalesce(jsonb_agg(v),'[]'::jsonb),count(*) INTO authorized,present FROM jsonb_array_elements(result) a(v) WHERE ids ? (v->>'documentId');
  -- Never present a partially authorized group or a group with stale links.
  IF present<>expected OR NOT(ids ? anchor::text) OR EXISTS(
   SELECT 1 FROM cotironda_piloto_privado.v2_supplier_conversation_sources f
   LEFT JOIN cotironda_piloto_privado.whapi_inbox m USING(message_hmac)
   LEFT JOIN cotironda_piloto_privado.ai_supplier_links_mvp225 l USING(message_hmac)
   WHERE f.conversation_id=g.id AND (m.message_hmac IS NULL OR l.message_hmac IS NULL OR m.request_id IS DISTINCT FROM p_request_id OR l.request_id IS DISTINCT FROM p_request_id OR m.participant_key IS DISTINCT FROM g.supplier_key OR l.supplier_key IS DISTINCT FROM g.supplier_key OR m.chat_hmac IS DISTINCT FROM g.chat_hmac OR m.plaintext_sha256 IS DISTINCT FROM f.source_sha256 OR l.source_sha256 IS DISTINCT FROM f.source_sha256 OR l.status IS DISTINCT FROM 'awaiting_semantic_review' OR m.supplier_text_intent IS DISTINCT FROM 'quote'))
  THEN
   SELECT coalesce(jsonb_agg(v ORDER BY pos),'[]'::jsonb) INTO result FROM jsonb_array_elements(result) WITH ORDINALITY a(v,pos) WHERE NOT(ids ? (v->>'documentId'));
   CONTINUE;
  END IF;
  SELECT a.summary INTO summary FROM cotironda_piloto_privado.ai_supplier_review_mvp227 a
  JOIN cotironda_piloto_privado.v2_supplier_conversation_sources f ON f.conversation_id=g.id AND f.message_hmac=a.message_hmac AND f.source_sha256=a.source_sha256
  WHERE a.message_hmac=g.quote_anchor_hmac AND a.request_id=p_request_id AND a.supplier_key=g.supplier_key AND a.state IN ('review','verified');
  quoted:=NULL;assigned:=NULL;
  IF jsonb_typeof(summary->'rubros')='array' AND jsonb_array_length(summary->'rubros') BETWEEN 1 AND 7
  AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(summary->'rubros') a(v) WHERE coalesce(v->>'solicitados','') !~ '^[0-9]{1,3}$' OR coalesce(v->>'respondidos','') !~ '^[0-9]{1,3}$') THEN
   SELECT sum((v->>'respondidos')::int),sum((v->>'solicitados')::int) INTO quoted,assigned FROM jsonb_array_elements(summary->'rubros') a(v);
   IF quoted>assigned OR assigned>25 OR assigned<1 THEN quoted:=NULL;assigned:=NULL;END IF;
  END IF;
  groupinfo:=jsonb_build_object('anchorId',anchor::text,'documentIds',ids,'quotedCount',quoted,'assignedCount',assigned,
   'amountDisplay',g.quote_amount_display,
   'iva',CASE WHEN summary->>'iva' IN ('incluido_explicito','sin_iva_explicito') THEN summary->>'iva' ELSE 'no_informado' END,
   'flete',CASE WHEN summary->>'flete' IN ('incluido_explicito','excluido_explicito','a_convenir') THEN summary->>'flete' ELSE 'no_informado' END,
   'pago',CASE WHEN summary->>'pago' IN ('contado','transferencia','credito') THEN summary->>'pago' ELSE 'no_informado' END);
  -- No partial single-message analysis/total masquerading as whole group.
  SELECT coalesce(jsonb_agg(CASE WHEN ids ? (v->>'documentId') THEN (v-'analysis'-'commercial')||jsonb_build_object('quoteGroup',groupinfo) ELSE v END ORDER BY pos),'[]'::jsonb) INTO result FROM jsonb_array_elements(result) WITH ORDINALITY a(v,pos);
 END LOOP;
 RETURN jsonb_set(jsonb_set(p_catalog,'{originals}',result),'{total}',to_jsonb(jsonb_array_length(result)));
END $fn$;
REVOKE ALL ON FUNCTION cotironda_piloto_privado.v2_group_original_id(uuid,text),cotironda_piloto_privado.v2_supplier_group_catalog_enrich(uuid,jsonb) FROM PUBLIC,anon,authenticated;
-- Reuse D021; only the existing authorized session RPC enters enrichment.
CREATE FUNCTION public.cotironda_piloto_v2_d021_grouped_responders_private(p_request_id uuid,p_sesion_hmac text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $fn$
 SELECT cotironda_piloto_privado.v2_supplier_group_catalog_enrich(p_request_id,public.cotironda_piloto_v2_d021_responders_commercial_private(p_request_id,p_sesion_hmac));
$fn$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_v2_d021_grouped_responders_private(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_v2_d021_grouped_responders_private(uuid,text) TO service_role;
