-- MVP309 · DESARROLLO EXCLUSIVO: registro de autorización previa declarada
-- por responsable de Cotironda. NO publica ni modifica la DB piloto.
-- Supuestos: MVP073,109,307,308 y acceso al SQL Editor autenticado como postgres.
-- No transforma la declaración del operador en una firma o mensaje del titular.
-- La categoría de permisos siempre deriva del rol REAL, nunca del pedido abierto.
-- No hay WhatsApp al participante ni autorizaciones adicionales por ronda.

CREATE TABLE cotironda_piloto_privado.admin_authorizations_mvp309(
 participant_key text PRIMARY KEY REFERENCES cotironda_piloto_privado.participants(key),
 role text NOT NULL CHECK(role IN ('buyer','supplier')),
 scope text NOT NULL CHECK(scope IN ('buyer_standard_operations','supplier_business_contact_after_close')),
 statement_kind text NOT NULL DEFAULT 'owner_reported_prior_permission'
  CHECK(statement_kind='owner_reported_prior_permission'),
 policy_version smallint NOT NULL DEFAULT 1 CHECK(policy_version=1),
 policy_text_sha256 text NOT NULL CHECK(policy_text_sha256 ~ '^[a-f0-9]{64}$'),
 source_reference text NOT NULL CHECK(source_reference ~ '^[a-z0-9][a-z0-9:_-]{11,119}$'),
 responsible_role text NOT NULL DEFAULT 'cotironda_owner'
  CHECK(responsible_role='cotironda_owner'),
 recorded_by_db_role text NOT NULL CHECK(length(recorded_by_db_role) BETWEEN 4 AND 64),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(role,policy_version)
  REFERENCES cotironda_piloto_privado.enrollment_policies_mvp308(role,version),
 CHECK((role='buyer' AND scope='buyer_standard_operations') OR
       (role='supplier' AND scope='supplier_business_contact_after_close'))
);
ALTER TABLE cotironda_piloto_privado.admin_authorizations_mvp309 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.admin_authorizations_mvp309
 FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER admin_authorizations_immutable_mvp309 BEFORE UPDATE OR DELETE
 ON cotironda_piloto_privado.admin_authorizations_mvp309
 FOR EACH ROW EXECUTE FUNCTION
 cotironda_piloto_privado.reject_supplier_line_mutation_mvp101();

CREATE TABLE cotironda_piloto_privado.admin_authorization_revocations_mvp309(
 participant_key text PRIMARY KEY REFERENCES cotironda_piloto_privado.admin_authorizations_mvp309(participant_key),
 revoked_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reason text NOT NULL CHECK(reason IN ('participant_revoked','operator_cancelled','source_disputed')),
 recorded_by_db_role text NOT NULL CHECK(length(recorded_by_db_role) BETWEEN 4 AND 64)
);
ALTER TABLE cotironda_piloto_privado.admin_authorization_revocations_mvp309 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.admin_authorization_revocations_mvp309
 FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER admin_auth_revocations_immutable_mvp309 BEFORE UPDATE OR DELETE
 ON cotironda_piloto_privado.admin_authorization_revocations_mvp309
 FOR EACH ROW EXECUTE FUNCTION
 cotironda_piloto_privado.reject_supplier_line_mutation_mvp101();

