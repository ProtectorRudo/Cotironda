-- CANDIDATO OFF: mismo contrato de revisión/lease y ventana de 60s del comprador.
-- El inbox real sigue siendo fuente de verdad. No atribuye rondas ni publica ofertas.
-- Separar grupos por referencia explícita, sin inventar una referencia para textos libres.
CREATE TABLE cotironda_piloto_privado.v2_supplier_conversations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 supplier_key text NOT NULL REFERENCES cotironda_piloto_privado.participants(key),
 chat_hmac text NOT NULL CHECK(chat_hmac ~ '^[a-f0-9]{64}$'),
 reference_key text NOT NULL DEFAULT '' CHECK(reference_key='' OR reference_key ~ '^[A-Za-z0-9._:-]{8,160}$'),
 state text NOT NULL DEFAULT 'collecting' CHECK(state IN ('collecting','processing','done','review')),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 ready_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '60 seconds',
 lease uuid,lease_until timestamptz,
 CHECK((state='processing' AND lease IS NOT NULL AND lease_until IS NOT NULL) OR (state<>'processing' AND lease IS NULL AND lease_until IS NULL))
);
CREATE UNIQUE INDEX v2_supplier_conversation_open ON cotironda_piloto_privado.v2_supplier_conversations(supplier_key,reference_key) WHERE state IN ('collecting','processing');
CREATE INDEX v2_supplier_conversation_due ON cotironda_piloto_privado.v2_supplier_conversations(ready_at) WHERE state='collecting';
CREATE TABLE cotironda_piloto_privado.v2_supplier_conversation_sources(
 conversation_id uuid NOT NULL REFERENCES cotironda_piloto_privado.v2_supplier_conversations(id),
 message_hmac text PRIMARY KEY REFERENCES cotironda_piloto_privado.whapi_inbox(message_hmac),
 source_sha256 text NOT NULL CHECK(source_sha256 ~ '^[a-f0-9]{64}$'),
 received_at timestamptz NOT NULL,
 kind text NOT NULL CHECK(kind='text')
);
CREATE INDEX v2_supplier_conversation_source_order ON cotironda_piloto_privado.v2_supplier_conversation_sources(conversation_id,received_at,message_hmac);
ALTER TABLE cotironda_piloto_privado.v2_supplier_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE cotironda_piloto_privado.v2_supplier_conversation_sources ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.v2_supplier_conversations,cotironda_piloto_privado.v2_supplier_conversation_sources FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.cotironda_piloto_v2_supplier_conversation_enqueue(p_chat_hmac text,p_message_hmac text,p_reference text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE s record;m record;g record;k text:=coalesce(p_reference,'');t timestamptz;
BEGIN
 IF p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$' OR p_message_hmac IS NULL OR p_message_hmac !~ '^[a-f0-9]{64}$'
 OR (k<>'' AND k !~ '^[A-Za-z0-9._:-]{8,160}$') THEN RETURN jsonb_build_object('state','invalid');END IF;
 IF NOT public.cotironda_piloto_v2_conversation_enabled() OR NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.integration_flags WHERE only_row AND whatsapp_inbound_enabled)
 THEN RETURN jsonb_build_object('state','disabled');END IF;
 SELECT key,consent_at INTO s FROM cotironda_piloto_privado.participants WHERE chat_hmac=p_chat_hmac AND participant_role='supplier' AND consent_at IS NOT NULL AND opted_out_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_authorized');END IF;
 SELECT * INTO m FROM cotironda_piloto_privado.whapi_inbox WHERE message_hmac=p_message_hmac AND chat_hmac=p_chat_hmac AND participant_key=s.key FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_authorized');END IF;
 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.v2_supplier_conversation_sources WHERE message_hmac=p_message_hmac) THEN RETURN jsonb_build_object('state','duplicate');END IF;
 IF m.kind<>'text' OR m.request_id IS NOT NULL OR m.supplier_text_intent IS NOT NULL OR m.processing_state NOT IN ('needs_review','unmatched_quote')
 OR m.received_at<s.consent_at OR m.received_at<clock_timestamp()-interval '10 minutes' OR m.received_at>clock_timestamp()
 THEN RETURN jsonb_build_object('state','source_not_eligible');END IF;
 t:=clock_timestamp();
 SELECT * INTO g FROM cotironda_piloto_privado.v2_supplier_conversations WHERE supplier_key=s.key AND reference_key=k AND state IN ('collecting','processing') FOR UPDATE;
 IF NOT FOUND THEN
 INSERT INTO cotironda_piloto_privado.v2_supplier_conversations(supplier_key,chat_hmac,reference_key,ready_at) VALUES(s.key,p_chat_hmac,k,t+interval '60 seconds') RETURNING * INTO g;
 ELSE
 UPDATE cotironda_piloto_privado.v2_supplier_conversations SET state='collecting',revision=revision+1,ready_at=t+interval '60 seconds',lease=NULL,lease_until=NULL WHERE id=g.id RETURNING * INTO g;
 END IF;
 INSERT INTO cotironda_piloto_privado.v2_supplier_conversation_sources VALUES(g.id,m.message_hmac,m.plaintext_sha256,m.received_at,m.kind);
 RETURN jsonb_build_object('state','queued','conversation_id',g.id,'revision',g.revision,'ready_at',g.ready_at);
