-- D021 candidate: texto comercial original ya ligado a UNA ronda, sin alterar
-- correlador MVP291, intento histórico MVP227, sesión D016 ni archivos.
-- SOLO CANDIDATO GitHub. Aplicar en cotironda-piloto tras «Publicalo».
BEGIN;
CREATE TABLE IF NOT EXISTS cotironda_piloto_privado.v2_text_commercial_d021 (
 source_hmac text PRIMARY KEY,
 request_id uuid NOT NULL,
 supplier_key text NOT NULL,
 source_sha256 text NOT NULL,
 state text NOT NULL CHECK (state IN ('leased','ready','review')),
 facts jsonb,
 reserved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 finished_at timestamptz,
 CONSTRAINT d021_sha_guard CHECK(
  source_hmac ~ '^[a-f0-9]{64}$' AND source_sha256 ~ '^[a-f0-9]{64}$'),
 CONSTRAINT d021_ready_guard CHECK (
  (state='leased' AND finished_at IS NULL AND facts IS NULL) OR
  (state='review' AND finished_at IS NOT NULL AND facts IS NULL) OR
  (state='ready' AND finished_at IS NOT NULL AND facts IS NOT NULL)
 )
);
ALTER TABLE cotironda_piloto_privado.v2_text_commercial_d021 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.v2_text_commercial_d021
 FROM PUBLIC,anon,authenticated;
-- Datos NO expuestos a APIs públicas; vista autorizada abajo solo retorna
-- una proyección comercial respaldada por mensaje SHA y consentimiento.

