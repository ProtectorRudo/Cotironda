-- MVP312C: post-close contacts only to the authenticated buyer;
-- no buyer numbers, no open-round leaks, no plain WhatsApp addresses.

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
 -- Two distinct authorized provenances: authenticated Whapi message
 -- OR owner-vouched commercial number with an immutable administrative record.
 -- Any later revocation/optout always blocks both.
 WITH verified AS (
  SELECT p.key,p.display_label,p.chat_hmac,
    coalesce(ch.nonce_b64,operator_ch.nonce_b64) AS nonce_b64,
    coalesce(ch.ciphertext_b64,operator_ch.ciphertext_b64) AS ciphertext_b64
  FROM cotironda_piloto_privado.invitations i
  JOIN cotironda_piloto_privado.participants p
   ON p.key=i.supplier_key AND p.participant_role='supplier'
  LEFT JOIN cotironda_piloto_privado.participant_channels_mvp109 ch
   ON ch.participant_key=p.key AND ch.chat_hmac=p.chat_hmac
  LEFT JOIN cotironda_piloto_privado.admin_channels_mvp312 operator_ch
   ON operator_ch.participant_key=p.key AND operator_ch.chat_hmac=p.chat_hmac
    AND operator_ch.participant_role='supplier'
  WHERE i.request_id=v_request AND i.state='prepared'
   AND (ch.participant_key IS NOT NULL OR operator_ch.participant_key IS NOT NULL)
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

