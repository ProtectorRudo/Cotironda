-- Cotironda V2 / MVP308 — candidato de ALTA ÚNICA INFORMADA, NO DESPLEGAR SIN «Publicalo».
-- Una aceptación de términos V2 para TODAS las rondas FUTURAS, revocable.
-- NO convierte registros antiguos en permisos nuevos, NO quita RLS,
-- NO abre WhatsApp, no retrodata ni autoriza contactos del comprador.
-- Leer/mostrar la política V2 completa ANTES de emitir el código de alta.
-- Preserva cada prueba V1 existente y usa SHA del WhatsApp original.
DO $preflight$
DECLARE d text;
BEGIN
 SELECT md5(pg_get_functiondef(p.oid)) INTO d FROM pg_proc p
 JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='cotironda_piloto_enroll_terms_mvp308';
 IF d IS DISTINCT FROM 'fdd6dd7e67817ac43b1fb88ce19666a5'
 THEN RAISE EXCEPTION 'v2_enrollment_source_changed'; END IF;
 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.enrollment_policies_mvp308
           WHERE version=2)
 THEN RAISE EXCEPTION 'v2_enrollment_already_configured';END IF;
END $preflight$;
ALTER TABLE cotironda_piloto_privado.enrollment_policies_mvp308
 DROP CONSTRAINT enrollment_policies_mvp308_version_check;
ALTER TABLE cotironda_piloto_privado.enrollment_policies_mvp308
 ADD CONSTRAINT enrollment_policies_mvp308_version_check CHECK (version IN (1,2));
ALTER TABLE cotironda_piloto_privado.enrollment_terms_proof_mvp308
 DROP CONSTRAINT enrollment_terms_proof_mvp308_policy_version_check;
ALTER TABLE cotironda_piloto_privado.enrollment_terms_proof_mvp308
 ADD CONSTRAINT enrollment_terms_proof_mvp308_policy_version_check CHECK (policy_version IN (1,2));
INSERT INTO cotironda_piloto_privado.enrollment_policies_mvp308(role,version,policy_text)
 VALUES
 ('buyer',2,'Al darme de alta en Cotironda como comprador mediante un único mensaje de aceptación, autorizo el tratamiento y análisis por IA de los pedidos, imágenes y documentos que envíe; la distribución de sus materiales a proveedores con catálogos técnicos y zona coincidentes; la recepción, almacenamiento privado y análisis de presupuestos; y su visualización en mi historial privado. No deberé confirmar cada cotización ni cada etapa rutinaria. Mi teléfono e identidad personal no se revelarán automáticamente a comercios. Puedo pedir la baja y ejercer mis derechos sobre los datos.'),
 ('supplier',2,'Al darme de alta en Cotironda como proveedor mediante el único mensaje COTI ALTA con CONTACTOS SI, acepto recibir pedidos de materiales por WhatsApp, que mi catálogo y mis respuestas se interpreten mediante IA, y que cuando responda a una ronda se muestre EXCLUSIVAMENTE al comprador destinatario mi nombre comercial y mi presupuesto ORIGINAL íntegro e identificado, junto al análisis orientativo. No se muestran al comprador proveedores que no respondieron ni se publican mis presupuestos en Internet. Mi aceptación cubre las próximas rondas sin pedir confirmación por presupuesto. Mi contacto comercial podrá mostrarse al comprador según las condiciones informadas. Puedo revocar el consentimiento, pedir la baja y solicitar información sobre el tratamiento de mis datos; la revocación se verifica antes de cada acceso.');