CREATE OR REPLACE FUNCTION public.cotironda_piloto_claim_text_commercial_v2()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $body$
DECLARE v_row record;v_written integer;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_central_control_mvp226
   WHERE only_row AND enabled AND activated_at IS NOT NULL)
 THEN RETURN jsonb_build_object('state','disabled'); END IF;
 IF NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.v2_original_share_policy
   WHERE singleton AND enabled)
 THEN RETURN jsonb_build_object('state','disabled'); END IF;
 -- Limit independent of the source-specific one-shot claim; no rolling
 -- reinterpretation of historic failed AI attempts or reset of ledgers.
 IF (SELECT count(*) FROM cotironda_piloto_privado.v2_text_commercial_d021
  WHERE reserved_at>clock_timestamp()-interval '24 hours')>=30
 THEN RETURN jsonb_build_object('state','quota'); END IF;
 SELECT l.message_hmac,l.request_id,l.supplier_key,l.source_sha256,
  m.chat_hmac,m.nonce_b64,m.ciphertext_b64,
  CASE WHEN jsonb_typeof(t.materials)='array'
   THEN LEAST(25,jsonb_array_length(t.materials)) ELSE 0 END AS expected_items
 INTO v_row
 FROM cotironda_piloto_privado.ai_supplier_links_mvp225 l
 JOIN cotironda_piloto_privado.whapi_inbox m
  ON m.message_hmac=l.message_hmac AND m.request_id=l.request_id
  AND m.participant_key=l.supplier_key AND m.kind='text'
  AND m.plaintext_sha256=l.source_sha256
  AND m.processing_state='needs_review'
 JOIN cotironda_piloto_privado.requests r
  ON r.id=l.request_id AND r.state='prepared'
  AND r.created_at<=m.received_at AND r.closes_at>m.received_at
  AND r.closes_at>clock_timestamp()
 JOIN cotironda_piloto_privado.participants buyer
  ON buyer.key=r.buyer_key AND buyer.participant_role='buyer'
  AND buyer.consent_at IS NOT NULL AND buyer.opted_out_at IS NULL
 JOIN cotironda_piloto_privado.participants supplier
  ON supplier.key=l.supplier_key AND supplier.participant_role='supplier'
  AND supplier.chat_hmac=m.chat_hmac
  AND supplier.consent_at IS NOT NULL AND supplier.opted_out_at IS NULL
 JOIN cotironda_piloto_privado.invitations inv
  ON inv.request_id=l.request_id AND inv.supplier_key=l.supplier_key
  AND inv.state='prepared'
 JOIN cotironda_piloto_privado.ai_dispatch_jobs_mvp222 dispatch
  ON dispatch.request_id=l.request_id AND dispatch.supplier_key=l.supplier_key
  AND dispatch.state='api_accepted' AND dispatch.whapi_message_id IS NOT NULL
  AND dispatch.finished_at IS NOT NULL AND dispatch.finished_at<=m.received_at
 LEFT JOIN cotironda_piloto_privado.ai_supplier_text_materials_mvp292 t
  ON t.source_hmac=l.message_hmac AND t.source_sha256=l.source_sha256
 WHERE l.kind='text' AND l.status='awaiting_semantic_review'
  AND l.association IN ('semantic_unique_mvp291','quoted_whapi_id',
   'single_active_round','prior_supplier_preamble')
  AND m.received_at>=clock_timestamp()-interval '7 days'
  AND m.nonce_b64 ~ '^[A-Za-z0-9+/]{16}$'
  AND length(m.ciphertext_b64) BETWEEN 24 AND 20000
  AND cotironda_piloto_privado.v2_d016_effective_original_consent_private(
   l.supplier_key,l.request_id,m.chat_hmac,inv.created_at) IS NOT NULL
  AND NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.v2_text_commercial_d021 old
   WHERE old.source_hmac=l.message_hmac)
 ORDER BY m.received_at,l.message_hmac
 LIMIT 1 FOR UPDATE OF l SKIP LOCKED;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','empty'); END IF;
 INSERT INTO cotironda_piloto_privado.v2_text_commercial_d021(
  source_hmac,request_id,supplier_key,source_sha256,state)
 VALUES(v_row.message_hmac,v_row.request_id,v_row.supplier_key,
  v_row.source_sha256,'leased')
 ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS v_written=ROW_COUNT;
 IF v_written<>1 THEN RETURN jsonb_build_object('state','busy'); END IF;
 RETURN jsonb_build_object('state','claimed',
  'source_hmac',v_row.message_hmac,'source_sha256',v_row.source_sha256,
  'chat_hmac',v_row.chat_hmac,'nonce',v_row.nonce_b64,
  'ciphertext',v_row.ciphertext_b64,'expected_items',v_row.expected_items);
