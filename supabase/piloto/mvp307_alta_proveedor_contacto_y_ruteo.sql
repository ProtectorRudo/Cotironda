-- MVP307 — DESARROLLO EXCLUSIVO. Autorizacion de contacto comercial
-- en el MISMO mensaje de alta + filtro SQL ANTES de invitar/cotizar.
-- Requiere MVP073, MVP109, MVP220, MVP303-306. Sin despliegue.
-- Usuario envía desde su WhatsApp REAL una sola vez:
--   COTI ALTA <codigo-32hex> CONTACTOS SI
-- La aceptación informa mostrar SOLO nombre/WhatsApp del negocio
-- al comprador DESPUES del cierre de cada ronda. Puede revocar con
--   COTI CONTACTOS NO
-- No deducir consentimiento de recibir PDF, catálogo o cotización.

CREATE TABLE cotironda_piloto_privado.supplier_enrollment_contact_proof_mvp307(
 supplier_key text PRIMARY KEY REFERENCES cotironda_piloto_privado.participants(key),
 message_hmac text UNIQUE NOT NULL
   REFERENCES cotironda_piloto_privado.whapi_inbox(message_hmac),
 code_hash text NOT NULL CHECK(code_hash ~ '^[a-f0-9]{64}$'),
 accepted_text_sha256 text NOT NULL CHECK(accepted_text_sha256 ~ '^[a-f0-9]{64}$'),
 consent_policy_version smallint NOT NULL DEFAULT 1 CHECK(consent_policy_version=1),
 accepted_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE cotironda_piloto_privado.supplier_enrollment_contact_proof_mvp307
 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.supplier_enrollment_contact_proof_mvp307
 FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER supplier_enrollment_proof_immutable_mvp307
 BEFORE UPDATE OR DELETE
 ON cotironda_piloto_privado.supplier_enrollment_contact_proof_mvp307
 FOR EACH ROW EXECUTE FUNCTION
 cotironda_piloto_privado.reject_supplier_line_mutation_mvp101();

-- Una sola RPC transaccional: el alta + el inbox autenticado +
-- el número AES-GCM + el permiso vinculado. Un error revierte TODO.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_supplier_enroll_contacts_mvp307(
 p_code text,p_chat_hmac text,p_message_hmac text,
 p_nonce_b64 text,p_ciphertext_b64 text,p_plaintext_sha256 text,
 p_source_unix bigint,p_contact_sha256 text,
 p_contact_nonce_b64 text,p_contact_ciphertext_b64 text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $enroll$
DECLARE v_supplier text; v_registered jsonb; v_bound jsonb; v_expected text;
BEGIN
 IF p_code IS NULL OR p_code !~ '^[a-f0-9]{32}$'
 OR p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$'
 OR p_message_hmac IS NULL OR p_message_hmac !~ '^[a-f0-9]{64}$'
 OR p_plaintext_sha256 IS NULL OR p_plaintext_sha256 !~ '^[a-f0-9]{64}$'
 OR p_nonce_b64 IS NULL OR p_nonce_b64 !~ '^[A-Za-z0-9+/]{16}$'
 OR p_ciphertext_b64 IS NULL
 OR length(p_ciphertext_b64) NOT BETWEEN 24 AND 20000
 OR p_ciphertext_b64 !~ '^[A-Za-z0-9+/=]+$'
 OR p_contact_sha256 IS NULL OR p_contact_sha256 !~ '^[a-f0-9]{64}$'
 OR p_contact_nonce_b64 IS NULL
 OR length(p_contact_nonce_b64) NOT BETWEEN 16 AND 40
 OR p_contact_ciphertext_b64 IS NULL
 OR length(p_contact_ciphertext_b64) NOT BETWEEN 32 AND 300
 OR p_source_unix IS NULL
 OR abs(p_source_unix-extract(epoch FROM clock_timestamp())::bigint)>300
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 v_expected:=encode(sha256(convert_to(
   'COTI ALTA '||p_code||' CONTACTOS SI','UTF8')),'hex');
 IF v_expected<>p_plaintext_sha256
 THEN RETURN jsonb_build_object('state','invalid_phrase');END IF;
 IF NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.integration_flags
  WHERE only_row AND whatsapp_inbound_enabled)
 THEN RETURN jsonb_build_object('state','inbound_disabled');END IF;
 SELECT ec.participant_key INTO v_supplier
 FROM cotironda_piloto_privado.enrollment_codes ec
 JOIN cotironda_piloto_privado.participants p ON p.key=ec.participant_key
 WHERE ec.code_hash=encode(sha256(convert_to(p_code,'UTF8')),'hex')
  AND ec.consumed_at IS NULL AND ec.expires_at>clock_timestamp()
  AND p.participant_role='supplier' AND p.chat_hmac IS NULL
  AND p.opted_out_at IS NULL
 FOR UPDATE OF ec;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','code_not_valid');END IF;
 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.whapi_inbox
  WHERE message_hmac=p_message_hmac)
 THEN RETURN jsonb_build_object('state','duplicate');END IF;
 v_registered:=public.cotironda_piloto_enroll_whapi_v1(
   p_code,p_chat_hmac);
 IF v_registered->>'state'<>'enrolled'
 OR v_registered->>'participant' IS DISTINCT FROM v_supplier
 THEN RAISE EXCEPTION 'mvp307_enrollment_transaction_reverted'
   USING ERRCODE='23514';END IF;
 -- Almacenar el evento original ya autenticado y cifrado; el código
 -- de un solo uso permanece en el vault AES, nunca como texto en DB.
 INSERT INTO cotironda_piloto_privado.whapi_inbox(
  message_hmac,chat_hmac,participant_key,kind,nonce_b64,ciphertext_b64,
  plaintext_sha256,source_unix,processing_state
 ) VALUES(p_message_hmac,p_chat_hmac,v_supplier,'text',
  p_nonce_b64,p_ciphertext_b64,p_plaintext_sha256,p_source_unix,
  'needs_review');
 v_bound:=public.cotironda_piloto_bind_contact_mvp109(
   p_message_hmac,p_chat_hmac,p_contact_sha256,
   p_contact_nonce_b64,p_contact_ciphertext_b64);
 IF v_bound->>'state' NOT IN ('bound','already_bound')
 THEN RAISE EXCEPTION 'mvp307_contact_binding_reverted'
   USING ERRCODE='23514';END IF;
 INSERT INTO cotironda_piloto_privado.contact_reveal_consents_mvp109(
  participant_key,approved_at,revoked_at,source_message_hmac)
 VALUES(v_supplier,clock_timestamp(),NULL,p_message_hmac);
 INSERT INTO cotironda_piloto_privado.supplier_enrollment_contact_proof_mvp307(
  supplier_key,message_hmac,code_hash,accepted_text_sha256,
  consent_policy_version)
 VALUES(v_supplier,p_message_hmac,
  encode(sha256(convert_to(p_code,'UTF8')),'hex'),
  p_plaintext_sha256,1);
 RETURN jsonb_build_object('state','enrolled_with_contact',
  'supplier',v_supplier,'consent_policy_version',1);
