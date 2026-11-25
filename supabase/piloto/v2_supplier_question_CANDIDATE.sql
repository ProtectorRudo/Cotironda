-- CANDIDATO: requiere las migraciones de conversación del mismo paquete.
-- No crea cotizaciones ni expone comprador/competidores/original privado.
CREATE FUNCTION public.cotironda_piloto_v2_supplier_question(
 p_message_hmac text,p_chat_hmac text,p_source_sha256 text,p_quoted_whapi_id text,p_fields text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE m record; s record; n integer; rid uuid; info jsonb; stored jsonb; code text;
BEGIN
 IF p_fields IS NULL OR cardinality(p_fields) NOT BETWEEN 1 AND 9 OR EXISTS(
 SELECT 1 FROM unnest(p_fields) f WHERE f IS NULL OR f NOT IN ('city','payment','vat','deadline','materials','alternatives','freight','other','how_it_works'))
 OR p_message_hmac IS NULL OR p_message_hmac !~ '^[a-f0-9]{64}$'
 OR p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$'
 OR p_source_sha256 IS NULL OR p_source_sha256 !~ '^[a-f0-9]{64}$'
 OR (p_quoted_whapi_id IS NOT NULL AND p_quoted_whapi_id !~ '^[A-Za-z0-9._:-]{8,160}$')
 THEN RETURN jsonb_build_object('state','denied');END IF;
 SELECT p.key,p.consent_at INTO s FROM cotironda_piloto_privado.participants p
 WHERE p.chat_hmac=p_chat_hmac AND p.participant_role='supplier' AND p.consent_at IS NOT NULL AND p.opted_out_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','denied');END IF;
 SELECT * INTO m FROM cotironda_piloto_privado.whapi_inbox
 WHERE message_hmac=p_message_hmac AND chat_hmac=p_chat_hmac AND participant_key=s.key AND plaintext_sha256=p_source_sha256
 AND kind='text' AND request_id IS NULL AND received_at>clock_timestamp()-interval '10 minutes'
 AND received_at>=s.consent_at AND received_at<=clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','denied');END IF;
 IF m.supplier_text_intent IS NOT NULL OR m.processing_state NOT IN ('needs_review','unmatched_quote')
 THEN RETURN jsonb_build_object('state','already_processed');END IF;
 -- No atribuir una pregunta a una ronda por ser la más reciente.
 SELECT count(*),(array_agg(r.id))[1] INTO n,rid
 FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 j
 JOIN cotironda_piloto_privado.requests r ON r.id=j.request_id
 JOIN cotironda_piloto_privado.invitations i ON i.request_id=r.id AND i.supplier_key=j.supplier_key
 JOIN cotironda_piloto_privado.participants b ON b.key=r.buyer_key AND b.participant_role='buyer'
 WHERE j.supplier_key=s.key AND j.state='api_accepted' AND j.whapi_message_id IS NOT NULL
 AND j.finished_at<=m.received_at AND s.consent_at<=j.finished_at AND b.consent_at<=j.finished_at
 AND b.consent_at IS NOT NULL AND b.opted_out_at IS NULL AND i.created_at<=j.finished_at
 AND r.state='prepared' AND i.state='prepared' AND r.closes_at>clock_timestamp()
 AND (p_quoted_whapi_id IS NULL OR j.whapi_message_id=p_quoted_whapi_id);
 IF n=1 THEN
 SELECT jsonb_build_object('city',r.delivery_city,'payment',c.requested_payment,'vat',c.requested_vat,
 'deadline',to_char(r.closes_at AT TIME ZONE 'America/Argentina/Buenos_Aires','DD/MM/YYYY HH24:MI'),
 'items',(SELECT coalesce(jsonb_agg(jsonb_build_object('description',l.original_description,'quantity',l.quantity::text,'unit',l.unit) ORDER BY l.line_no),'[]'::jsonb)
 FROM cotironda_piloto_privado.request_lines l JOIN cotironda_piloto_privado.ai_shadow_destinos_mvp221 d ON d.request_id=l.request_id AND d.line_no=l.line_no
 WHERE l.request_id=r.id AND d.supplier_key=s.key))
 INTO info FROM cotironda_piloto_privado.requests r LEFT JOIN cotironda_piloto_privado.v2_buyer_conversations c ON c.request_id=r.id
 WHERE r.id=rid;
 END IF;
 -- Usa exactamente la clasificación no_quote vigente: no se crea oferta ni se vincula inbox a ronda.
 stored:=public.cotironda_piloto_supplier_text_intent_v2(p_message_hmac,p_chat_hmac,p_source_sha256,'non_quote');
 IF stored->>'state' IS DISTINCT FROM 'non_quote' THEN RETURN jsonb_build_object('state','already_processed');END IF;
 IF NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.integration_flags WHERE only_row AND whatsapp_inbound_enabled AND whatsapp_outbound_enabled)
 THEN RETURN jsonb_build_object('state','recorded');END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.ai_replies_mvp094 WHERE chat_hmac=p_chat_hmac AND created_at>=clock_timestamp()-interval '24 hours')>=
 (SELECT max_replies_per_24h FROM cotironda_piloto_privado.operational_caps_mvp097 WHERE only_row)
 THEN RETURN jsonb_build_object('state','recorded');END IF;
 INSERT INTO cotironda_piloto_privado.ai_replies_mvp094(message_hmac,chat_hmac,reply_code) VALUES(p_message_hmac,p_chat_hmac,'status') ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RETURN jsonb_build_object('state','already_processed');END IF;
 RETURN jsonb_build_object('state','reply_reserved','context',info,'fields',to_jsonb(p_fields));
END $fn$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_v2_supplier_question(text,text,text,text,text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_v2_supplier_question(text,text,text,text,text[]) TO service_role;
