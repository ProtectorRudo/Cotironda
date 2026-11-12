-- Cotironda V2-03a · catalogo privado de RESPONDEDORES reales.
-- CANDIDATO, NO INSTALAR sin "Publicalo". No reemplaza MVP192/MVP161.
-- No incluye bytes, links, HMAC, storage path, montos ni invitados pendientes.
-- Regla de seguridad: SOLO buyer Auth vivo + pertenencia de WhatsApp verificada,
-- consentimiento V2 prospectivo documentado, fuente original SHA y enlace
-- de pedido confiable. No espera analisis de precios ni cierre de ronda.
--
-- Kill switch persistente OFF. Solo procedimiento futuro autorizado puede
-- activar despues de consentimiento informado de los proveedores.
CREATE TABLE IF NOT EXISTS cotironda_piloto_privado.v2_original_share_policy (
 singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
 enabled boolean NOT NULL DEFAULT false,
 activated_at timestamptz,
 CHECK (NOT enabled OR activated_at IS NOT NULL)
);
ALTER TABLE cotironda_piloto_privado.v2_original_share_policy ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.v2_original_share_policy
 FROM PUBLIC,anon,authenticated;
GRANT SELECT ON cotironda_piloto_privado.v2_original_share_policy TO service_role;
INSERT INTO cotironda_piloto_privado.v2_original_share_policy(singleton,enabled)
 VALUES (true,false) ON CONFLICT (singleton) DO NOTHING;

-- Alta con consentimiento informado V2, UNA SOLA VEZ por proveedor.
-- NO copiar consentimientos v1 "tras cierre" o opt-in WhatsApp generico.
-- Nunca insertar consentimiento por inferencia, fecha o actividad previa.
CREATE TABLE IF NOT EXISTS cotironda_piloto_privado.v2_supplier_original_consents (
 supplier_key text PRIMARY KEY REFERENCES cotironda_piloto_privado.participants(key),
 consent_message_hmac text NOT NULL REFERENCES cotironda_piloto_privado.whapi_inbox(message_hmac),
 version text NOT NULL CHECK (version='cotironda-originales-v2'),
 accepted_at timestamptz NOT NULL,
 revoked_at timestamptz,
 CHECK (revoked_at IS NULL OR revoked_at>=accepted_at)
);
ALTER TABLE cotironda_piloto_privado.v2_supplier_original_consents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.v2_supplier_original_consents
 FROM PUBLIC,anon,authenticated;