END $enroll$;
REVOKE ALL ON FUNCTION
 public.cotironda_piloto_supplier_enroll_contacts_mvp307(
 text,text,text,text,text,text,bigint,text,text,text)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_supplier_enroll_contacts_mvp307(
 text,text,text,text,text,text,bigint,text,text,text)
 TO service_role;

-- Verificación compartida, SIN devolver teléfono, de las dos modalidades
-- reales: frase explícita histórica MVP109 o alta en 1 mensaje MVP307.
CREATE OR REPLACE FUNCTION cotironda_piloto_privado.proveedor_contactable_mvp307(
 p_supplier text
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $eligible$
 SELECT coalesce(EXISTS(
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
 ),false);
$eligible$;
REVOKE ALL ON FUNCTION
 cotironda_piloto_privado.proveedor_contactable_mvp307(text)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION
 cotironda_piloto_privado.proveedor_contactable_mvp307(text) TO service_role;

-- A partir de la activación del modo automático, el MODELO sólo ve
-- proveedores ya habilitados, no lee consentimientos ni teléfonos.
-- Conserva mismo JSON para el clasificador IA Central.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_catalogo_mvp220(
  p_buyer_chat_hmac text,
  p_delivery_city text
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_suppliers integer;
  v_too_large boolean;
  v_catalogues jsonb;
BEGIN
  IF p_buyer_chat_hmac IS NULL
     OR p_buyer_chat_hmac !~ '^[a-f0-9]{64}$'
     OR p_delivery_city IS NULL
     OR length(btrim(p_delivery_city)) NOT BETWEEN 3 AND 80
     OR p_delivery_city ~ '[[:cntrl:]]'
  THEN RETURN jsonb_build_object('state','invalid_input'); END IF;

  -- El comprador debe existir y estar autorizado. No se expone contacto.
  IF NOT EXISTS(
    SELECT 1 FROM cotironda_piloto_privado.participants buyer
    WHERE buyer.participant_role='buyer'
      AND buyer.chat_hmac=p_buyer_chat_hmac
      AND buyer.consent_at IS NOT NULL
      AND buyer.opted_out_at IS NULL
  ) THEN RETURN jsonb_build_object('state','not_authorized'); END IF;

  -- No devolver TODOS los catálogos truncados: fallar explícitamente.
  SELECT count(*), coalesce(bool_or(s.items_count>150),false)
  INTO v_suppliers,v_too_large
  FROM (
    SELECT p.key,count(c.line_no)::integer AS items_count
    FROM cotironda_piloto_privado.participants p
    JOIN cotironda_piloto_privado.catalogue_lines c
      ON c.participant_key=p.key
    WHERE p.participant_role='supplier'
      AND p.chat_hmac IS NOT NULL
      AND p.consent_at IS NOT NULL AND p.opted_out_at IS NULL
      AND (NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_auto_release_gate_mvp306 g
       WHERE g.only_row AND g.enabled AND g.activated_at IS NOT NULL)
       OR cotironda_piloto_privado.proveedor_contactable_mvp307(p.key))
      AND lower(btrim(p.delivery_city))=lower(btrim(p_delivery_city))
    GROUP BY p.key
  ) s;
  IF v_suppliers>25 OR v_too_large THEN
    RETURN jsonb_build_object('state','too_many_catalogue_lines');
  END IF;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'clave',p.key,
      'localidad',p.delivery_city,
      'catalogoConfirmado',p.catalogue_confirmed_at IS NOT NULL,
      'articulos',cl.lines
    ) ORDER BY p.key
  ),'[]'::jsonb) INTO v_catalogues
  FROM cotironda_piloto_privado.participants p
  CROSS JOIN LATERAL (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'numero',c.line_no,
      'descripcion',c.literal_description,
      'familiaAnterior',c.family_code,
      'revisionAnterior',c.recognition_state
    ) ORDER BY c.line_no),'[]'::jsonb) AS lines
    FROM cotironda_piloto_privado.catalogue_lines c
    WHERE c.participant_key=p.key
  ) cl
  WHERE p.participant_role='supplier'
    AND p.chat_hmac IS NOT NULL
    AND p.consent_at IS NOT NULL AND p.opted_out_at IS NULL
      AND (NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_auto_release_gate_mvp306 g
       WHERE g.only_row AND g.enabled AND g.activated_at IS NOT NULL)
       OR cotironda_piloto_privado.proveedor_contactable_mvp307(p.key))
    AND lower(btrim(p.delivery_city))=lower(btrim(p_delivery_city))
    AND jsonb_array_length(cl.lines)>0;

  RETURN jsonb_build_object(
    'state','catalogue_snapshot',
    'localidad',btrim(p_delivery_city),
    'proveedores',v_catalogues,
    'proveedoresSinConfirmar',(
      SELECT count(*) FROM jsonb_array_elements(v_catalogues) x
      WHERE x->>'catalogoConfirmado'='false'
    )
  );
