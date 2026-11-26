-- CANDIDATE ONLY: no aplicar al piloto mientras la ronda real siga abierta.
-- D016: permitir cardinalidad variable conservando identidad, consentimiento, deduplicación y ACL.
-- Un envío acreditado basta para abrir el portal; otros trabajos pendientes/inciertos no bloquean.
-- La correspondencia invitación preparada ↔ trabajo se verifica por proveedor/ronda, no solo por cantidad.
-- Aplicar en una transacción después de revisar fingerprint y completar pruebas integradas.

DO $guard$
BEGIN
 IF md5(pg_get_functiondef('public.cotironda_piloto_v2_d016_auto_buyer_packet_private()'::regprocedure)) IS DISTINCT FROM '2f9532c95e83ad3950ea4b18fad02792' THEN
  RAISE EXCEPTION 'D016 cardinality baseline changed; abort';
 END IF;
END $guard$;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_v2_d016_auto_buyer_packet_private()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v record;
BEGIN
 SELECT r.id request_id,r.source_hmac event_hmac,
        buyer.chat_hmac chat_hmac,channel.contact_sha256,
        channel.nonce_b64,channel.ciphertext_b64
 INTO v
 FROM cotironda_piloto_privado.requests r
 JOIN cotironda_piloto_privado.v2_business_policy policy
   ON policy.singleton AND policy.enabled AND policy.activated_at IS NOT NULL
   AND r.created_at>=policy.activated_at
 JOIN cotironda_piloto_privado.participants buyer
   ON buyer.key=r.buyer_key AND buyer.participant_role='buyer'
   AND buyer.consent_at IS NOT NULL AND buyer.opted_out_at IS NULL
 JOIN cotironda_piloto_privado.participant_channels_mvp109 channel
   ON channel.participant_key=buyer.key AND channel.chat_hmac=buyer.chat_hmac
 JOIN cotironda_piloto_privado.whapi_inbox source
   ON source.message_hmac=r.source_hmac AND source.request_id=r.id
   AND source.participant_key=buyer.key AND source.chat_hmac=buyer.chat_hmac
 JOIN cotironda_piloto_privado.whapi_inbox proof
   ON proof.message_hmac=channel.authenticated_message_hmac
   AND proof.participant_key=buyer.key AND proof.chat_hmac=buyer.chat_hmac
 WHERE r.state='prepared' AND r.closes_at>clock_timestamp()
   AND r.timing_mode='business_two_days' AND r.round_days=2
   AND r.created_at>clock_timestamp()-interval '3 days'
   AND source.received_at IS NOT NULL AND source.received_at<=clock_timestamp()
   AND NOT EXISTS (
    SELECT 1 FROM cotironda_piloto_privado.participant_channels_mvp109 ch2
    JOIN cotironda_piloto_privado.participants other
      ON other.key=ch2.participant_key
    WHERE ch2.contact_sha256=channel.contact_sha256
      AND ch2.participant_key<>buyer.key
      AND other.participant_role='buyer' AND other.opted_out_at IS NULL
   )
   AND EXISTS (
      SELECT 1 FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 j
      JOIN cotironda_piloto_privado.invitations i ON i.request_id=j.request_id AND i.supplier_key=j.supplier_key
      WHERE j.request_id=r.id AND i.state='prepared'
        AND j.state='api_accepted' AND j.whapi_message_id IS NOT NULL
    )
    AND NOT EXISTS (
      SELECT 1 FROM cotironda_piloto_privado.invitations i
      WHERE i.request_id=r.id AND i.state='prepared'
        AND NOT EXISTS (SELECT 1 FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 j
          WHERE j.request_id=i.request_id AND j.supplier_key=i.supplier_key)
    )
    AND NOT EXISTS (
      SELECT 1 FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 j
      WHERE j.request_id=r.id
        AND NOT EXISTS (SELECT 1 FROM cotironda_piloto_privado.invitations i
          WHERE i.request_id=j.request_id AND i.supplier_key=j.supplier_key AND i.state='prepared')
    )
   AND NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.v2_d016_whapi_link_deliveries prior
     WHERE prior.request_id=r.id)
 ORDER BY r.created_at,r.id LIMIT 1;
 IF v.request_id IS NULL THEN RETURN jsonb_build_object('state','empty');END IF;
 RETURN jsonb_build_object('state','ready','request_id',v.request_id::text,
  'event_hmac',v.event_hmac,'chat_hmac',v.chat_hmac,
  'contact_sha256',v.contact_sha256,'nonce_b64',v.nonce_b64,
  'ciphertext_b64',v.ciphertext_b64,'source','authenticated_whapi');
