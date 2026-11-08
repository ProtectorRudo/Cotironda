-- MVP312 · SOLO DESARROLLO, NO PUBLICAR CON "LUZ VERDE".
-- Alta asistida por el responsable con número comercial ya obtenido.
-- El usuario no debe enviar otro mensaje de autorización ni código de alta.
-- Precondiciones: MVP109, MVP307, MVP308, MVP309, MVP310, MVP311.
-- Se registra "declaración del administrador", NUNCA un mensaje WhatsApp
-- fingido. El número/código no llega a SQL: solo HMAC, SHA y AES-GCM.
-- El operador NO puede ejecutar estas funciones desde API/Edge.
CREATE TABLE cotironda_piloto_privado.admin_channels_mvp312(
 participant_key text PRIMARY KEY
  REFERENCES cotironda_piloto_privado.participants(key),
 participant_role text NOT NULL CHECK(participant_role IN('buyer','supplier')),
 source_reference text NOT NULL
  REFERENCES cotironda_piloto_privado.admin_authorizations_mvp309(source_reference),
 channel_id text NOT NULL CHECK(channel_id ~ '^[A-Za-z0-9_-]{4,64}$'),
 chat_hmac text NOT NULL UNIQUE CHECK(chat_hmac ~ '^[a-f0-9]{64}$'),
 contact_sha256 text NOT NULL UNIQUE CHECK(contact_sha256 ~ '^[a-f0-9]{64}$'),
 nonce_b64 text NOT NULL CHECK(length(nonce_b64) BETWEEN 16 AND 40),
 ciphertext_b64 text NOT NULL CHECK(length(ciphertext_b64) BETWEEN 32 AND 300),
 evidence_kind text NOT NULL DEFAULT 'owner_vouched_phone'
  CHECK(evidence_kind='owner_vouched_phone'),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 recorded_by_db_role text NOT NULL CHECK(recorded_by_db_role='postgres'),
 CHECK(chat_hmac<>contact_sha256)
);
ALTER TABLE cotironda_piloto_privado.admin_channels_mvp312 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.admin_channels_mvp312
 FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER admin_channels_immutable_mvp312 BEFORE UPDATE OR DELETE
 ON cotironda_piloto_privado.admin_channels_mvp312
 FOR EACH ROW EXECUTE FUNCTION
 cotironda_piloto_privado.reject_supplier_line_mutation_mvp101();

-- Explicitly prevent a caller from "verifying" a number with an enrollment
-- message that never existed. Owner statement is separate from inbound proof.
CREATE OR REPLACE FUNCTION cotironda_piloto_privado.admin_bind_channel_mvp312(
 p_participant text,p_source_reference text,p_channel_id text,
 p_chat_hmac text,p_contact_sha256 text,
 p_nonce_b64 text,p_ciphertext_b64 text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $admin_channel$
DECLARE v_part record;v_current record;v_count integer;
BEGIN
 IF current_user<>'postgres' OR session_user<>'postgres'
 THEN RAISE EXCEPTION 'mvp312_admin_session_required' USING ERRCODE='42501';END IF;
 IF p_participant IS NULL OR p_participant !~ '^[a-z][a-z0-9_]{2,60}$'
  OR p_source_reference IS NULL OR
    p_source_reference !~ '^[a-z0-9][a-z0-9:_-]{11,119}$'
  OR p_channel_id IS NULL OR
    p_channel_id !~ '^[A-Za-z0-9_-]{4,64}$'
  OR p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$'
  OR p_contact_sha256 IS NULL OR p_contact_sha256 !~ '^[a-f0-9]{64}$'
  OR p_chat_hmac=p_contact_sha256
  OR p_nonce_b64 IS NULL OR p_nonce_b64 !~ '^[A-Za-z0-9+/]{16,40}$'
  OR p_ciphertext_b64 IS NULL OR
    p_ciphertext_b64 !~ '^[A-Za-z0-9+/]{20,296}={0,2}$'
  OR length(p_ciphertext_b64) NOT BETWEEN 32 AND 300
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 SELECT p.key,p.participant_role,p.chat_hmac,p.consent_at INTO v_part
 FROM cotironda_piloto_privado.participants p
 JOIN cotironda_piloto_privado.admin_authorizations_mvp309 a
  ON a.participant_key=p.key AND a.role=p.participant_role
  AND a.source_reference=p_source_reference
 WHERE p.key=p_participant AND p.opted_out_at IS NULL
  AND NOT EXISTS(
   SELECT 1 FROM cotironda_piloto_privado.admin_authorization_revocations_mvp309 rev
   WHERE rev.participant_key=p.key)
 FOR UPDATE OF p;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_authorized');END IF;

 SELECT c.participant_key,c.source_reference,c.channel_id,c.chat_hmac,
  c.contact_sha256 INTO v_current
 FROM cotironda_piloto_privado.admin_channels_mvp312 c
 WHERE c.participant_key=p_participant;
 IF FOUND THEN
  IF v_current.source_reference=p_source_reference
   AND v_current.channel_id=p_channel_id
   AND v_current.chat_hmac=p_chat_hmac
   AND v_current.contact_sha256=p_contact_sha256
   AND v_part.chat_hmac=p_chat_hmac AND v_part.consent_at IS NOT NULL
  THEN RETURN jsonb_build_object('state','already_bound','role',v_part.participant_role,
      'permission_basis','owner_statement','whapi_inbound_proof',false);END IF;
  RETURN jsonb_build_object('state','identity_conflict');
 END IF;
 -- Never overwrite a contact linked and proven by an authenticated inbound
 -- WhatsApp. Existing Ailin/Nahuel keep their original channel/evidence.
 IF v_part.chat_hmac IS NOT NULL OR v_part.consent_at IS NOT NULL
  OR EXISTS(
   SELECT 1 FROM cotironda_piloto_privado.participant_channels_mvp109 ch
   WHERE ch.participant_key=p_participant)
 THEN RETURN jsonb_build_object('state','already_linked_other_path');END IF;
 IF EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.participants p
  WHERE p.key<>p_participant AND p.chat_hmac=p_chat_hmac
 ) OR EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.admin_channels_mvp312 c
  WHERE c.participant_key<>p_participant
   AND (c.chat_hmac=p_chat_hmac OR c.contact_sha256=p_contact_sha256)
 ) THEN RETURN jsonb_build_object('state','identity_conflict');END IF;
 INSERT INTO cotironda_piloto_privado.admin_channels_mvp312(
  participant_key,participant_role,source_reference,channel_id,
  chat_hmac,contact_sha256,nonce_b64,ciphertext_b64,recorded_by_db_role
 ) VALUES(p_participant,v_part.participant_role,p_source_reference,p_channel_id,
  p_chat_hmac,p_contact_sha256,p_nonce_b64,p_ciphertext_b64,current_user);
 UPDATE cotironda_piloto_privado.participants
 SET chat_hmac=p_chat_hmac,consent_at=clock_timestamp()
 WHERE key=p_participant AND chat_hmac IS NULL AND consent_at IS NULL
  AND opted_out_at IS NULL;
 GET DIAGNOSTICS v_count=ROW_COUNT;
 IF v_count<>1
 THEN RAISE EXCEPTION 'mvp312_identity_binding_rollback' USING ERRCODE='23514';END IF;
 RETURN jsonb_build_object('state','bound','role',v_part.participant_role,
  'permission_basis','owner_statement','whapi_inbound_proof',false,
  'buyer_contact_public',false,'messages_sent',false);
