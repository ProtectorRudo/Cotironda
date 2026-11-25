-- CANDIDATO: instalar después del buffer proveedor, runtime/cron comprador y supplier_question.
-- Interruptor independiente OFF hasta que exista el puente de ofertas multifuente.
ALTER TABLE cotironda_piloto_privado.v2_conversation_control ADD COLUMN supplier_enabled boolean NOT NULL DEFAULT false;
CREATE FUNCTION public.cotironda_piloto_v2_supplier_conversation_enabled()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $fn$
 SELECT coalesce((SELECT enabled AND supplier_enabled FROM cotironda_piloto_privado.v2_conversation_control WHERE singleton),false);
$fn$;
-- Reutilizar el único programador; no crear un cron adicional.
ALTER FUNCTION public.cotironda_piloto_v2_conversation_due() RENAME TO cotironda_piloto_v2_buyer_due_internal;
CREATE FUNCTION public.cotironda_piloto_v2_conversation_due()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $fn$
 SELECT coalesce(jsonb_agg(q.job ORDER BY q.priority,q.at,q.id),'[]'::jsonb)
 FROM (
 SELECT x.job,0 AS priority,clock_timestamp() AS at,x.job->>'conversation_id' AS id
 FROM jsonb_array_elements(public.cotironda_piloto_v2_buyer_due_internal()) x(job)
 UNION ALL
 SELECT jsonb_build_object('chat_hmac',g.chat_hmac,'conversation_id',g.id,'phase','supplier_interpretation'),1,g.ready_at,g.id::text
 FROM cotironda_piloto_privado.v2_supplier_conversations g JOIN cotironda_piloto_privado.participants s ON s.key=g.supplier_key AND s.chat_hmac=g.chat_hmac AND s.participant_role='supplier' AND s.consent_at IS NOT NULL AND s.opted_out_at IS NULL
 WHERE public.cotironda_piloto_v2_supplier_conversation_enabled()
 AND EXISTS(SELECT 1 FROM cotironda_piloto_privado.integration_flags WHERE only_row AND whatsapp_inbound_enabled AND whatsapp_outbound_enabled)
 AND ((g.state='collecting' AND g.ready_at<=clock_timestamp()) OR (g.state='processing' AND g.lease_until<=clock_timestamp()))
 ORDER BY priority,at,id LIMIT 8) q;