END $fn$;
CREATE FUNCTION public.cotironda_piloto_v2_supplier_conversation_claim(p_chat_hmac text,p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE s record;g record;sources jsonb;
BEGIN
 IF NOT public.cotironda_piloto_v2_conversation_enabled() OR NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.integration_flags WHERE only_row AND whatsapp_inbound_enabled)
 THEN RETURN jsonb_build_object('state','disabled');END IF;
 SELECT key,consent_at INTO s FROM cotironda_piloto_privado.participants WHERE chat_hmac=p_chat_hmac AND participant_role='supplier' AND consent_at IS NOT NULL AND opted_out_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_authorized');END IF;
 SELECT * INTO g FROM cotironda_piloto_privado.v2_supplier_conversations WHERE id=p_id AND supplier_key=s.key AND chat_hmac=p_chat_hmac AND ((state='collecting' AND ready_at<=clock_timestamp()) OR (state='processing' AND lease_until<=clock_timestamp())) FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_due');END IF;
 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.v2_supplier_conversation_sources f LEFT JOIN cotironda_piloto_privado.whapi_inbox m USING(message_hmac)
 WHERE f.conversation_id=g.id AND (m.message_hmac IS NULL OR m.chat_hmac IS DISTINCT FROM p_chat_hmac OR m.participant_key IS DISTINCT FROM s.key OR m.plaintext_sha256 IS DISTINCT FROM f.source_sha256 OR m.request_id IS NOT NULL OR m.supplier_text_intent IS NOT NULL OR m.kind IS DISTINCT FROM f.kind OR m.received_at<s.consent_at OR m.processing_state NOT IN ('needs_review','unmatched_quote')))
 THEN RETURN jsonb_build_object('state','source_changed');END IF;
 SELECT jsonb_agg(jsonb_build_object('message_hmac',f.message_hmac,'source_sha256',f.source_sha256,'kind',f.kind,'nonce',m.nonce_b64,'ciphertext',m.ciphertext_b64) ORDER BY f.received_at,f.message_hmac) INTO sources
 FROM cotironda_piloto_privado.v2_supplier_conversation_sources f JOIN cotironda_piloto_privado.whapi_inbox m USING(message_hmac) WHERE f.conversation_id=g.id;
 IF sources IS NULL THEN RETURN jsonb_build_object('state','empty');END IF;
 UPDATE cotironda_piloto_privado.v2_supplier_conversations SET state='processing',lease=gen_random_uuid(),lease_until=clock_timestamp()+interval '4 minutes' WHERE id=g.id RETURNING * INTO g;
 RETURN jsonb_build_object('state','claimed','conversation_id',g.id,'revision',g.revision,'lease',g.lease,'reference',nullif(g.reference_key,''),'sources',sources);
END $fn$;
-- Un resultado obsoleto jamás habilita efectos. Por ahora solo revisión privada:
-- el puente transaccional multifuente de ofertas/respuestas se integra posteriormente.
CREATE FUNCTION public.cotironda_piloto_v2_supplier_conversation_review(p_chat_hmac text,p_id uuid,p_revision bigint,p_lease uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE s record;n integer;
BEGIN
 SELECT key,consent_at INTO s FROM cotironda_piloto_privado.participants WHERE chat_hmac=p_chat_hmac AND participant_role='supplier' AND consent_at IS NOT NULL AND opted_out_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_authorized');END IF;
 UPDATE cotironda_piloto_privado.v2_supplier_conversations g SET state='review',lease=NULL,lease_until=NULL WHERE g.id=p_id AND g.supplier_key=s.key AND g.chat_hmac=p_chat_hmac AND g.state='processing' AND g.revision=p_revision AND g.lease=p_lease AND g.lease_until>clock_timestamp()
 AND NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.v2_supplier_conversation_sources f JOIN cotironda_piloto_privado.whapi_inbox m USING(message_hmac) WHERE f.conversation_id=g.id AND (m.chat_hmac IS DISTINCT FROM p_chat_hmac OR m.participant_key IS DISTINCT FROM s.key OR m.plaintext_sha256 IS DISTINCT FROM f.source_sha256 OR m.request_id IS NOT NULL OR m.supplier_text_intent IS NOT NULL OR m.kind IS DISTINCT FROM f.kind OR m.received_at<s.consent_at));
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN jsonb_build_object('state',CASE WHEN n=1 THEN 'review' ELSE 'stale' END);
END $fn$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_v2_supplier_conversation_enqueue(text,text,text),public.cotironda_piloto_v2_supplier_conversation_claim(text,uuid),public.cotironda_piloto_v2_supplier_conversation_review(text,uuid,bigint,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_v2_supplier_conversation_enqueue(text,text,text),public.cotironda_piloto_v2_supplier_conversation_claim(text,uuid),public.cotironda_piloto_v2_supplier_conversation_review(text,uuid,bigint,uuid) TO service_role;
