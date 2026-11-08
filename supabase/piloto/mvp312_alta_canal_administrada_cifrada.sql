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

-- Unified supplier eligibility: retain original WhatsApp proof OR an owner-
-- attested, AES-encrypted direct channel. Never authorize opt-out contacts.
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
    AND ch.contact_sha256 ~ '^[a-f0-9]{64}$'
    AND length(ch.nonce_b64) BETWEEN 16 AND 40
    AND length(ch.ciphertext_b64) BETWEEN 32 AND 300
    AND NOT EXISTS(
     SELECT 1 FROM cotironda_piloto_privado.contact_reveal_consents_mvp109 c
     WHERE c.participant_key=p.key AND c.revoked_at IS NOT NULL
    )
  )
 OR EXISTS(
   SELECT 1
   FROM cotironda_piloto_privado.participants p
   JOIN cotironda_piloto_privado.admin_authorizations_mvp309 a
    ON a.participant_key=p.key AND a.role='supplier'
    AND a.scope='supplier_business_contact_after_close'
    AND a.statement_kind='owner_reported_prior_permission'
   JOIN cotironda_piloto_privado.admin_channels_mvp312 ch
    ON ch.participant_key=p.key AND ch.participant_role='supplier'
    AND ch.source_reference=a.source_reference
    AND ch.chat_hmac=p.chat_hmac
    AND ch.evidence_kind='owner_vouched_phone'
   JOIN cotironda_piloto_privado.enrollment_policies_mvp308 pol
    ON pol.role=a.role AND pol.version=a.policy_version
   WHERE p.key=p_supplier AND p.participant_role='supplier'
    AND p.consent_at IS NOT NULL AND p.opted_out_at IS NULL
    AND p.display_label IS NOT NULL
    AND length(trim(p.display_label)) BETWEEN 2 AND 100
    AND p.display_label !~ '[[:cntrl:]<>]'
    AND p.display_label !~ '[0-9]{8,}'
    AND a.policy_text_sha256=encode(sha256(convert_to(pol.policy_text,'UTF8')),'hex')
    AND ch.contact_sha256 ~ '^[a-f0-9]{64}
   WHERE rev.participant_key=p_supplier
 );
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


-- MVP304 stays closed until the real buyer-specific close/token gate;
-- it may return either ciphertext source, never clear numbers or buyer phones.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_all_supplier_contacts_mvp304(
 p_token_hash text
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path='' AS $mvp304$
DECLARE
 v_roster jsonb; v_request uuid; v_rows jsonb;
 v_count integer; v_duplicates integer;
BEGIN
 IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$'
 THEN RETURN jsonb_build_object('state','not_found'); END IF;
 -- Reusar EXACTAMENTE el gate del listado: activacion prospectiva,
 -- comprador real consentido, token privado vigente, ronda closed + fecha.
 v_roster:=public.cotironda_piloto_all_suppliers_closed_mvp303(p_token_hash);
 IF v_roster->>'state'<>'proveedores_revelados_al_cierre'
 THEN RETURN jsonb_build_object('state','not_ready'); END IF;
 SELECT t.request_id INTO v_request
 FROM cotironda_piloto_privado.buyer_tracking_mvp091 t
 JOIN cotironda_piloto_privado.requests r ON r.id=t.request_id
 WHERE t.token_hash=p_token_hash AND t.revoked_at IS NULL
   AND t.expires_at>clock_timestamp() AND r.state='closed'
   AND r.closes_at<=clock_timestamp();
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_ready');END IF;
 -- Names are used to merge with the MVP303 buyer roster, which deliberately
 -- contains no internal IDs. Colliding names MUST NEVER cross-wire phones.
 WITH named AS (
  SELECT p.display_label, count(*) AS n
  FROM cotironda_piloto_privado.invitations i
  JOIN cotironda_piloto_privado.participants p ON p.key=i.supplier_key
  WHERE i.request_id=v_request AND i.state='prepared'
    AND p.participant_role='supplier'
    AND p.consent_at IS NOT NULL AND p.opted_out_at IS NULL
  GROUP BY p.display_label
 )
 SELECT count(*) INTO v_duplicates FROM named WHERE n<>1;
 IF v_duplicates>0
 THEN RETURN jsonb_build_object('state','ambiguous_labels');END IF;
 -- Valid sources: authenticated WhatsApp channel OR immutable per-person
 -- owner statement + operator-vouched encrypted number (MVP312).
 -- Neither path overrides a later revocation or opt-out.
 WITH verified AS (
  SELECT p.key,p.display_label,p.chat_hmac,
    coalesce(ch.nonce_b64,owner_ch.nonce_b64) AS nonce_b64,
    coalesce(ch.ciphertext_b64,owner_ch.ciphertext_b64) AS ciphertext_b64
  FROM cotironda_piloto_privado.invitations i
  JOIN cotironda_piloto_privado.participants p
   ON p.key=i.supplier_key AND p.participant_role='supplier'
  LEFT JOIN cotironda_piloto_privado.participant_channels_mvp109 ch
   ON ch.participant_key=p.key AND ch.chat_hmac=p.chat_hmac
  LEFT JOIN cotironda_piloto_privado.admin_channels_mvp312 owner_ch
   ON owner_ch.participant_key=p.key AND owner_ch.chat_hmac=p.chat_hmac
    AND owner_ch.participant_role='supplier'
  WHERE i.request_id=v_request AND i.state='prepared'
   AND (ch.participant_key IS NOT NULL OR owner_ch.participant_key IS NOT NULL)
   AND cotironda_piloto_privado.proveedor_contactable_mvp307(p.key)
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'supplier_key',key,
  'nombre',trim(display_label),
  'chat_hmac',chat_hmac,
  'nonce_b64',nonce_b64,
  'ciphertext_b64',ciphertext_b64
 ) ORDER BY key),'[]'::jsonb),count(*) INTO v_rows,v_count
 FROM verified;
 IF v_count>100 THEN RETURN jsonb_build_object('state','capacity_exceeded');END IF;
 RETURN jsonb_build_object(
   'state','private_consented_contacts',
   'count',v_count,
   'contacts_encrypted',v_rows,
   'buyer_phone_included',false,
   'messages_sent',false,
   'automatic_award',false
 );
END $mvp304$;
REVOKE ALL ON FUNCTION
 public.cotironda_piloto_all_supplier_contacts_mvp304(text)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_all_supplier_contacts_mvp304(text)
 TO service_role;

