-- Cotironda V2 D016 P0. CANDIDATO: alta única de originales por proveedor.
-- No aprobar términos, no crear consentimientos, no habilitar originales.
-- La aprobación jurídica debe quedar en una fila privada distinta ANTES de
-- reservar o enviar un único aviso por WhatsApp al nuevo proveedor.

CREATE TABLE cotironda_piloto_privado.v2_d016_supplier_terms_approval(
 version text PRIMARY KEY CHECK(version='cotironda-originales-v2'),
 terms_sha256 text NOT NULL CHECK(terms_sha256 ~ '^[a-f0-9]{64}$'),
 notice_body_sha256 text NOT NULL
  CHECK(notice_body_sha256 ~ '^[a-f0-9]{64}$'),
 approved_at timestamptz NOT NULL,
 approval_ref text NOT NULL CHECK(length(btrim(approval_ref)) BETWEEN 10 AND 200)
);
ALTER TABLE cotironda_piloto_privado.v2_d016_supplier_terms_approval
 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.v2_d016_supplier_terms_approval
 FROM PUBLIC,anon,authenticated,service_role;
-- Sin INSERT de política: jurídica/propietario deben aprobar el texto exacto.
-- Nada se autoaprueba por ser proveedor existente.

CREATE TABLE cotironda_piloto_privado.v2_d016_supplier_terms_notices(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 supplier_key text NOT NULL REFERENCES cotironda_piloto_privado.participants(key),
 chat_hmac text NOT NULL CHECK(chat_hmac ~ '^[a-f0-9]{64}$'),
 version text NOT NULL CHECK(version='cotironda-originales-v2'),
 terms_sha256 text NOT NULL CHECK(terms_sha256 ~ '^[a-f0-9]{64}$'),
 notice_body_sha256 text NOT NULL
  CHECK(notice_body_sha256 ~ '^[a-f0-9]{64}$'),
 state text NOT NULL DEFAULT 'reserved'
  CHECK(state IN('reserved','api_accepted')),
 reserved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 sent_at timestamptz,
 outgoing_whapi_id text UNIQUE,
 CHECK(
  (state='reserved' AND sent_at IS NULL AND outgoing_whapi_id IS NULL)
  OR
  (state='api_accepted' AND sent_at IS NOT NULL AND
   sent_at>=reserved_at AND outgoing_whapi_id ~ '^[A-Za-z0-9._:-]{8,160}$')
 )
);
CREATE INDEX v2_d016_signup_notice_latest ON
 cotironda_piloto_privado.v2_d016_supplier_terms_notices
 (supplier_key,reserved_at DESC);
ALTER TABLE cotironda_piloto_privado.v2_d016_supplier_terms_notices
 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.v2_d016_supplier_terms_notices
 FROM PUBLIC,anon,authenticated,service_role;

-- Se reserva la evidencia de UN aviso de alta antes del envío.
-- No se manda nada en SQL. La función devuelve solo UUID servidor.
CREATE FUNCTION public.cotironda_piloto_v2_d016_reserve_signup_terms_private(
 p_supplier_key text,p_chat_hmac text,p_notice_body_sha256 text
) RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER
 SET search_path TO '' AS $reserve$
DECLARE v_notice_id uuid;v_now timestamptz:=clock_timestamp();
 v_terms record;