END
$function$;

-- SECURITY DEFINER en public: acceso SOLO al backend con service_role.
REVOKE ALL ON FUNCTION
 public.cotironda_piloto_ia_catalogo_mvp220(text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_ia_catalogo_mvp220(text,text)
 TO service_role;


-- También validar el permiso nuevamente justo antes del envío.
CREATE OR REPLACE FUNCTION cotironda_piloto_privado.proveedores_contactables_mvp306(
 p_request uuid
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $all_eligible$
 SELECT EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_shadow_destinos_mvp221
  WHERE request_id=p_request)
 AND NOT EXISTS(
  SELECT 1 FROM (
   SELECT DISTINCT supplier_key
   FROM cotironda_piloto_privado.ai_shadow_destinos_mvp221
   WHERE request_id=p_request
  ) d
  WHERE NOT cotironda_piloto_privado.proveedor_contactable_mvp307(d.supplier_key)
 )
 -- MVP304 identifica contactos por etiqueta. Evitar ambigüedad entre
 -- dos invitados con el MISMO nombre comercial, sin divulgar otros datos.
 AND NOT EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.ai_shadow_destinos_mvp221 d
  JOIN cotironda_piloto_privado.participants p ON p.key=d.supplier_key
  WHERE d.request_id=p_request
  GROUP BY lower(trim(p.display_label))
  HAVING count(DISTINCT d.supplier_key)>1
 );
$all_eligible$;
REVOKE ALL ON FUNCTION
 cotironda_piloto_privado.proveedores_contactables_mvp306(uuid)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION
 cotironda_piloto_privado.proveedores_contactables_mvp306(uuid)
 TO service_role;

-- MVP304: el comprador ve el WhatsApp si se acreditó en el alta
-- O mediante el consentimiento individual histórico, nunca antes del cierre.
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
 -- No unauthenticated self-registration / importer is consent.
 -- Consent record MUST be bound to the authenticated, hash-verified literal
 -- opt-in message (MVP109). A later revocation or opt-out instantly blocks.
 WITH verified AS (
  SELECT p.key,p.display_label,p.chat_hmac,ch.nonce_b64,ch.ciphertext_b64
  FROM cotironda_piloto_privado.invitations i
  JOIN cotironda_piloto_privado.participants p
   ON p.key=i.supplier_key AND p.participant_role='supplier'
  JOIN cotironda_piloto_privado.participant_channels_mvp109 ch
   ON ch.participant_key=p.key AND ch.chat_hmac=p.chat_hmac
  WHERE i.request_id=v_request AND i.state='prepared'
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

