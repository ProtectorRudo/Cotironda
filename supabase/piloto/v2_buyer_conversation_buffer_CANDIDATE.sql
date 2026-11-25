-- CANDIDATO NO PUBLICADO. Cola privada de conversación; no crea rondas ni envía mensajes.
-- Whapi sigue siendo la fuente original. Cada fragmento mantiene su HMAC/SHA.
CREATE TABLE cotironda_piloto_privado.v2_buyer_conversations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 buyer_key text NOT NULL REFERENCES cotironda_piloto_privado.participants(key),
 chat_hmac text NOT NULL CHECK(chat_hmac ~ '^[a-f0-9]{64}$'),
 state text NOT NULL DEFAULT 'collecting' CHECK(state IN ('collecting','processing','awaiting_context','sealed','done','review')),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 last_received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 ready_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '60 seconds',
 lease uuid, lease_until timestamptz,
 CHECK((state IN ('processing','sealed') AND lease IS NOT NULL AND lease_until IS NOT NULL) OR
 (state NOT IN ('processing','sealed') AND lease IS NULL AND lease_until IS NULL))
);
CREATE UNIQUE INDEX v2_buyer_conversations_open ON cotironda_piloto_privado.v2_buyer_conversations(buyer_key)
 WHERE state IN ('collecting','processing','awaiting_context');
CREATE INDEX v2_buyer_conversations_due ON cotironda_piloto_privado.v2_buyer_conversations(ready_at) WHERE state='collecting';
CREATE TABLE cotironda_piloto_privado.v2_buyer_conversation_sources (
 conversation_id uuid NOT NULL REFERENCES cotironda_piloto_privado.v2_buyer_conversations(id),
 message_hmac text PRIMARY KEY REFERENCES cotironda_piloto_privado.whapi_inbox(message_hmac),
 source_sha256 text NOT NULL CHECK(source_sha256 ~ '^[a-f0-9]{64}$'),
 received_at timestamptz NOT NULL,
 kind text NOT NULL CHECK(kind IN ('text','image','document','audio','voice'))
);
CREATE INDEX v2_buyer_conversation_sources_order ON cotironda_piloto_privado.v2_buyer_conversation_sources(conversation_id,received_at,message_hmac);
ALTER TABLE cotironda_piloto_privado.v2_buyer_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE cotironda_piloto_privado.v2_buyer_conversation_sources ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.v2_buyer_conversations,cotironda_piloto_privado.v2_buyer_conversation_sources FROM PUBLIC,anon,authenticated;
-- Una sola transacción por ingreso, después de archivar y autenticar Whapi.
CREATE FUNCTION public.cotironda_piloto_v2_conversation_enqueue(p_chat_hmac text,p_message_hmac text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE b text; m cotironda_piloto_privado.whapi_inbox%ROWTYPE; g cotironda_piloto_privado.v2_buyer_conversations%ROWTYPE; t timestamptz;
BEGIN
 IF p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$' OR p_message_hmac IS NULL OR p_message_hmac !~ '^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('state','invalid'); END IF;
 IF NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.integration_flags WHERE only_row AND whatsapp_inbound_enabled)
 OR NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_central_control_mvp226 WHERE only_row AND enabled AND activated_at IS NOT NULL)
 THEN RETURN jsonb_build_object('state','disabled'); END IF;
 SELECT key INTO b FROM cotironda_piloto_privado.participants WHERE chat_hmac=p_chat_hmac AND participant_role='buyer' AND consent_at IS NOT NULL AND opted_out_at IS NULL FOR UPDATE;
 IF b IS NULL THEN RETURN jsonb_build_object('state','not_authorized'); END IF;
 SELECT * INTO m FROM cotironda_piloto_privado.whapi_inbox WHERE message_hmac=p_message_hmac AND chat_hmac=p_chat_hmac AND participant_key=b FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_authorized'); END IF;
 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.v2_buyer_conversation_sources WHERE message_hmac=p_message_hmac) THEN RETURN jsonb_build_object('state','duplicate'); END IF;
 IF m.request_id IS NOT NULL OR m.processing_state NOT IN ('needs_review','needs_zone') OR m.received_at<clock_timestamp()-interval '10 minutes'
 OR EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_central_attempts_mvp226 WHERE message_hmac=p_message_hmac)
 THEN RETURN jsonb_build_object('state','source_not_eligible'); END IF;
 t:=clock_timestamp();
 SELECT * INTO g FROM cotironda_piloto_privado.v2_buyer_conversations WHERE buyer_key=b AND state IN ('collecting','processing','awaiting_context') FOR UPDATE;
 IF FOUND AND g.state='awaiting_context' AND g.last_received_at<t-interval '24 hours' THEN
  UPDATE cotironda_piloto_privado.v2_buyer_conversations SET state='review' WHERE id=g.id;
  g.id:=NULL;
 END IF;
 IF g.id IS NULL THEN
  INSERT INTO cotironda_piloto_privado.v2_buyer_conversations(buyer_key,chat_hmac,last_received_at,ready_at) VALUES(b,p_chat_hmac,t,t+interval '60 seconds') RETURNING * INTO g;
 ELSE
  -- Un mensaje nuevo invalida la revisión anterior ANTES de cualquier efecto comercial.
  UPDATE cotironda_piloto_privado.v2_buyer_conversations SET state='collecting',revision=revision+1,last_received_at=t,ready_at=t+interval '60 seconds',lease=NULL,lease_until=NULL WHERE id=g.id RETURNING * INTO g;
 END IF;
 INSERT INTO cotironda_piloto_privado.v2_buyer_conversation_sources(conversation_id,message_hmac,source_sha256,received_at,kind)
 VALUES(g.id,m.message_hmac,m.plaintext_sha256,m.received_at,m.kind);
 RETURN jsonb_build_object('state','queued','conversation_id',g.id,'revision',g.revision,'ready_at',g.ready_at);
