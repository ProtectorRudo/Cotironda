-- D016 CANDIDATE SOLO DESARROLLO. NO ejecutar en PILOTO sin Publicalo.
-- Canje de enlace WhatsApp en PostgreSQL 17: transacción única y ACL privadas.
-- No crea Auth, no confirma teléfonos, no emite JWT ni da acceso a originales.
BEGIN;
CREATE TABLE cotironda_piloto_privado.v2_d016_access_tickets (
 ticket_hmac text PRIMARY KEY CHECK (ticket_hmac ~ '^[a-f0-9]{64}$'),
 buyer_key text NOT NULL,
 request_id uuid NOT NULL,
 chat_hmac text NOT NULL CHECK (chat_hmac ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 consumed_at timestamptz,
 revoked_at timestamptz,
 purpose text NOT NULL DEFAULT 'whatsapp_buyer_login'
  CHECK (purpose='whatsapp_buyer_login'),
 CHECK (expires_at>created_at AND expires_at<=created_at+interval '10 minutes'),
 CHECK (consumed_at IS NULL OR consumed_at>=created_at),
 CHECK (revoked_at IS NULL OR revoked_at>=created_at)
);
ALTER TABLE cotironda_piloto_privado.v2_d016_access_tickets
 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.v2_d016_access_tickets
 FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON cotironda_piloto_privado.v2_d016_access_tickets
 TO service_role;
CREATE INDEX v2_d016_tickets_active_scope
 ON cotironda_piloto_privado.v2_d016_access_tickets(buyer_key,request_id)
 WHERE consumed_at IS NULL AND revoked_at IS NULL;

-- Servicio servidor, nunca usado con JWT comprador. Bloquea la ronda,
-- comprueba canal con mensaje entrante real, revoca tokens previos del pedido.
CREATE FUNCTION public.cotironda_piloto_v2_d016_issue_ticket_private(
 p_ticket_hmac text,p_buyer_key text,p_request_id uuid,p_chat_hmac text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $issue$
DECLARE v_request uuid; v_now timestamptz;
BEGIN
 IF p_ticket_hmac IS NULL OR p_ticket_hmac !~ '^[a-f0-9]{64}$'
  OR p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$'
  OR p_buyer_key IS NULL OR p_buyer_key !~ '^[a-z0-9_-]{3,100}$'
  OR p_request_id IS NULL
 THEN RETURN false;END IF;

 SELECT r.id INTO v_request
 FROM cotironda_piloto_privado.requests r
 JOIN cotironda_piloto_privado.participants buyer
  ON buyer.key=r.buyer_key
  AND buyer.participant_role='buyer'
  AND buyer.chat_hmac=p_chat_hmac
  AND buyer.consent_at IS NOT NULL
  AND buyer.opted_out_at IS NULL
 JOIN cotironda_piloto_privado.participant_channels_mvp109 channel
  ON channel.participant_key=buyer.key
  AND channel.chat_hmac=buyer.chat_hmac
 JOIN cotironda_piloto_privado.whapi_inbox proof
  ON proof.message_hmac=channel.authenticated_message_hmac
  AND proof.chat_hmac=channel.chat_hmac
  AND proof.participant_key=buyer.key
 WHERE r.id=p_request_id
  AND r.buyer_key=p_buyer_key
  AND r.state IN ('prepared','closed')
  AND NOT EXISTS (
   SELECT 1 FROM cotironda_piloto_privado.participant_channels_mvp109 x
   JOIN cotironda_piloto_privado.participants other
    ON other.key=x.participant_key
   WHERE x.contact_sha256=channel.contact_sha256
    AND x.participant_key<>buyer.key
    AND other.participant_role='buyer'
    AND other.opted_out_at IS NULL
  )
 FOR UPDATE OF r;
 IF v_request IS NULL THEN RETURN false;END IF;

 v_now:=clock_timestamp();
 UPDATE cotironda_piloto_privado.v2_d016_access_tickets
  SET revoked_at=v_now
 WHERE buyer_key=p_buyer_key AND request_id=p_request_id
  AND consumed_at IS NULL AND revoked_at IS NULL;
 INSERT INTO cotironda_piloto_privado.v2_d016_access_tickets(
  ticket_hmac,buyer_key,request_id,chat_hmac,created_at,expires_at
 ) VALUES (p_ticket_hmac,p_buyer_key,p_request_id,p_chat_hmac,
  v_now,v_now+interval '10 minutes');
 RETURN true;
EXCEPTION WHEN unique_violation THEN RETURN false;
END $issue$;

-- UPDATE condicional e indivisible = dos solicitudes concurrentes no canjean
-- el mismo ticket. Se revalida el vínculo buyer/WhatsApp antes de consumir.
-- El resultado es SOLO del servidor, NO una sesión Auth.
CREATE FUNCTION public.cotironda_piloto_v2_d016_claim_ticket_private(
 p_ticket_hmac text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $claim$
DECLARE v_result record; v_now timestamptz:=clock_timestamp();
BEGIN
 IF p_ticket_hmac IS NULL OR p_ticket_hmac !~ '^[a-f0-9]{64}$'
 THEN RETURN NULL;END IF;
 UPDATE cotironda_piloto_privado.v2_d016_access_tickets t
 SET consumed_at=v_now
 WHERE t.ticket_hmac=p_ticket_hmac
  AND t.consumed_at IS NULL AND t.revoked_at IS NULL
  AND t.expires_at>v_now
  AND t.purpose='whatsapp_buyer_login'
  AND EXISTS (
   SELECT 1 FROM cotironda_piloto_privado.requests r
   JOIN cotironda_piloto_privado.participants buyer
    ON buyer.key=r.buyer_key
    AND buyer.participant_role='buyer'
    AND buyer.chat_hmac=t.chat_hmac
    AND buyer.consent_at IS NOT NULL
    AND buyer.opted_out_at IS NULL
   JOIN cotironda_piloto_privado.participant_channels_mvp109 channel
    ON channel.participant_key=buyer.key
    AND channel.chat_hmac=buyer.chat_hmac
   JOIN cotironda_piloto_privado.whapi_inbox proof
    ON proof.message_hmac=channel.authenticated_message_hmac
    AND proof.chat_hmac=channel.chat_hmac
    AND proof.participant_key=buyer.key
   WHERE r.id=t.request_id AND r.buyer_key=t.buyer_key
    AND r.state IN ('prepared','closed')
    AND NOT EXISTS (
     SELECT 1 FROM cotironda_piloto_privado.participant_channels_mvp109 x
     JOIN cotironda_piloto_privado.participants other
      ON other.key=x.participant_key
     WHERE x.contact_sha256=channel.contact_sha256
      AND x.participant_key<>buyer.key
      AND other.participant_role='buyer'
      AND other.opted_out_at IS NULL
    )
  )
 RETURNING t.buyer_key,t.request_id,t.chat_hmac INTO v_result;
 IF NOT FOUND THEN RETURN NULL;END IF;
 -- Exclusivo service_role. La capa de sesión vuelve a validar identidad
 -- y nunca transforma este JSON en autorización a un original.
 RETURN jsonb_build_object('state','CLAIMED_AWAITING_AUTH',
  'buyerKey',v_result.buyer_key,
  'requestId',v_result.request_id::text,
  'chatHmac',v_result.chat_hmac);
END $claim$;

REVOKE ALL ON FUNCTION public.cotironda_piloto_v2_d016_issue_ticket_private(
 text,text,uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.cotironda_piloto_v2_d016_claim_ticket_private(
 text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_v2_d016_issue_ticket_private(
 text,text,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_v2_d016_claim_ticket_private(
 text) TO service_role;
COMMIT;