-- Nunca exponer esta acción mediante RPC pública ni service_role de Edge.
-- Solo la identidad privilegiada con sesión SQL administrativa postgres
-- puede declarar que obtuvo consentimiento previo y conoce su alcance.
-- El asistente NO debe llamar a esta función sin la instrucción de alta real.
CREATE OR REPLACE FUNCTION cotironda_piloto_privado.admin_record_permission_mvp309(
 p_participant text,p_declared_role text,p_source_reference text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $operator$
DECLARE v_role text;v_policy text;v_scope text;existing record;
BEGIN
 IF current_user<>'postgres' OR session_user<>'postgres'
 THEN RAISE EXCEPTION 'mvp309_admin_session_required' USING ERRCODE='42501';END IF;
 IF p_participant IS NULL OR p_participant !~ '^[a-z][a-z0-9_]{2,60}$'
  OR p_declared_role NOT IN ('buyer','supplier')
  OR p_source_reference IS NULL
  OR p_source_reference !~ '^[a-z0-9][a-z0-9:_-]{11,119}$'
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 SELECT p.participant_role INTO v_role
 FROM cotironda_piloto_privado.participants p
 WHERE p.key=p_participant AND p.opted_out_at IS NULL FOR UPDATE;
 IF NOT FOUND OR v_role<>p_declared_role
 THEN RETURN jsonb_build_object('state','role_or_participant_invalid');END IF;
 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.admin_authorization_revocations_mvp309 rev
   WHERE rev.participant_key=p_participant)
 THEN RETURN jsonb_build_object('state','revoked');END IF;
 v_scope:=CASE WHEN v_role='buyer' THEN 'buyer_standard_operations'
   ELSE 'supplier_business_contact_after_close' END;
 SELECT pol.policy_text INTO v_policy
 FROM cotironda_piloto_privado.enrollment_policies_mvp308 pol
 WHERE pol.role=v_role AND pol.version=1;
 IF v_policy IS NULL THEN RETURN jsonb_build_object('state','policy_missing');END IF;
 SELECT scope,source_reference INTO existing
 FROM cotironda_piloto_privado.admin_authorizations_mvp309
 WHERE participant_key=p_participant;
 IF FOUND THEN RETURN jsonb_build_object('state','already_recorded',
   'scope',existing.scope);END IF;
 INSERT INTO cotironda_piloto_privado.admin_authorizations_mvp309(
  participant_key,role,scope,policy_version,policy_text_sha256,
  source_reference,recorded_by_db_role
 ) VALUES(p_participant,v_role,v_scope,1,
  encode(sha256(convert_to(v_policy,'UTF8')),'hex'),
  p_source_reference,current_user);
 RETURN jsonb_build_object('state','recorded','scope',v_scope,
  'evidence_kind','operator_statement','contact_revealed',false);
END $operator$;
REVOKE ALL ON FUNCTION cotironda_piloto_privado.admin_record_permission_mvp309(text,text,text)
 FROM PUBLIC,anon,authenticated,service_role;

