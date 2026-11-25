-- Candidato: compartir resúmenes, nunca sesión ni original. Solo piloto.
BEGIN;
CREATE TABLE cotironda_piloto_privado.v2_buyer_shared_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 buyer_key text NOT NULL REFERENCES cotironda_piloto_privado.participants(key),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 revoked_at timestamptz
);
CREATE UNIQUE INDEX v2_buyer_shared_history_one_active ON cotironda_piloto_privado.v2_buyer_shared_history(buyer_key) WHERE revoked_at IS NULL;
ALTER TABLE cotironda_piloto_privado.v2_buyer_shared_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.v2_buyer_shared_history FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION cotironda_piloto_privado.v2_responders_for_verified_buyer(p_request_id uuid, p_buyer_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_now timestamptz:=clock_timestamp();
 v_buyer text;
 v_activation timestamptz;
 v_docs jsonb:='[]'::jsonb;
 v_rec record;
 v_hex text;
 v_doc uuid;
 v_total integer:=0;
BEGIN
 IF p_request_id IS NULL OR p_buyer_key IS NULL
 THEN RETURN NULL;END IF;
 IF NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.v2_original_share_policy WHERE singleton=true AND enabled=true) THEN RETURN NULL; END IF;

 -- Sesión D016 y política comercial revalidadas en base.
 SELECT r.buyer_key,policy.activated_at INTO v_buyer,v_activation
 FROM cotironda_piloto_privado.requests r
 JOIN cotironda_piloto_privado.v2_business_policy policy
 ON policy.singleton=true AND policy.enabled=true
 AND policy.activated_at IS NOT NULL
 AND r.created_at>=policy.activated_at
 WHERE r.id=p_request_id AND r.state IN ('prepared','closed')
 AND r.buyer_key=p_buyer_key
 LIMIT 1;
 IF v_buyer IS NULL THEN RETURN NULL; END IF;

 FOR v_rec IN
  SELECT DISTINCT ON (link.message_hmac)
   link.message_hmac,
   CASE WHEN link.kind='text' THEN source.plaintext_sha256
        ELSE a.content_sha256 END AS content_sha256,
   CASE WHEN link.kind='text' THEN 'text/plain' ELSE a.mime END AS mime,
   link.kind,supplier.display_label,source.received_at
  FROM cotironda_piloto_privado.ai_supplier_links_mvp225 link
  JOIN cotironda_piloto_privado.requests r
   ON r.id=link.request_id AND r.buyer_key=v_buyer
   AND r.state IN ('prepared','closed')
  LEFT JOIN cotironda_piloto_privado.media_archive_mvp095 a
   ON a.message_hmac=link.message_hmac
   AND link.kind IN ('document','image')
   AND a.kind=link.kind
   AND a.request_id=link.request_id
   AND a.participant_key=link.supplier_key
   AND a.content_sha256=link.source_sha256
   AND a.state='stored' AND a.finished_at IS NOT NULL
   AND a.storage_path='media/'||a.message_hmac
   AND a.size_bytes BETWEEN 1 AND 8388608
   AND a.mime IN (
     'application/pdf','image/jpeg','image/png','image/webp',
     'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
     'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
     'application/msword','application/vnd.ms-excel','text/plain','text/csv')
  JOIN cotironda_piloto_privado.whapi_inbox source
   ON source.message_hmac=link.message_hmac
   AND source.request_id=link.request_id
   AND source.participant_key=link.supplier_key
   AND source.kind=link.kind
   AND (link.kind='text' OR source.chat_hmac=a.chat_hmac)
  JOIN cotironda_piloto_privado.participants supplier
   ON supplier.key=link.supplier_key
   AND supplier.chat_hmac=source.chat_hmac
   AND supplier.participant_role='supplier'
   AND supplier.consent_at IS NOT NULL
   AND supplier.opted_out_at IS NULL
   AND length(btrim(supplier.display_label)) BETWEEN 3 AND 100
  JOIN cotironda_piloto_privado.invitations inv
   ON inv.request_id=r.id AND inv.supplier_key=supplier.key
   AND inv.state='prepared'
   AND inv.created_at<=source.received_at
  JOIN cotironda_piloto_privado.ai_dispatch_jobs_mvp222 dispatch
   ON dispatch.request_id=r.id AND dispatch.supplier_key=supplier.key
   AND dispatch.state='api_accepted' AND dispatch.whapi_message_id IS NOT NULL
   AND dispatch.finished_at<=source.received_at
   AND dispatch.finished_at>=inv.created_at
  JOIN LATERAL (SELECT cotironda_piloto_privado.v2_d016_effective_original_consent_private(supplier.key,r.id,supplier.chat_hmac,inv.created_at) AS accepted_at) c ON c.accepted_at IS NOT NULL
  WHERE link.request_id=p_request_id
   AND (
    (link.kind IN ('document','image')
     AND a.message_hmac IS NOT NULL
     AND (
      link.association IN ('quoted_whapi_id','single_active_round')
      OR (
       link.association='semantic_unique_mvp291'
       AND EXISTS (
        SELECT 1 FROM cotironda_piloto_privado.ai_supplier_auto_correlation_mvp291 decision
        JOIN cotironda_piloto_privado.ai_supplier_unresolved_mvp237 u
          ON u.message_hmac=decision.source_hmac
          AND u.supplier_key=decision.supplier_key
          AND u.source_sha256=decision.source_sha256
        WHERE decision.source_hmac=link.message_hmac
          AND decision.supplier_key=link.supplier_key
          AND decision.source_sha256=link.source_sha256
          AND decision.selected_request_id=link.request_id
          AND decision.state='linked'
          AND decision.finished_at IS NOT NULL
          AND u.resolved_request_id=link.request_id
          AND u.state='ambiguous_round'
       )
      )
      OR (
       link.association='prior_supplier_preamble'
       AND EXISTS (
        SELECT 1 FROM cotironda_piloto_privado.ai_supplier_preambles_mvp238 preamble
        JOIN cotironda_piloto_privado.whapi_inbox notice
         ON notice.message_hmac=preamble.preamble_hmac
         AND notice.chat_hmac=preamble.chat_hmac
         AND notice.participant_key=preamble.supplier_key
         AND notice.kind='text'
         AND notice.request_id=preamble.request_id
         AND notice.received_at=preamble.received_at
         AND notice.plaintext_sha256=preamble.source_sha256
        WHERE preamble.attachment_hmac=link.message_hmac
         AND preamble.request_id=link.request_id
         AND preamble.supplier_key=link.supplier_key
         AND preamble.chat_hmac=source.chat_hmac
         AND preamble.attached_at IS NOT NULL
         AND preamble.attached_at>=source.received_at
         AND preamble.received_at<source.received_at
         AND preamble.received_at>=source.received_at-interval '24 hours'
         AND preamble.source_sha256 ~ '^[a-f0-9]{64}$'
       )
      )
     )
    )
    OR
    (link.kind='text'
     AND a.message_hmac IS NULL
     AND source.kind='text'
     AND source.plaintext_sha256=link.source_sha256
     AND source.plaintext_sha256 ~ '^[a-f0-9]{64}$'
     AND source.nonce_b64 ~ '^[A-Za-z0-9+/]{16}$'
     AND length(source.ciphertext_b64) BETWEEN 24 AND 20000
     AND source.processing_state='needs_review'
     AND (
      link.association IN ('quoted_whapi_id','single_active_round')
      OR
      (link.association='semantic_unique_mvp291'
       AND EXISTS(
        SELECT 1 FROM cotironda_piloto_privado.ai_supplier_auto_correlation_mvp291 decision
        WHERE decision.source_hmac=link.message_hmac
         AND decision.supplier_key=link.supplier_key
         AND decision.source_sha256=link.source_sha256
         AND decision.state='linked'
         AND decision.selected_request_id=link.request_id
         AND decision.finished_at IS NOT NULL
      ))
     )
    )
   )
   AND link.status='awaiting_semantic_review'

    -- Un solo consentimiento al alta. SIN confirmación por respuesta.
   AND link.source_sha256 ~ '^[a-f0-9]{64}$'
   AND (link.kind='text' OR a.content_sha256 ~ '^[a-f0-9]{64}$')
   AND source.received_at>=r.created_at
   AND source.received_at<=r.closes_at
   AND source.received_at<=v_now
   AND supplier.consent_at<=dispatch.finished_at
   AND NOT EXISTS (
    SELECT 1 FROM cotironda_piloto_privado.ai_supplier_unresolved_mvp237 bad
    WHERE bad.message_hmac=link.message_hmac
      AND (
       bad.state='media_context_conflict'
       OR (bad.state='ambiguous_round'
           AND (link.association IS DISTINCT FROM 'semantic_unique_mvp291'
                OR bad.resolved_request_id IS DISTINCT FROM link.request_id))
      )
   )
  ORDER BY link.message_hmac
 LOOP
  v_total:=v_total+1;
  IF v_total>100 THEN RETURN NULL; END IF;
  -- Identificador opaco estable: NO expone HMAC, ruta ni contactos.
  v_hex:=encode(extensions.digest(convert_to(
   'cotironda-v2-original|'||p_request_id::text||'|'||v_rec.message_hmac,
   'UTF8'),'sha256'),'hex');
  v_doc:=(substr(v_hex,1,8)||'-'||substr(v_hex,9,4)||'-4'||
   substr(v_hex,14,3)||'-a'||substr(v_hex,18,3)||'-'||
   substr(v_hex,21,12))::uuid;
  v_docs:=v_docs||jsonb_build_array(jsonb_build_object(
   'documentId',v_doc::text,
   'supplierName',btrim(v_rec.display_label),
   'mime',v_rec.mime,'kind',v_rec.kind,
   'receivedAt',(extract(epoch from v_rec.received_at)*1000)::bigint
  ));
 END LOOP;
 RETURN jsonb_build_object(
  'state','authorized_responders_v2','buyerKey',v_buyer,
  'total',v_total,'originals',v_docs);
