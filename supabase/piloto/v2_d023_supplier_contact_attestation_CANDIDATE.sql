-- D023: declaración del propietario sobre autorización de contactos.
-- CANDIDATO: NO INSTALADO. Separar declaración del propietario de mensajes
-- autenticados de proveedores. No atribuir HMAC de Whapi inexistentes.
-- Limitar a los 2 proveedores previamente incorporados al piloto.
BEGIN;
CREATE TABLE cotironda_piloto_privado.supplier_contact_owner_attestations_d023 (
 supplier_key text PRIMARY KEY REFERENCES cotironda_piloto_privado.participants(key),
 scope text NOT NULL DEFAULT 'buyer_portal_whatsapp_commercial',
 source_kind text NOT NULL DEFAULT 'owner_statement_in_chat',
 owner_statement text NOT NULL,
 attested_at timestamptz NOT NULL DEFAULT now(),
 revoked_at timestamptz,
 CONSTRAINT d023_scope CHECK (scope='buyer_portal_whatsapp_commercial'),
 CONSTRAINT d023_source CHECK (source_kind='owner_statement_in_chat'),
 CONSTRAINT d023_statement CHECK (owner_statement='Todos autorizaron'),
 CONSTRAINT d023_revocation CHECK (revoked_at IS NULL OR revoked_at>=attested_at)
);
ALTER TABLE cotironda_piloto_privado.supplier_contact_owner_attestations_d023
 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.supplier_contact_owner_attestations_d023
 FROM PUBLIC,anon,authenticated;
GRANT SELECT ON cotironda_piloto_privado.supplier_contact_owner_attestations_d023
 TO service_role;

-- Alcance exacto del test real. No incluir automáticamente futuros proveedores.
INSERT INTO cotironda_piloto_privado.supplier_contact_owner_attestations_d023
 (supplier_key,owner_statement)
SELECT p.key,'Todos autorizaron'
FROM cotironda_piloto_privado.participants p
JOIN cotironda_piloto_privado.participant_channels_mvp109 c
 ON c.participant_key=p.key AND c.chat_hmac=p.chat_hmac
WHERE p.participant_role='supplier' AND p.consent_at IS NOT NULL
 AND p.opted_out_at IS NULL AND c.bound_at IS NOT NULL
 AND c.authenticated_message_hmac IS NOT NULL
 AND p.display_label IN ('Corralón Ailín · prueba','Corralón Nahuel · prueba')
ON CONFLICT DO NOTHING;

CREATE FUNCTION public.cotironda_piloto_v2_d023_supplier_contact_source_private(
 p_request_id uuid,p_sesion_hmac text,p_document_id uuid
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE v_source jsonb; v_key text; v_row record;
BEGIN
 IF p_request_id IS NULL OR p_sesion_hmac IS NULL OR p_document_id IS NULL
 THEN RETURN NULL;END IF;
 -- La autorización del DOCUMENTO determina el proveedor. El cliente web
 -- no puede elegir un número, chat, proveedor o contacto de otro presupuesto.
 v_source:=public.cotironda_piloto_v2_d016_original_source_private(
  p_request_id,p_sesion_hmac,p_document_id);
 IF v_source IS NULL OR (v_source->>'state') NOT IN
  ('authorized_original_v2','authorized_text_v2')
  OR v_source->>'requestId' IS DISTINCT FROM p_request_id::text
  OR v_source->>'documentId' IS DISTINCT FROM p_document_id::text
 THEN RETURN NULL;END IF;
 v_key:=v_source->>'supplierKey';
 SELECT p.key,c.chat_hmac,c.contact_sha256,c.nonce_b64,c.ciphertext_b64
 INTO v_row
 FROM cotironda_piloto_privado.participants p
 JOIN cotironda_piloto_privado.participant_channels_mvp109 c
  ON c.participant_key=p.key AND c.chat_hmac=p.chat_hmac
 JOIN cotironda_piloto_privado.supplier_contact_owner_attestations_d023 a
  ON a.supplier_key=p.key
 LEFT JOIN cotironda_piloto_privado.contact_reveal_consents_mvp109 cc
  ON cc.participant_key=p.key
 LEFT JOIN cotironda_piloto_privado.supplier_business_profiles_d022 profile
  ON profile.supplier_key=p.key
 WHERE p.key=v_key AND p.participant_role='supplier'
  AND p.consent_at IS NOT NULL AND p.opted_out_at IS NULL
  AND c.bound_at IS NOT NULL AND c.authenticated_message_hmac IS NOT NULL
  AND c.contact_sha256 ~ '^[a-f0-9]{64}$'
  AND c.chat_hmac ~ '^[a-f0-9]{64}$'
  AND a.scope='buyer_portal_whatsapp_commercial'
  AND a.source_kind='owner_statement_in_chat'
  AND a.owner_statement='Todos autorizaron'
  AND a.revoked_at IS NULL
  AND cc.revoked_at IS NULL
  AND profile.revocado_en IS NULL;
 IF NOT FOUND THEN RETURN NULL;END IF;
 RETURN jsonb_build_object(
  'state','authorized_contact_envelope_d023',
  'chatHmac',v_row.chat_hmac,'contactSha256',v_row.contact_sha256,
  'nonceB64',v_row.nonce_b64,'ciphertextB64',v_row.ciphertext_b64
 );
END $fn$;
REVOKE ALL ON FUNCTION
 public.cotironda_piloto_v2_d023_supplier_contact_source_private(uuid,text,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_v2_d023_supplier_contact_source_private(uuid,text,uuid)
 TO service_role;
COMMIT;
-- El acceso a datos cifrados es solo para backend service-role.
-- El contacto real nunca se vuelca en SQL en claro, logs ni Git.