-- El operador nunca debe invalidar una baja. Una vez revocada la
-- declaración, el proceso de alta no puede reactivarla silenciosamente.
CREATE OR REPLACE FUNCTION cotironda_piloto_privado.admin_revoke_permission_mvp309(
 p_participant text,p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $revoke$
BEGIN
 IF current_user<>'postgres' OR session_user<>'postgres'
 THEN RAISE EXCEPTION 'mvp309_admin_session_required' USING ERRCODE='42501';END IF;
 IF p_reason NOT IN ('participant_revoked','operator_cancelled','source_disputed')
 THEN RETURN jsonb_build_object('state','invalid_reason');END IF;
 INSERT INTO cotironda_piloto_privado.admin_authorization_revocations_mvp309(
  participant_key,reason,recorded_by_db_role
 ) SELECT participant_key,p_reason,current_user
 FROM cotironda_piloto_privado.admin_authorizations_mvp309
 WHERE participant_key=p_participant
 ON CONFLICT(participant_key) DO NOTHING;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_found_or_already_revoked');END IF;
 RETURN jsonb_build_object('state','revoked');
END $revoke$;
REVOKE ALL ON FUNCTION cotironda_piloto_privado.admin_revoke_permission_mvp309(text,text)
 FROM PUBLIC,anon,authenticated,service_role;

-- Mismo contrato booleano MVP307: el clasificador, despacho y respuesta
-- al comprador usan una única verificación centralizada.
-- Acepta dos orígenes DISTINTOS, jamás los confunde:
-- (1) WhatsApp autenticado MVP109/307; (2) declaración individual del
-- administrador, asociada al rol y política informada registrada.
-- Una revocación en cualquiera de los caminos bloquea el contacto.

CREATE OR REPLACE FUNCTION cotironda_piloto_privado.proveedor_contactable_mvp307(
 p_supplier text
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $eligible$
 SELECT (coalesce(EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.participants p
  JOIN cotironda_piloto_privado.participant_channels_mvp109 ch
   ON ch.participant_key=p.key AND ch.chat_hmac=p.chat_hmac
  JOIN cotironda_piloto_privado.whapi_inbox bound
   ON bound.message_hmac=ch.authenticated_message_hmac
   AND bound.participant_key=p.key AND bound.chat_hmac=p.chat_hmac
  JOIN cotironda_piloto_privado.contact_reveal_consents_mvp109 consent
   ON consent.participant_key=p.key
   AND consent.approved_at IS NOT NULL AND consent.revoked_at IS NULL
  JOIN cotironda_piloto_privado.whapi_inbox src
   ON src.message_hmac=consent.source_message_hmac
   AND src.participant_key=p.key AND src.chat_hmac=p.chat_hmac
   AND src.kind='text'
  WHERE p.key=p_supplier AND p.participant_role='supplier'
   AND p.consent_at IS NOT NULL AND p.opted_out_at IS NULL
   AND ch.contact_sha256 ~ '^[a-f0-9]{64}$'
   AND length(ch.nonce_b64) BETWEEN 16 AND 40
   AND length(ch.ciphertext_b64) BETWEEN 32 AND 300
   AND p.display_label IS NOT NULL
   AND length(trim(p.display_label)) BETWEEN 2 AND 100
   AND p.display_label !~ '[[:cntrl:]<>]'
   AND p.display_label !~ '[0-9]{8,}'
   AND consent.approved_at>=src.received_at
   AND (
    src.plaintext_sha256=encode(
      sha256(convert_to('COTI CONTACTOS SI','UTF8')),'hex')
    OR EXISTS(
      SELECT 1 FROM cotironda_piloto_privado.supplier_enrollment_contact_proof_mvp307 proof
      JOIN cotironda_piloto_privado.enrollment_codes ec
       ON ec.participant_key=p.key AND ec.code_hash=proof.code_hash
       AND ec.consumed_at IS NOT NULL
      WHERE proof.supplier_key=p.key AND proof.message_hmac=src.message_hmac
        AND proof.accepted_text_sha256=src.plaintext_sha256
        AND proof.consent_policy_version=1
        AND proof.accepted_at>=src.received_at
    )
   )
 ),false)
 OR EXISTS(
   SELECT 1
   FROM cotironda_piloto_privado.admin_authorizations_mvp309 a
   JOIN cotironda_piloto_privado.participants p
    ON p.key=a.participant_key AND p.participant_role=a.role
   JOIN cotironda_piloto_privado.enrollment_policies_mvp308 pol
    ON pol.role=a.role AND pol.version=a.policy_version
   JOIN cotironda_piloto_privado.participant_channels_mvp109 ch
    ON ch.participant_key=p.key AND ch.chat_hmac=p.chat_hmac
   JOIN cotironda_piloto_privado.whapi_inbox source
    ON source.message_hmac=ch.authenticated_message_hmac
    AND source.participant_key=p.key AND source.chat_hmac=p.chat_hmac
   WHERE a.participant_key=p_supplier AND a.role='supplier'
    AND a.scope='supplier_business_contact_after_close'
    AND a.statement_kind='owner_reported_prior_permission'
    AND a.policy_text_sha256=encode(sha256(convert_to(pol.policy_text,'UTF8')),'hex')
    AND p.consent_at IS NOT NULL AND p.opted_out_at IS NULL
    AND p.display_label IS NOT NULL
    AND length(trim(p.display_label)) BETWEEN 2 AND 100
    AND p.display_label !~ '[[:cntrl:]<>]'
    AND p.display_label !~ '[0-9]{8,}'
    AND ch.contact_sha256 ~ '^[a-f0-9]{64}
$eligible$;
REVOKE ALL ON FUNCTION
 cotironda_piloto_privado.proveedor_contactable_mvp307(text)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION
 cotironda_piloto_privado.proveedor_contactable_mvp307(text) TO service_role;


    AND length(ch.nonce_b64) BETWEEN 16 AND 40
    AND length(ch.ciphertext_b64) BETWEEN 32 AND 300
    AND NOT EXISTS(
     SELECT 1 FROM cotironda_piloto_privado.contact_reveal_consents_mvp109 c
     WHERE c.participant_key=p.key AND c.revoked_at IS NOT NULL
    )
  )
 ) AND NOT EXISTS(
   SELECT 1 FROM cotironda_piloto_privado.admin_authorization_revocations_mvp309 rev
   WHERE rev.participant_key=p_supplier
 );
$eligible$;
REVOKE ALL ON FUNCTION
 cotironda_piloto_privado.proveedor_contactable_mvp307(text)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION
 cotironda_piloto_privado.proveedor_contactable_mvp307(text) TO service_role;

