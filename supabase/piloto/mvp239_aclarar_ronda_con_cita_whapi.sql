-- Etapa 2, MVP239: consulta breve y aclaración por cita exacta.
-- No envía WhatsApps desde SQL, ni concede nuevos permisos comerciales.
ALTER TABLE cotironda_piloto_privado.ai_supplier_unresolved_mvp237
 ADD COLUMN IF NOT EXISTS resolved_request_id uuid REFERENCES cotironda_piloto_privado.requests(id),
 ADD COLUMN IF NOT EXISTS resolved_at timestamptz;
ALTER TABLE cotironda_piloto_privado.ai_supplier_unresolved_mvp237
 ADD CONSTRAINT mvp239_resolution_pair CHECK
 ((resolved_request_id IS NULL)=(resolved_at IS NULL));

ALTER TABLE cotironda_piloto_privado.ai_supplier_links_mvp225
 DROP CONSTRAINT IF EXISTS ai_supplier_links_mvp225_association_check;
ALTER TABLE cotironda_piloto_privado.ai_supplier_links_mvp225
 ADD CONSTRAINT ai_supplier_links_mvp225_association_check
 CHECK(association IN('quoted_whapi_id','single_active_round',
 'prior_supplier_preamble','clarified_supplier_reply'));

CREATE TABLE cotironda_piloto_privado.ai_supplier_clarifications_mvp239(
 source_hmac text PRIMARY KEY REFERENCES cotironda_piloto_privado.ai_supplier_unresolved_mvp237(message_hmac),
 supplier_key text NOT NULL REFERENCES cotironda_piloto_privado.participants(key),
 state text NOT NULL CHECK(state IN('leased','api_accepted','uncertain')),
 leased_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 finished_at timestamptz,
 CONSTRAINT mvp239_state_dates CHECK((state='leased')=(finished_at IS NULL))
);
CREATE INDEX ai_supplier_clarifications_mvp239_budget_idx
 ON cotironda_piloto_privado.ai_supplier_clarifications_mvp239(supplier_key,leased_at);
ALTER TABLE cotironda_piloto_privado.ai_supplier_clarifications_mvp239 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE cotironda_piloto_privado.ai_supplier_clarifications_mvp239 FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_reserve_clarification_mvp239(
 p_source_hmac text,p_chat_hmac text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $reserve$
DECLARE v_supplier text;v_count integer;v_added integer;
BEGIN
 IF p_source_hmac !~ '^[a-f0-9]{64}$' OR p_chat_hmac !~ '^[a-f0-9]{64}$'
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 IF (public.cotironda_piloto_ia_trial_flags_mvp229(p_chat_hmac)->>'quote_link') IS DISTINCT FROM 'true'
 OR NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.integration_flags f
    WHERE f.only_row AND f.whatsapp_inbound_enabled
      AND f.whatsapp_outbound_enabled)
 THEN RETURN jsonb_build_object('state','disabled');END IF;
 SELECT p.key INTO v_supplier
 FROM cotironda_piloto_privado.ai_supplier_unresolved_mvp237 u
 JOIN cotironda_piloto_privado.whapi_inbox m
  ON m.message_hmac=u.message_hmac AND m.participant_key=u.supplier_key
 JOIN cotironda_piloto_privado.participants p
  ON p.key=u.supplier_key AND p.chat_hmac=m.chat_hmac
 WHERE u.message_hmac=p_source_hmac AND m.chat_hmac=p_chat_hmac
  AND m.request_id IS NULL AND u.resolved_request_id IS NULL
  AND m.kind=u.kind AND m.received_at>=clock_timestamp()-interval '15 minutes'
  AND p.participant_role='supplier' AND p.consent_at IS NOT NULL
  AND p.opted_out_at IS NULL
  AND ( (m.kind='text' AND m.plaintext_sha256=u.source_sha256)
     OR (m.kind IN('document','image') AND EXISTS(
       SELECT 1 FROM cotironda_piloto_privado.media_archive_mvp095 a
       WHERE a.message_hmac=m.message_hmac AND a.request_id IS NULL
        AND a.state='stored' AND a.content_sha256=u.source_sha256)) )
 FOR UPDATE OF m;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_eligible');END IF;
 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_supplier_clarifications_mvp239 q
  WHERE q.source_hmac=p_source_hmac)
 THEN RETURN jsonb_build_object('state','already_reserved');END IF;
 SELECT count(*) INTO v_count
 FROM cotironda_piloto_privado.ai_supplier_clarifications_mvp239 q
 WHERE q.supplier_key=v_supplier AND q.leased_at>clock_timestamp()-interval '24 hours';
 IF v_count>=3 THEN RETURN jsonb_build_object('state','daily_quota');END IF;
 INSERT INTO cotironda_piloto_privado.ai_supplier_clarifications_mvp239(source_hmac,supplier_key,state)
 VALUES(p_source_hmac,v_supplier,'leased')
 ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS v_added=ROW_COUNT;
 RETURN jsonb_build_object('state',CASE WHEN v_added=1 THEN 'reserved' ELSE 'already_reserved' END);