BEGIN
 IF p_supplier_key IS NULL OR p_chat_hmac IS NULL
  OR p_notice_body_sha256 IS NULL
  OR p_supplier_key !~ '^[a-z0-9_-]{3,100}$'
  OR p_chat_hmac !~ '^[a-f0-9]{64}$'
  OR p_notice_body_sha256 !~ '^[a-f0-9]{64}$'
 THEN RETURN NULL;END IF;

 -- Solo alta prospectiva con política de originales preparada (puede estar
 -- OFF) y texto legal aprobado sin insertar default alguno.
 SELECT t.version,t.terms_sha256,t.notice_body_sha256 INTO v_terms
 FROM cotironda_piloto_privado.v2_d016_supplier_terms_approval t
 JOIN cotironda_piloto_privado.v2_original_share_policy policy
  ON policy.singleton=true AND policy.activated_at IS NOT NULL
  AND policy.activated_at<=v_now
 JOIN cotironda_piloto_privado.participants supplier
  ON supplier.key=p_supplier_key
  AND supplier.chat_hmac=p_chat_hmac
  AND supplier.participant_role='supplier'
  AND supplier.consent_at IS NOT NULL
  AND supplier.opted_out_at IS NULL
 WHERE t.version='cotironda-originales-v2'
  AND t.approved_at<=v_now
  AND t.notice_body_sha256=p_notice_body_sha256
 FOR UPDATE OF supplier;
 IF NOT FOUND THEN RETURN NULL;END IF;

 IF EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.v2_supplier_original_consents c
  WHERE c.supplier_key=p_supplier_key AND c.revoked_at IS NULL
 ) OR EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.v2_d016_supplier_terms_notices n
  WHERE n.supplier_key=p_supplier_key
  AND n.reserved_at>=v_now-interval '24 hours'
  -- Una baja explícita posterior al último aviso permite una NUEVA
  -- aceptación con texto vigente sin quedar bloqueado 24 horas.
  AND NOT EXISTS(
   SELECT 1 FROM cotironda_piloto_privado.v2_d016_supplier_original_optout_events o
   WHERE o.supplier_key=p_supplier_key AND o.received_at>n.reserved_at
  )
 ) THEN RETURN NULL;END IF;

 INSERT INTO cotironda_piloto_privado.v2_d016_supplier_terms_notices(
  supplier_key,chat_hmac,version,terms_sha256,notice_body_sha256,
  reserved_at,state
 ) VALUES(
  p_supplier_key,p_chat_hmac,v_terms.version,v_terms.terms_sha256,
  p_notice_body_sha256,v_now,'reserved'
 ) RETURNING id INTO v_notice_id;
 RETURN v_notice_id;
END $reserve$;

-- Confirmar ACK REAL de Whapi solo si SHA coincide con lo reservado.
CREATE FUNCTION public.cotironda_piloto_v2_d016_confirm_signup_notice_private(
 p_notice_id uuid,p_whapi_id text,p_body_sha256 text
) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER
 SET search_path TO '' AS $confirm$
DECLARE v_rowcount integer;
BEGIN
 IF p_notice_id IS NULL OR p_whapi_id IS NULL
  OR p_whapi_id !~ '^[A-Za-z0-9._:-]{8,160}$'
  OR p_body_sha256 IS NULL OR p_body_sha256 !~ '^[a-f0-9]{64}$'
 THEN RETURN false;END IF;
 UPDATE cotironda_piloto_privado.v2_d016_supplier_terms_notices notice
 SET state='api_accepted',sent_at=clock_timestamp(),
     outgoing_whapi_id=p_whapi_id
 WHERE notice.id=p_notice_id AND notice.state='reserved'
  AND notice.notice_body_sha256=p_body_sha256
  AND notice.reserved_at>=clock_timestamp()-interval '1 hour';
 GET DIAGNOSTICS v_rowcount=ROW_COUNT;
 RETURN v_rowcount=1;
EXCEPTION WHEN unique_violation THEN RETURN false;
END $confirm$;

-- Única aceptación explícita en onboarding; NO por recibir una cotización.
-- Mensaje exacto de WhatsApp archivado en inbox, mismo chat autenticado,
-- mismo proveedor, posterior al aviso aprobado y a cualquier opt-out.
CREATE FUNCTION public.cotironda_piloto_v2_d016_accept_signup_terms_private(
 p_message_hmac text,p_chat_hmac text,p_outgoing_whapi_id text,
 p_is_forwarded boolean
) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER
 SET search_path TO '' AS $accept$
