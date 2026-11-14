-- D016 P0 / #838. Revocar globalmente la cesión de originales con
-- "NO COMPARTIR" por WhatsApp autenticado. Solo Supabase PILOTO / SQL privado.
-- CANDIDATO. No activa sharing, no crea consentimientos, no envía mensajes.

CREATE TABLE cotironda_piloto_privado.v2_d016_supplier_original_optout_events(
 message_hmac text PRIMARY KEY REFERENCES
  cotironda_piloto_privado.whapi_inbox(message_hmac),
 supplier_key text NOT NULL REFERENCES
  cotironda_piloto_privado.participants(key),
 chat_hmac text NOT NULL CHECK(chat_hmac ~ '^[a-f0-9]{64}$'),
 received_at timestamptz NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX v2_d016_supplier_original_optouts_by_supplier
 ON cotironda_piloto_privado.v2_d016_supplier_original_optout_events
 (supplier_key,received_at DESC);
ALTER TABLE cotironda_piloto_privado.v2_d016_supplier_original_optout_events
 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.v2_d016_supplier_original_optout_events
 FROM PUBLIC,anon,authenticated,service_role;

-- Impedir que una aceptación ANTERIOR a "NO COMPARTIR" reaparezca
-- como vigente. Una futura aceptación nueva es válida solo si su prueba
-- es genuinamente POSTERIOR a la baja y cumple el proceso legal aprobado.
-- Se bloquea la fila del proveedor en ambos caminos para serializar
-- bajas y renovaciones concurrentes de consentimiento.
CREATE FUNCTION cotironda_piloto_privado.v2_d016_guard_original_reconsent()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $guard$
BEGIN
 PERFORM 1 FROM cotironda_piloto_privado.participants s
 WHERE s.key=NEW.supplier_key FOR UPDATE;
 IF NEW.revoked_at IS NULL AND EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.v2_d016_supplier_original_optout_events o
  WHERE o.supplier_key=NEW.supplier_key AND o.received_at>=NEW.accepted_at
 ) THEN
  RAISE EXCEPTION 'd016_original_consent_older_than_optout'
   USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END
$guard$;
REVOKE ALL ON FUNCTION
 cotironda_piloto_privado.v2_d016_guard_original_reconsent()
 FROM PUBLIC,anon,authenticated,service_role;

CREATE TRIGGER v2_d016_guard_original_reconsent
 BEFORE INSERT OR UPDATE OF accepted_at,revoked_at
 ON cotironda_piloto_privado.v2_supplier_original_consents
 FOR EACH ROW EXECUTE FUNCTION
 cotironda_piloto_privado.v2_d016_guard_original_reconsent();

-- Es un único comando de WhatsApp, no un paso extra por cada oferta.
-- No revoca la participación del proveedor: solo el uso de sus originales.
-- No requiere que exista aviso/ronda: también afecta nuevas invitaciones.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_v2_d016_revoke_by_whapi_text_private(
 p_message_hmac text,p_chat_hmac text
) RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER
 SET search_path TO '' AS $fn$
DECLARE
 v_sender record;
 v_optouts integer:=0;
 v_consents integer:=0;
 v_notices integer:=0;
BEGIN
 IF p_message_hmac IS NULL OR p_message_hmac !~ '^[a-f0-9]{64}$'
 OR p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$'
 THEN RETURN 0;END IF;

 -- ÚNICA fuente: WhatsApp guardado previamente, participante supplier,
 -- mismo chat verificado y SHA del cuerpo exacto; el caller no manda texto.
 SELECT src.message_hmac,src.participant_key AS supplier_key,
        src.chat_hmac,src.received_at
 INTO v_sender
 FROM cotironda_piloto_privado.whapi_inbox src
 JOIN cotironda_piloto_privado.participants supplier
  ON supplier.key=src.participant_key
  AND supplier.chat_hmac=src.chat_hmac
  AND supplier.participant_role='supplier'
 WHERE src.message_hmac=p_message_hmac AND src.chat_hmac=p_chat_hmac
  AND src.kind='text' AND src.received_at<=clock_timestamp()
  AND src.plaintext_sha256 IN (
   SELECT encode(pg_catalog.sha256(pg_catalog.convert_to(msg,'UTF8')),'hex')
   FROM pg_catalog.unnest(ARRAY[
    'NO COMPARTIR','No compartir','no compartir',
    'NO COMPARTIR.','No compartir.','no compartir.'
   ]::text[]) AS msg
  )
 FOR UPDATE OF supplier;

 IF NOT FOUND THEN RETURN 0;END IF;

 -- Evidencia global, append-only, con FK al mensaje entrante.
 INSERT INTO cotironda_piloto_privado.v2_d016_supplier_original_optout_events
 (message_hmac,supplier_key,chat_hmac,received_at)
 VALUES(v_sender.message_hmac,v_sender.supplier_key,
        v_sender.chat_hmac,v_sender.received_at)
 ON CONFLICT (message_hmac) DO NOTHING;
 GET DIAGNOSTICS v_optouts=ROW_COUNT;

 -- Invalida la autorización ÚNICA del proveedor, incluso cuando no hay
 -- ningún pedido abierto. Las cotizaciones futuras siguen permitidas.
 UPDATE cotironda_piloto_privado.v2_supplier_original_consents consent
 SET revoked_at=v_sender.received_at
 WHERE consent.supplier_key=v_sender.supplier_key
  AND consent.accepted_at<=v_sender.received_at
  AND (consent.revoked_at IS NULL
       OR consent.revoked_at>v_sender.received_at);
 GET DIAGNOSTICS v_consents=ROW_COUNT;

 -- Anula además las evidencias de todas las rondas ya avisadas al chat.
 INSERT INTO cotironda_piloto_privado.v2_d016_original_notice_revocations
 (request_id,supplier_key,message_hmac,revoked_at)
 SELECT notice.request_id,notice.supplier_key,
        v_sender.message_hmac,v_sender.received_at
 FROM cotironda_piloto_privado.v2_d016_original_notice_ledger notice
 WHERE notice.supplier_key=v_sender.supplier_key
  AND notice.chat_hmac=v_sender.chat_hmac
  AND notice.reserved_at<=v_sender.received_at
 ON CONFLICT (request_id,supplier_key) DO NOTHING;
 GET DIAGNOSTICS v_notices=ROW_COUNT;

 RETURN v_optouts+v_consents+v_notices;
END
$fn$;
REVOKE ALL ON FUNCTION
 public.cotironda_piloto_v2_d016_revoke_by_whapi_text_private(text,text)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_v2_d016_revoke_by_whapi_text_private(text,text)
 TO service_role;
