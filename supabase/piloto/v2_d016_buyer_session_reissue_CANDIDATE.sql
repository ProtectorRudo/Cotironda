-- D016: recuperación de un enlace de acceso por la sesión ya autenticada.
-- PILOTO: candidate, NO APLICAR sin orden PUBLICALO. No lee ni publica originales.
-- Reusa buyer/session D016 y el canal cifrado Whapi registrado.
CREATE TABLE cotironda_piloto_privado.v2_d016_session_reissues (
 operation_id uuid PRIMARY KEY,
 ticket_hmac text NOT NULL UNIQUE
   REFERENCES cotironda_piloto_privado.v2_d016_access_tickets(ticket_hmac),
 buyer_key text NOT NULL,
 request_id uuid NOT NULL,
 chat_hmac text NOT NULL CHECK (chat_hmac ~ '^[a-f0-9]{64}$'),
 state text NOT NULL DEFAULT 'leased'
   CHECK (state IN ('leased','api_accepted','uncertain')),
 message_id text,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 finished_at timestamptz,
 CHECK (
   (state='leased' AND finished_at IS NULL AND message_id IS NULL)
   OR (state='uncertain' AND finished_at IS NOT NULL AND message_id IS NULL)
   OR (state='api_accepted' AND finished_at IS NOT NULL
       AND message_id IS NOT NULL AND message_id ~ '^[A-Za-z0-9._:-]{8,160}
 )
);
ALTER TABLE cotironda_piloto_privado.v2_d016_session_reissues ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.v2_d016_session_reissues FROM PUBLIC,anon,authenticated;
CREATE INDEX v2_d016_session_reissues_buyer_time
 ON cotironda_piloto_privado.v2_d016_session_reissues(buyer_key,created_at DESC);

CREATE OR REPLACE FUNCTION public.cotironda_piloto_v2_d016_reissue_from_session_private(
 p_operation_id uuid,p_request_id uuid,p_sesion_hmac text,p_ticket_hmac text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_buyer text;v_chat text;v_nonce text;v_cipher text;v_contact_hash text;
 v_now timestamptz:=clock_timestamp(); v_ctx jsonb;
BEGIN
 IF p_operation_id IS NULL OR p_request_id IS NULL
 OR p_sesion_hmac IS NULL OR p_sesion_hmac !~ '^[a-f0-9]{64}$'
 OR p_ticket_hmac IS NULL OR p_ticket_hmac !~ '^[a-f0-9]{64}$'
 THEN RETURN jsonb_build_object('state','denied'); END IF;
 -- El servidor entrega HMAC derivado de la cookie HttpOnly. Nunca buyerKey ni teléfono.
 v_ctx:=public.cotironda_piloto_v2_d016_session_context_private(
  p_sesion_hmac,p_request_id
 );
 IF v_ctx IS NULL OR v_ctx->>'state'<>'authorized_buyer_whatsapp_session'
 THEN RETURN jsonb_build_object('state','denied');END IF;
 SELECT b.key,b.chat_hmac,ch.nonce_b64,ch.ciphertext_b64,ch.contact_sha256
 INTO v_buyer,v_chat,v_nonce,v_cipher,v_contact_hash
 FROM cotironda_piloto_privado.requests r
 JOIN cotironda_piloto_privado.participants b ON b.key=r.buyer_key
 JOIN cotironda_piloto_privado.participant_channels_mvp109 ch
  ON ch.participant_key=b.key AND ch.chat_hmac=b.chat_hmac
 JOIN cotironda_piloto_privado.whapi_inbox proof
  ON proof.message_hmac=ch.authenticated_message_hmac
  AND proof.participant_key=b.key AND proof.chat_hmac=b.chat_hmac
 WHERE r.id=p_request_id AND b.key=v_ctx->>'buyerKey'
  AND b.participant_role='buyer' AND b.consent_at IS NOT NULL
  AND b.opted_out_at IS NULL
  AND ch.nonce_b64 IS NOT NULL AND ch.ciphertext_b64 IS NOT NULL
 FOR UPDATE OF b;
 IF v_buyer IS NULL THEN RETURN jsonb_build_object('state','denied');END IF;
 IF NOT EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.v2_d016_access_tickets old
  WHERE old.buyer_key=v_buyer AND old.request_id=p_request_id
  AND (old.consumed_at IS NOT NULL OR old.expires_at<=v_now)
 ) THEN RETURN jsonb_build_object('state','denied');END IF;
 -- Una petición/60 s; máximo seis accesos/24 h entre ambos emisores.
 IF EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.v2_d016_session_reissues x
  WHERE x.buyer_key=v_buyer AND x.created_at>v_now-interval '60 seconds'
 ) OR EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.v2_d016_whapi_link_deliveries x
  WHERE x.buyer_key=v_buyer AND x.created_at>v_now-interval '60 seconds'
 ) OR (
  (SELECT count(*) FROM cotironda_piloto_privado.v2_d016_session_reissues x
   WHERE x.buyer_key=v_buyer AND x.created_at>v_now-interval '24 hours')
  +(SELECT count(*) FROM cotironda_piloto_privado.v2_d016_whapi_link_deliveries x
   WHERE x.buyer_key=v_buyer AND x.created_at>v_now-interval '24 hours')
 )>=6 THEN RETURN jsonb_build_object('state','rate_limited');END IF;
 IF public.cotironda_piloto_v2_d016_issue_ticket_private(
  p_ticket_hmac,v_buyer,p_request_id,v_chat) IS DISTINCT FROM true
 THEN RETURN jsonb_build_object('state','denied');END IF;
 -- En este reenvío el ticket dura 10 minutos, no los 14 días de la sesión.
 UPDATE cotironda_piloto_privado.v2_d016_access_tickets
 SET expires_at=v_now+interval '10 minutes'
 WHERE ticket_hmac=p_ticket_hmac;
 INSERT INTO cotironda_piloto_privado.v2_d016_session_reissues(
  operation_id,ticket_hmac,buyer_key,request_id,chat_hmac,created_at
 ) VALUES(p_operation_id,p_ticket_hmac,v_buyer,p_request_id,v_chat,v_now);
 RETURN jsonb_build_object('state','issued','requestId',p_request_id::text,
  'chatHmac',v_chat,'nonceB64',v_nonce,'ciphertextB64',v_cipher,
  'contactSha256',v_contact_hash);
EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('state','duplicate');
END $$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_v2_d016_reissue_from_session_private(
 uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_v2_d016_reissue_from_session_private(
 uuid,uuid,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_v2_d016_finish_session_reissue_private(
 p_operation_id uuid,p_ticket_hmac text,p_state text,p_message_id text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
 IF p_operation_id IS NULL OR p_ticket_hmac IS NULL
 OR p_ticket_hmac !~ '^[a-f0-9]{64}$'
 OR p_state NOT IN ('api_accepted','uncertain')
 OR (p_state='api_accepted' AND (
  p_message_id IS NULL OR p_message_id !~ '^[A-Za-z0-9._:-]{8,160}$'))
 OR (p_state='uncertain' AND p_message_id IS NOT NULL)
 THEN RETURN false;END IF;
 UPDATE cotironda_piloto_privado.v2_d016_session_reissues
 SET state=p_state,message_id=p_message_id,finished_at=clock_timestamp()
 WHERE operation_id=p_operation_id AND ticket_hmac=p_ticket_hmac
  AND state='leased';
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_v2_d016_finish_session_reissue_private(
 uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_v2_d016_finish_session_reissue_private(
 uuid,text,text,text) TO service_role;
)
 )
);
ALTER TABLE cotironda_piloto_privado.v2_d016_session_reissues ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.v2_d016_session_reissues FROM PUBLIC,anon,authenticated;
CREATE INDEX v2_d016_session_reissues_buyer_time
 ON cotironda_piloto_privado.v2_d016_session_reissues(buyer_key,created_at DESC);

CREATE OR REPLACE FUNCTION public.cotironda_piloto_v2_d016_reissue_from_session_private(
 p_operation_id uuid,p_request_id uuid,p_sesion_hmac text,p_ticket_hmac text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_buyer text;v_chat text;v_nonce text;v_cipher text;v_contact_hash text;
 v_now timestamptz:=clock_timestamp(); v_ctx jsonb;
BEGIN
 IF p_operation_id IS NULL OR p_request_id IS NULL
 OR p_sesion_hmac IS NULL OR p_sesion_hmac !~ '^[a-f0-9]{64}$'
 OR p_ticket_hmac IS NULL OR p_ticket_hmac !~ '^[a-f0-9]{64}$'
 THEN RETURN jsonb_build_object('state','denied'); END IF;
 -- El servidor entrega HMAC derivado de la cookie HttpOnly. Nunca buyerKey ni teléfono.
 v_ctx:=public.cotironda_piloto_v2_d016_session_context_private(
  p_sesion_hmac,p_request_id
 );
 IF v_ctx IS NULL OR v_ctx->>'state'<>'authorized_buyer_whatsapp_session'
 THEN RETURN jsonb_build_object('state','denied');END IF;
 SELECT b.key,b.chat_hmac,ch.nonce_b64,ch.ciphertext_b64,ch.contact_sha256
 INTO v_buyer,v_chat,v_nonce,v_cipher,v_contact_hash
 FROM cotironda_piloto_privado.requests r
 JOIN cotironda_piloto_privado.participants b ON b.key=r.buyer_key
 JOIN cotironda_piloto_privado.participant_channels_mvp109 ch
  ON ch.participant_key=b.key AND ch.chat_hmac=b.chat_hmac
 JOIN cotironda_piloto_privado.whapi_inbox proof
  ON proof.message_hmac=ch.authenticated_message_hmac
  AND proof.participant_key=b.key AND proof.chat_hmac=b.chat_hmac
 WHERE r.id=p_request_id AND b.key=v_ctx->>'buyerKey'
  AND b.participant_role='buyer' AND b.consent_at IS NOT NULL
  AND b.opted_out_at IS NULL
  AND ch.nonce_b64 IS NOT NULL AND ch.ciphertext_b64 IS NOT NULL
 FOR UPDATE OF b;
 IF v_buyer IS NULL THEN RETURN jsonb_build_object('state','denied');END IF;
 IF NOT EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.v2_d016_access_tickets old
  WHERE old.buyer_key=v_buyer AND old.request_id=p_request_id
  AND (old.consumed_at IS NOT NULL OR old.expires_at<=v_now)
 ) THEN RETURN jsonb_build_object('state','denied');END IF;
 -- Una petición/60 s; máximo seis accesos/24 h entre ambos emisores.
 IF EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.v2_d016_session_reissues x
  WHERE x.buyer_key=v_buyer AND x.created_at>v_now-interval '60 seconds'
 ) OR EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.v2_d016_whapi_link_deliveries x
  WHERE x.buyer_key=v_buyer AND x.created_at>v_now-interval '60 seconds'
 ) OR (
  (SELECT count(*) FROM cotironda_piloto_privado.v2_d016_session_reissues x
   WHERE x.buyer_key=v_buyer AND x.created_at>v_now-interval '24 hours')
  +(SELECT count(*) FROM cotironda_piloto_privado.v2_d016_whapi_link_deliveries x
   WHERE x.buyer_key=v_buyer AND x.created_at>v_now-interval '24 hours')
 )>=6 THEN RETURN jsonb_build_object('state','rate_limited');END IF;
 IF public.cotironda_piloto_v2_d016_issue_ticket_private(
  p_ticket_hmac,v_buyer,p_request_id,v_chat) IS DISTINCT FROM true
 THEN RETURN jsonb_build_object('state','denied');END IF;
 -- En este reenvío el ticket dura 10 minutos, no los 14 días de la sesión.
 UPDATE cotironda_piloto_privado.v2_d016_access_tickets
 SET expires_at=v_now+interval '10 minutes'
 WHERE ticket_hmac=p_ticket_hmac;
 INSERT INTO cotironda_piloto_privado.v2_d016_session_reissues(
  operation_id,ticket_hmac,buyer_key,request_id,chat_hmac,created_at
 ) VALUES(p_operation_id,p_ticket_hmac,v_buyer,p_request_id,v_chat,v_now);
 RETURN jsonb_build_object('state','issued','requestId',p_request_id::text,
  'chatHmac',v_chat,'nonceB64',v_nonce,'ciphertextB64',v_cipher,
  'contactSha256',v_contact_hash);
EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('state','duplicate');
END $$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_v2_d016_reissue_from_session_private(
 uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_v2_d016_reissue_from_session_private(
 uuid,uuid,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_v2_d016_finish_session_reissue_private(
 p_operation_id uuid,p_ticket_hmac text,p_state text,p_message_id text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
 IF p_operation_id IS NULL OR p_ticket_hmac IS NULL
 OR p_ticket_hmac !~ '^[a-f0-9]{64}$'
 OR p_state NOT IN ('api_accepted','uncertain')
 OR (p_state='api_accepted' AND (
  p_message_id IS NULL OR p_message_id !~ '^[A-Za-z0-9._:-]{8,160}$'))
 OR (p_state='uncertain' AND p_message_id IS NOT NULL)
 THEN RETURN false;END IF;
 UPDATE cotironda_piloto_privado.v2_d016_session_reissues
 SET state=p_state,message_id=p_message_id,finished_at=clock_timestamp()
 WHERE operation_id=p_operation_id AND ticket_hmac=p_ticket_hmac
  AND state='leased';
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_v2_d016_finish_session_reissue_private(
 uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_v2_d016_finish_session_reissue_private(
 uuid,text,text,text) TO service_role;
