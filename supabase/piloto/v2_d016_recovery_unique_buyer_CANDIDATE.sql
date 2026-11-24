-- D016 / PILOTO — recuperación sin cookie para el ÚNICO comprador autorizado.
-- SOLO CANDIDATO: NO aplicar ni enviar mensajes antes de «Publicalo».
-- Ningún input identifica comprador, número, empresa o ronda: se resuelve en BD.
-- Usa el canal Whapi cifrado y auditado y las tablas existentes. Sin nuevas RLS.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_v2_d016_reissue_unique_pilot_private(
 p_operation_id uuid,p_ticket_hmac text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
 v_buyer text;v_chat text;v_request uuid;v_nonce text;v_cipher text;
 v_contact_hash text;v_now timestamptz:=clock_timestamp();v_eligible bigint;
BEGIN
 IF p_operation_id IS NULL OR p_ticket_hmac IS NULL OR
    p_ticket_hmac !~ '^[a-f0-9]{64}$'
 THEN RETURN jsonb_build_object('state','denied');END IF;

 -- Este modo NO debe funcionar cuando se incorpore un segundo comprador.
 SELECT count(*) INTO v_eligible FROM cotironda_piloto_privado.participants b
 WHERE b.participant_role='buyer' AND b.consent_at IS NOT NULL
 AND b.opted_out_at IS NULL;
 IF v_eligible<>1 THEN RETURN jsonb_build_object('state','denied');END IF;

 SELECT b.key,b.chat_hmac,t.request_id,ch.nonce_b64,ch.ciphertext_b64,
   ch.contact_sha256
 INTO v_buyer,v_chat,v_request,v_nonce,v_cipher,v_contact_hash
 FROM cotironda_piloto_privado.participants b
 JOIN cotironda_piloto_privado.participant_channels_mvp109 ch
  ON ch.participant_key=b.key AND ch.chat_hmac=b.chat_hmac
 JOIN cotironda_piloto_privado.whapi_inbox proof
  ON proof.message_hmac=ch.authenticated_message_hmac
  AND proof.chat_hmac=b.chat_hmac AND proof.participant_key=b.key
 JOIN cotironda_piloto_privado.v2_d016_access_tickets t
  ON t.buyer_key=b.key AND t.chat_hmac=b.chat_hmac
 JOIN cotironda_piloto_privado.requests r
  ON r.id=t.request_id AND r.buyer_key=b.key
 JOIN cotironda_piloto_privado.v2_business_policy policy
  ON policy.singleton=true AND policy.enabled=true
  AND policy.activated_at IS NOT NULL AND r.created_at>=policy.activated_at
 WHERE b.participant_role='buyer'
  AND b.consent_at IS NOT NULL AND b.opted_out_at IS NULL
  AND r.state IN ('prepared','closed')
  AND t.created_at>v_now-interval '30 days'
  AND (t.consumed_at IS NOT NULL OR t.expires_at<=v_now)
  AND ch.nonce_b64 IS NOT NULL AND ch.ciphertext_b64 IS NOT NULL
  AND NOT EXISTS (
   SELECT 1 FROM cotironda_piloto_privado.participant_channels_mvp109 x
   JOIN cotironda_piloto_privado.participants another
    ON another.key=x.participant_key
   WHERE x.contact_sha256=ch.contact_sha256
    AND x.participant_key<>b.key
    AND another.participant_role='buyer' AND another.opted_out_at IS NULL
  )
 ORDER BY t.created_at DESC
 LIMIT 1
 FOR UPDATE OF b;
 IF v_buyer IS NULL THEN RETURN jsonb_build_object('state','denied');END IF;

 -- Más estricto que el acceso ordinario: una vez cada 10 minutos
 -- y dos solicitudes totales en 24h, incluyendo el emisor original.
 IF EXISTS (
  SELECT 1 FROM cotironda_piloto_privado.v2_d016_session_reissues x
  WHERE x.buyer_key=v_buyer AND x.created_at>v_now-interval '10 minutes'
 ) OR EXISTS (
  SELECT 1 FROM cotironda_piloto_privado.v2_d016_whapi_link_deliveries x
  WHERE x.buyer_key=v_buyer AND x.created_at>v_now-interval '10 minutes'
 ) OR (
  (SELECT count(*) FROM cotironda_piloto_privado.v2_d016_session_reissues x
   WHERE x.buyer_key=v_buyer AND x.created_at>v_now-interval '24 hours')
  +(SELECT count(*) FROM cotironda_piloto_privado.v2_d016_whapi_link_deliveries x
   WHERE x.buyer_key=v_buyer AND x.created_at>v_now-interval '24 hours')
 )>=2 THEN RETURN jsonb_build_object('state','rate_limited');END IF;

 -- La RPC existente revalida consentimiento, empresa, canal, ronda y política.
 IF public.cotironda_piloto_v2_d016_issue_ticket_private(
  p_ticket_hmac,v_buyer,v_request,v_chat) IS DISTINCT FROM true
 THEN RETURN jsonb_build_object('state','denied');END IF;
 UPDATE cotironda_piloto_privado.v2_d016_access_tickets
 SET expires_at=v_now+interval '10 minutes'
 WHERE ticket_hmac=p_ticket_hmac;
 INSERT INTO cotironda_piloto_privado.v2_d016_session_reissues(
  operation_id,ticket_hmac,buyer_key,request_id,chat_hmac,created_at
 ) VALUES(p_operation_id,p_ticket_hmac,v_buyer,v_request,v_chat,v_now);
 RETURN jsonb_build_object('state','issued','requestId',v_request::text,
  'chatHmac',v_chat,'nonceB64',v_nonce,'ciphertextB64',v_cipher,
  'contactSha256',v_contact_hash);
EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('state','duplicate');
END $$;

REVOKE ALL ON FUNCTION
 public.cotironda_piloto_v2_d016_reissue_unique_pilot_private(uuid,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_v2_d016_reissue_unique_pilot_private(uuid,text)
 TO service_role;
