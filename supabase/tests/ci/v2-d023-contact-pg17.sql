\set ON_ERROR_STOP on
-- Ejecución totalmente local a PostgreSQL 17 sintético (no toca piloto real).
\ir v2-d022-profile-pg17.sql
BEGIN;
ALTER TABLE cotironda_piloto_privado.participants
 ADD COLUMN consent_at timestamptz,
 ADD COLUMN chat_hmac text;
CREATE TABLE cotironda_piloto_privado.participant_channels_mvp109 (
 participant_key text PRIMARY KEY REFERENCES cotironda_piloto_privado.participants(key),
 chat_hmac text,
 contact_sha256 text,
 nonce_b64 text,
 ciphertext_b64 text,
 bound_at timestamptz,
 authenticated_message_hmac text
);
CREATE TABLE cotironda_piloto_privado.contact_reveal_consents_mvp109 (
 participant_key text PRIMARY KEY REFERENCES cotironda_piloto_privado.participants(key),
 approved_at timestamptz,revoked_at timestamptz,
 source_message_hmac text
);
UPDATE cotironda_piloto_privado.participants
SET consent_at=now(),chat_hmac=repeat('a',64)
WHERE key='corralon_a';
INSERT INTO cotironda_piloto_privado.participant_channels_mvp109
(participant_key,chat_hmac,contact_sha256,nonce_b64,ciphertext_b64,bound_at,authenticated_message_hmac)
VALUES('corralon_a',repeat('a',64),repeat('b',64),
 'AAAAAAAAAAAAAAAA','AAAAAAAAAAAAAAAAAAAAAAAAAAAA',now(),repeat('c',64));
COMMIT;
\ir ../../piloto/v2_d023_supplier_contact_attestation_CANDIDATE.sql
DO $assert$
DECLARE
 rid uuid:='11111111-1111-4111-8111-111111111111';
 doc uuid:='22222222-2222-4222-8222-222222222222';
 res jsonb;
BEGIN
 IF has_function_privilege('anon','public.cotironda_piloto_v2_d023_supplier_contact_source_private(uuid,text,uuid)','EXECUTE')
 OR has_table_privilege('anon','cotironda_piloto_privado.supplier_contact_owner_attestations_d023','SELECT')
 THEN RAISE EXCEPTION 'Public access bypass'; END IF;
 IF public.cotironda_piloto_v2_d023_supplier_contact_source_private(rid,'invalid-session',doc) IS NOT NULL
 THEN RAISE EXCEPTION 'Session bypass';END IF;
 IF public.cotironda_piloto_v2_d023_supplier_contact_source_private(
  rid,'sesion-autorizada','33333333-3333-4333-8333-333333333333'::uuid) IS NOT NULL
 THEN RAISE EXCEPTION 'Document bypass';END IF;
 IF public.cotironda_piloto_v2_d023_supplier_contact_source_private(rid,'sesion-autorizada',doc) IS NOT NULL
 THEN RAISE EXCEPTION 'Owner declaration was not recorded; should deny';END IF;
 -- La declaración del propietario no suplanta un HMAC autenticado del proveedor.
 INSERT INTO cotironda_piloto_privado.supplier_contact_owner_attestations_d023
 (supplier_key,owner_statement) VALUES ('corralon_a','Todos autorizaron');
 res:=public.cotironda_piloto_v2_d023_supplier_contact_source_private(rid,'sesion-autorizada',doc);
 IF res->>'state' IS DISTINCT FROM 'authorized_contact_envelope_d023'
 OR res->>'chatHmac' IS DISTINCT FROM repeat('a',64)
 OR res->>'contactSha256' IS DISTINCT FROM repeat('b',64)
 THEN RAISE EXCEPTION 'Valid supplier/owner attestation not accessible';END IF;
 IF res ? 'telefono' OR res ? 'digits' OR res ? 'whatsapp'
 THEN RAISE EXCEPTION 'Plain contact leaked through SQL';END IF;
 -- El proveedor puede revocar; NO basta afirmar consentimiento a futuro.
 INSERT INTO cotironda_piloto_privado.contact_reveal_consents_mvp109
 (participant_key,revoked_at) VALUES('corralon_a',now());
 IF public.cotironda_piloto_v2_d023_supplier_contact_source_private(rid,'sesion-autorizada',doc) IS NOT NULL
 THEN RAISE EXCEPTION 'Explicit supplier revocation bypass';END IF;
 DELETE FROM cotironda_piloto_privado.contact_reveal_consents_mvp109
 WHERE participant_key='corralon_a';
 UPDATE cotironda_piloto_privado.supplier_contact_owner_attestations_d023
 SET revoked_at=now() WHERE supplier_key='corralon_a';
 IF public.cotironda_piloto_v2_d023_supplier_contact_source_private(rid,'sesion-autorizada',doc) IS NOT NULL
 THEN RAISE EXCEPTION 'Attestation revocation bypass';END IF;
 RAISE NOTICE 'D023: synthetic supplier consent, session, revocation and privacy passed';
END $assert$;
