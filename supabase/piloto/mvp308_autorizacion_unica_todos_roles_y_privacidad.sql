-- MVP308 · SOLO DESARROLLO: autorización informada por rol EN UN ÚNICO alta.
-- No se ejecuta en PILOTO ni modifica altas históricas.
-- Requiere MVP073, MVP109, MVP110, MVP307. Instalación controlada.
-- No hay "consentimiento para todo": finalidad clara y versión acreditada.

CREATE TABLE cotironda_piloto_privado.enrollment_policies_mvp308(
 role text NOT NULL CHECK(role IN ('buyer','supplier')),
 version smallint NOT NULL CHECK(version=1),
 policy_text text NOT NULL CHECK(length(policy_text) BETWEEN 100 AND 3000),
 PRIMARY KEY(role,version)
);
INSERT INTO cotironda_piloto_privado.enrollment_policies_mvp308
 (role,version,policy_text) VALUES
 ('buyer',1,
  'Al incorporarme a Cotironda como comprador autorizo el tratamiento de los pedidos y documentos que envíe, su interpretación mediante IA, consultas sobre datos imprescindibles, distribución de los materiales y cantidades depurados a proveedores por rubro y zona, recepción y análisis de sus ofertas, avisos y seguimiento de la ronda. No necesito confirmar cada pedido válido. Mis datos personales y de contacto no se revelarán automáticamente a proveedores. Puedo solicitar la baja y ejercer mis derechos sobre mis datos.'),
 ('supplier',1,
  'Al incorporarme a Cotironda como proveedor autorizo recibir solicitudes de cotización por WhatsApp, que mis catálogos y respuestas sean tratados por IA para verificar ofertas, y que mis presupuestos se muestren anónimos durante la ronda. Al cerrar, el comprador de esa ronda verá los nombres comerciales de TODOS los negocios invitados, incluso si no cotizaron, y mi nombre comercial y número de WhatsApp del negocio podrán mostrarse a ese comprador. No veré datos personales ni el teléfono del arquitecto. Puedo revocar la publicación de mi contacto comercial escribiendo COTI CONTACTOS NO, o darme de baja.');
ALTER TABLE cotironda_piloto_privado.enrollment_policies_mvp308
 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.enrollment_policies_mvp308
 FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER enrollment_policies_immutable_mvp308 BEFORE UPDATE OR DELETE
 ON cotironda_piloto_privado.enrollment_policies_mvp308
 FOR EACH ROW EXECUTE FUNCTION
 cotironda_piloto_privado.reject_supplier_line_mutation_mvp101();

CREATE TABLE cotironda_piloto_privado.enrollment_terms_proof_mvp308(
 participant_key text PRIMARY KEY REFERENCES cotironda_piloto_privado.participants(key),
 role text NOT NULL CHECK(role IN ('buyer','supplier')),
 policy_version smallint NOT NULL DEFAULT 1 CHECK(policy_version=1),
 policy_sha256 text NOT NULL CHECK(policy_sha256 ~ '^[a-f0-9]{64}$'),
 message_hmac text UNIQUE NOT NULL REFERENCES cotironda_piloto_privado.whapi_inbox(message_hmac),
 original_sha256 text NOT NULL CHECK(original_sha256 ~ '^[a-f0-9]{64}$'),
 accepted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(role,policy_version)
  REFERENCES cotironda_piloto_privado.enrollment_policies_mvp308(role,version)
);
ALTER TABLE cotironda_piloto_privado.enrollment_terms_proof_mvp308
 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.enrollment_terms_proof_mvp308
 FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER enrollment_terms_proof_immutable_mvp308 BEFORE UPDATE OR DELETE
 ON cotironda_piloto_privado.enrollment_terms_proof_mvp308
 FOR EACH ROW EXECUTE FUNCTION
 cotironda_piloto_privado.reject_supplier_line_mutation_mvp101();