DECLARE v_proof record;v_rowcount integer;
BEGIN
 IF p_message_hmac IS NULL OR p_message_hmac !~ '^[a-f0-9]{64}$'
  OR p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$'
  OR p_outgoing_whapi_id IS NULL
  OR p_outgoing_whapi_id !~ '^[A-Za-z0-9._:-]{8,160}$'
  OR p_is_forwarded IS DISTINCT FROM false
 THEN RETURN false;END IF;

 -- Bloquear la identidad del proveedor para serializar con NO COMPARTIR.
 PERFORM 1 FROM cotironda_piloto_privado.whapi_inbox incoming
 JOIN cotironda_piloto_privado.participants supplier
  ON supplier.key=incoming.participant_key
  AND supplier.chat_hmac=incoming.chat_hmac
  AND supplier.participant_role='supplier'
  AND supplier.consent_at IS NOT NULL
  AND supplier.opted_out_at IS NULL
 WHERE incoming.message_hmac=p_message_hmac
  AND incoming.chat_hmac=p_chat_hmac
 FOR UPDATE OF supplier;
 IF NOT FOUND THEN RETURN false;END IF;

 SELECT incoming.participant_key AS supplier_key,incoming.message_hmac,
        incoming.received_at AS accepted_at,
        notice.sent_at,notice.id AS notice_id
 INTO v_proof
 FROM cotironda_piloto_privado.whapi_inbox incoming
 JOIN cotironda_piloto_privado.v2_d016_supplier_terms_notices notice
  ON notice.supplier_key=incoming.participant_key
  AND notice.chat_hmac=incoming.chat_hmac
  AND notice.outgoing_whapi_id=p_outgoing_whapi_id
  AND notice.state='api_accepted'
  AND notice.sent_at IS NOT NULL
 JOIN cotironda_piloto_privado.v2_d016_supplier_terms_approval terms
  ON terms.version=notice.version
  AND terms.terms_sha256=notice.terms_sha256
  AND terms.notice_body_sha256=notice.notice_body_sha256
  AND terms.approved_at<=notice.reserved_at
 JOIN cotironda_piloto_privado.v2_original_share_policy policy
  ON policy.singleton=true AND policy.activated_at IS NOT NULL
  AND policy.activated_at<=notice.reserved_at
 WHERE incoming.message_hmac=p_message_hmac
  AND incoming.chat_hmac=p_chat_hmac
  AND incoming.kind='text'
  AND incoming.request_id IS NULL
  AND incoming.plaintext_sha256=encode(
   pg_catalog.sha256(pg_catalog.convert_to(
    'ACEPTO COMPARTIR ORIGINALES COTIRONDA V2','UTF8')),'hex')
  AND incoming.received_at>notice.sent_at
  AND incoming.received_at<=notice.sent_at+interval '14 days'
  AND incoming.received_at<=clock_timestamp()
  -- Tras una revocación global, exigir AVISO NUEVO posterior, no reusar
  -- el aviso histórico para regenerar permisos.
  AND NOT EXISTS(
   SELECT 1 FROM cotironda_piloto_privado.v2_d016_supplier_original_optout_events optout
   WHERE optout.supplier_key=incoming.participant_key
    AND optout.received_at>=notice.sent_at
  )
 ORDER BY notice.sent_at DESC
 LIMIT 2;
 IF NOT FOUND THEN RETURN false;END IF;

 INSERT INTO cotironda_piloto_privado.v2_supplier_original_consents(
  supplier_key,consent_message_hmac,version,accepted_at,revoked_at
 ) VALUES(
  v_proof.supplier_key,v_proof.message_hmac,
  'cotironda-originales-v2',v_proof.accepted_at,NULL
 )
 ON CONFLICT(supplier_key) DO UPDATE
 SET consent_message_hmac=EXCLUDED.consent_message_hmac,
     accepted_at=EXCLUDED.accepted_at,revoked_at=NULL
 WHERE cotironda_piloto_privado.v2_supplier_original_consents.revoked_at IS NOT NULL
  AND EXCLUDED.accepted_at>
   cotironda_piloto_privado.v2_supplier_original_consents.accepted_at;
 GET DIAGNOSTICS v_rowcount=ROW_COUNT;
 RETURN v_rowcount=1;
END $accept$;

-- Ninguna función es ejecutable directamente por comprador/proveedor web.
REVOKE ALL ON FUNCTION
 public.cotironda_piloto_v2_d016_reserve_signup_terms_private(text,text,text),
 public.cotironda_piloto_v2_d016_confirm_signup_notice_private(uuid,text,text),
 public.cotironda_piloto_v2_d016_accept_signup_terms_private(text,text,text,boolean)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_v2_d016_reserve_signup_terms_private(text,text,text),
 public.cotironda_piloto_v2_d016_confirm_signup_notice_private(uuid,text,text),
 public.cotironda_piloto_v2_d016_accept_signup_terms_private(text,text,text,boolean)
 TO service_role;
