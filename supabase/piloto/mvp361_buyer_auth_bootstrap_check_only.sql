-- MVP361 / 2026-11-12 / ONLY DEVELOPMENT.
-- A single privileged YES/NO answer for verified WhatsApp buyer bootstrap.
-- Never returns phone numbers, buyer_key, contacts, HMACs or business data.
-- Does NOT create Auth users, send OTP/SMS/WhatsApp or alter pilot state.
-- Requires separately approved publication, live preflight and role checks.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_buyer_bootstrap_allowed_mvp361(
 p_contact_sha256 text
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $mvp361$
 SELECT
  p_contact_sha256 IS NOT NULL
  AND p_contact_sha256 ~ '^[a-f0-9]{64}$'
  AND (
   SELECT count(*)=1
   FROM cotironda_piloto_privado.participants buyer
   JOIN cotironda_piloto_privado.participant_channels_mvp109 channel
     ON channel.participant_key=buyer.key
     AND channel.chat_hmac=buyer.chat_hmac
     AND channel.contact_sha256=p_contact_sha256
     AND channel.contact_sha256 ~ '^[a-f0-9]{64}$'
     AND channel.bound_at IS NOT NULL
     AND channel.authenticated_message_hmac ~ '^[a-f0-9]{64}$'
   JOIN cotironda_piloto_privado.whapi_inbox proof
     ON proof.message_hmac=channel.authenticated_message_hmac
     AND proof.participant_key=buyer.key
     AND proof.chat_hmac=buyer.chat_hmac
     AND proof.received_at IS NOT NULL
     AND proof.received_at<=clock_timestamp()
   WHERE buyer.participant_role='buyer'
     AND buyer.consent_at IS NOT NULL
     AND buyer.opted_out_at IS NULL
     AND buyer.chat_hmac ~ '^[a-f0-9]{64}$'
     -- Do not register an orphan Auth user without a real buyer request.
     AND EXISTS (
       SELECT 1 FROM cotironda_piloto_privado.requests req
       WHERE req.buyer_key=buyer.key
         AND req.state IN ('draft','prepared','closed')
     )
     -- Strong uniqueness: no other active buyer OR supplier owns this
     -- WhatsApp identity. Cross-account/recycled phones require review.
     AND NOT EXISTS (
       SELECT 1
       FROM cotironda_piloto_privado.participant_channels_mvp109 other_channel
       JOIN cotironda_piloto_privado.participants other_person
         ON other_person.key=other_channel.participant_key
       WHERE other_channel.contact_sha256=p_contact_sha256
         AND other_person.key<>buyer.key
         AND other_person.opted_out_at IS NULL
     )
     -- Never silently create a second Auth identity for the same phone.
     AND NOT EXISTS (
       SELECT 1 FROM auth.users u
       WHERE u.phone IS NOT NULL
         AND encode(extensions.digest(
           convert_to(regexp_replace(u.phone,'^[+]','','')||
             '@s.whatsapp.net','UTF8'),'sha256'),'hex')
             =p_contact_sha256
     )
  );
$mvp361$;
REVOKE ALL ON FUNCTION
 public.cotironda_piloto_buyer_bootstrap_allowed_mvp361(text)
 FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_buyer_bootstrap_allowed_mvp361(text)
 TO service_role;
