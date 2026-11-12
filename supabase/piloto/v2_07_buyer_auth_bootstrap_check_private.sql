-- Cotironda V2-07 · BOOTSTRAP FIRST BUYER, AUTH CHECK ONLY.
-- CANDIDATE / NOT INSTALLED. Run ONLY after "Publicalo" for PILOT.
-- No personal data is returned. The operator derives SHA256 from exact
-- E.164 digits (without plus) + '@s.whatsapp.net' locally on the server.
-- Non-matching WhatsApp conventions must fail closed; never bind by name.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_v2_bootstrap_buyer_check_private(
 p_buyer_key text,p_contact_sha256 text
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $buyer$
DECLARE v_matches integer;
BEGIN
 IF p_buyer_key IS NULL OR p_buyer_key !~ '^[a-z0-9_-]{3,100}$'
 OR p_contact_sha256 IS NULL OR p_contact_sha256 !~ '^[a-f0-9]{64}$'
 THEN RETURN false;END IF;
 SELECT count(*) INTO v_matches
 FROM cotironda_piloto_privado.participants buyer
 JOIN cotironda_piloto_privado.participant_channels_mvp109 channel
  ON channel.participant_key=buyer.key AND
     channel.chat_hmac=buyer.chat_hmac
 JOIN cotironda_piloto_privado.whapi_inbox proof
  ON proof.message_hmac=channel.authenticated_message_hmac
  AND proof.participant_key=buyer.key
  AND proof.chat_hmac=buyer.chat_hmac
  AND proof.kind='text'
  AND proof.received_at<=clock_timestamp()
 WHERE buyer.key=p_buyer_key
  AND buyer.participant_role='buyer'
  AND buyer.consent_at IS NOT NULL
  AND buyer.consent_at<=clock_timestamp()
  AND buyer.opted_out_at IS NULL
  AND buyer.chat_hmac ~ '^[a-f0-9]{64}$'
  AND channel.contact_sha256=p_contact_sha256
  AND NOT EXISTS(
   SELECT 1
   FROM cotironda_piloto_privado.participant_channels_mvp109 other
   JOIN cotironda_piloto_privado.participants p
    ON p.key=other.participant_key
   WHERE other.contact_sha256=p_contact_sha256
    AND other.participant_key<>buyer.key
    AND p.participant_role='buyer'
    AND p.opted_out_at IS NULL
  );
 -- A single verified channel only: no ambiguous WhatsApp account mapping.
 RETURN v_matches=1;
END
$buyer$;
REVOKE ALL ON FUNCTION
 public.cotironda_piloto_v2_bootstrap_buyer_check_private(text,text)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_v2_bootstrap_buyer_check_private(text,text)
 TO service_role;
