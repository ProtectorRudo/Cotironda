-- MVP302 — PROPOSED, NOT INSTALLED. Privileged READ-ONLY bridge:
-- IA Central MVP227 verified source -> PRIVATE candidates for a future
-- MANUAL closing decision. NO plan insert, award, WhatsApp or contact reveal.
-- This is a source-scoped RPC, NOT the legacy MVP196 document planner.
-- MUST stay service_role-only; NEVER call or proxy directly to a browser.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_finalist_sources_mvp302(
 p_request uuid
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path='' AS $mvp302$
DECLARE
 r_ record; source_ record; price_ jsonb; buyer_ record;
 v_items jsonb:='[]'::jsonb;v_out jsonb:='[]'::jsonb;
 v_ids text[]:=array[]::text[];v_rubros text[]:=array[]::text[];
 v_seen text[]:=array[]::text[];v_source_items jsonb;
 v_count int;v_q numeric;v_unit text;v_rubro text;
 v_valid boolean;v_latest record;v_label integer:=0;v_total int:=0;
BEGIN
 IF p_request IS NULL THEN RETURN jsonb_build_object('state','not_eligible');END IF;
 SELECT r.id,r.state,r.closes_at,r.created_at,r.buyer_key
 INTO r_ FROM cotironda_piloto_privado.requests r
 JOIN cotironda_piloto_privado.ai_shadow_requests_mvp221 sh
   ON sh.request_id=r.id
 JOIN cotironda_piloto_privado.ai_buyer_review_mvp279 br
   ON br.request_id=r.id AND br.state='confirmed'
 WHERE r.id=p_request AND r.state='closed' AND r.closes_at<=now();
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_closed_or_not_confirmed');END IF;
 SELECT b.participant_role,b.consent_at,b.opted_out_at INTO buyer_
 FROM cotironda_piloto_privado.participants b
 WHERE b.key=r_.buyer_key;
 IF NOT FOUND OR buyer_.participant_role<>'buyer' OR
    buyer_.consent_at IS NULL OR buyer_.opted_out_at IS NOT NULL
 THEN RETURN jsonb_build_object('state','buyer_not_consented');END IF;
 SELECT count(*) INTO v_total FROM cotironda_piloto_privado.request_lines rl
 JOIN cotironda_piloto_privado.ai_shadow_rubros_mvp221 rub
   ON rub.request_id=rl.request_id AND rub.line_no=rl.line_no
 WHERE rl.request_id=p_request;
 IF v_total NOT BETWEEN 1 AND 25 OR v_total<>(
   SELECT count(*) FROM cotironda_piloto_privado.request_lines
   WHERE request_id=p_request)
 THEN RETURN jsonb_build_object('state','request_not_complete');END IF;
 SELECT jsonb_agg('item_'||rl.line_no ORDER BY rl.line_no)
 INTO v_items FROM cotironda_piloto_privado.request_lines rl
 WHERE rl.request_id=p_request;
 -- No fallback to old quotes. A newer pending/review source suppresses
 -- older verified versions of the SAME supplier (DISTINCT ON).
 FOR source_ IN
  WITH latest AS (
   SELECT DISTINCT ON (ln.supplier_key)
    ln.supplier_key,ln.message_hmac,ln.source_sha256,ln.request_id,
    ln.kind,m.received_at,m.kind AS inbound_kind,
    m.chat_hmac,m.plaintext_sha256
   FROM cotironda_piloto_privado.ai_supplier_links_mvp225 ln
   JOIN cotironda_piloto_privado.whapi_inbox m
    ON m.message_hmac=ln.message_hmac AND m.request_id=ln.request_id
     AND m.participant_key=ln.supplier_key
   WHERE ln.request_id=p_request
   ORDER BY ln.supplier_key,m.received_at DESC,ln.message_hmac DESC
  )
  SELECT l.*,rev.state AS review_state,rev.reason_code,
   rev.summary,rev.source_sha256 AS review_sha,rev.finished_at
  FROM latest l
  JOIN cotironda_piloto_privado.ai_supplier_review_mvp227 rev
    ON rev.message_hmac=l.message_hmac AND rev.request_id=l.request_id
   AND rev.supplier_key=l.supplier_key
  JOIN cotironda_piloto_privado.participants supplier
    ON supplier.key=l.supplier_key AND supplier.participant_role='supplier'
   AND supplier.chat_hmac=l.chat_hmac
   AND supplier.consent_at IS NOT NULL AND supplier.opted_out_at IS NULL
  JOIN cotironda_piloto_privado.ai_dispatch_jobs_mvp222 job
    ON job.request_id=l.request_id AND job.supplier_key=l.supplier_key
   AND job.state='api_accepted' AND job.whapi_message_id IS NOT NULL
   AND job.finished_at IS NOT NULL AND job.finished_at<=l.received_at
  WHERE l.received_at<=r_.closes_at
  ORDER BY md5(p_request::text||l.supplier_key)
 LOOP
  IF source_.review_state<>'verified' OR
    source_.reason_code<>'source_and_math_checked' OR
    source_.finished_at IS NULL OR
    source_.review_sha IS DISTINCT FROM source_.source_sha256 OR
    source_.source_sha256 !~ '^[0-9a-f]{64}$' OR
    jsonb_typeof(source_.summary)<>'object' OR
    source_.summary->>'estado'<>'verificada_para_comparacion' OR
    source_.summary->>'moneda' NOT IN('ARS','USD') OR
    source_.summary->>'iva' NOT IN(
      'incluido_explicito','sin_iva_explicito','no_informado') OR
    source_.summary->>'flete' NOT IN(
      'incluido_explicito','excluido_explicito','a_convenir','no_informado') OR
    source_.summary->>'pago' NOT IN(
      'contado','transferencia','credito','no_informado') OR
    jsonb_typeof(source_.summary->'precios')<>'array' OR
    jsonb_typeof(source_.summary->'rubros')<>'array' OR
    jsonb_array_length(source_.summary->'precios') NOT BETWEEN 1 AND 25
  THEN CONTINUE;END IF;
  -- Actual sealed source: text SHA, or stored verified Office/PDF source.
  IF NOT (
   (source_.kind='text' AND source_.inbound_kind='text' AND
     source_.plaintext_sha256=source_.source_sha256)
   OR
   (source_.kind='document' AND source_.inbound_kind='document'
    AND EXISTS(
      SELECT 1 FROM cotironda_piloto_privado.media_archive_mvp095 a
      JOIN cotironda_piloto_privado.supplier_source_checks_mvp106 checksrc
        ON checksrc.message_hmac=a.message_hmac
       AND checksrc.source_sha256=a.content_sha256
       AND checksrc.state='source_text_covered'
       AND checksrc.reason='covered'
      WHERE a.message_hmac=source_.message_hmac
       AND a.chat_hmac=source_.chat_hmac
       AND a.participant_key=source_.supplier_key
       AND a.request_id=p_request
       AND a.content_sha256=source_.source_sha256
       AND a.state='stored'
    ))
  ) THEN CONTINUE;END IF;
  -- Versioned correction: only the newest stored revision may be proposed.
  SELECT v.message_hmac,v.source_sha256,v.review_state INTO v_latest
  FROM cotironda_piloto_privado.supplier_source_versions_mvp261 v
  WHERE v.request_id=p_request AND v.supplier_key=source_.supplier_key
  ORDER BY v.revision_no DESC LIMIT 1;
  IF FOUND AND (v_latest.message_hmac<>source_.message_hmac OR
    v_latest.source_sha256<>source_.source_sha256 OR
    v_latest.review_state<>'verified') THEN CONTINUE;END IF;
  v_seen:=ARRAY[]::text[];v_source_items:='[]'::jsonb;
  v_valid:=true;
  FOR price_ IN SELECT value FROM
    jsonb_array_elements(source_.summary->'precios')
  LOOP
   IF jsonb_typeof(price_)<>'object' OR
     coalesce(price_->>'pedidoId','') !~ '^item_[1-9][0-9]{0,2}$' OR
     coalesce(price_->>'cantidad','') !~ '^(?:0|[1-9][0-9]{0,7})(?:\.[0-9]{1,3})?$' OR
     coalesce(price_->>'centavos','') !~ '^(0|[1-9][0-9]{0,16})$' OR
     coalesce(price_->>'unidad','') NOT IN(
      'bag','unit','box','kg','g','l','ml','m','m2','m3','roll','pack') OR
     price_->>'pedidoId'=ANY(v_seen)
   THEN v_valid:=false;EXIT;END IF;
   SELECT rl.quantity,rl.unit,rub.rubro
   INTO v_q,v_unit,v_rubro
   FROM cotironda_piloto_privado.request_lines rl
   JOIN cotironda_piloto_privado.ai_shadow_rubros_mvp221 rub
     ON rub.request_id=rl.request_id AND rub.line_no=rl.line_no
   JOIN cotironda_piloto_privado.ai_shadow_destinos_mvp221 dest
     ON dest.request_id=rl.request_id AND dest.line_no=rl.line_no
      AND dest.supplier_key=source_.supplier_key
   WHERE rl.request_id=p_request AND
    'item_'||rl.line_no=price_->>'pedidoId';
   IF NOT FOUND OR v_q<>(price_->>'cantidad')::numeric OR
      v_unit<>price_->>'unidad'
   THEN v_valid:=false;EXIT;END IF;
   v_seen:=array_append(v_seen,price_->>'pedidoId');
   v_source_items:=v_source_items||jsonb_build_array(price_->>'pedidoId');
  END LOOP;
  IF NOT v_valid OR cardinality(v_seen)=0 THEN CONTINUE;END IF;
  -- The outcome is SERVICE-ONLY and never includes amounts, document
  -- text, recipient chat, buyer identity or contact. The client must not
  -- present the private source-key bindings to a browser.
  v_label:=v_label+1;
  v_out:=v_out||jsonb_build_array(jsonb_build_object(
   'label','Presupuesto '||v_label,
   'supplier_key',source_.supplier_key,
   'message_hmac',source_.message_hmac,
   'source_sha256',source_.source_sha256,
   'item_ids',v_source_items,
   'moneda',source_.summary->>'moneda',
   'iva',source_.summary->>'iva',
   'flete',source_.summary->>'flete',
   'pago',source_.summary->>'pago'
  ));
 END LOOP;
 RETURN jsonb_build_object(
  'state',CASE WHEN v_label=0 THEN 'no_verified_sources'
               ELSE 'private_verified_sources' END,
  'requested_item_ids',coalesce(v_items,'[]'::jsonb),
  'candidates',v_out,
  'ranking_allowed',false,'automatic_award',false,
  'contacts_revealed',false,'whatsapp_sent',false,
  'manual_award_required',true);
END;$mvp302$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_ia_finalist_sources_mvp302(uuid)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_ia_finalist_sources_mvp302(uuid)
 TO service_role;