$fn$;
-- La revisión vigente se consume y las preguntas se reservan en una transacción.
-- Solo non_quote; nunca convertir fragmentos económicos en mensajes de consulta.
CREATE FUNCTION public.cotironda_piloto_v2_supplier_conversation_finish_question(p_chat_hmac text,p_id uuid,p_revision bigint,p_lease uuid,p_fields text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE s record;g record;anchor record;f record;r jsonb;changed jsonb;
BEGIN
 IF NOT public.cotironda_piloto_v2_supplier_conversation_enabled() THEN RETURN jsonb_build_object('state','disabled');END IF;
 IF p_fields IS NULL OR cardinality(p_fields)>9 OR EXISTS(SELECT 1 FROM unnest(p_fields) f WHERE f IS NULL OR f NOT IN ('city','payment','vat','deadline','materials','alternatives','freight','other','how_it_works')) THEN RETURN jsonb_build_object('state','invalid');END IF;
 SELECT key,consent_at INTO s FROM cotironda_piloto_privado.participants WHERE chat_hmac=p_chat_hmac AND participant_role='supplier' AND consent_at IS NOT NULL AND opted_out_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_authorized');END IF;
 SELECT * INTO g FROM cotironda_piloto_privado.v2_supplier_conversations WHERE id=p_id AND supplier_key=s.key AND chat_hmac=p_chat_hmac AND state='processing' AND revision=p_revision AND lease=p_lease AND lease_until>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','stale');END IF;
 PERFORM 1 FROM cotironda_piloto_privado.whapi_inbox m JOIN cotironda_piloto_privado.v2_supplier_conversation_sources f USING(message_hmac) WHERE f.conversation_id=p_id ORDER BY m.message_hmac FOR UPDATE OF m;
 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.v2_supplier_conversation_sources f LEFT JOIN cotironda_piloto_privado.whapi_inbox m USING(message_hmac) WHERE f.conversation_id=p_id AND (m.message_hmac IS NULL OR m.chat_hmac IS DISTINCT FROM p_chat_hmac OR m.participant_key IS DISTINCT FROM s.key OR m.plaintext_sha256 IS DISTINCT FROM f.source_sha256 OR m.kind IS DISTINCT FROM f.kind OR m.received_at<s.consent_at OR m.request_id IS NOT NULL OR m.supplier_text_intent IS NOT NULL OR m.processing_state NOT IN ('needs_review','unmatched_quote'))) THEN RETURN jsonb_build_object('state','source_changed');END IF;
 SELECT * INTO anchor FROM cotironda_piloto_privado.v2_supplier_conversation_sources WHERE conversation_id=p_id ORDER BY received_at DESC,message_hmac DESC LIMIT 1;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','empty');END IF;
 IF cardinality(p_fields)>0 THEN
  r:=public.cotironda_piloto_v2_supplier_question(anchor.message_hmac,p_chat_hmac,anchor.source_sha256,nullif(g.reference_key,''),p_fields,'non_quote');
  IF r->>'state' NOT IN ('reply_reserved','recorded') THEN RETURN jsonb_build_object('state','question_not_reserved');END IF;
 ELSE
  changed:=public.cotironda_piloto_supplier_text_intent_v2(anchor.message_hmac,p_chat_hmac,anchor.source_sha256,'non_quote');
  IF changed->>'state' IS DISTINCT FROM 'non_quote' THEN RAISE EXCEPTION 'supplier anchor changed';END IF;
  r:=jsonb_build_object('state','recorded');
 END IF;
 FOR f IN SELECT * FROM cotironda_piloto_privado.v2_supplier_conversation_sources WHERE conversation_id=p_id AND message_hmac<>anchor.message_hmac LOOP
  changed:=public.cotironda_piloto_supplier_text_intent_v2(f.message_hmac,p_chat_hmac,f.source_sha256,'non_quote');
  IF changed->>'state' IS DISTINCT FROM 'non_quote' THEN RAISE EXCEPTION 'supplier source changed';END IF;
 END LOOP;
 UPDATE cotironda_piloto_privado.v2_supplier_conversations SET state='done',lease=NULL,lease_until=NULL WHERE id=p_id;
 RETURN r||jsonb_build_object('message_hmac',anchor.message_hmac,'conversation_id',p_id);
END $fn$;
CREATE FUNCTION public.cotironda_piloto_v2_supplier_conversation_contact(p_chat_hmac text,p_id uuid,p_event_hmac text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $fn$
 SELECT jsonb_build_object('nonce',v.nonce_b64,'ciphertext',v.ciphertext_b64,'sha256',v.contact_sha256)
 FROM cotironda_piloto_privado.v2_supplier_conversations g
 JOIN cotironda_piloto_privado.participants s ON s.key=g.supplier_key AND s.chat_hmac=g.chat_hmac AND s.participant_role='supplier' AND s.consent_at IS NOT NULL AND s.opted_out_at IS NULL
 JOIN cotironda_piloto_privado.participant_channels_mvp109 v ON v.participant_key=s.key AND v.chat_hmac=s.chat_hmac
 JOIN cotironda_piloto_privado.v2_supplier_conversation_sources f ON f.conversation_id=g.id AND f.message_hmac=p_event_hmac
 JOIN cotironda_piloto_privado.ai_replies_mvp094 r ON r.message_hmac=f.message_hmac AND r.chat_hmac=g.chat_hmac AND r.state='leased'
 WHERE g.id=p_id AND g.chat_hmac=p_chat_hmac AND g.state='done'
 AND public.cotironda_piloto_v2_supplier_conversation_enabled()
 AND EXISTS(SELECT 1 FROM cotironda_piloto_privado.integration_flags WHERE only_row AND whatsapp_outbound_enabled);
$fn$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_v2_supplier_conversation_enabled(),public.cotironda_piloto_v2_conversation_due(),public.cotironda_piloto_v2_supplier_conversation_finish_question(text,uuid,bigint,uuid,text[]),public.cotironda_piloto_v2_supplier_conversation_contact(text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_v2_supplier_conversation_enabled(),public.cotironda_piloto_v2_conversation_due(),public.cotironda_piloto_v2_supplier_conversation_finish_question(text,uuid,bigint,uuid,text[]),public.cotironda_piloto_v2_supplier_conversation_contact(text,uuid,text) TO service_role;
