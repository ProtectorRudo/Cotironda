-- COTIRONDA V2 D016 CANDIDATO. NO PUBLICAR SIN «PUBLICALO».
-- Reutiliza constancia de consentimiento UNA vez para futuras rondas
-- del MISMO comprador y proveedor; se verifica prueba firmada y revocaciones.
-- No crea consentimientos, no comparte originales, no invita proveedores.
-- Preserva rama de consentimiento directo y no habilita rondas anteriores.
CREATE OR REPLACE FUNCTION cotironda_piloto_privado.v2_d016_effective_original_consent_private(p_supplier_key text, p_request_id uuid, p_chat_hmac text, p_invited_at timestamp with time zone)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
SELECT CASE WHEN EXISTS (
 SELECT 1 FROM cotironda_piloto_privado.participants p
 WHERE p.key=p_supplier_key AND p.chat_hmac=p_chat_hmac
  AND p.participant_role='supplier' AND p.consent_at<=p_invited_at AND p.opted_out_at IS NULL
) AND NOT EXISTS (
 SELECT 1 FROM cotironda_piloto_privado.v2_supplier_original_consents revoked
 WHERE revoked.supplier_key=p_supplier_key AND revoked.revoked_at IS NOT NULL
) AND NOT EXISTS(
 SELECT 1 FROM cotironda_piloto_privado.v2_d016_supplier_original_optout_events opt WHERE opt.supplier_key=p_supplier_key
) THEN COALESCE(
 (SELECT c.accepted_at
  FROM cotironda_piloto_privado.v2_supplier_original_consents c
  JOIN cotironda_piloto_privado.whapi_inbox msg ON msg.message_hmac=c.consent_message_hmac
   AND msg.participant_key=c.supplier_key AND msg.chat_hmac=p_chat_hmac
   AND msg.kind='text' AND msg.received_at=c.accepted_at
  JOIN cotironda_piloto_privado.v2_business_policy bp ON bp.singleton AND bp.enabled
  WHERE c.supplier_key=p_supplier_key AND c.version='cotironda-originales-v2'
   AND c.revoked_at IS NULL AND c.accepted_at>=bp.activated_at
   AND c.accepted_at<=p_invited_at LIMIT 1),
 -- La ratificación del responsable se registra HOY; no se retrodata.
 -- El campo consentAt del portal usa la fecha REAL del alta general del proveedor
 -- (participants.consent_at), anterior a la invitación. La autorización expresa
 -- de compartir originales se acredita por la constancia owner, separada e inmutable.
 -- Nunca se presenta el alta general como un WhatsApp de aceptación V2.
 -- Autoriza ÚNICAMENTE al mismo comprador que recibió la constancia
 -- posterior al alta, en rondas futuras. Sin extender a otros compradores.
 -- La aceptación directa por mensaje Whapi se conserva sin cambios.
 (SELECT p.consent_at FROM cotironda_piloto_privado.v2_d016_owner_original_attestations att
  JOIN cotironda_piloto_privado.participants p ON p.key=att.supplier_key
  JOIN cotironda_piloto_privado.requests att_round ON att_round.id=att.request_id
  JOIN cotironda_piloto_privado.requests current_round ON current_round.id=p_request_id
  WHERE att.supplier_key=p_supplier_key
   AND (att.request_id=p_request_id OR (
    att_round.buyer_key=current_round.buyer_key
    AND att_round.buyer_key IS NOT NULL
    AND att_round.created_at<=att.recorded_at
    AND current_round.created_at>att.recorded_at
    AND current_round.created_at>att_round.created_at
    AND current_round.state IN ('draft','prepared','closed')
    AND att.recorded_at<=p_invited_at
    AND att.attested_by='responsable_cotironda'
    AND att.evidence_kind='declaracion_responsable_en_conversacion'
    AND att.declaration_sha256 ~ '^[a-f0-9]{64}$'
    AND NOT EXISTS(
      SELECT 1 FROM cotironda_piloto_privado.v2_d016_original_notice_revocations rev
      WHERE rev.supplier_key=p_supplier_key
        AND rev.request_id IN (att.request_id,p_request_id)
    )
   ))
   AND p.chat_hmac=p_chat_hmac AND p.participant_role='supplier'
   AND p.consent_at IS NOT NULL AND p.consent_at<=p_invited_at
   AND p.opted_out_at IS NULL
   AND att.revoked_at IS NULL AND att.consent_scope='comprador_original_identificado_y_analisis_v2'
   AND att.recorded_at<=clock_timestamp() LIMIT 1)
) ELSE NULL END
$function$;