-- El mismo evento autenticado acepta las condiciones generales y, SOLO
-- para el proveedor, la publicación de su WhatsApp comercial al cierre.
-- Si falla cualquier paso, se revierte toda la transacción (sin permisos parciales).
CREATE OR REPLACE FUNCTION public.cotironda_piloto_enroll_terms_mvp308(
 p_role text,p_code text,p_chat_hmac text,p_message_hmac text,
 p_nonce_b64 text,p_ciphertext_b64 text,p_plaintext_sha256 text,
 p_source_unix bigint,p_contact_sha256 text,
 p_contact_nonce_b64 text,p_contact_ciphertext_b64 text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $enroll$
DECLARE v_participant text;v_policy text;v_expected text;
 v_status jsonb;v_bound jsonb;v_original text;v_version smallint:=1;
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
 INSERT INTO cotironda_piloto_privado.enrollment_terms_proof_mvp308(
  participant_key,role,policy_version,policy_sha256,message_hmac,original_sha256
 ) VALUES(v_participant,p_role,v_version,
  encode(sha256(convert_to(v_policy,'UTF8')),'hex'),
  p_message_hmac,p_plaintext_sha256);
 RETURN jsonb_build_object('state','enrolled_with_terms',
  'role',p_role,'policy_version',v_version);
END $enroll$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_enroll_terms_mvp308(
 text,text,text,text,text,text,text,bigint,text,text,text)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_enroll_terms_mvp308(
 text,text,text,text,text,text,text,bigint,text,text,text) TO service_role;

-- Guardián de términos vigentes: no expone número ni mensajes.
CREATE OR REPLACE FUNCTION cotironda_piloto_privado.terminos_aceptados_mvp308(
 p_participant text
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $terms$
 SELECT EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.participants p
  JOIN cotironda_piloto_privado.enrollment_terms_proof_mvp308 proof
   ON proof.participant_key=p.key AND proof.role=p.participant_role
  JOIN cotironda_piloto_privado.enrollment_policies_mvp308 policy
   ON policy.role=proof.role AND policy.version=proof.policy_version
  JOIN cotironda_piloto_privado.whapi_inbox source
   ON source.message_hmac=proof.message_hmac
   AND source.participant_key=p.key AND source.chat_hmac=p.chat_hmac
   AND source.plaintext_sha256=proof.original_sha256
  WHERE p.key=p_participant AND p.consent_at IS NOT NULL
   AND p.opted_out_at IS NULL
   AND proof.policy_sha256=encode(
    sha256(convert_to(policy.policy_text,'UTF8')),'hex')
 );
$terms$;
REVOKE ALL ON FUNCTION
 cotironda_piloto_privado.terminos_aceptados_mvp308(text)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION
 cotironda_piloto_privado.terminos_aceptados_mvp308(text)
 TO service_role;

-- Política actual: nunca enviar el teléfono del arquitecto a los negocios.
-- La ronda nueva enseña contactos comerciales al COMPRADOR mediante MVP304.
-- Deshabilitar tres rutas VIEJAS de intercambio bilateral de finalistas.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_finalist_contacts_mvp109(
 p_request uuid
) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $no_buyer_contact$
 SELECT jsonb_build_object('state','buyer_contact_private');
$no_buyer_contact$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_finalist_contacts_mvp109(uuid)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_finalist_contacts_mvp109(uuid)
 TO service_role;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_queue_finalists_mvp110(
 p_request uuid
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO ''
AS $legacy_off$
 SELECT jsonb_build_object('state','replaced_by_all_supplier_reveal');
$legacy_off$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_queue_finalists_mvp110(uuid)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_queue_finalists_mvp110(uuid)
 TO service_role;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_authorize_finalist_whapi_mvp110(
 p_request uuid,p_recipient text,p_lease uuid
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO ''
AS $legacy_off$
 SELECT jsonb_build_object('state','replaced_by_all_supplier_reveal');
$legacy_off$;
REVOKE ALL ON FUNCTION
 public.cotironda_piloto_authorize_finalist_whapi_mvp110(uuid,text,uuid)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_authorize_finalist_whapi_mvp110(uuid,text,uuid)
 TO service_role;