GRANT SELECT ON cotironda_piloto_privado.v2_supplier_original_consents TO service_role;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_v2_responders_private(
 p_request_id uuid,p_auth_user_id uuid,p_auth_session_id uuid
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $v2$
DECLARE
 v_now timestamptz:=clock_timestamp();
 v_buyer text;
 v_activation timestamptz;
 v_docs jsonb:='[]'::jsonb;
 v_rec record;
 v_hex text;
 v_doc uuid;
 v_total integer:=0;
BEGIN
 IF p_request_id IS NULL OR p_auth_user_id IS NULL OR p_auth_session_id IS NULL
 THEN RETURN NULL;END IF;

 -- Identidad solo de usuario autenticado, sesion VIVA y misma empresa.
 -- Inputs de sesion/usuario se toman del JWT validado por el servidor,
 -- NUNCA de un request del navegador. Esta funcion revalida en BD.
 SELECT buyer.key,policy.activated_at
 INTO v_buyer,v_activation
 FROM auth.users u
 JOIN auth.sessions s ON s.id=p_auth_session_id AND s.user_id=u.id
 JOIN cotironda_piloto_privado.requests r
  ON r.id=p_request_id AND r.state IN ('prepared','closed')
 JOIN cotironda_piloto_privado.v2_original_share_policy policy
  ON policy.singleton=true AND policy.enabled=true
  AND policy.activated_at IS NOT NULL
  AND r.created_at>=policy.activated_at
 JOIN cotironda_piloto_privado.participants buyer
  ON buyer.key=r.buyer_key AND buyer.participant_role='buyer'
  AND buyer.consent_at IS NOT NULL AND buyer.opted_out_at IS NULL
 JOIN cotironda_piloto_privado.participant_channels_mvp109 channel
  ON channel.participant_key=buyer.key AND channel.chat_hmac=buyer.chat_hmac
 JOIN cotironda_piloto_privado.whapi_inbox proof
  ON proof.message_hmac=channel.authenticated_message_hmac
  AND proof.participant_key=buyer.key AND proof.chat_hmac=buyer.chat_hmac
 WHERE u.id=p_auth_user_id
 AND u.deleted_at IS NULL
 AND (u.banned_until IS NULL OR u.banned_until<=v_now)
 AND u.is_anonymous=false AND u.phone_confirmed_at IS NOT NULL
 AND u.phone ~ '^[+]?[1-9][0-9]{7,15}$'
 AND channel.contact_sha256=encode(extensions.digest(
   convert_to(regexp_replace(u.phone,'^[+]','','')||
   '@s.whatsapp.net','UTF8'),'sha256'),'hex')
 AND (s.not_after IS NULL OR s.not_after>v_now)
 AND NOT EXISTS (
   SELECT 1 FROM cotironda_piloto_privado.participant_channels_mvp109 x
   JOIN cotironda_piloto_privado.participants p2
    ON p2.key=x.participant_key
   WHERE x.contact_sha256=channel.contact_sha256
    AND x.participant_key<>buyer.key
    AND p2.participant_role='buyer' AND p2.opted_out_at IS NULL
 )
 LIMIT 1;
 IF v_buyer IS NULL THEN RETURN NULL; END IF;

 FOR v_rec IN
  SELECT DISTINCT ON (a.message_hmac)
   a.message_hmac,a.content_sha256,a.mime,a.kind,
   supplier.display_label,source.received_at
  FROM cotironda_piloto_privado.ai_supplier_links_mvp225 link
  JOIN cotironda_piloto_privado.requests r
   ON r.id=link.request_id AND r.buyer_key=v_buyer
   AND r.state IN ('prepared','closed')
  JOIN cotironda_piloto_privado.media_archive_mvp095 a
   ON a.message_hmac=link.message_hmac
   AND a.request_id=link.request_id
   AND a.participant_key=link.supplier_key
   AND a.content_sha256=link.source_sha256
   AND a.state='stored' AND a.finished_at IS NOT NULL
   AND a.storage_path='media/'||a.message_hmac
   AND a.size_bytes BETWEEN 1 AND 8388608
   AND a.mime IN (
     'application/pdf','image/jpeg','image/png','image/webp',
     'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
     'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
     'application/msword','application/vnd.ms-excel','text/plain','text/csv')
  JOIN cotironda_piloto_privado.whapi_inbox source
   ON source.message_hmac=a.message_hmac
   AND source.request_id=link.request_id
   AND source.participant_key=link.supplier_key
   AND source.chat_hmac=a.chat_hmac
   AND source.kind=a.kind
  JOIN cotironda_piloto_privado.participants supplier
   ON supplier.key=link.supplier_key
   AND supplier.chat_hmac=source.chat_hmac
   AND supplier.participant_role='supplier'
   AND supplier.consent_at IS NOT NULL
   AND supplier.opted_out_at IS NULL
   AND length(btrim(supplier.display_label)) BETWEEN 3 AND 100
  JOIN cotironda_piloto_privado.invitations inv
   ON inv.request_id=r.id AND inv.supplier_key=supplier.key
   AND inv.state='prepared'
   AND inv.created_at<=source.received_at
  JOIN cotironda_piloto_privado.ai_dispatch_jobs_mvp222 dispatch
   ON dispatch.request_id=r.id AND dispatch.supplier_key=supplier.key
   AND dispatch.state='api_accepted' AND dispatch.whapi_message_id IS NOT NULL
   AND dispatch.finished_at<=source.received_at
   AND dispatch.finished_at>=inv.created_at
  JOIN cotironda_piloto_privado.v2_supplier_original_consents c
   ON c.supplier_key=supplier.key
   AND c.version='cotironda-originales-v2'
   AND c.revoked_at IS NULL
   AND c.accepted_at>=v_activation
   AND c.accepted_at<=inv.created_at
  JOIN cotironda_piloto_privado.whapi_inbox consent_msg
   ON consent_msg.message_hmac=c.consent_message_hmac
   AND consent_msg.participant_key=supplier.key
   AND consent_msg.chat_hmac=supplier.chat_hmac
   AND consent_msg.kind='text'
   AND consent_msg.received_at=c.accepted_at
  WHERE link.request_id=p_request_id
   AND link.kind IN ('document','image')
   AND link.association IN ('quoted_whapi_id','single_active_round')
   AND link.status='awaiting_semantic_review'
   AND link.source_sha256 ~ '^[a-f0-9]{64}$'
   AND a.content_sha256 ~ '^[a-f0-9]{64}$'
   AND source.received_at>=r.created_at
   AND source.received_at<=r.closes_at
   AND source.received_at<=v_now
   AND supplier.consent_at<=dispatch.finished_at
   AND NOT EXISTS (
    SELECT 1 FROM cotironda_piloto_privado.ai_supplier_unresolved_mvp237 bad
    WHERE bad.message_hmac=link.message_hmac
      AND bad.state IN ('ambiguous_round','media_context_conflict')
   )
  ORDER BY a.message_hmac
 LOOP
  v_total:=v_total+1;
  IF v_total>100 THEN RETURN NULL; END IF;
  -- Identificador opaco estable: NO expone HMAC, ruta ni contactos.
  v_hex:=encode(extensions.digest(convert_to(
   'cotironda-v2-original|'||p_request_id::text||'|'||v_rec.message_hmac,
   'UTF8'),'sha256'),'hex');
  v_doc:=(substr(v_hex,1,8)||'-'||substr(v_hex,9,4)||'-4'||
   substr(v_hex,14,3)||'-a'||substr(v_hex,18,3)||'-'||
   substr(v_hex,21,12))::uuid;
  v_docs:=v_docs||jsonb_build_array(jsonb_build_object(
   'documentId',v_doc::text,
   'supplierName',btrim(v_rec.display_label),
   'mime',v_rec.mime,'kind',v_rec.kind,
   'receivedAt',(extract(epoch from v_rec.received_at)*1000)::bigint
  ));
 END LOOP;
 RETURN jsonb_build_object(
  'state','authorized_responders_v2','buyerKey',v_buyer,
  'total',v_total,'originals',v_docs);
END;
$v2$;

-- Funcion privilegiada visible en public SOLO por el servidor.
REVOKE ALL ON FUNCTION
 public.cotironda_piloto_v2_responders_private(uuid,uuid,uuid)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_v2_responders_private(uuid,uuid,uuid)
 TO service_role;
