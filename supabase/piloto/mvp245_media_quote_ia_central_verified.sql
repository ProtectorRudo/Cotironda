-- MVP246 hardening: SOLO archivos con publicación anónima privada
-- ya autorizada por documento original, dos lecturas e importes conciliados.
-- MVP245: proyecto Cotironda. Integración controlada de archivos con IA Central.
-- No activación de WhatsApp. Un file nunca reemplaza el texto original.
-- La migración extiende FINISH existente (MVP227) sin quitar sus guardas
-- de texto y agrega reserva exclusivamente para archivos corroborados.
--
-- AUTHZ: funciones SECURITY DEFINER con EXECUTE solamente service_role.
-- Si hay foto/imagen sin prueba binaria independiente, denegar por MIME.
--
CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_reserve_media_mvp245(
 p_message_hmac text,p_chat_hmac text,
 p_source_sha256 text,p_line_count integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $mvp245$
DECLARE v_source record; v_count int;v_rows int;v_items jsonb;
BEGIN
 IF p_message_hmac IS NULL OR p_message_hmac !~ '^[a-f0-9]{64}$'
  OR p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$'
  OR p_source_sha256 IS NULL OR p_source_sha256 !~ '^[a-f0-9]{64}$'
  OR p_line_count NOT BETWEEN 1 AND 25
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 -- Source and supplier must be bound by the *original* accepted Whapi
 -- invitation, even if the trial has since expired. A non-quoted supplier
 -- with two possible rounds cannot reach this link.
 SELECT l.request_id,l.supplier_key,l.source_sha256
 INTO v_source
 FROM cotironda_piloto_privado.ai_supplier_links_mvp225 l
 JOIN cotironda_piloto_privado.whapi_inbox m
  ON m.message_hmac=l.message_hmac
  AND m.chat_hmac=p_chat_hmac AND m.participant_key=l.supplier_key
  AND m.request_id=l.request_id AND m.kind=l.kind
 JOIN cotironda_piloto_privado.media_archive_mvp095 a
  ON a.message_hmac=l.message_hmac AND a.chat_hmac=p_chat_hmac
  AND a.participant_key=l.supplier_key AND a.request_id=l.request_id
  AND a.state='stored' AND a.content_sha256=l.source_sha256
 JOIN cotironda_piloto_privado.supplier_media_quotes_mvp098 q
  ON q.message_hmac=a.message_hmac AND q.request_id=l.request_id
  AND q.supplier_key=l.supplier_key
  AND q.source_sha256=a.content_sha256
  AND q.state='awaiting_fidelity_check'
  AND q.line_count=p_line_count
 JOIN cotironda_piloto_privado.supplier_source_checks_mvp106 sc
  ON sc.message_hmac=a.message_hmac
  AND sc.source_sha256=a.content_sha256
  AND sc.state='source_text_covered' AND sc.reason='covered'
  AND sc.model_line_count=p_line_count
 -- El publicador anterior verificó el binario, las dos lecturas,
 -- todas las líneas y las cifras y preservó una copia ANÓNIMA.
 -- Sin esa prueba no alcanza con un "source_text_covered" aislado.
 JOIN cotironda_piloto_privado.supplier_reading_checks_mvp102 dual
  ON dual.message_hmac=a.message_hmac
  AND dual.source_sha256=a.content_sha256
  AND dual.state='model_readings_match' AND dual.line_count=p_line_count
 JOIN cotironda_piloto_privado.supplier_amount_checks_mvp103 amounts
  ON amounts.message_hmac=a.message_hmac
  AND amounts.source_sha256=a.content_sha256
  AND amounts.state='balanced' AND amounts.line_count=p_line_count
 JOIN cotironda_piloto_privado.anonymous_supplier_docs_mvp107 published
  ON published.message_hmac=a.message_hmac
  AND published.request_id=l.request_id
  AND published.supplier_key=l.supplier_key
  AND published.source_sha256=a.content_sha256
  AND published.line_count=p_line_count
 JOIN cotironda_piloto_privado.participants p
  ON p.key=l.supplier_key AND p.chat_hmac=p_chat_hmac
  AND p.participant_role='supplier' AND p.consent_at IS NOT NULL
  AND p.opted_out_at IS NULL
 JOIN cotironda_piloto_privado.requests r
  ON r.id=l.request_id AND r.state='prepared'
  AND m.received_at>=r.created_at AND m.received_at<=r.closes_at
 JOIN cotironda_piloto_privado.participants buyer
  ON buyer.key=r.buyer_key AND buyer.participant_role='buyer'
  AND buyer.consent_at IS NOT NULL AND buyer.opted_out_at IS NULL
 JOIN cotironda_piloto_privado.ai_shadow_requests_mvp221 sh
  ON sh.request_id=r.id
 JOIN cotironda_piloto_privado.ai_dispatch_jobs_mvp222 d
  ON d.request_id=r.id AND d.supplier_key=l.supplier_key
  AND d.state='api_accepted' AND d.finished_at<=m.received_at
 WHERE l.message_hmac=p_message_hmac
  AND l.kind='document' AND l.status='awaiting_semantic_review'
  AND a.content_sha256=p_source_sha256
  AND a.mime IN(
   'application/pdf',
   'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
   'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
   'text/plain','text/csv')
  AND jsonb_typeof(a.proposal)='object'
  AND a.proposal->>'kind'='supplier_quote'
  AND jsonb_typeof(a.proposal->'lines')='array'
  AND jsonb_array_length(a.proposal->'lines')=p_line_count
 FOR UPDATE OF a;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_eligible');END IF;
 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_supplier_review_mvp227
  WHERE message_hmac=p_message_hmac)
 THEN RETURN jsonb_build_object('state','already_reserved');END IF;
 SELECT count(*) INTO v_count
 FROM cotironda_piloto_privado.ai_supplier_review_mvp227 rev
 WHERE rev.supplier_key=v_source.supplier_key
  AND rev.reserved_at>clock_timestamp()-interval '24 hours';
 IF v_count>=12 THEN RETURN jsonb_build_object('state','quota_exceeded');END IF;
 SELECT jsonb_agg(jsonb_build_object(
   'id','item_'||l.line_no,'descripcion',l.original_description,
   'cantidad',l.quantity::text,'unidad',l.unit,'rubro',rub.rubro
  ) ORDER BY l.line_no) INTO v_items
 FROM cotironda_piloto_privado.ai_shadow_destinos_mvp221 map
 JOIN cotironda_piloto_privado.request_lines l
  ON l.request_id=map.request_id AND l.line_no=map.line_no
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
 -- Source bytes/identities never returned.
 RETURN jsonb_build_object('state','reserved',
  'source_sha256',v_source.source_sha256,'items',v_items);
