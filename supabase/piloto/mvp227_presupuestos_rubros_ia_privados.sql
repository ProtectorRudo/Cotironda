-- MVP227: respuesta vinculada -> revisión IA -> hechos por rubro para comprador.
-- Sin datos de contacto, adjudicación ni originales en consulta pública.
CREATE TABLE IF NOT EXISTS cotironda_piloto_privado.ai_supplier_review_mvp227(
 message_hmac text PRIMARY KEY
  REFERENCES cotironda_piloto_privado.ai_supplier_links_mvp225(message_hmac)
  ON DELETE RESTRICT,
 request_id uuid NOT NULL,
 supplier_key text NOT NULL,
 source_sha256 text NOT NULL CHECK(source_sha256 ~ '^[a-f0-9]{64}$'),
 state text NOT NULL DEFAULT 'reserved'
   CHECK(state IN('reserved','verified','review')),
 reason_code text CHECK(reason_code IS NULL OR reason_code ~ '^[a-z_]{3,64}$'),
 summary jsonb,
 reserved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 finished_at timestamptz,
 FOREIGN KEY(request_id,supplier_key)
  REFERENCES cotironda_piloto_privado.invitations(request_id,supplier_key)
  ON DELETE RESTRICT,
 CHECK((state='reserved' AND finished_at IS NULL AND summary IS NULL)
 OR (state<>'reserved' AND finished_at IS NOT NULL)),
 CHECK(summary IS NULL OR jsonb_typeof(summary)='object')
);
CREATE INDEX IF NOT EXISTS ai_supplier_review_mvp227_buyer_idx
 ON cotironda_piloto_privado.ai_supplier_review_mvp227(request_id,supplier_key,state);
ALTER TABLE cotironda_piloto_privado.ai_supplier_review_mvp227 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.ai_supplier_review_mvp227
 FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_reserve_quote_mvp227(
 p_message_hmac text,p_chat_hmac text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v_source record;v_count int;v_rows int;v_items jsonb;
BEGIN
 IF p_message_hmac IS NULL OR p_message_hmac !~ '^[a-f0-9]{64}$'
 OR p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$'
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 -- Source MUST be linked to a specific quoted invitation of THIS sender.
 SELECT l.message_hmac,l.supplier_key,l.request_id,l.source_sha256,
   m.nonce_b64,m.ciphertext_b64,m.plaintext_sha256,m.received_at
 INTO v_source
 FROM cotironda_piloto_privado.ai_supplier_links_mvp225 l
 JOIN cotironda_piloto_privado.whapi_inbox m ON m.message_hmac=l.message_hmac
  AND m.request_id=l.request_id AND m.participant_key=l.supplier_key
 JOIN cotironda_piloto_privado.participants p ON p.key=l.supplier_key
  AND p.chat_hmac=m.chat_hmac
 JOIN cotironda_piloto_privado.requests r ON r.id=l.request_id
 JOIN cotironda_piloto_privado.ai_shadow_requests_mvp221 shadow
  ON shadow.request_id=r.id
 JOIN cotironda_piloto_privado.ai_dispatch_jobs_mvp222 d
  ON d.request_id=r.id AND d.supplier_key=l.supplier_key
 WHERE l.message_hmac=p_message_hmac AND m.chat_hmac=p_chat_hmac
   AND l.kind='text' AND m.kind='text' AND l.status='awaiting_semantic_review'
   AND m.processing_state='needs_review'
   AND m.plaintext_sha256=l.source_sha256
   AND p.participant_role='supplier'
   AND p.consent_at IS NOT NULL AND p.opted_out_at IS NULL
   AND r.state='prepared' AND r.closes_at>m.received_at
   AND m.received_at>=r.created_at AND m.received_at>clock_timestamp()-interval '10 minutes'
   AND d.state='api_accepted' AND d.finished_at<=m.received_at
 FOR UPDATE OF p;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_eligible');END IF;
 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_supplier_review_mvp227 a
  WHERE a.message_hmac=p_message_hmac)
 THEN RETURN jsonb_build_object('state','already_reserved');END IF;
 SELECT count(*) INTO v_count
 FROM cotironda_piloto_privado.ai_supplier_review_mvp227 a
 WHERE a.supplier_key=v_source.supplier_key
  AND a.reserved_at>clock_timestamp()-interval '24 hours';
 IF v_count>=12 THEN RETURN jsonb_build_object('state','quota_exceeded');END IF;
 SELECT jsonb_agg(jsonb_build_object(
   'id','item_'||l.line_no,'descripcion',l.original_description,
   'cantidad',l.quantity::text,'unidad',l.unit,'rubro',rub.rubro
  ) ORDER BY l.line_no) INTO v_items
 FROM cotironda_piloto_privado.ai_shadow_destinos_mvp221 map
 JOIN cotironda_piloto_privado.request_lines l ON
  l.request_id=map.request_id AND l.line_no=map.line_no
 JOIN cotironda_piloto_privado.ai_shadow_rubros_mvp221 rub
  ON rub.request_id=l.request_id AND rub.line_no=l.line_no
 WHERE map.request_id=v_source.request_id
  AND map.supplier_key=v_source.supplier_key;
 IF v_items IS NULL OR jsonb_array_length(v_items) NOT BETWEEN 1 AND 25
 THEN RETURN jsonb_build_object('state','request_lines_inconsistent');END IF;
 INSERT INTO cotironda_piloto_privado.ai_supplier_review_mvp227(
  message_hmac,request_id,supplier_key,source_sha256)
 VALUES(p_message_hmac,v_source.request_id,v_source.supplier_key,
  v_source.source_sha256) ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS v_rows=ROW_COUNT;
 IF v_rows<>1 THEN RETURN jsonb_build_object('state','already_reserved');END IF;
 -- Do NOT return phone, supplier name or source plain text.
 RETURN jsonb_build_object('state','reserved','source_sha256',
  v_source.source_sha256,'nonce',v_source.nonce_b64,
  'ciphertext',v_source.ciphertext_b64,'items',v_items);