END;
$function$;
REVOKE ALL ON FUNCTION cotironda_piloto_privado.v2_responders_for_verified_buyer(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.cotironda_piloto_v2_d016_responders_private(p_request_id uuid,p_sesion_hmac text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $$
DECLARE c jsonb;
BEGIN
 c:=public.cotironda_piloto_v2_d016_session_context_private(p_sesion_hmac,p_request_id);
 IF c IS NULL OR c->>'state'<>'authorized_buyer_whatsapp_session' OR c->>'requestId' IS DISTINCT FROM p_request_id::text THEN RETURN NULL;END IF;
 RETURN cotironda_piloto_privado.v2_responders_for_verified_buyer(p_request_id,c->>'buyerKey');
END $$;
CREATE OR REPLACE FUNCTION public.cotironda_piloto_v2_manage_shared_history(p_sesion_hmac text,p_action text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE b text; r uuid; c jsonb; share_id uuid;
BEGIN
 IF p_action IS NULL OR p_action NOT IN ('get','create','revoke') THEN RETURN NULL;END IF;
 SELECT buyer_key,request_id INTO b,r FROM cotironda_piloto_privado.v2_d016_browser_sessions
 WHERE sesion_hmac=p_sesion_hmac AND revoked_at IS NULL AND expires_at>clock_timestamp() AND purpose='whatsapp_buyer_session';
 IF NOT FOUND THEN RETURN NULL;END IF;
 PERFORM 1 FROM cotironda_piloto_privado.participants WHERE key=b FOR UPDATE;
 c:=public.cotironda_piloto_v2_d016_session_context_private(p_sesion_hmac,r);
 IF c IS NULL OR c->>'buyerKey' IS DISTINCT FROM b THEN RETURN NULL;END IF;
 IF p_action='revoke' THEN
  UPDATE cotironda_piloto_privado.v2_buyer_shared_history SET revoked_at=clock_timestamp() WHERE buyer_key=b AND revoked_at IS NULL;
  RETURN jsonb_build_object('state','inactive');
 END IF;
 SELECT id INTO share_id FROM cotironda_piloto_privado.v2_buyer_shared_history WHERE buyer_key=b AND revoked_at IS NULL;
 IF share_id IS NULL AND p_action='create' THEN
  INSERT INTO cotironda_piloto_privado.v2_buyer_shared_history(buyer_key) VALUES(b) RETURNING id INTO share_id;
 END IF;
 RETURN CASE WHEN share_id IS NULL THEN jsonb_build_object('state','inactive') ELSE jsonb_build_object('state','active','shareId',share_id) END;
END $$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_v2_manage_shared_history(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_v2_manage_shared_history(text,text) TO service_role;
CREATE OR REPLACE FUNCTION public.cotironda_piloto_v2_read_shared_history(p_share_id uuid,p_request_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $$
DECLARE b text; result jsonb; cat jsonb; v_entry jsonb; items jsonb:='[]'::jsonb; commercial jsonb; analysis jsonb; rec record;
BEGIN
 -- UUID is not an authentication credential: server must verify the HMAC
 -- before using this service-role-only RPC. Recheck ownership and revocation.
 SELECT s.buyer_key INTO b FROM cotironda_piloto_privado.v2_buyer_shared_history s
 JOIN cotironda_piloto_privado.participants buyer ON buyer.key=s.buyer_key AND buyer.participant_role='buyer' AND buyer.consent_at IS NOT NULL AND buyer.opted_out_at IS NULL
 JOIN cotironda_piloto_privado.participant_channels_mvp109 ch ON ch.participant_key=buyer.key AND ch.chat_hmac=buyer.chat_hmac
 JOIN cotironda_piloto_privado.whapi_inbox proof ON proof.message_hmac=ch.authenticated_message_hmac AND proof.participant_key=buyer.key AND proof.chat_hmac=buyer.chat_hmac
 WHERE s.id=p_share_id AND s.revoked_at IS NULL AND NOT EXISTS(
 SELECT 1 FROM cotironda_piloto_privado.participant_channels_mvp109 x JOIN cotironda_piloto_privado.participants other ON other.key=x.participant_key
 WHERE x.contact_sha256=ch.contact_sha256 AND x.participant_key<>buyer.key AND other.participant_role='buyer' AND other.opted_out_at IS NULL);
 IF b IS NULL THEN RETURN NULL;END IF;
 IF p_request_id IS NULL THEN
 SELECT COALESCE(jsonb_agg(jsonb_build_object('requestId',x.id::text,'createdAtMs',(extract(epoch from x.created_at)*1000)::bigint,'status',x.state,'deliveryCity',left(coalesce(x.delivery_city,''),100),'requestedItems',x.n,'canOpenOffers',true,'availableDocuments',coalesce((cotironda_piloto_privado.v2_responders_for_verified_buyer(x.id,b)->>'total')::integer,0)) ORDER BY x.created_at DESC,x.id DESC),'[]'::jsonb) INTO result
 FROM (SELECT r.id,r.created_at,r.state,r.delivery_city,(SELECT count(*)::integer FROM cotironda_piloto_privado.request_lines ln WHERE ln.request_id=r.id) n
 FROM cotironda_piloto_privado.requests r JOIN cotironda_piloto_privado.v2_business_policy bp ON bp.singleton=true AND bp.enabled=true AND bp.activated_at IS NOT NULL AND r.created_at>=bp.activated_at
 WHERE r.buyer_key=b AND r.state IN ('prepared','closed') ORDER BY r.created_at DESC,r.id DESC LIMIT 100) x;
 RETURN jsonb_build_object('state','authorized_buyer_history_v2','buyerName','Cotizaciones compartidas','total',jsonb_array_length(result),'rounds',result);
 END IF;
 cat:=cotironda_piloto_privado.v2_responders_for_verified_buyer(p_request_id,b);
 IF cat IS NULL THEN RETURN NULL;END IF;
 FOR v_entry IN SELECT value FROM jsonb_array_elements(cat->'originals') LOOP
 -- Match the same stable document ID and original SHA as the authorized catalog.
 SELECT l.message_hmac,l.supplier_key,l.source_sha256 INTO rec
 FROM cotironda_piloto_privado.ai_supplier_links_mvp225 l
 CROSS JOIN LATERAL (SELECT encode(extensions.digest(convert_to('cotironda-v2-original|'||p_request_id::text||'|'||l.message_hmac,'UTF8'),'sha256'),'hex') h) hash
 WHERE l.request_id=p_request_id AND l.status='awaiting_semantic_review'
 AND (substr(h,1,8)||'-'||substr(h,9,4)||'-4'||substr(h,14,3)||'-a'||substr(h,18,3)||'-'||substr(h,21,12))=v_entry->>'documentId';
 IF NOT FOUND THEN RETURN NULL;END IF;
 SELECT jsonb_build_object('totalLiteral',NULLIF(btrim(q.declared_total_literal),''),'termsLiteral',NULL,
 'requestItems',(SELECT coalesce(jsonb_agg(jsonb_build_object('line',rl.line_no,'description',rl.original_description,'quantity',rl.quantity::text,'unit',rl.unit) ORDER BY rl.line_no),'[]'::jsonb) FROM cotironda_piloto_privado.request_lines rl WHERE rl.request_id=p_request_id),
 'assignedItems',(SELECT coalesce(jsonb_agg(jsonb_build_object('line',rl.line_no,'description',rl.original_description,'quantity',rl.quantity::text,'unit',rl.unit) ORDER BY rl.line_no),'[]'::jsonb) FROM cotironda_piloto_privado.invitation_lines_mvp099 i JOIN cotironda_piloto_privado.request_lines rl ON rl.request_id=i.request_id AND rl.line_no=i.line_no WHERE i.request_id=p_request_id AND i.supplier_key=rec.supplier_key),
 'quotedItems',(SELECT coalesce(jsonb_agg(jsonb_build_object('line',ql.line_no,'description',ql.description_literal,'quantity',ql.quantity_literal,'unit',ql.unit_literal,'unitPrice',ql.unit_price_literal,'lineTotal',ql.line_total_literal,'ambiguity',ql.ambiguity_literal) ORDER BY ql.line_no),'[]'::jsonb) FROM cotironda_piloto_privado.supplier_quote_lines_mvp101 ql WHERE ql.message_hmac=q.message_hmac))
 INTO commercial FROM cotironda_piloto_privado.supplier_media_quotes_mvp098 q
 WHERE q.request_id=p_request_id AND q.message_hmac=rec.message_hmac AND q.supplier_key=rec.supplier_key AND q.source_sha256=rec.source_sha256 AND q.state IN ('awaiting_fidelity_check','verified') AND q.line_count BETWEEN 0 AND 100 LIMIT 1;
 SELECT jsonb_build_object('state','ready','points',a.points) INTO analysis FROM cotironda_piloto_privado.v2_original_analysis a
 WHERE a.request_id=p_request_id AND a.document_id=(v_entry->>'documentId')::uuid AND a.original_sha256=rec.source_sha256 AND a.status='ready' LIMIT 1;
 items:=items||jsonb_build_array(v_entry||jsonb_build_object('commercial',commercial,'analysis',analysis));
 END LOOP;
 -- Only the backend projection may consume raw commercial fields.
 RETURN jsonb_set(cat,'{originals}',items);
END $$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_v2_read_shared_history(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_v2_read_shared_history(uuid,uuid) TO service_role;
COMMIT;