END $function$;

REVOKE ALL ON FUNCTION public.cotironda_piloto_v2_d016_auto_buyer_packet_private() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_v2_d016_auto_buyer_packet_private() TO service_role;

DO $guard$
BEGIN
 IF md5(pg_get_functiondef('public.cotironda_piloto_v2_d016_prepare_whapi_link_private(text,text,uuid,text,text)'::regprocedure)) IS DISTINCT FROM 'bc89fbc7b39ef49b35287dda66049258' THEN
  RAISE EXCEPTION 'D016 cardinality baseline changed; abort';
 END IF;
END $guard$;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_v2_d016_prepare_whapi_link_private(p_chat_hmac text, p_event_hmac text, p_request_id uuid, p_mode text, p_ticket_hmac text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  
 AND (event.received_at>v_now-interval '10 minutes' OR
 (p_mode='auto' AND p_request_id IS NOT NULL AND EXISTS (
  SELECT 1 FROM cotironda_piloto_privado.requests original
  JOIN cotironda_piloto_privado.v2_business_policy active
   ON active.singleton AND active.enabled
    AND active.activated_at IS NOT NULL
    AND original.created_at>=active.activated_at
  WHERE original.id=p_request_id
    AND original.buyer_key=buyer.key
    AND original.source_hmac=p_event_hmac
    AND event.request_id=original.id
    AND original.state='prepared'
    AND original.closes_at>v_now
    AND EXISTS (
      SELECT 1 FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 j
      JOIN cotironda_piloto_privado.invitations i ON i.request_id=j.request_id AND i.supplier_key=j.supplier_key
      WHERE j.request_id=original.id AND i.state='prepared'
        AND j.state='api_accepted' AND j.whapi_message_id IS NOT NULL
    )
    AND NOT EXISTS (
      SELECT 1 FROM cotironda_piloto_privado.invitations i
      WHERE i.request_id=original.id AND i.state='prepared'
        AND NOT EXISTS (SELECT 1 FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 j
          WHERE j.request_id=i.request_id AND j.supplier_key=i.supplier_key)
    )
    AND NOT EXISTS (
      SELECT 1 FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 j
      WHERE j.request_id=original.id
        AND NOT EXISTS (SELECT 1 FROM cotironda_piloto_privado.invitations i
          WHERE i.request_id=j.request_id AND i.supplier_key=j.supplier_key AND i.state='prepared')
    )
  )
 ))

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
 JOIN cotironda_piloto_privado.v2_business_policy policy
  ON policy.singleton=true AND policy.enabled=true
  AND policy.activated_at IS NOT NULL
  AND r.created_at>=policy.activated_at
 WHERE r.buyer_key=v_buyer AND r.state IN ('prepared','closed')
  AND EXISTS (
     SELECT 1 FROM cotironda_piloto_privado.v2_business_policy business
     WHERE business.singleton=true AND business.enabled=true
      AND business.activated_at IS NOT NULL
      AND r.created_at>=business.activated_at
    )
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
END $function$;

REVOKE ALL ON FUNCTION public.cotironda_piloto_v2_d016_prepare_whapi_link_private(text,text,uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_v2_d016_prepare_whapi_link_private(text,text,uuid,text,text) TO service_role;