END
$mvp245$;

-- SAME finish RPC as MVP227: text guard intact; new document branch
-- only when the same binary archive+source check+supplier+ronda agree.
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
 LEFT JOIN cotironda_piloto_privado.media_archive_mvp095 media
  ON media.message_hmac=a.message_hmac
  AND media.chat_hmac=m.chat_hmac AND media.participant_key=a.supplier_key
  AND media.request_id=a.request_id AND media.state='stored'
  AND media.content_sha256=a.source_sha256
 LEFT JOIN cotironda_piloto_privado.supplier_source_checks_mvp106 checksrc
  ON checksrc.message_hmac=a.message_hmac
  AND checksrc.source_sha256=a.source_sha256
  AND checksrc.state='source_text_covered' AND checksrc.reason='covered'
 LEFT JOIN cotironda_piloto_privado.supplier_media_quotes_mvp098 quote
  ON quote.message_hmac=a.message_hmac
  AND quote.request_id=a.request_id
  AND quote.supplier_key=a.supplier_key
  AND quote.source_sha256=a.source_sha256
 LEFT JOIN cotironda_piloto_privado.anonymous_supplier_docs_mvp107 published
  ON published.message_hmac=a.message_hmac
  AND published.request_id=a.request_id
  AND published.supplier_key=a.supplier_key
  AND published.source_sha256=a.source_sha256
 JOIN cotironda_piloto_privado.participants p ON p.key=a.supplier_key
  AND p.chat_hmac=p_chat_hmac AND p.consent_at IS NOT NULL
  AND p.opted_out_at IS NULL
 WHERE a.message_hmac=p_message_hmac AND a.state='reserved'
 AND (
  (link.kind='text' AND m.kind='text'
   AND m.plaintext_sha256=a.source_sha256)
  OR
  (link.kind='document' AND m.kind='document'
   AND media.mime IN (
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain','text/csv')
   AND checksrc.message_hmac IS NOT NULL
   AND quote.state='awaiting_fidelity_check'
   AND published.message_hmac IS NOT NULL
   AND published.line_count=quote.line_count
   AND checksrc.model_line_count=quote.line_count
   AND jsonb_typeof(media.proposal)='object'
   AND media.proposal->>'kind'='supplier_quote'
   AND jsonb_typeof(media.proposal->'lines')='array'
   AND jsonb_array_length(media.proposal->'lines')=quote.line_count)
 )
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


REVOKE ALL ON FUNCTION
 public.cotironda_piloto_ia_reserve_media_mvp245(text,text,text,integer)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_ia_reserve_media_mvp245(text,text,text,integer)
 TO service_role;
