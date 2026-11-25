-- CANDIDATO: requiere buffer 005d08c y stage 3c6ac63. Sin cron activo.
-- Reutiliza originales y medidor MVP264; nunca crea mensajes Whapi.
ALTER TABLE cotironda_piloto_privado.v2_buyer_conversations
 ADD COLUMN delivery_state text NOT NULL DEFAULT 'pending' CHECK(delivery_state IN ('pending','processing','complete','review')),
 ADD COLUMN delivery_lease uuid,
 ADD COLUMN delivery_lease_until timestamptz,
 ADD COLUMN delivery_ready_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 ADD CONSTRAINT v2_delivery_lease_pair CHECK((delivery_state='processing')=(delivery_lease IS NOT NULL AND delivery_lease_until IS NOT NULL));

CREATE FUNCTION public.cotironda_piloto_v2_conversation_due()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $fn$
 SELECT coalesce(jsonb_agg(jsonb_build_object('chat_hmac',q.chat_hmac,'conversation_id',q.id,'phase',q.phase) ORDER BY q.at,q.id),'[]'::jsonb)
 FROM (SELECT g.chat_hmac,g.id,CASE WHEN g.state='done' THEN 'delivery' ELSE 'interpretation' END phase,
  CASE WHEN g.state='done' THEN g.delivery_ready_at ELSE g.ready_at END at
  FROM cotironda_piloto_privado.v2_buyer_conversations g
  JOIN cotironda_piloto_privado.participants b ON b.key=g.buyer_key AND b.chat_hmac=g.chat_hmac AND b.participant_role='buyer' AND b.consent_at IS NOT NULL AND b.opted_out_at IS NULL
  WHERE EXISTS(SELECT 1 FROM cotironda_piloto_privado.integration_flags WHERE only_row AND whatsapp_inbound_enabled AND whatsapp_outbound_enabled)
  AND EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_central_control_mvp226 WHERE only_row AND enabled AND activated_at IS NOT NULL)
  AND ((g.state='collecting' AND g.ready_at<=clock_timestamp()) OR (g.state='processing' AND g.lease_until<=clock_timestamp())
   OR (g.state='done' AND ((g.delivery_state='pending' AND g.delivery_ready_at<=clock_timestamp()) OR (g.delivery_state='processing' AND g.delivery_lease_until<=clock_timestamp()))))
  ORDER BY at,g.id LIMIT 8) q;
$fn$;

CREATE FUNCTION public.cotironda_piloto_v2_conversation_meter(p_chat_hmac text,p_id uuid,p_revision bigint,p_lease uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE g record; m record; b text; prev record; n integer;
BEGIN
 SELECT key INTO b FROM cotironda_piloto_privado.participants WHERE chat_hmac=p_chat_hmac AND participant_role='buyer' AND consent_at IS NOT NULL AND opted_out_at IS NULL FOR UPDATE;
 IF b IS NULL THEN RETURN jsonb_build_object('state','not_authorized'); END IF;
 SELECT * INTO g FROM cotironda_piloto_privado.v2_buyer_conversations WHERE id=p_id AND buyer_key=b AND chat_hmac=p_chat_hmac AND state='processing' AND revision=p_revision AND lease=p_lease AND lease_until>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','stale');END IF;
 SELECT s.message_hmac,s.source_sha256 INTO m FROM cotironda_piloto_privado.v2_buyer_conversation_sources s JOIN cotironda_piloto_privado.whapi_inbox i USING(message_hmac)
 WHERE s.conversation_id=p_id AND i.participant_key=b AND i.chat_hmac=p_chat_hmac AND i.plaintext_sha256=s.source_sha256 AND i.request_id IS NULL
 ORDER BY s.received_at DESC,s.message_hmac DESC LIMIT 1;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','source_changed');END IF;
 -- Si otra revisión todavía tiene una llamada abierta, no competir por tokens.
 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_usage_calls_mvp264 u WHERE u.participant_key=b AND u.state='reserved')
 THEN
  UPDATE cotironda_piloto_privado.v2_buyer_conversations SET state='collecting',lease=NULL,lease_until=NULL,ready_at=clock_timestamp()+interval '15 seconds' WHERE id=p_id;
  RETURN jsonb_build_object('state','meter_busy');
 END IF;
 SELECT * INTO prev FROM cotironda_piloto_privado.ai_central_attempts_mvp226 WHERE message_hmac=m.message_hmac FOR UPDATE;
 IF FOUND AND (prev.buyer_key IS DISTINCT FROM b OR prev.chat_hmac IS DISTINCT FROM p_chat_hmac OR prev.source_sha256 IS DISTINCT FROM m.source_sha256 OR prev.state<>'reserved')
 THEN RETURN jsonb_build_object('state','attempt_not_eligible');END IF;
 IF NOT FOUND THEN
  INSERT INTO cotironda_piloto_privado.ai_central_attempts_mvp226(message_hmac,buyer_key,chat_hmac,source_sha256) VALUES(m.message_hmac,b,p_chat_hmac,m.source_sha256);
 END IF;
 SELECT coalesce(max(call_no),0) INTO n FROM cotironda_piloto_privado.ai_usage_calls_mvp264 WHERE message_hmac=m.message_hmac;
 IF n>=8 THEN RETURN jsonb_build_object('state','meter_exhausted');END IF;
 RETURN jsonb_build_object('state','reserved','message_hmac',m.message_hmac,'usage_call_no',n);
