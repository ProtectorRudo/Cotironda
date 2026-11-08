-- MVP304 - Servicio PRIVADO: contactos consentidos de TODOS los proveedores
-- invitados en una ronda cerrada. NO se limita a 2 finalistas.
-- NO incluye contacto del comprador. NO modifica consentimiento ni envía WA.
-- Depende de MVP303; requiere un consentimiento WhatsApp autentico
-- 'COTI CONTACTOS SI' (MVP109) no revocado + número AES-GCM vinculado.
-- Sin autorización individual, el comprador sigue viendo NOMBRE pero NO número.
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
    AND p.consent_at IS NOT NULL AND p.opted_out_at IS NULL
  JOIN cotironda_piloto_privado.participant_channels_mvp109 ch
    ON ch.participant_key=p.key AND ch.chat_hmac=p.chat_hmac
  JOIN cotironda_piloto_privado.contact_reveal_consents_mvp109 c
    ON c.participant_key=p.key
   AND c.approved_at IS NOT NULL AND c.revoked_at IS NULL
  JOIN cotironda_piloto_privado.whapi_inbox consent_source
    ON consent_source.message_hmac=c.source_message_hmac
   AND consent_source.participant_key=p.key
   AND consent_source.chat_hmac=p.chat_hmac
   AND consent_source.kind='text'
   AND consent_source.plaintext_sha256=encode(
      sha256(convert_to('COTI CONTACTOS SI','UTF8')),'hex')
  JOIN cotironda_piloto_privado.whapi_inbox bound_source
    ON bound_source.message_hmac=ch.authenticated_message_hmac
   AND bound_source.participant_key=p.key
   AND bound_source.chat_hmac=p.chat_hmac
  WHERE i.request_id=v_request AND i.state='prepared'
    AND c.approved_at>=consent_source.received_at
    AND p.display_label IS NOT NULL
    AND length(trim(p.display_label)) BETWEEN 2 AND 100
    AND p.display_label !~ '[[:cntrl:]<>]'
    AND p.display_label !~ '[0-9]{8,}'
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
