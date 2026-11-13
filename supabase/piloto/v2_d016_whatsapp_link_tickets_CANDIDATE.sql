-- D016 CANDIDATE SOLO DESARROLLO. NO ejecutar en PILOTO sin Publicalo.
-- Canje de enlace WhatsApp en PostgreSQL 17: transacción única y ACL privadas.
-- No crea Auth, no confirma teléfonos, no emite JWT ni da acceso a originales.
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

-- Sesión del portal: NO usa campos de GoTrue phone_confirmed_at/email.
-- El HMAC de la cookie jamás sale de esta tabla privada.
CREATE TABLE cotironda_piloto_privado.v2_d016_browser_sessions (
 sesion_hmac text PRIMARY KEY CHECK(sesion_hmac ~ '^[a-f0-9]{64}$'),
 ticket_hmac text NOT NULL UNIQUE
  REFERENCES cotironda_piloto_privado.v2_d016_access_tickets(ticket_hmac),
 buyer_key text NOT NULL,request_id uuid NOT NULL,chat_hmac text NOT NULL
  CHECK(chat_hmac ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 purpose text NOT NULL DEFAULT 'whatsapp_buyer_session'
  CHECK (purpose='whatsapp_buyer_session'),
 CHECK(expires_at>created_at
  AND expires_at<=created_at+interval '8 hours')
);
ALTER TABLE cotironda_piloto_privado.v2_d016_browser_sessions
 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.v2_d016_browser_sessions
 FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON cotironda_piloto_privado.v2_d016_browser_sessions
 TO service_role;
CREATE INDEX v2_d016_sessions_lookup
 ON cotironda_piloto_privado.v2_d016_browser_sessions(request_id,buyer_key)
 WHERE revoked_at IS NULL;

-- Ticket + browser session en UNA operación transaccional y atómica.
-- Si falla INSERT por conflicto/colisión, el UPDATE vuelve atrás.
CREATE FUNCTION public.cotironda_piloto_v2_d016_claim_session_private(
 p_ticket_hmac text,p_sesion_hmac text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $sess$
DECLARE v_created text;v_now timestamptz:=clock_timestamp();
BEGIN
 IF p_ticket_hmac IS NULL OR p_ticket_hmac !~ '^[a-f0-9]{64}$'
  OR p_sesion_hmac IS NULL OR p_sesion_hmac !~ '^[a-f0-9]{64}$'
 THEN RETURN false;END IF;

 WITH claimed AS (
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
     AND NOT EXISTS(
      SELECT 1 FROM cotironda_piloto_privado.participant_channels_mvp109 x
      JOIN cotironda_piloto_privado.participants other
       ON other.key=x.participant_key
      WHERE x.contact_sha256=channel.contact_sha256
       AND x.participant_key<>buyer.key
       AND other.participant_role='buyer'
       AND other.opted_out_at IS NULL
     )
   )
  RETURNING t.ticket_hmac,t.buyer_key,t.request_id,t.chat_hmac
 )
 INSERT INTO cotironda_piloto_privado.v2_d016_browser_sessions(
  sesion_hmac,ticket_hmac,buyer_key,request_id,chat_hmac,
  created_at,expires_at
 )
 SELECT p_sesion_hmac,c.ticket_hmac,c.buyer_key,c.request_id,
  c.chat_hmac,v_now,v_now+interval '8 hours'
 FROM claimed c
 RETURNING sesion_hmac INTO v_created;
 RETURN v_created IS NOT NULL;
EXCEPTION WHEN unique_violation THEN RETURN false;
END $sess$;

-- Una cookie NO garantiza identidad; se revalida en CADA lectura.
CREATE FUNCTION public.cotironda_piloto_v2_d016_session_context_private(
 p_sesion_hmac text,p_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $context$
DECLARE v_context jsonb;v_now timestamptz:=clock_timestamp();
BEGIN
 IF p_sesion_hmac IS NULL OR p_sesion_hmac !~ '^[a-f0-9]{64}$'
  OR p_request_id IS NULL THEN RETURN NULL;END IF;
 SELECT jsonb_build_object(
  'state','authorized_buyer_whatsapp_session',
  'buyerKey',s.buyer_key,'requestId',s.request_id::text
 ) INTO v_context
 FROM cotironda_piloto_privado.v2_d016_browser_sessions s
 JOIN cotironda_piloto_privado.requests r
  ON r.id=s.request_id AND r.buyer_key=s.buyer_key
  AND r.state IN ('prepared','closed')
 JOIN cotironda_piloto_privado.participants buyer
  ON buyer.key=r.buyer_key AND buyer.participant_role='buyer'
  AND buyer.chat_hmac=s.chat_hmac
  AND buyer.consent_at IS NOT NULL AND buyer.opted_out_at IS NULL
 JOIN cotironda_piloto_privado.participant_channels_mvp109 channel
  ON channel.participant_key=buyer.key AND channel.chat_hmac=buyer.chat_hmac
 JOIN cotironda_piloto_privado.whapi_inbox proof
  ON proof.message_hmac=channel.authenticated_message_hmac
  AND proof.participant_key=buyer.key AND proof.chat_hmac=buyer.chat_hmac
 WHERE s.sesion_hmac=p_sesion_hmac AND s.request_id=p_request_id
  AND s.revoked_at IS NULL AND s.expires_at>v_now
  AND s.purpose='whatsapp_buyer_session'
  AND NOT EXISTS(
   SELECT 1 FROM cotironda_piloto_privado.participant_channels_mvp109 x
   JOIN cotironda_piloto_privado.participants other
    ON other.key=x.participant_key
   WHERE x.contact_sha256=channel.contact_sha256
    AND x.participant_key<>buyer.key
    AND other.participant_role='buyer'
    AND other.opted_out_at IS NULL
  )
 LIMIT 1;
 RETURN v_context;
END $context$;

-- Logout explícito: invalidación inmediata en servidor.
CREATE FUNCTION public.cotironda_piloto_v2_d016_logout_private(
 p_sesion_hmac text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $logout$
BEGIN
 IF p_sesion_hmac IS NULL OR p_sesion_hmac !~ '^[a-f0-9]{64}$'
 THEN RETURN false;END IF;
 UPDATE cotironda_piloto_privado.v2_d016_browser_sessions
 SET revoked_at=clock_timestamp()
 WHERE sesion_hmac=p_sesion_hmac AND revoked_at IS NULL;
 RETURN FOUND;
END $logout$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_v2_d016_claim_session_private(
 text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.cotironda_piloto_v2_d016_session_context_private(
 text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.cotironda_piloto_v2_d016_logout_private(
 text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_v2_d016_claim_session_private(
 text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_v2_d016_session_context_private(
 text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_v2_d016_logout_private(
 text) TO service_role;

-- D016 Whapi: una reserva de entrega por evento entrante autenticado.
-- Nunca insertar mensajes salientes sin reservar primero. La red incierta
-- permanece 'uncertain': NO reintentar automáticamente.
CREATE TABLE cotironda_piloto_privado.v2_d016_whapi_link_deliveries(
 event_hmac text PRIMARY KEY CHECK(event_hmac ~ '^[a-f0-9]{64}$'),
 ticket_hmac text NOT NULL UNIQUE
  REFERENCES cotironda_piloto_privado.v2_d016_access_tickets(ticket_hmac),
 buyer_key text NOT NULL,request_id uuid NOT NULL,
 chat_hmac text NOT NULL CHECK(chat_hmac ~ '^[a-f0-9]{64}$'),
 mode text NOT NULL CHECK(mode IN ('auto','confirmed','recovery')),
 state text NOT NULL DEFAULT 'leased'
  CHECK(state IN ('leased','api_accepted','uncertain')),
 message_id text CHECK(message_id IS NULL OR
  message_id ~ '^[A-Za-z0-9._:-]{8,160}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 finished_at timestamptz,
 CHECK((state='leased' AND finished_at IS NULL AND message_id IS NULL)
   OR (state='uncertain' AND finished_at IS NOT NULL AND message_id IS NULL)
   OR (state='api_accepted' AND finished_at IS NOT NULL
    AND message_id IS NOT NULL))
);
ALTER TABLE cotironda_piloto_privado.v2_d016_whapi_link_deliveries
 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.v2_d016_whapi_link_deliveries
 FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON cotironda_piloto_privado.v2_d016_whapi_link_deliveries
 TO service_role;
CREATE INDEX v2_d016_whapi_link_budget
 ON cotironda_piloto_privado.v2_d016_whapi_link_deliveries(buyer_key,created_at);

-- Preparación atómica: evidencia Whapi entrante, buyer único, ronda y política
-- V2 vigente, cuota acotada y ticket HMAC creado ANTES de hacer POST.
CREATE FUNCTION public.cotironda_piloto_v2_d016_prepare_whapi_link_private(
 p_chat_hmac text,p_event_hmac text,p_request_id uuid,
 p_mode text,p_ticket_hmac text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $d016_prepare$
DECLARE v_buyer text;v_request uuid;v_now timestamptz:=clock_timestamp();
 v_count integer;
BEGIN
 IF p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$'
  OR p_event_hmac IS NULL OR p_event_hmac !~ '^[a-f0-9]{64}$'
  OR p_ticket_hmac IS NULL OR p_ticket_hmac !~ '^[a-f0-9]{64}$'
  OR p_mode IS NULL OR p_mode NOT IN ('auto','confirmed','recovery')
  OR (p_mode='recovery' AND p_request_id IS NOT NULL)
  OR (p_mode IN ('auto','confirmed') AND p_request_id IS NULL)
 THEN RETURN jsonb_build_object('state','denied');END IF;
 -- Serializar eventos diferentes del mismo comprador para prevenir spam.
 SELECT buyer.key INTO v_buyer
 FROM cotironda_piloto_privado.participants buyer
 JOIN cotironda_piloto_privado.participant_channels_mvp109 channel
  ON channel.participant_key=buyer.key AND channel.chat_hmac=buyer.chat_hmac
 JOIN cotironda_piloto_privado.whapi_inbox event
  ON event.message_hmac=p_event_hmac
  AND event.chat_hmac=p_chat_hmac AND event.participant_key=buyer.key
 WHERE buyer.participant_role='buyer'
  AND buyer.chat_hmac=p_chat_hmac
  AND buyer.consent_at IS NOT NULL AND buyer.opted_out_at IS NULL
  AND (event.received_at IS NOT NULL)
  AND event.received_at<=v_now
  AND event.received_at>v_now-interval '10 minutes'
  AND NOT EXISTS(
   SELECT 1 FROM cotironda_piloto_privado.participant_channels_mvp109 x
   JOIN cotironda_piloto_privado.participants other
    ON other.key=x.participant_key
   WHERE x.contact_sha256=channel.contact_sha256
    AND x.participant_key<>buyer.key
    AND other.participant_role='buyer' AND other.opted_out_at IS NULL
  )
 FOR UPDATE OF buyer;
 IF v_buyer IS NULL THEN RETURN jsonb_build_object('state','denied');END IF;
 -- El número y el pedido NO se aceptan desde el navegador.
 -- Para recovery debe existir UNA SOLA ronda activa/autorizada.
 SELECT count(*),(array_agg(r.id))[1] INTO v_count,v_request
 FROM cotironda_piloto_privado.requests r
 JOIN cotironda_piloto_privado.v2_original_share_policy policy
  ON policy.singleton=true AND policy.enabled=true
  AND policy.activated_at IS NOT NULL
  AND r.created_at>=policy.activated_at
 WHERE r.buyer_key=v_buyer AND r.state IN ('prepared','closed')
  AND (p_request_id IS NULL OR r.id=p_request_id);
 IF v_count<>1 OR v_request IS NULL THEN
  RETURN jsonb_build_object('state','denied');END IF;

 -- No resucitar eventos: nunca POST Whapi para un event_hmac repetido.
 IF EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.v2_d016_whapi_link_deliveries
  WHERE event_hmac=p_event_hmac
 ) THEN RETURN jsonb_build_object('state','duplicate');END IF;
 -- Cuota máxima seis mensajes de acceso por comprador en 24 horas.
 IF EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.v2_d016_whapi_link_deliveries
  WHERE buyer_key=v_buyer AND created_at>v_now-interval '60 seconds'
 ) OR (SELECT count(*)
  FROM cotironda_piloto_privado.v2_d016_whapi_link_deliveries
  WHERE buyer_key=v_buyer AND created_at>v_now-interval '24 hours')>=6
 THEN RETURN jsonb_build_object('state','rate_limited');END IF;

 -- Esta RPC revalida canal, comprador y consentimiento antes de registrar.
 IF public.cotironda_piloto_v2_d016_issue_ticket_private(
  p_ticket_hmac,v_buyer,v_request,p_chat_hmac) IS DISTINCT FROM true
 THEN RETURN jsonb_build_object('state','denied');END IF;
 INSERT INTO cotironda_piloto_privado.v2_d016_whapi_link_deliveries(
  event_hmac,ticket_hmac,buyer_key,request_id,chat_hmac,mode,created_at
 ) VALUES(p_event_hmac,p_ticket_hmac,v_buyer,v_request,
  p_chat_hmac,p_mode,v_now);
 RETURN jsonb_build_object('state','issued','request_id',v_request::text);
EXCEPTION WHEN unique_violation THEN
 RETURN jsonb_build_object('state','duplicate');
END $d016_prepare$;

-- Cierre ONE-SHOT del intento reservado. Nunca se reabre la reserva.
CREATE FUNCTION public.cotironda_piloto_v2_d016_finish_whapi_link_private(
 p_ticket_hmac text,p_state text,p_whapi_message_id text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $d016_finish$
BEGIN
 IF p_ticket_hmac IS NULL OR p_ticket_hmac !~ '^[a-f0-9]{64}$'
  OR p_state NOT IN ('api_accepted','uncertain')
  OR (p_state='uncertain' AND p_whapi_message_id IS NOT NULL)
  OR (p_state='api_accepted' AND
   (p_whapi_message_id IS NULL OR
    p_whapi_message_id !~ '^[A-Za-z0-9._:-]{8,160}$'))
 THEN RETURN false;END IF;
 UPDATE cotironda_piloto_privado.v2_d016_whapi_link_deliveries
 SET state=p_state,message_id=p_whapi_message_id,finished_at=clock_timestamp()
 WHERE ticket_hmac=p_ticket_hmac AND state='leased' AND finished_at IS NULL;
 RETURN FOUND;
END $d016_finish$;

REVOKE ALL ON FUNCTION public.cotironda_piloto_v2_d016_prepare_whapi_link_private(
 text,text,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.cotironda_piloto_v2_d016_finish_whapi_link_private(
 text,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_v2_d016_prepare_whapi_link_private(
 text,text,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_v2_d016_finish_whapi_link_private(
 text,text,text) TO service_role;