END $fn$;

-- Finalizar la interpretación y el registro de uso sin crear otra ronda.
-- La decisión y la reserva de pregunta son atómicas frente a otro mensaje.
CREATE FUNCTION public.cotironda_piloto_v2_conversation_finish(p_chat_hmac text,p_id uuid,p_revision bigint,p_lease uuid,p_message_hmac text,p_decision text,p_reason text,p_reply_code text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE g record; b text; allowed boolean:=false; n integer;
BEGIN
 IF p_decision NOT IN ('awaiting_context','review','staged') OR p_decision IS NULL OR p_reason IS NULL OR p_reason !~ '^[a-z_]{3,64}$'
 OR (p_reply_code IS NOT NULL AND p_reply_code NOT IN ('zone','materials')) THEN RETURN jsonb_build_object('state','invalid');END IF;
 SELECT key INTO b FROM cotironda_piloto_privado.participants WHERE chat_hmac=p_chat_hmac AND participant_role='buyer' AND consent_at IS NOT NULL AND opted_out_at IS NULL FOR UPDATE;
 IF b IS NULL THEN RETURN jsonb_build_object('state','not_authorized');END IF;
 SELECT * INTO g FROM cotironda_piloto_privado.v2_buyer_conversations WHERE id=p_id AND buyer_key=b AND chat_hmac=p_chat_hmac FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.v2_buyer_conversation_sources WHERE conversation_id=p_id AND message_hmac=p_message_hmac)
 THEN RETURN jsonb_build_object('state','not_authorized');END IF;
 IF p_decision='staged' THEN
  IF g.state<>'done' OR g.revision<>p_revision OR g.request_id IS NULL THEN RETURN jsonb_build_object('state','stale');END IF;
 ELSE
  IF g.state<>'processing' OR g.revision<>p_revision OR g.lease IS DISTINCT FROM p_lease OR g.lease_until<=clock_timestamp()
  THEN
   -- Una revisión nueva no puede ser anulada por el resultado anterior.
   RETURN jsonb_build_object('state','stale');
  END IF;
  IF p_reply_code IS NOT NULL THEN
   allowed:=public.cotironda_piloto_reserve_reply_mvp094(p_message_hmac,p_chat_hmac,p_reply_code);
  END IF;
  UPDATE cotironda_piloto_privado.v2_buyer_conversations SET state=p_decision,lease=NULL,lease_until=NULL WHERE id=p_id;
 END IF;
 UPDATE cotironda_piloto_privado.ai_central_attempts_mvp226 SET state=CASE WHEN p_decision='staged' THEN 'staged' ELSE 'review' END,finished_at=clock_timestamp(),failure_code=CASE WHEN p_decision='staged' THEN NULL ELSE p_reason END
 WHERE message_hmac=p_message_hmac AND chat_hmac=p_chat_hmac AND buyer_key=b AND state='reserved';
 RETURN jsonb_build_object('state',p_decision,'reply_reserved',allowed);
END $fn$;

