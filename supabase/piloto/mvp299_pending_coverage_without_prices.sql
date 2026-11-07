-- MVP299 development-only. Must not be applied to the live pilot without Publicalo.
-- DISTINCT, token-scoped projection of SOURCE-REVIEWED but NONCOMPARABLE
-- materials by rubro. Never returns supplier keys, prices or raw documents.
-- The original verified commercial RPC and finalist logic are UNCHANGED.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_pending_coverage_mvp299(
 p_token_hash text
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
 v_request uuid;
 v_state text;
 v_quotes jsonb := '[]'::jsonb;
 v_rubros jsonb;
 v_seen text[];
 v_rubro text;
 v_solicitados int;
 v_respondidos int;
 v_expected int;
 v_expected_rubros int;
 v_count int := 0;
 v_total int;
 v_good boolean;
 rec record;
 rb jsonb;
BEGIN
 IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$'
 THEN RETURN jsonb_build_object('state','not_found'); END IF;

 SELECT r.id,r.state INTO v_request,v_state
 FROM cotironda_piloto_privado.buyer_tracking_mvp091 t
 JOIN cotironda_piloto_privado.requests r ON r.id=t.request_id
 JOIN cotironda_piloto_privado.ai_shadow_requests_mvp221 sh ON sh.request_id=r.id
 JOIN cotironda_piloto_privado.participants buyer ON buyer.key=r.buyer_key
 WHERE t.token_hash=p_token_hash AND t.revoked_at IS NULL
  AND t.expires_at>clock_timestamp()
  AND r.state IN ('prepared','closed','cancelled')
  AND buyer.participant_role='buyer'
  AND buyer.consent_at IS NOT NULL AND buyer.opted_out_at IS NULL;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_found'); END IF;
 IF v_state='cancelled' THEN RETURN jsonb_build_object('state','cancelled'); END IF;

 FOR rec IN
  WITH latest AS (
   SELECT DISTINCT ON (l.supplier_key)
     l.supplier_key,l.message_hmac,l.source_sha256
   FROM cotironda_piloto_privado.ai_supplier_links_mvp225 l
   JOIN cotironda_piloto_privado.whapi_inbox m
    ON m.message_hmac=l.message_hmac
    AND m.request_id=l.request_id
    AND m.participant_key=l.supplier_key
   JOIN cotironda_piloto_privado.participants supplier
    ON supplier.key=l.supplier_key AND supplier.chat_hmac=m.chat_hmac
   JOIN cotironda_piloto_privado.ai_dispatch_jobs_mvp222 d
    ON d.request_id=l.request_id AND d.supplier_key=l.supplier_key
   WHERE l.request_id=v_request
    AND supplier.participant_role='supplier'
    AND supplier.consent_at IS NOT NULL AND supplier.opted_out_at IS NULL
    AND d.state='api_accepted' AND d.finished_at<=m.received_at
    -- A later linked source must hide this reply even if that newer
    -- source cannot be verified yet. Otherwise old offers resurface.
    AND NOT EXISTS (
     SELECT 1 FROM cotironda_piloto_privado.ai_supplier_links_mvp225 newer
     JOIN cotironda_piloto_privado.whapi_inbox newer_message
      ON newer_message.message_hmac=newer.message_hmac
       AND newer_message.participant_key=newer.supplier_key
       AND newer_message.request_id=newer.request_id
     WHERE newer.request_id=l.request_id
       AND newer.supplier_key=l.supplier_key
       AND (newer_message.received_at,newer.message_hmac)>
           (m.received_at,l.message_hmac)
    )
    AND (
     (l.kind='text' AND m.kind='text' AND
      m.plaintext_sha256=l.source_sha256)
     OR (
      l.kind='document' AND m.kind='document'
      AND EXISTS (
       SELECT 1 FROM cotironda_piloto_privado.media_archive_mvp095 media
       WHERE media.message_hmac=l.message_hmac
        AND media.chat_hmac=m.chat_hmac
        AND media.participant_key=l.supplier_key
        AND media.request_id=l.request_id
        AND media.state='stored'
        AND media.content_sha256=l.source_sha256)
      AND EXISTS (
       SELECT 1 FROM cotironda_piloto_privado.supplier_source_checks_mvp106 evidence
       WHERE evidence.message_hmac=l.message_hmac
        AND evidence.source_sha256=l.source_sha256
        AND evidence.state='source_text_covered' AND evidence.reason='covered')
      AND EXISTS (
       SELECT 1 FROM cotironda_piloto_privado.supplier_media_quotes_mvp098 quoted
       WHERE quoted.message_hmac=l.message_hmac AND quoted.request_id=l.request_id
        AND quoted.supplier_key=l.supplier_key
        AND quoted.source_sha256=l.source_sha256
        AND quoted.state='awaiting_fidelity_check')
      AND EXISTS (
       SELECT 1 FROM cotironda_piloto_privado.anonymous_supplier_docs_mvp107 published
       WHERE published.message_hmac=l.message_hmac
        AND published.request_id=l.request_id
        AND published.supplier_key=l.supplier_key
        AND published.source_sha256=l.source_sha256)
     )
    )
   ORDER BY l.supplier_key,m.received_at DESC,l.message_hmac DESC
  )
  SELECT l.supplier_key,l.message_hmac,rev.summary
  FROM latest l
  JOIN cotironda_piloto_privado.ai_supplier_review_mvp227 rev
   ON rev.message_hmac=l.message_hmac
   AND rev.request_id=v_request
   AND rev.supplier_key=l.supplier_key
   AND rev.source_sha256=l.source_sha256
  WHERE rev.state='review' AND rev.reason_code='conditions_need_review'
   AND rev.finished_at IS NOT NULL
   AND jsonb_typeof(rev.summary)='object'
   AND rev.summary->>'cobertura_pendiente_mvp299'='true'
   AND rev.summary->>'estado'='requiere_revision'
   -- If source versions exist for this supplier, the review must be
   -- the latest immutable version. Never combine old/revised prices.
   AND (
    NOT EXISTS (
     SELECT 1 FROM cotironda_piloto_privado.supplier_source_versions_mvp261 v
     WHERE v.request_id=v_request AND v.supplier_key=l.supplier_key)
    OR EXISTS (
     SELECT 1 FROM cotironda_piloto_privado.supplier_source_versions_mvp261 v
     WHERE v.request_id=v_request AND v.supplier_key=l.supplier_key
      AND v.message_hmac=l.message_hmac
      AND v.source_sha256=l.source_sha256
      AND v.revision_no=(
       SELECT max(newer.revision_no)
       FROM cotironda_piloto_privado.supplier_source_versions_mvp261 newer
       WHERE newer.request_id=v_request
        AND newer.supplier_key=l.supplier_key)
    )
   )
  ORDER BY md5(v_request::text||l.supplier_key)
 LOOP
  IF jsonb_typeof(rec.summary->'rubros')<>'array' OR
     jsonb_array_length(rec.summary->'rubros') NOT BETWEEN 1 AND 7
  THEN CONTINUE; END IF;

  SELECT count(DISTINCT rub.rubro) INTO v_expected_rubros
  FROM cotironda_piloto_privado.ai_shadow_destinos_mvp221 destination
  JOIN cotironda_piloto_privado.ai_shadow_rubros_mvp221 rub
   ON rub.request_id=destination.request_id
    AND rub.line_no=destination.line_no
  WHERE destination.request_id=v_request
   AND destination.supplier_key=rec.supplier_key;
  IF v_expected_rubros=0 OR
     v_expected_rubros<>jsonb_array_length(rec.summary->'rubros')
  THEN CONTINUE; END IF;
  v_rubros:='[]'::jsonb;v_seen:=ARRAY[]::text[];
  v_total:=0;v_good:=true;
  FOR rb IN SELECT value FROM jsonb_array_elements(rec.summary->'rubros')
  LOOP
   IF jsonb_typeof(rb)<>'object' OR
      rb->>'rubro' NOT IN (
       'obra_gruesa','pintura','electricidad','construccion_seca',
       'sanitarios','ferreteria','otros') OR
      rb->>'rubro'=ANY(v_seen) OR
      coalesce(rb->>'solicitados','') !~ '^[1-9][0-9]{0,2}$' OR
      coalesce(rb->>'respondidos','') !~ '^(0|[1-9][0-9]{0,2})$'
   THEN v_good:=false;EXIT;END IF;
   v_rubro:=rb->>'rubro';
   v_solicitados:=(rb->>'solicitados')::int;
   v_respondidos:=(rb->>'respondidos')::int;
   SELECT count(*) INTO v_expected
   FROM cotironda_piloto_privado.ai_shadow_destinos_mvp221 destination
   JOIN cotironda_piloto_privado.ai_shadow_rubros_mvp221 rub
    ON rub.request_id=destination.request_id
     AND rub.line_no=destination.line_no
   WHERE destination.request_id=v_request
    AND destination.supplier_key=rec.supplier_key
    AND rub.rubro=v_rubro;
   IF v_expected<>v_solicitados OR
     v_solicitados>25 OR v_respondidos>v_solicitados OR
     rb->>'cobertura'<>(
      CASE WHEN v_respondidos=v_solicitados THEN 'completa'
       WHEN v_respondidos=0 THEN 'sin_cobertura' ELSE 'parcial' END)
   THEN v_good:=false;EXIT;END IF;
   v_seen:=array_append(v_seen,v_rubro);
   v_total:=v_total+v_respondidos;
   IF v_respondidos>0 THEN
    v_rubros:=v_rubros||jsonb_build_array(jsonb_build_object(
     'rubro',v_rubro,'respondidos',v_respondidos,
     'solicitados',v_solicitados));
   END IF;
  END LOOP;
  IF NOT v_good OR v_total=0 THEN CONTINUE; END IF;
  -- No truncation: deny the entire optional projection if its bound
  -- would otherwise silently omit a supplier.
  IF v_count>=25 THEN RETURN jsonb_build_object('state','unavailable');END IF;
  v_count:=v_count+1;
  v_quotes:=v_quotes||jsonb_build_array(jsonb_build_object(
   'label','Respuesta en revisión '||v_count,'rubros',v_rubros));
 END LOOP;
 RETURN jsonb_build_object(
  'state','respuestas_pendientes_por_rubro',
  'respuestas',v_quotes,
  'ranking_permitido',false,
  'contactos_revelados',false,
  'adjudicacion_automatica',false
 );
END
$fn$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_ia_pending_coverage_mvp299(text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_ia_pending_coverage_mvp299(text)
 TO service_role;