END
$fn$;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_finish_quote_mvp227(
 p_message_hmac text,p_chat_hmac text,p_state text,
 p_reason text,p_summary jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v_review record;v_rows int;v_price jsonb;v_rubro jsonb;
BEGIN
 IF p_message_hmac IS NULL OR p_message_hmac !~ '^[a-f0-9]{64}$'
 OR p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$'
 OR p_state NOT IN('verified','review')
 OR (p_reason IS NOT NULL AND p_reason !~ '^[a-z_]{3,64}$')
 OR (p_summary IS NOT NULL AND
    (jsonb_typeof(p_summary)<>'object' OR length(p_summary::text)>30000))
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 SELECT a.message_hmac,a.request_id,a.supplier_key,a.source_sha256
 INTO v_review FROM cotironda_piloto_privado.ai_supplier_review_mvp227 a
 JOIN cotironda_piloto_privado.ai_supplier_links_mvp225 link
  ON link.message_hmac=a.message_hmac
  AND link.request_id=a.request_id AND link.supplier_key=a.supplier_key
 JOIN cotironda_piloto_privado.whapi_inbox m ON m.message_hmac=a.message_hmac
  AND m.chat_hmac=p_chat_hmac AND m.request_id=a.request_id
  AND m.plaintext_sha256=a.source_sha256
 JOIN cotironda_piloto_privado.participants p ON p.key=a.supplier_key
  AND p.chat_hmac=p_chat_hmac AND p.consent_at IS NOT NULL
  AND p.opted_out_at IS NULL
 WHERE a.message_hmac=p_message_hmac AND a.state='reserved'
 FOR UPDATE OF a;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','already_finalized_or_ineligible');END IF;
 IF p_state='verified' AND (
   p_summary IS NULL OR p_summary->>'estado'<>'verificada_para_comparacion'
   OR p_summary->>'moneda' NOT IN('ARS','USD')
   OR p_summary->>'iva' NOT IN('incluido_explicito','sin_iva_explicito','no_informado')
   OR p_summary->>'flete' NOT IN('incluido_explicito','excluido_explicito','a_convenir','no_informado')
   OR p_summary->>'pago' NOT IN('contado','transferencia','credito','no_informado')
   OR jsonb_typeof(p_summary->'rubros')<>'array'
   OR jsonb_typeof(p_summary->'precios')<>'array'
   OR jsonb_array_length(p_summary->'rubros') NOT BETWEEN 1 AND 7
   OR jsonb_array_length(p_summary->'precios')>25
  ) THEN RETURN jsonb_build_object('state','summary_not_verified');END IF;
 IF p_summary IS NOT NULL THEN
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(
    coalesce(p_summary->'precios','[]'::jsonb)) pr
    WHERE jsonb_typeof(pr)<>'object'
     OR pr->>'pedidoId' !~ '^item_[1-9][0-9]{0,2}$'
     OR pr->>'centavos' !~ '^[0-9]{1,17}$'
     OR NOT EXISTS(
      SELECT 1 FROM cotironda_piloto_privado.ai_shadow_destinos_mvp221 map
      WHERE map.request_id=v_review.request_id
       AND map.supplier_key=v_review.supplier_key
       AND 'item_'||map.line_no=pr->>'pedidoId'
     ))
  THEN RETURN jsonb_build_object('state','price_without_request_source');END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(
    coalesce(p_summary->'rubros','[]'::jsonb)) rb
    WHERE jsonb_typeof(rb)<>'object'
     OR rb->>'rubro' NOT IN
      ('obra_gruesa','pintura','electricidad','construccion_seca',
       'sanitarios','ferreteria','otros')
     OR rb->>'solicitados' !~ '^[0-9]{1,3}$'
     OR rb->>'respondidos' !~ '^[0-9]{1,3}$'
     OR rb->>'cobertura' NOT IN('completa','parcial','sin_cobertura')
    )
  THEN RETURN jsonb_build_object('state','invalid_rubro_summary');END IF;
 END IF;
 UPDATE cotironda_piloto_privado.ai_supplier_review_mvp227
 SET state=p_state,reason_code=p_reason,summary=p_summary,finished_at=clock_timestamp()
 WHERE message_hmac=p_message_hmac AND state='reserved';
 GET DIAGNOSTICS v_rows=ROW_COUNT;
 RETURN jsonb_build_object('state',
  CASE WHEN v_rows=1 THEN 'saved_private' ELSE 'already_finalized' END);
