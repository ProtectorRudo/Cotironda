-- D016. CANDIDATO, NO PUBLICAR SIN «PUBLICALO».
-- Enlace automático al comprador DESPUÉS de 2 mensajes Whapi aceptados.
-- Reutiliza emisión D016, sesión, TTL 10 min y deduplicación existentes.
-- Ninguna publicación de originales ni cambio de política de proveedores.
DO $d016$
DECLARE before_sql text;after_sql text;
 old_clause CONSTANT text:='AND event.received_at>v_now-interval ''10 minutes''';
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO STRICT before_sql FROM pg_proc p
 JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='cotironda_piloto_v2_d016_prepare_whapi_link_private';
 IF md5(before_sql)<>'fca92e7b076bd74c14a25ccafe60427d'
 OR length(before_sql)-length(replace(before_sql,old_clause,''))<>length(old_clause)
 THEN RAISE EXCEPTION 'd016_auto_link_function_version_changed';END IF;
 after_sql:=replace(before_sql,old_clause,$condition$
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
    AND (SELECT count(*) FROM cotironda_piloto_privado.invitations i
     WHERE i.request_id=original.id AND i.state='prepared')=2
    AND (SELECT count(*) FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 j
     WHERE j.request_id=original.id)=2
    AND (SELECT count(*) FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 j
     WHERE j.request_id=original.id AND j.state='api_accepted'
       AND j.whapi_message_id IS NOT NULL)=2
  )
 ))
$condition$);
 EXECUTE after_sql;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='cotironda_piloto_v2_d016_prepare_whapi_link_private'
   AND (has_function_privilege('anon',p.oid,'EXECUTE')
     OR has_function_privilege('authenticated',p.oid,'EXECUTE')
     OR NOT has_function_privilege('service_role',p.oid,'EXECUTE')))
 THEN RAISE EXCEPTION 'd016_auto_link_acl_not_private';END IF;
END $d016$;

-- Sin destinatarios planos. Sólo devuelve envelope AES-GCM del canal REAL.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_v2_d016_auto_buyer_packet_private()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $packet$
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
   AND (SELECT count(*) FROM cotironda_piloto_privado.invitations i
     WHERE i.request_id=r.id AND i.state='prepared')=2
   AND (SELECT count(*) FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 j
     WHERE j.request_id=r.id)=2
   AND (SELECT count(*) FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 j
     WHERE j.request_id=r.id AND j.state='api_accepted'
       AND j.whapi_message_id IS NOT NULL)=2
   AND NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.v2_d016_whapi_link_deliveries prior
     WHERE prior.request_id=r.id)
 ORDER BY r.created_at,r.id LIMIT 1;
 IF v.request_id IS NULL THEN RETURN jsonb_build_object('state','empty');END IF;
 RETURN jsonb_build_object('state','ready','request_id',v.request_id::text,
  'event_hmac',v.event_hmac,'chat_hmac',v.chat_hmac,
  'contact_sha256',v.contact_sha256,'nonce_b64',v.nonce_b64,
  'ciphertext_b64',v.ciphertext_b64,'source','authenticated_whapi');
END $packet$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_v2_d016_auto_buyer_packet_private()
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_v2_d016_auto_buyer_packet_private()
 TO service_role;