CREATE FUNCTION public.cotironda_piloto_v2_conversation_contact(p_chat_hmac text,p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $fn$
 SELECT jsonb_build_object('nonce',v.nonce_b64,'ciphertext',v.ciphertext_b64,'sha256',v.contact_sha256)
 FROM cotironda_piloto_privado.v2_buyer_conversations g
 JOIN cotironda_piloto_privado.participants b ON b.key=g.buyer_key AND b.chat_hmac=g.chat_hmac AND b.participant_role='buyer' AND b.consent_at IS NOT NULL AND b.opted_out_at IS NULL
 JOIN cotironda_piloto_privado.participant_channels_mvp109 v ON v.participant_key=b.key AND v.chat_hmac=b.chat_hmac
 WHERE g.id=p_id AND g.chat_hmac=p_chat_hmac
 AND EXISTS(SELECT 1 FROM cotironda_piloto_privado.integration_flags WHERE only_row AND whatsapp_outbound_enabled);
$fn$;

CREATE FUNCTION public.cotironda_piloto_v2_conversation_delivery_claim(p_chat_hmac text,p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE g record;b text;r record;e text; token uuid;
BEGIN
 SELECT key INTO b FROM cotironda_piloto_privado.participants WHERE chat_hmac=p_chat_hmac AND participant_role='buyer' AND consent_at IS NOT NULL AND opted_out_at IS NULL FOR UPDATE;
 IF b IS NULL THEN RETURN jsonb_build_object('state','not_authorized');END IF;
 IF NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.integration_flags WHERE only_row AND whatsapp_outbound_enabled) THEN RETURN jsonb_build_object('state','disabled');END IF;
 SELECT * INTO g FROM cotironda_piloto_privado.v2_buyer_conversations WHERE id=p_id AND buyer_key=b AND chat_hmac=p_chat_hmac AND state='done'
 AND ((delivery_state='pending' AND delivery_ready_at<=clock_timestamp()) OR (delivery_state='processing' AND delivery_lease_until<=clock_timestamp())) FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_due');END IF;
 SELECT id,state,source_hmac INTO r FROM cotironda_piloto_privado.requests WHERE id=g.request_id AND buyer_key=b AND state IN ('draft','prepared') AND closes_at>clock_timestamp() FOR UPDATE;
 IF NOT FOUND OR NOT cotironda_piloto_privado.v2_conversation_source_verified(g.request_id) THEN
  UPDATE cotironda_piloto_privado.v2_buyer_conversations SET delivery_state='review',delivery_lease=NULL,delivery_lease_until=NULL WHERE id=p_id;
  RETURN jsonb_build_object('state','source_changed');
 END IF;
 SELECT message_hmac INTO e FROM cotironda_piloto_privado.v2_buyer_conversation_sources WHERE conversation_id=p_id ORDER BY received_at DESC,message_hmac DESC LIMIT 1;
 token:=gen_random_uuid();
 UPDATE cotironda_piloto_privado.v2_buyer_conversations SET delivery_state='processing',delivery_lease=token,delivery_lease_until=clock_timestamp()+interval '4 minutes' WHERE id=p_id;
 RETURN jsonb_build_object('state','claimed','lease',token,'request_id',r.id,'round_state',r.state,'source_hmac',r.source_hmac,'event_hmac',e);
END $fn$;

CREATE FUNCTION public.cotironda_piloto_v2_conversation_delivery_status(p_chat_hmac text,p_id uuid,p_lease uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $fn$
 SELECT jsonb_build_object('pending',count(*) FILTER(WHERE j.state='pending'),'accepted',count(*) FILTER(WHERE j.state='api_accepted'),'uncertain',count(*) FILTER(WHERE j.state IN ('uncertain','leased')),'total',count(*))
 FROM cotironda_piloto_privado.v2_buyer_conversations g
 JOIN cotironda_piloto_privado.participants b ON b.key=g.buyer_key AND b.chat_hmac=g.chat_hmac AND b.consent_at IS NOT NULL AND b.opted_out_at IS NULL
 JOIN cotironda_piloto_privado.ai_dispatch_jobs_mvp222 j ON j.request_id=g.request_id
 WHERE g.id=p_id AND g.chat_hmac=p_chat_hmac AND g.delivery_state='processing' AND g.delivery_lease=p_lease AND g.delivery_lease_until>clock_timestamp();
$fn$;

CREATE FUNCTION public.cotironda_piloto_v2_conversation_delivery_finish(p_chat_hmac text,p_id uuid,p_lease uuid,p_state text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE n integer;
BEGIN
 IF p_state NOT IN ('pending','complete','review') OR p_state IS NULL THEN RETURN jsonb_build_object('state','invalid');END IF;
 UPDATE cotironda_piloto_privado.v2_buyer_conversations SET delivery_state=p_state,delivery_lease=NULL,delivery_lease_until=NULL,delivery_ready_at=clock_timestamp()+interval '30 seconds'
 WHERE id=p_id AND chat_hmac=p_chat_hmac AND delivery_state='processing' AND delivery_lease=p_lease AND delivery_lease_until>clock_timestamp();
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN jsonb_build_object('state',CASE WHEN n=1 THEN p_state ELSE 'stale' END);
END $fn$;
DO $acl$ DECLARE sig text; BEGIN
 FOREACH sig IN ARRAY ARRAY['public.cotironda_piloto_v2_conversation_due()','public.cotironda_piloto_v2_conversation_meter(text,uuid,bigint,uuid)','public.cotironda_piloto_v2_conversation_finish(text,uuid,bigint,uuid,text,text,text,text)','public.cotironda_piloto_v2_conversation_contact(text,uuid)','public.cotironda_piloto_v2_conversation_delivery_claim(text,uuid)','public.cotironda_piloto_v2_conversation_delivery_status(text,uuid,uuid)','public.cotironda_piloto_v2_conversation_delivery_finish(text,uuid,uuid,text)'] LOOP
 EXECUTE 'REVOKE ALL ON FUNCTION '||sig||' FROM PUBLIC,anon,authenticated';
 EXECUTE 'GRANT EXECUTE ON FUNCTION '||sig||' TO service_role';
 END LOOP;
END $acl$;