END
$fn$;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_buyer_rubros_mvp227(
 p_token_hash text
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v_request uuid;v_state text;v_items jsonb;v_quotes jsonb;
 v_received int;v_pending int;
BEGIN
 IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$'
 THEN RETURN jsonb_build_object('state','not_found');END IF;
 SELECT r.id,r.state INTO v_request,v_state
 FROM cotironda_piloto_privado.buyer_tracking_mvp091 t
 JOIN cotironda_piloto_privado.requests r ON r.id=t.request_id
 JOIN cotironda_piloto_privado.ai_shadow_requests_mvp221 sh ON sh.request_id=r.id
 JOIN cotironda_piloto_privado.participants b ON b.key=r.buyer_key
 WHERE t.token_hash=p_token_hash AND t.revoked_at IS NULL
   AND t.expires_at>clock_timestamp() AND r.state IN('prepared','closed','cancelled')
   AND b.participant_role='buyer' AND b.consent_at IS NOT NULL
   AND b.opted_out_at IS NULL;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_found');END IF;
 IF v_state='cancelled' THEN
  RETURN jsonb_build_object('state','cancelled');END IF;
 SELECT jsonb_agg(jsonb_build_object(
   'itemId','item_'||l.line_no,'descripcion',l.original_description,
   'rubro',rub.rubro,'cantidad',l.quantity::text,'unidad',l.unit
 ) ORDER BY l.line_no) INTO v_items
 FROM cotironda_piloto_privado.request_lines l
 JOIN cotironda_piloto_privado.ai_shadow_rubros_mvp221 rub
  ON rub.request_id=l.request_id AND rub.line_no=l.line_no
 WHERE l.request_id=v_request;
 SELECT count(DISTINCT supplier_key) INTO v_received
 FROM cotironda_piloto_privado.ai_supplier_links_mvp225
 WHERE request_id=v_request;
 SELECT count(*) INTO v_pending
 FROM cotironda_piloto_privado.ai_supplier_links_mvp225 link
 WHERE link.request_id=v_request
   AND NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_supplier_review_mvp227 rev
    WHERE rev.message_hmac=link.message_hmac AND rev.state='verified');
 -- If a supplier submits a later message still under review, hide its
 -- previously verified version until latest source is independently checked.
 WITH latest AS (
  SELECT DISTINCT ON (l.supplier_key)
    l.supplier_key,l.message_hmac,m.received_at
  FROM cotironda_piloto_privado.ai_supplier_links_mvp225 l
  JOIN cotironda_piloto_privado.whapi_inbox m
   ON m.message_hmac=l.message_hmac
  WHERE l.request_id=v_request
  ORDER BY l.supplier_key,m.received_at DESC,l.message_hmac DESC
 ), verified AS (
  SELECT latest.supplier_key,rev.summary
  FROM latest
  JOIN cotironda_piloto_privado.ai_supplier_review_mvp227 rev
   ON rev.message_hmac=latest.message_hmac AND rev.state='verified'
 ), numbered AS (
  SELECT summary,row_number() over(order by md5(v_request::text||supplier_key)) n
  FROM verified
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'label','Presupuesto '||n,
   'moneda',summary->'moneda','iva',summary->'iva',
   'flete',summary->'flete','pago',summary->'pago',
   'rubros',summary->'rubros','precios',summary->'precios'
 ) ORDER BY n),'[]'::jsonb) INTO v_quotes
 FROM numbered;
 RETURN jsonb_build_object('state','rubros_por_articulo',
  'items',coalesce(v_items,'[]'::jsonb),
  'ofertas',v_quotes,'recibidos',v_received,
  'pendientes_revision',v_pending,'ranking_global_permitido',false,
  'adjudicacion_automatica',false,'contactos_revelados',false);
END
$fn$;

REVOKE ALL ON FUNCTION
 public.cotironda_piloto_ia_reserve_quote_mvp227(text,text),
 public.cotironda_piloto_ia_finish_quote_mvp227(text,text,text,text,jsonb),
 public.cotironda_piloto_ia_buyer_rubros_mvp227(text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_ia_reserve_quote_mvp227(text,text),
 public.cotironda_piloto_ia_finish_quote_mvp227(text,text,text,text,jsonb),
 public.cotironda_piloto_ia_buyer_rubros_mvp227(text)
 TO service_role;