END $admin_channel$;
REVOKE ALL ON FUNCTION
 cotironda_piloto_privado.admin_bind_channel_mvp312(
  text,text,text,text,text,text,text
 ) FROM PUBLIC,anon,authenticated,service_role;

-- One administrator operation: create participant + record prior permission
-- + register the encrypted contact in the SAME SQL transaction.
-- An invalid envelope or duplicate identifier rolls everything back.
CREATE OR REPLACE FUNCTION cotironda_piloto_privado.admin_create_and_bind_mvp312(
 p_role text,p_display_label text,p_supplier_city text,
 p_source_reference text,p_channel_id text,p_chat_hmac text,
 p_contact_sha256 text,p_nonce_b64 text,p_ciphertext_b64 text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $complete$
DECLARE v_new jsonb;v_bound jsonb;v_participant text;
BEGIN
 IF current_user<>'postgres' OR session_user<>'postgres'
 THEN RAISE EXCEPTION 'mvp312_admin_session_required' USING ERRCODE='42501';END IF;
 -- Do not call a nested SECURITY DEFINER that could bypass session identity.
 v_new:=cotironda_piloto_privado.admin_create_participant_mvp310(
  p_role,p_display_label,p_supplier_city,p_source_reference);
 IF v_new->>'state' NOT IN ('created','already_created')
 THEN RETURN v_new;END IF;
 v_participant:=v_new->>'participant_key';
 v_bound:=cotironda_piloto_privado.admin_bind_channel_mvp312(
  v_participant,p_source_reference,p_channel_id,p_chat_hmac,
  p_contact_sha256,p_nonce_b64,p_ciphertext_b64);
 IF v_bound->>'state' NOT IN ('bound','already_bound')
 THEN RAISE EXCEPTION 'mvp312_atomic_binding_rejected' USING ERRCODE='23514';END IF;
 RETURN jsonb_build_object(
  'state',CASE WHEN v_new->>'state'='created' THEN 'created_and_bound'
    ELSE 'already_created_and_bound' END,
  'participant_key',v_participant,'role',p_role,
  'permission_basis','owner_statement','whapi_inbound_proof',false,
  'buyer_contact_public',false,'messages_sent',false);
END $complete$;
REVOKE ALL ON FUNCTION
 cotironda_piloto_privado.admin_create_and_bind_mvp312(
  text,text,text,text,text,text,text,text,text
 ) FROM PUBLIC,anon,authenticated,service_role;

-- Revocation is evaluated on every lookup; never un-revoke the immutable
-- operator statement or the original user's opted_out_at.
