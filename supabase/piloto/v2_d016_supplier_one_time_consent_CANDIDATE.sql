-- Cotironda V2 D016 / #838. Consentimiento de originales UNA sola vez
-- por proveedor, enlazado al WhatsApp de alta y a términos aprobados.
-- CANDIDATO: política legal OFF, ninguna aceptación retroactiva o inferida.
-- No envía mensajes ni abre originales/negocio/cierre.

-- Activación manual únicamente después de que exista texto legal V2
-- aprobado. Guardar SHA del cuerpo COMPLETO, no una frase genérica.
CREATE TABLE cotironda_piloto_privado.v2_d016_supplier_terms_policy (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 enabled boolean NOT NULL DEFAULT false,
 terms_version text NOT NULL DEFAULT 'cotironda-originales-v2'
  CHECK(terms_version='cotironda-originales-v2'),
 body_sha256 text,
 approved_at timestamptz,
 approval_reference text,
 CHECK(NOT enabled OR (
  body_sha256 ~ '^[a-f0-9]{64}$' AND approved_at IS NOT NULL
  AND approval_reference IS NOT NULL
  AND length(btrim(approval_reference)) BETWEEN 12 AND 250
 ))
);
ALTER TABLE cotironda_piloto_privado.v2_d016_supplier_terms_policy
 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.v2_d016_supplier_terms_policy
 FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO cotironda_piloto_privado.v2_d016_supplier_terms_policy
(singleton,enabled) VALUES(true,false);

-- Constancia del único envío con condiciones de alta (puede acompañar
-- al mensaje inicial; NO requiere un WhatsApp por presupuesto).
-- Nunca registrar "enviado" antes de recibir el ID real de Whapi.
CREATE TABLE cotironda_piloto_privado.v2_d016_supplier_terms_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 supplier_key text NOT NULL REFERENCES
  cotironda_piloto_privado.participants(key),
 chat_hmac text NOT NULL CHECK(chat_hmac ~ '^[a-f0-9]{64}$'),
 terms_version text NOT NULL
  CHECK(terms_version='cotironda-originales-v2'),
 body_sha256 text NOT NULL CHECK(body_sha256 ~ '^[a-f0-9]{64}$'),
 whapi_message_id text NOT NULL UNIQUE
  CHECK(whapi_message_id ~ '^[A-Za-z0-9._:-]{8,160}$'),
 api_accepted_at timestamptz NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX v2_d016_terms_deliveries_supplier
 ON cotironda_piloto_privado.v2_d016_supplier_terms_deliveries
 (supplier_key,api_accepted_at DESC);
ALTER TABLE cotironda_piloto_privado.v2_d016_supplier_terms_deliveries
 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.v2_d016_supplier_terms_deliveries
 FROM PUBLIC,anon,authenticated,service_role;

-- Esta RPC se llama sólo DESPUÉS de que Whapi devuelve aceptación real
-- del envío de condiciones aprobadas. No acepta el nombre o teléfono
-- del destinatario desde un navegador. Nunca crea consentimiento.
CREATE FUNCTION public.cotironda_piloto_v2_d016_record_terms_delivery_private(
 p_supplier_key text,p_chat_hmac text,p_body_sha256 text,
 p_whapi_message_id text,p_api_accepted_at timestamptz
) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER
 SET search_path TO '' AS $fn$
DECLARE v_created integer;
BEGIN
 IF p_supplier_key IS NULL OR p_chat_hmac IS NULL
 OR p_chat_hmac !~ '^[a-f0-9]{64}$'
 OR p_body_sha256 IS NULL OR p_body_sha256 !~ '^[a-f0-9]{64}$'
 OR p_whapi_message_id IS NULL
 OR p_whapi_message_id !~ '^[A-Za-z0-9._:-]{8,160}$'
 OR p_api_accepted_at IS NULL OR p_api_accepted_at>clock_timestamp()
 THEN RETURN false;END IF;
 INSERT INTO cotironda_piloto_privado.v2_d016_supplier_terms_deliveries
 (supplier_key,chat_hmac,terms_version,body_sha256,
  whapi_message_id,api_accepted_at)
 SELECT s.key,s.chat_hmac,terms.terms_version,terms.body_sha256,
        p_whapi_message_id,p_api_accepted_at
 FROM cotironda_piloto_privado.participants s
 JOIN cotironda_piloto_privado.v2_d016_supplier_terms_policy terms
  ON terms.singleton=true AND terms.enabled=true
  AND terms.body_sha256=p_body_sha256
  AND terms.approved_at IS NOT NULL
  AND terms.approved_at<=p_api_accepted_at
 JOIN cotironda_piloto_privado.v2_original_share_policy share
  ON share.singleton=true AND share.enabled=true
  AND share.activated_at IS NOT NULL
  AND share.activated_at<=p_api_accepted_at
 WHERE s.key=p_supplier_key AND s.chat_hmac=p_chat_hmac
  AND s.participant_role='supplier'
  AND s.consent_at IS NOT NULL AND s.consent_at<=p_api_accepted_at
  AND s.opted_out_at IS NULL
 ON CONFLICT (whapi_message_id) DO NOTHING;
 GET DIAGNOSTICS v_created=ROW_COUNT;
 RETURN v_created=1;
END $fn$;
REVOKE ALL ON FUNCTION
 public.cotironda_piloto_v2_d016_record_terms_delivery_private(text,text,text,text,timestamptz)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_v2_d016_record_terms_delivery_private(text,text,text,text,timestamptz)
 TO service_role;

-- Una respuesta explícita única. No es "cotizar" ni silencio: debe
-- ser texto exacto de WhatsApp archivado, posterior al envío de términos
-- aprobados. No acepta el texto ni el nombre del proveedor como input.
CREATE FUNCTION public.cotironda_piloto_v2_d016_register_terms_acceptance_private(
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
REVOKE ALL ON FUNCTION
 public.cotironda_piloto_v2_d016_register_terms_acceptance_private(text,text)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_v2_d016_register_terms_acceptance_private(text,text)
 TO service_role;