CREATE OR REPLACE FUNCTION public.cotironda_piloto_enroll_terms_mvp308(p_role text, p_code text, p_chat_hmac text, p_message_hmac text, p_nonce_b64 text, p_ciphertext_b64 text, p_plaintext_sha256 text, p_source_unix bigint, p_contact_sha256 text, p_contact_nonce_b64 text, p_contact_ciphertext_b64 text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_participant text;v_policy text;v_expected text;
 v_status jsonb;v_bound jsonb;v_original text;v_version smallint:=2;
BEGIN
 IF p_role NOT IN ('buyer','supplier')
 OR p_code IS NULL OR p_code !~ '^[a-f0-9]{32}$'
 OR p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$'
 OR p_message_hmac IS NULL OR p_message_hmac !~ '^[a-f0-9]{64}$'
 OR p_nonce_b64 IS NULL OR p_nonce_b64 !~ '^[A-Za-z0-9+/]{16}$'
 OR p_ciphertext_b64 IS NULL OR length(p_ciphertext_b64) NOT BETWEEN 24 AND 20000
 OR p_ciphertext_b64 !~ '^[A-Za-z0-9+/=]+$'
 OR p_plaintext_sha256 IS NULL OR p_plaintext_sha256 !~ '^[a-f0-9]{64}$'
 OR p_source_unix IS NULL OR
   abs(p_source_unix-extract(epoch FROM clock_timestamp())::bigint)>300
 OR p_contact_sha256 IS NULL OR p_contact_sha256 !~ '^[a-f0-9]{64}$'
 OR p_contact_nonce_b64 IS NULL OR length(p_contact_nonce_b64) NOT BETWEEN 16 AND 40
 OR p_contact_ciphertext_b64 IS NULL OR
  length(p_contact_ciphertext_b64) NOT BETWEEN 32 AND 300
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 v_original:='COTI ALTA '||p_code||
  CASE WHEN p_role='supplier' THEN ' CONTACTOS SI' ELSE ' ACEPTO' END;
 v_expected:=encode(sha256(convert_to(v_original,'UTF8')),'hex');
 IF p_plaintext_sha256<>v_expected
 THEN RETURN jsonb_build_object('state','invalid_phrase');END IF;
 IF NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.integration_flags
  WHERE only_row AND whatsapp_inbound_enabled)
 THEN RETURN jsonb_build_object('state','inbound_disabled');END IF;
 -- Reentrega exacta del mismo mensaje WhatsApp: sin permisos nuevos.
 IF EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.enrollment_terms_proof_mvp308 proof
  JOIN cotironda_piloto_privado.participants p ON p.key=proof.participant_key
  JOIN cotironda_piloto_privado.whapi_inbox m
   ON m.message_hmac=proof.message_hmac
   AND m.participant_key=p.key AND m.chat_hmac=p.chat_hmac
  WHERE proof.message_hmac=p_message_hmac AND proof.role=p_role
   AND proof.original_sha256=v_expected AND m.plaintext_sha256=v_expected
   AND p.chat_hmac=p_chat_hmac AND p.consent_at IS NOT NULL
   AND p.opted_out_at IS NULL
 ) THEN RETURN jsonb_build_object('state','already_enrolled');END IF;
 SELECT ep.policy_text INTO v_policy
 FROM cotironda_piloto_privado.enrollment_policies_mvp308 ep
 WHERE ep.role=p_role AND ep.version=v_version;
 IF v_policy IS NULL
 THEN RETURN jsonb_build_object('state','missing_policy');END IF;
 SELECT ec.participant_key INTO v_participant
 FROM cotironda_piloto_privado.enrollment_codes ec
 JOIN cotironda_piloto_privado.participants p ON p.key=ec.participant_key
 WHERE ec.code_hash=encode(sha256(convert_to(p_code,'UTF8')),'hex')
  AND ec.consumed_at IS NULL AND ec.expires_at>clock_timestamp()
  AND p.participant_role=p_role AND p.chat_hmac IS NULL
  AND p.opted_out_at IS NULL
 FOR UPDATE OF ec;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','code_or_role_not_valid');END IF;
 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.whapi_inbox
  WHERE message_hmac=p_message_hmac)
 THEN RETURN jsonb_build_object('state','duplicate');END IF;
 IF p_role='supplier' THEN
  -- MVP307 registra de forma atómica el contacto comercial y consentimiento.
  v_status:=public.cotironda_piloto_supplier_enroll_contacts_mvp307(
   p_code,p_chat_hmac,p_message_hmac,p_nonce_b64,p_ciphertext_b64,
   p_plaintext_sha256,p_source_unix,p_contact_sha256,
   p_contact_nonce_b64,p_contact_ciphertext_b64);
  IF v_status->>'state'<>'enrolled_with_contact'
    OR v_status->>'supplier' IS DISTINCT FROM v_participant
  THEN RAISE EXCEPTION 'mvp308_supplier_signup_rollback' USING ERRCODE='23514';END IF;
 ELSE
  v_status:=public.cotironda_piloto_enroll_whapi_v1(p_code,p_chat_hmac);
  IF v_status->>'state'<>'enrolled'
   OR v_status->>'participant' IS DISTINCT FROM v_participant
  THEN RAISE EXCEPTION 'mvp308_buyer_signup_rollback' USING ERRCODE='23514';END IF;
  INSERT INTO cotironda_piloto_privado.whapi_inbox(
   message_hmac,chat_hmac,participant_key,kind,nonce_b64,ciphertext_b64,
   plaintext_sha256,source_unix,processing_state
  ) VALUES(p_message_hmac,p_chat_hmac,v_participant,'text',
   p_nonce_b64,p_ciphertext_b64,p_plaintext_sha256,p_source_unix,'needs_review');
  -- El teléfono del comprador se almacena cifrado únicamente para
  -- responder a su WhatsApp. NO se concede publicación a proveedores.
  v_bound:=public.cotironda_piloto_bind_contact_mvp109(
   p_message_hmac,p_chat_hmac,p_contact_sha256,
   p_contact_nonce_b64,p_contact_ciphertext_b64);
  IF v_bound->>'state' NOT IN ('bound','already_bound')
  THEN RAISE EXCEPTION 'mvp308_buyer_contact_rollback' USING ERRCODE='23514';END IF;
 END IF;
 -- La única aceptación de términos V2 al ALTA también autoriza
 -- los originales IDENTIFICADOS sólo al comprador que reciba la oferta.
 -- Reutilizar siempre el mensaje WHAPI AUTENTICADO con la política V2.
 -- No inferir permiso de contactos, alta genérica ni cotización posterior.
 IF p_role='supplier' THEN
  INSERT INTO cotironda_piloto_privado.v2_supplier_original_consents(
   supplier_key,consent_message_hmac,version,accepted_at
  )
  SELECT v_participant,m.message_hmac,'cotironda-originales-v2',m.received_at
  FROM cotironda_piloto_privado.whapi_inbox m
  WHERE m.message_hmac=p_message_hmac
   AND m.chat_hmac=p_chat_hmac
   AND m.participant_key=v_participant
   AND m.kind='text'
   AND m.plaintext_sha256=v_expected;
  IF NOT FOUND THEN
   RAISE EXCEPTION 'mvp308_v2_original_enrollment_evidence_missing'
    USING ERRCODE='23514';
  END IF;
 END IF;
 INSERT INTO cotironda_piloto_privado.enrollment_terms_proof_mvp308(
  participant_key,role,policy_version,policy_sha256,message_hmac,original_sha256
 ) VALUES(v_participant,p_role,v_version,
  encode(sha256(convert_to(v_policy,'UTF8')),'hex'),
  p_message_hmac,p_plaintext_sha256);
 RETURN jsonb_build_object('state','enrolled_with_terms',
  'role',p_role,'policy_version',v_version);
END $function$;

-- No GRANT ni cambio de ACL. Los términos V1 y consentimientos históricos
-- se conservan; su alcance NO se amplía retroactivamente.
