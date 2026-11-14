-- Cotironda D016 P0. Guard prospectivo: tras NO COMPARTIR,
-- reconsentir requiere entrega de términos aprobados POSTERIOR a baja global.
-- Mismo contrato y firma de la RPC #846, sin cambiar alta ni otros objetos.
-- No genera consentimientos, mensajes, flags ni efectos retroactivos.

CREATE OR REPLACE FUNCTION public.cotironda_piloto_v2_d016_register_terms_acceptance_private(
 p_message_hmac text,p_chat_hmac text
) RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER
 SET search_path TO '' AS $fn$
DECLARE v_src record;v_count integer;
BEGIN
 IF p_message_hmac IS NULL OR p_message_hmac !~ '^[a-f0-9]{64}$'
 OR p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$'
 THEN RETURN 'denied';END IF;

 SELECT inbox.message_hmac,inbox.received_at,
        supplier.key AS supplier_key
 INTO v_src
 FROM cotironda_piloto_privado.whapi_inbox inbox
 JOIN cotironda_piloto_privado.participants supplier
  ON supplier.key=inbox.participant_key
  AND supplier.chat_hmac=inbox.chat_hmac
  AND supplier.participant_role='supplier'
  AND supplier.consent_at IS NOT NULL
  AND supplier.opted_out_at IS NULL
 JOIN cotironda_piloto_privado.v2_d016_supplier_terms_policy terms
  ON terms.singleton=true AND terms.enabled=true
  AND terms.approved_at IS NOT NULL
  AND terms.body_sha256 ~ '^[a-f0-9]{64}$'
 JOIN cotironda_piloto_privado.v2_original_share_policy share
  ON share.singleton=true AND share.enabled=true
  AND share.activated_at IS NOT NULL
  AND share.activated_at<=inbox.received_at
 WHERE inbox.message_hmac=p_message_hmac AND inbox.chat_hmac=p_chat_hmac
  AND inbox.kind='text'
  AND inbox.received_at<=clock_timestamp()
  AND inbox.received_at>=terms.approved_at
  AND inbox.plaintext_sha256=
   encode(pg_catalog.sha256(pg_catalog.convert_to(
    'ACEPTO COTIRONDA ORIGINALES V2','UTF8')),'hex')
  AND EXISTS(
   SELECT 1 FROM cotironda_piloto_privado.v2_d016_supplier_terms_deliveries notice
   WHERE notice.supplier_key=supplier.key
    AND notice.chat_hmac=inbox.chat_hmac
    AND notice.terms_version=terms.terms_version
    AND notice.body_sha256=terms.body_sha256
    AND notice.api_accepted_at>=share.activated_at
    AND notice.api_accepted_at>=terms.approved_at
    AND notice.api_accepted_at<inbox.received_at
    -- Una baja posterior al aviso invalida ESE aviso para reaceptar:
    -- incluso si un nuevo texto de aceptación llegó después de la baja.
    -- Exigir un nuevo envío Whapi auténtico, aceptado DESPUÉS de la baja.
    AND NOT EXISTS(
     SELECT 1 FROM cotironda_piloto_privado.v2_d016_supplier_original_optout_events prior_optout
     WHERE prior_optout.supplier_key=supplier.key
      AND prior_optout.received_at>=notice.api_accepted_at
    )
  )
  AND NOT EXISTS(
   SELECT 1 FROM cotironda_piloto_privado.v2_d016_supplier_original_optout_events optout
   WHERE optout.supplier_key=supplier.key
    AND optout.received_at>=inbox.received_at
  )
 FOR UPDATE OF supplier;
 IF NOT FOUND THEN RETURN 'denied';END IF;

 INSERT INTO cotironda_piloto_privado.v2_supplier_original_consents
 (supplier_key,consent_message_hmac,version,accepted_at,revoked_at)
 VALUES(v_src.supplier_key,v_src.message_hmac,'cotironda-originales-v2',
        v_src.received_at,NULL)
 ON CONFLICT (supplier_key) DO UPDATE
 SET consent_message_hmac=EXCLUDED.consent_message_hmac,
     accepted_at=EXCLUDED.accepted_at,revoked_at=NULL
 WHERE cotironda_piloto_privado.v2_supplier_original_consents.revoked_at IS NOT NULL
  AND EXCLUDED.accepted_at>
      cotironda_piloto_privado.v2_supplier_original_consents.revoked_at
  AND EXCLUDED.accepted_at>
      cotironda_piloto_privado.v2_supplier_original_consents.accepted_at;
 GET DIAGNOSTICS v_count=ROW_COUNT;
 RETURN CASE WHEN v_count=1 THEN 'recorded' ELSE 'unchanged' END;
END $fn$;

REVOKE ALL ON FUNCTION public.cotironda_piloto_v2_d016_register_terms_acceptance_private(text,text)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_v2_d016_register_terms_acceptance_private(text,text)
 TO service_role;