END $fn$;
CREATE FUNCTION public.cotironda_piloto_v2_conversation_claim(p_chat_hmac text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE b text; g cotironda_piloto_privado.v2_buyer_conversations%ROWTYPE; sources jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.integration_flags WHERE only_row AND whatsapp_inbound_enabled)
 OR NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_central_control_mvp226 WHERE only_row AND enabled AND activated_at IS NOT NULL)
 THEN RETURN jsonb_build_object('state','disabled'); END IF;
 SELECT key INTO b FROM cotironda_piloto_privado.participants WHERE chat_hmac=p_chat_hmac AND participant_role='buyer' AND consent_at IS NOT NULL AND opted_out_at IS NULL FOR UPDATE;
 IF b IS NULL THEN RETURN jsonb_build_object('state','not_authorized'); END IF;
 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.v2_buyer_conversations WHERE buyer_key=b AND state='sealed') THEN RETURN jsonb_build_object('state','sealed_pending'); END IF;
 SELECT * INTO g FROM cotironda_piloto_privado.v2_buyer_conversations WHERE buyer_key=b AND
 ((state='collecting' AND ready_at<=clock_timestamp()) OR (state='processing' AND lease_until<=clock_timestamp())) FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_due'); END IF;
 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.v2_buyer_conversation_sources s LEFT JOIN cotironda_piloto_privado.whapi_inbox m ON m.message_hmac=s.message_hmac
 WHERE s.conversation_id=g.id AND (m.message_hmac IS NULL OR m.chat_hmac IS DISTINCT FROM p_chat_hmac OR m.participant_key IS DISTINCT FROM b OR m.plaintext_sha256 IS DISTINCT FROM s.source_sha256 OR m.request_id IS NOT NULL OR m.kind IS DISTINCT FROM s.kind))
 THEN RETURN jsonb_build_object('state','source_changed'); END IF;
 SELECT jsonb_agg(jsonb_build_object('message_hmac',s.message_hmac,'source_sha256',s.source_sha256,'kind',s.kind,'nonce',m.nonce_b64,'ciphertext',m.ciphertext_b64) ORDER BY s.received_at,s.message_hmac)
 INTO sources FROM cotironda_piloto_privado.v2_buyer_conversation_sources s JOIN cotironda_piloto_privado.whapi_inbox m USING(message_hmac) WHERE s.conversation_id=g.id;
 IF sources IS NULL THEN RETURN jsonb_build_object('state','empty'); END IF;
 UPDATE cotironda_piloto_privado.v2_buyer_conversations SET state='processing',lease=gen_random_uuid(),lease_until=clock_timestamp()+interval '4 minutes' WHERE id=g.id RETURNING * INTO g;
 RETURN jsonb_build_object('state','claimed','conversation_id',g.id,'revision',g.revision,'lease',g.lease,'sources',sources);
END $fn$;
-- CAS: únicamente el trabajador de la revisión vigente puede pedir contexto o sellar.
-- Sellar no crea una ronda. El puente transaccional de publicación es parte pendiente.
CREATE FUNCTION public.cotironda_piloto_v2_conversation_decide(p_chat_hmac text,p_id uuid,p_revision bigint,p_lease uuid,p_decision text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE b text;n integer;
BEGIN
 IF p_decision NOT IN ('awaiting_context','sealed','review') OR p_decision IS NULL THEN RETURN jsonb_build_object('state','invalid'); END IF;
 SELECT key INTO b FROM cotironda_piloto_privado.participants WHERE chat_hmac=p_chat_hmac AND participant_role='buyer' AND consent_at IS NOT NULL AND opted_out_at IS NULL FOR UPDATE;
 IF b IS NULL THEN RETURN jsonb_build_object('state','not_authorized'); END IF;
 UPDATE cotironda_piloto_privado.v2_buyer_conversations g SET state=p_decision,
 lease=CASE WHEN p_decision='sealed' THEN g.lease ELSE NULL END,
 lease_until=CASE WHEN p_decision='sealed' THEN g.lease_until ELSE NULL END
 WHERE g.id=p_id AND g.buyer_key=b AND g.chat_hmac=p_chat_hmac AND g.state='processing' AND g.revision=p_revision AND g.lease=p_lease AND g.lease_until>clock_timestamp()
 AND NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.v2_buyer_conversation_sources s JOIN cotironda_piloto_privado.whapi_inbox m USING(message_hmac) WHERE s.conversation_id=g.id AND (m.plaintext_sha256 IS DISTINCT FROM s.source_sha256 OR m.request_id IS NOT NULL OR m.participant_key IS DISTINCT FROM b OR m.chat_hmac IS DISTINCT FROM p_chat_hmac));
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN jsonb_build_object('state',CASE WHEN n=1 THEN p_decision ELSE 'stale' END);
END $fn$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_v2_conversation_enqueue(text,text),public.cotironda_piloto_v2_conversation_claim(text),public.cotironda_piloto_v2_conversation_decide(text,uuid,bigint,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_v2_conversation_enqueue(text,text),public.cotironda_piloto_v2_conversation_claim(text),public.cotironda_piloto_v2_conversation_decide(text,uuid,bigint,uuid,text) TO service_role;