END
$reserve$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_ia_reserve_clarification_mvp239(text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_ia_reserve_clarification_mvp239(text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_finish_clarification_mvp239(
 p_source_hmac text,p_state text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $finish$
DECLARE v_rows integer;
BEGIN
 IF p_source_hmac !~ '^[a-f0-9]{64}$' OR
 p_state NOT IN ('api_accepted','uncertain')
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 UPDATE cotironda_piloto_privado.ai_supplier_clarifications_mvp239
 SET state=p_state,finished_at=clock_timestamp()
 WHERE source_hmac=p_source_hmac AND state='leased';
 GET DIAGNOSTICS v_rows=ROW_COUNT;
 RETURN jsonb_build_object('state',CASE WHEN v_rows=1 THEN 'recorded' ELSE 'not_leased' END);
END
$finish$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_ia_finish_clarification_mvp239(text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_ia_finish_clarification_mvp239(text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_resolve_clarification_mvp239(
 p_reply_hmac text,p_chat_hmac text,p_quoted_whapi_id text,p_original_text text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $resolve$
DECLARE v_supplier text;v_received_at timestamptz;
 v_target uuid;v_target_count integer;v_source_hmac text;v_source_count integer;
 v_source record;v_rows integer;
BEGIN
 IF p_reply_hmac !~ '^[a-f0-9]{64}$' OR p_chat_hmac !~ '^[a-f0-9]{64}$'
 OR p_quoted_whapi_id !~ '^[A-Za-z0-9._:-]{8,160}$'
 OR p_original_text IS NULL OR length(p_original_text) NOT BETWEEN 5 AND 80
 OR lower(btrim(p_original_text)) !~ '^(es|de|corresponde|este|esta)'
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 SELECT p.key,reply.received_at INTO v_supplier,v_received_at
 FROM cotironda_piloto_privado.whapi_inbox reply
 JOIN cotironda_piloto_privado.participants p
   ON p.key=reply.participant_key AND p.chat_hmac=reply.chat_hmac
 WHERE reply.message_hmac=p_reply_hmac AND reply.chat_hmac=p_chat_hmac
 AND reply.kind='text' AND reply.request_id IS NULL
 AND reply.processing_state IN('needs_review','unmatched_quote')
 AND reply.received_at>=clock_timestamp()-interval '10 minutes'
 AND reply.plaintext_sha256=encode(sha256(convert_to(p_original_text,'UTF8')),'hex')
 AND p.participant_role='supplier' AND p.consent_at IS NOT NULL AND p.opted_out_at IS NULL
 FOR UPDATE OF reply;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_authorized');END IF;
 -- El ID citado debe ser el que Cotironda envió a ESTE proveedor.
 -- No se utilizan descripciones, importes ni textos generados por IA.
 WITH targets AS (
   SELECT r.id
   FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 d
   JOIN cotironda_piloto_privado.requests r ON r.id=d.request_id
   JOIN cotironda_piloto_privado.invitations i ON i.request_id=r.id
      AND i.supplier_key=d.supplier_key AND i.state='prepared'
   JOIN cotironda_piloto_privado.participants buyer ON buyer.key=r.buyer_key
     AND buyer.participant_role='buyer' AND buyer.consent_at IS NOT NULL
     AND buyer.opted_out_at IS NULL
   WHERE d.supplier_key=v_supplier AND d.state='api_accepted'
    AND d.whapi_message_id=p_quoted_whapi_id
    AND d.finished_at<=v_received_at
    AND r.state='prepared' AND r.created_at<=v_received_at
    AND r.closes_at>v_received_at AND r.closes_at>clock_timestamp()
   UNION
   SELECT r.id
   FROM cotironda_piloto_privado.whapi_outbox o
   JOIN cotironda_piloto_privado.requests r ON r.id=o.request_id
   JOIN cotironda_piloto_privado.invitations i ON i.request_id=r.id
     AND i.supplier_key=o.supplier_key AND i.state='prepared'
   JOIN cotironda_piloto_privado.participants buyer ON buyer.key=r.buyer_key
     AND buyer.participant_role='buyer' AND buyer.consent_at IS NOT NULL
     AND buyer.opted_out_at IS NULL
   WHERE o.supplier_key=v_supplier AND o.state='api_accepted'
    AND o.whapi_message_id=p_quoted_whapi_id
    AND o.sent_at<=v_received_at
    AND r.state='prepared' AND r.created_at<=v_received_at
    AND r.closes_at>v_received_at AND r.closes_at>clock_timestamp()
 )
 SELECT count(*),min(id::text)::uuid INTO v_target_count,v_target FROM targets;
 IF v_target_count<>1 OR v_target IS NULL
 THEN RETURN jsonb_build_object('state','quoted_request_not_unique');END IF;
 SELECT count(*),min(u.message_hmac) INTO v_source_count,v_source_hmac
 FROM cotironda_piloto_privado.ai_supplier_unresolved_mvp237 u
 JOIN cotironda_piloto_privado.whapi_inbox source
  ON source.message_hmac=u.message_hmac
 WHERE u.supplier_key=v_supplier AND source.chat_hmac=p_chat_hmac
  AND source.participant_key=v_supplier
  AND u.resolved_request_id IS NULL AND source.request_id IS NULL
  AND source.kind=u.kind AND source.processing_state IN('needs_review','unmatched_quote')
  AND source.received_at<v_received_at
  AND source.received_at>=v_received_at-interval '24 hours'
  AND ((source.kind='text' AND source.plaintext_sha256=u.source_sha256)
   OR (source.kind IN('image','document') AND EXISTS(
      SELECT 1 FROM cotironda_piloto_privado.media_archive_mvp095 a
      WHERE a.message_hmac=source.message_hmac AND a.state='stored'
        AND a.request_id IS NULL AND a.content_sha256=u.source_sha256))
  );
 IF v_source_count<>1 OR v_source_hmac IS NULL
 THEN RETURN jsonb_build_object('state',
  CASE WHEN v_source_count>1 THEN 'ambiguous_source' ELSE 'no_pending_source' END);END IF;
 SELECT u.source_sha256,source.kind,source.received_at
 INTO v_source
 FROM cotironda_piloto_privado.ai_supplier_unresolved_mvp237 u
 JOIN cotironda_piloto_privado.whapi_inbox source ON source.message_hmac=u.message_hmac
 WHERE u.message_hmac=v_source_hmac AND u.resolved_request_id IS NULL
  AND source.request_id IS NULL
 FOR UPDATE OF u,source;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','already_resolved');END IF;
 -- Una cotización antigua NO puede adjudicarse a una solicitud enviada
 -- después de que llegó el presupuesto, aunque el proveedor la cite hoy.
 IF NOT EXISTS(
   SELECT 1 FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 d
   WHERE d.request_id=v_target AND d.supplier_key=v_supplier
    AND d.state='api_accepted' AND d.whapi_message_id=p_quoted_whapi_id
    AND d.finished_at<=v_source.received_at
 ) AND NOT EXISTS(
   SELECT 1 FROM cotironda_piloto_privado.whapi_outbox o
   WHERE o.request_id=v_target AND o.supplier_key=v_supplier
    AND o.state='api_accepted' AND o.whapi_message_id=p_quoted_whapi_id
    AND o.sent_at<=v_source.received_at
 )
 THEN RETURN jsonb_build_object('state','invitation_after_source');END IF;
 -- Solo una asociación nueva: source, adjunto y resolución en UNA transacción.
 UPDATE cotironda_piloto_privado.whapi_inbox
 SET request_id=v_target,processing_state='needs_review'
 WHERE message_hmac=v_source_hmac AND request_id IS NULL
  AND participant_key=v_supplier;
 GET DIAGNOSTICS v_rows=ROW_COUNT;
 IF v_rows<>1 THEN RAISE EXCEPTION 'mvp239_source_race';END IF;
 IF v_source.kind IN('image','document') THEN
  UPDATE cotironda_piloto_privado.media_archive_mvp095
  SET request_id=v_target
  WHERE message_hmac=v_source_hmac AND request_id IS NULL
   AND state='stored' AND content_sha256=v_source.source_sha256;
  GET DIAGNOSTICS v_rows=ROW_COUNT;
  IF v_rows<>1 THEN RAISE EXCEPTION 'mvp239_archive_race';END IF;
 END IF;
 INSERT INTO cotironda_piloto_privado.ai_supplier_links_mvp225
 (message_hmac,request_id,supplier_key,kind,association,source_sha256)
 VALUES(v_source_hmac,v_target,v_supplier,v_source.kind,
  'clarified_supplier_reply',v_source.source_sha256);
 UPDATE cotironda_piloto_privado.ai_supplier_unresolved_mvp237
 SET resolved_request_id=v_target,resolved_at=clock_timestamp()
 WHERE message_hmac=v_source_hmac AND resolved_request_id IS NULL;
 GET DIAGNOSTICS v_rows=ROW_COUNT;
 IF v_rows<>1 THEN RAISE EXCEPTION 'mvp239_ledger_race';END IF;
 -- La aclaración no es una oferta; evita que la ruta legacy
 -- la guarde como presupuesto o la envíe al comparador.
 UPDATE cotironda_piloto_privado.whapi_inbox
 SET request_id=v_target,processing_state='needs_review'
 WHERE message_hmac=p_reply_hmac AND request_id IS NULL
  AND participant_key=v_supplier;
 GET DIAGNOSTICS v_rows=ROW_COUNT;
 IF v_rows<>1 THEN RAISE EXCEPTION 'mvp239_reply_race';END IF;
 RETURN jsonb_build_object('state','resolved','source_hmac',v_source_hmac,
  'source_kind',v_source.kind);
END
$resolve$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_ia_resolve_clarification_mvp239(text,text,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_ia_resolve_clarification_mvp239(text,text,text,text) TO service_role;
