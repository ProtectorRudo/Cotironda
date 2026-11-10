-- MVP312B: owner-vouched encrypted channels, no fake WhatsApp proof.
-- Old authenticated consent and all revocation guards are preserved.

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
  SELECT 1 FROM cotironda_piloto_privado.participants p
  JOIN cotironda_piloto_privado.admin_authorizations_mvp309 a
   ON a.participant_key=p.key AND a.role=p.participant_role
   AND a.statement_kind='owner_reported_prior_permission'
   AND a.scope='supplier_business_contact_after_close'
  JOIN cotironda_piloto_privado.enrollment_policies_mvp308 pol
   ON pol.role=a.role AND pol.version=a.policy_version
  JOIN cotironda_piloto_privado.admin_channels_mvp312 c
   ON c.participant_key=p.key AND c.participant_role=p.participant_role
   AND c.source_reference=a.source_reference AND c.chat_hmac=p.chat_hmac
   AND c.evidence_kind='owner_vouched_phone'
  WHERE p.key=p_supplier AND p.participant_role='supplier'
   AND p.consent_at IS NOT NULL AND p.opted_out_at IS NULL
   AND p.display_label IS NOT NULL
   AND length(trim(p.display_label)) BETWEEN 2 AND 100
   AND p.display_label !~ '[[:cntrl:]<>]'
   AND p.display_label !~ '[0-9]{8,}'
   AND a.policy_text_sha256=encode(sha256(convert_to(pol.policy_text,'UTF8')),'hex')
   AND c.contact_sha256 ~ '^[a-f0-9]{64}$'
   AND length(c.nonce_b64) BETWEEN 16 AND 40
   AND length(c.ciphertext_b64) BETWEEN 32 AND 300
   AND NOT EXISTS(
    SELECT 1 FROM cotironda_piloto_privado.contact_reveal_consents_mvp109 revoked
    WHERE revoked.participant_key=p.key AND revoked.revoked_at IS NOT NULL
   )
 ) ) AND NOT EXISTS(
   SELECT 1 FROM cotironda_piloto_privado.admin_authorization_revocations_mvp309 rev
   WHERE rev.participant_key=p_supplier
 );
$eligible$;
REVOKE ALL ON FUNCTION
 cotironda_piloto_privado.proveedor_contactable_mvp307(text)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION
 cotironda_piloto_privado.proveedor_contactable_mvp307(text) TO service_role;

