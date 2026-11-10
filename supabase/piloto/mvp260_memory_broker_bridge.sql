-- MVP260 / etapa 6: Memory as a verified broker guard, never source of prices.
-- Applied only AFTER MVP259. No network, WhatsApp, or model invocation in SQL.
DO $gate$ BEGIN
 IF to_regclass('cotironda_piloto_privado.commercial_context_events_mvp259') IS NULL OR
    to_regclass('cotironda_piloto_privado.ai_supplier_review_mvp227') IS NULL
 THEN RAISE EXCEPTION 'mvp260_missing_memory_or_reviews' USING errcode='42501';END IF;
END $gate$;

-- Do not let Edge choose a round: determine it from the previously reserved
-- original message and verified chat, then take the existing scoped snapshot.
CREATE FUNCTION public.cotironda_piloto_memory_quote_context_mvp260(
 p_chat_hmac text,p_message_hmac text,p_source_sha256 text
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE request_ uuid; participant_ text; scope_ jsonb;
BEGIN
 IF p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$' OR
    p_message_hmac IS NULL OR p_message_hmac !~ '^[a-f0-9]{64}$' OR
    p_source_sha256 IS NULL OR p_source_sha256 !~ '^[a-f0-9]{64}$'
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 SELECT q.request_id,q.supplier_key INTO request_,participant_
 FROM cotironda_piloto_privado.ai_supplier_review_mvp227 q
 JOIN cotironda_piloto_privado.whapi_inbox m
  ON m.message_hmac=q.message_hmac AND m.request_id=q.request_id
  AND m.participant_key=q.supplier_key
 JOIN cotironda_piloto_privado.participants p
  ON p.key=q.supplier_key AND p.chat_hmac=m.chat_hmac
 WHERE q.message_hmac=p_message_hmac AND q.state='reserved'
   AND q.source_sha256=p_source_sha256
   AND m.plaintext_sha256=p_source_sha256 AND m.chat_hmac=p_chat_hmac
   AND p.participant_role='supplier' AND p.consent_at IS NOT NULL
   AND p.opted_out_at IS NULL;
 IF request_ IS NULL THEN RETURN jsonb_build_object('state','not_authorized');END IF;
 scope_:=public.cotironda_piloto_commercial_context_mvp259(request_,p_chat_hmac);
 IF scope_->>'state'<>'private_commercial_context'
    OR scope_->>'role'<>'supplier'
    OR scope_->>'contains_contacts'<>'false'
    OR scope_->>'contains_prices'<>'false'
    OR scope_->>'automatic_decisions_allowed'<>'false'
 THEN RETURN jsonb_build_object('state','not_authorized');END IF;
 -- Strict allowlist; no request IDs, contacts, supplier names, prices or HMAC.
 RETURN jsonb_build_object(
   'state','verified_scope',
   'rubros',scope_->'rubros',
   'expires_at',scope_->>'expires_at',
   'own_latest_verified_quote_remembered',
     scope_->'own_latest_verified_quote_remembered',
   'contains_prices',false,'contains_contacts',false,
   'automatic_decisions_allowed',false);
END;$fn$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_memory_quote_context_mvp260(
 text,text,text) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_memory_quote_context_mvp260(
 text,text,text) TO service_role;

-- Write the memory pointer ONLY after the independent economic review has
-- persisted "verified". If database confirmation was lost, caller must
-- reconcile; never rerun the price model or the WhatsApp dispatch.
CREATE FUNCTION public.cotironda_piloto_memory_sync_quote_mvp260(
 p_chat_hmac text,p_message_hmac text,p_source_sha256 text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE request_ uuid; recorded_ jsonb;
BEGIN
 IF p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$' OR
    p_message_hmac IS NULL OR p_message_hmac !~ '^[a-f0-9]{64}$' OR
    p_source_sha256 IS NULL OR p_source_sha256 !~ '^[a-f0-9]{64}$'
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 SELECT q.request_id INTO request_
 FROM cotironda_piloto_privado.ai_supplier_review_mvp227 q
 JOIN cotironda_piloto_privado.whapi_inbox m
  ON m.message_hmac=q.message_hmac AND m.request_id=q.request_id
  AND m.participant_key=q.supplier_key AND m.chat_hmac=p_chat_hmac
  AND m.plaintext_sha256=q.source_sha256
 JOIN cotironda_piloto_privado.participants p
  ON p.key=q.supplier_key AND p.chat_hmac=p_chat_hmac
 WHERE q.message_hmac=p_message_hmac
  AND q.state='verified' AND q.source_sha256=p_source_sha256
  AND p.participant_role='supplier' AND p.consent_at IS NOT NULL
  AND p.opted_out_at IS NULL;
 IF request_ IS NULL THEN RETURN jsonb_build_object('state','not_authorized');END IF;
 recorded_:=public.cotironda_piloto_remember_commercial_mvp259(
  request_,p_chat_hmac,p_message_hmac,p_source_sha256,'supplier_quote_verified');
 RETURN jsonb_build_object('state',
  CASE WHEN recorded_->>'state' IN ('remembered_private','already_remembered')
   THEN recorded_->>'state' ELSE 'memory_not_saved' END);
END;$fn$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_memory_sync_quote_mvp260(
 text,text,text) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_memory_sync_quote_mvp260(
 text,text,text) TO service_role;