END $body$;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_finish_text_commercial_v2(
 p_source_hmac text,p_source_sha256 text,p_state text,p_facts jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $body$
DECLARE v_row record;
BEGIN
 IF p_source_hmac !~ '^[a-f0-9]{64}$'
 OR p_source_sha256 !~ '^[a-f0-9]{64}$'
 OR p_state NOT IN ('ready','review')
 THEN RETURN jsonb_build_object('state','invalid'); END IF;
 SELECT * INTO v_row FROM cotironda_piloto_privado.v2_text_commercial_d021
  WHERE source_hmac=p_source_hmac AND source_sha256=p_source_sha256
  AND state='leased' FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_permitted'); END IF;
 IF p_state='ready' AND (
  p_facts IS NULL OR jsonb_typeof(p_facts)<>'object' OR
  jsonb_typeof(p_facts->'quotedItems')<>'array' OR
  jsonb_array_length(p_facts->'quotedItems') NOT BETWEEN 1 AND 25 OR
  length(p_facts::text)>18000 OR
  p_facts ? 'requestItems' OR p_facts ? 'assignedItems' OR
  (SELECT count(*)<>3 FROM jsonb_object_keys(p_facts))
 ) THEN RETURN jsonb_build_object('state','invalid'); END IF;
 IF p_state='review' AND p_facts IS NOT NULL
 THEN RETURN jsonb_build_object('state','invalid'); END IF;
 -- Immutable original source, SHA and link remain untouched.
 UPDATE cotironda_piloto_privado.v2_text_commercial_d021
 SET state=p_state,facts=CASE WHEN p_state='ready' THEN p_facts ELSE NULL END,
  finished_at=clock_timestamp()
 WHERE source_hmac=p_source_hmac AND source_sha256=p_source_sha256
  AND state='leased';
 RETURN jsonb_build_object('state','recorded');
END $body$;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_v2_d021_responders_commercial_private(
 p_request_id uuid,p_sesion_hmac text
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $body$
DECLARE v_catalog jsonb;v_items jsonb:='[]'::jsonb;v_item jsonb;
 v_source jsonb;v_facts jsonb;v_requested jsonb;v_assigned jsonb;
BEGIN
 -- The existing RPC is the source of truth: same buyer, consent, originals,
 -- company isolation, SHA, analysis, revocation and checked D016 session.
 v_catalog:=public.cotironda_piloto_v2_d016_responders_with_analysis_private(
  p_request_id,p_sesion_hmac);
 IF v_catalog IS NULL OR v_catalog->>'state'<>'authorized_responders_v2'
 OR jsonb_typeof(v_catalog->'originals')<>'array'
 THEN RETURN NULL; END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'line',rl.line_no,'description',rl.original_description,
  'quantity',rl.quantity::text,'unit',rl.unit
 ) ORDER BY rl.line_no),'[]'::jsonb)
 INTO v_requested
 FROM cotironda_piloto_privado.request_lines rl WHERE rl.request_id=p_request_id;
 FOR v_item IN SELECT value FROM jsonb_array_elements(v_catalog->'originals') LOOP
  IF v_item->>'kind'='text' AND v_item->>'mime'='text/plain' THEN
   v_source:=public.cotironda_piloto_v2_d016_original_source_private(
    p_request_id,p_sesion_hmac,(v_item->>'documentId')::uuid);
   IF v_source IS NOT NULL AND v_source->>'state'='authorized_text_v2' THEN
    v_facts:=NULL;
    SELECT c.facts INTO v_facts
    FROM cotironda_piloto_privado.v2_text_commercial_d021 c
    JOIN cotironda_piloto_privado.ai_supplier_links_mvp225 l
     ON l.message_hmac=c.source_hmac
     AND l.request_id=c.request_id AND l.supplier_key=c.supplier_key
     AND l.source_sha256=c.source_sha256
    WHERE c.state='ready' AND c.request_id=p_request_id
     AND c.source_hmac=v_source->>'messageHmac'
     AND c.source_sha256=v_source->>'sha256'
     AND c.supplier_key=v_source->>'supplierKey';
    IF v_facts IS NOT NULL THEN
     SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'line',rl.line_no,'description',rl.original_description,
      'quantity',rl.quantity::text,'unit',rl.unit
     ) ORDER BY rl.line_no),'[]'::jsonb)
     INTO v_assigned
     FROM cotironda_piloto_privado.invitation_lines_mvp099 a
     JOIN cotironda_piloto_privado.request_lines rl
      ON rl.request_id=a.request_id AND rl.line_no=a.line_no
     WHERE a.request_id=p_request_id AND a.supplier_key=v_source->>'supplierKey';
     v_item:=v_item||jsonb_build_object('commercial',
      v_facts||jsonb_build_object(
       'requestItems',v_requested,'assignedItems',v_assigned));
    END IF;
   END IF;
  END IF;
  v_items:=v_items||jsonb_build_array(v_item);
 END LOOP;
 RETURN jsonb_set(v_catalog,'{originals}',v_items);
END $body$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_claim_text_commercial_v2()
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.cotironda_piloto_finish_text_commercial_v2(text,text,text,jsonb)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.cotironda_piloto_v2_d021_responders_commercial_private(uuid,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_claim_text_commercial_v2()
 TO service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_finish_text_commercial_v2(text,text,text,jsonb)
 TO service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_v2_d021_responders_commercial_private(uuid,text)
 TO service_role;
COMMIT;
