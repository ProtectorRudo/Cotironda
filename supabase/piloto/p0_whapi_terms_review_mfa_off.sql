-- P0 operator review of explicit original-download enrollment — development OFF.
-- Install only with approved original-terms policy and operator Auth MFA AAL2.
-- Requires M267, M362/M364/M365, pilot whapi_inbox with AES-GCM fields.
-- No service_role override, no general API table grants, no automatic consent.
DO $deps$ BEGIN
 IF to_regprocedure('cotironda_piloto_privado.operator_session_mvp267()') IS NULL
 OR to_regclass('cotironda_piloto_privado.original_terms_policy_mvp362') IS NULL
 OR to_regclass('cotironda_piloto_privado.supplier_original_terms_notices_mvp364') IS NULL
 OR to_regclass('cotironda_piloto_privado.supplier_original_optins_mvp362') IS NULL
 OR to_regclass('cotironda_piloto_privado.whapi_inbox') IS NULL
 THEN RAISE EXCEPTION 'p0_review_dependencies_unavailable' USING errcode='42501';
 END IF;
END $deps$;

CREATE TABLE cotironda_piloto_privado.supplier_original_reviews_p0 (
 evidence_message_hmac text PRIMARY KEY
   CHECK(evidence_message_hmac ~ '^[a-f0-9]{64}$'),
 supplier_key text NOT NULL REFERENCES cotironda_piloto_privado.participants(key),
 notice_message_hmac text NOT NULL REFERENCES
   cotironda_piloto_privado.supplier_original_terms_notices_mvp364(notice_message_hmac),
 terms_version text NOT NULL REFERENCES
   cotironda_piloto_privado.original_terms_policy_mvp362(terms_version),
 plaintext_sha256 text NOT NULL CHECK(plaintext_sha256 ~ '^[a-f0-9]{64}$'),
 decision text NOT NULL CHECK(decision IN ('explicit_accept','not_explicit')),
 reviewed_by_operator uuid NOT NULL,
 review_sha256 text NOT NULL CHECK(review_sha256 ~ '^[a-f0-9]{64}$'),
 reviewed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(reviewed_at<=clock_timestamp()+interval '1 minute')
);
ALTER TABLE cotironda_piloto_privado.supplier_original_reviews_p0
 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.supplier_original_reviews_p0
 FROM PUBLIC,anon,authenticated,service_role;

-- Shared candidate resolver for review and final COMMIT.
-- A message may be reviewed only if it was actually persisted by the Whapi
-- authenticated inbox, from the SAME supplier/chat, in TEXT mode, outside
-- any quote round, AFTER a currently approved/versioned notice to this chat.
-- The newest valid earlier notice is used; never allow choosing an old
-- notice after another revocation or replacing/retrospectively changing terms.
CREATE FUNCTION cotironda_piloto_privado.terms_review_candidate_p0(
 p_message_hmac text
) RETURNS TABLE(
 supplier_key text,notice_message_hmac text,terms_version text,
 terms_sha256 text,chat_hmac text,message_hmac text,
 plaintext_sha256 text,received_at timestamptz,
 nonce_b64 text,ciphertext_b64 text,terms_body text
) LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
 SELECT p.key,n.notice_message_hmac,n.terms_version,t.terms_sha256,
   msg.chat_hmac,msg.message_hmac,msg.plaintext_sha256,msg.received_at,
   msg.nonce_b64,msg.ciphertext_b64,t.terms_body
 FROM cotironda_piloto_privado.whapi_inbox msg
 JOIN cotironda_piloto_privado.participants p
   ON p.key=msg.participant_key AND p.participant_role='supplier'
   AND p.chat_hmac=msg.chat_hmac AND p.consent_at IS NOT NULL
   AND p.opted_out_at IS NULL
 JOIN cotironda_piloto_privado.original_terms_policy_mvp362 t
   ON t.terms_version='cotironda-originales-alta-v1'
   AND t.enabled=true AND t.approved_at IS NOT NULL
   AND t.activated_at IS NOT NULL
   AND t.activated_at<=msg.received_at
   AND t.terms_sha256=encode(extensions.digest(
     convert_to(t.terms_body,'UTF8'),'sha256'),'hex')
 JOIN LATERAL (
   SELECT n.notice_message_hmac,n.terms_version,n.terms_sha256,
      n.sent_at,n.recorded_at
   FROM cotironda_piloto_privado.supplier_original_terms_notices_mvp364 n
   WHERE n.supplier_key=p.key AND n.terms_version=t.terms_version
     AND n.terms_sha256=t.terms_sha256
     AND n.supplier_chat_hmac=msg.chat_hmac
     AND n.outbound_body_sha256=n.terms_sha256
     AND n.delivery_state='api_accepted'
     AND n.sent_at>=t.activated_at AND n.sent_at<msg.received_at
     AND n.recorded_at<=msg.received_at
     -- After a withdrawal the supplier must get a FRESH terms notice
     -- before sending a NEW affirmative response.
     AND NOT EXISTS (
       SELECT 1
       FROM cotironda_piloto_privado.supplier_original_revocations_mvp362 r
       WHERE r.supplier_key=p.key AND r.terms_version=n.terms_version
         AND r.recorded_at<=clock_timestamp()
         AND (r.recorded_at>=n.sent_at OR r.revoked_at>=n.sent_at)
     )
   ORDER BY n.sent_at DESC,n.recorded_at DESC,n.notice_message_hmac DESC
   LIMIT 1
 ) n ON true
 WHERE msg.message_hmac=p_message_hmac AND msg.kind='text'
   AND msg.request_id IS NULL AND msg.received_at<=clock_timestamp()
   AND msg.plaintext_sha256 ~ '^[a-f0-9]{64}$'
   AND msg.nonce_b64 IS NOT NULL AND msg.ciphertext_b64 IS NOT NULL
   AND length(msg.nonce_b64)>0 AND length(msg.ciphertext_b64)>0
   AND NOT EXISTS (
     SELECT 1 FROM cotironda_piloto_privado.supplier_original_reviews_p0 r
     WHERE r.evidence_message_hmac=msg.message_hmac
   )
   AND NOT EXISTS (
     SELECT 1 FROM cotironda_piloto_privado.supplier_original_optins_mvp362 o
     WHERE o.evidence_message_hmac=msg.message_hmac
   )
 LIMIT 1;
$fn$;
REVOKE ALL ON FUNCTION
 cotironda_piloto_privado.terms_review_candidate_p0(text)
 FROM PUBLIC,anon,authenticated,service_role;

-- Returns encrypted evidence ONLY to an active Supabase Auth AAL2 incident
-- manager with an unrevoked live session (M267). Caller never supplies
-- supplier_key, phone, actor UUID or consent boolean.
CREATE FUNCTION public.cotironda_piloto_terms_review_packet_auth_p0(
 p_message_hmac text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE actor uuid; candidate record;
BEGIN
 actor:=cotironda_piloto_privado.operator_session_mvp267();
 IF actor IS NULL THEN RETURN jsonb_build_object('state','not_authorized');END IF;
 IF p_message_hmac IS NULL OR
    p_message_hmac !~ '^[a-f0-9]{64}$'
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 SELECT * INTO candidate
 FROM cotironda_piloto_privado.terms_review_candidate_p0(p_message_hmac);
 IF NOT FOUND THEN RETURN jsonb_build_object('state','unavailable');END IF;
 RETURN jsonb_build_object(
   'state','ready','messageHmac',candidate.message_hmac,
   'supplierKey',candidate.supplier_key,
   'noticeMessageHmac',candidate.notice_message_hmac,
   'termsVersion',candidate.terms_version,
   'termsSha256',candidate.terms_sha256,
   'termsBody',candidate.terms_body,
   'chatHmac',candidate.chat_hmac,
   'receivedAt',candidate.received_at,
   'plaintextSha256',candidate.plaintext_sha256,
   'nonceB64',candidate.nonce_b64,
   'ciphertextB64',candidate.ciphertext_b64
 );
END;$fn$;
REVOKE ALL ON FUNCTION
 public.cotironda_piloto_terms_review_packet_auth_p0(text)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_terms_review_packet_auth_p0(text)
 TO authenticated;

-- Separate, explicit HUMAN decision. Requires the exact DECRYPTED incoming
-- message text to cryptographically match the immutable inbox SHA. It is
-- not stored or echoed. An operator may attest 'explicit_accept' only after
-- personally reading that text; uncertainty must be 'not_explicit'.
-- Database validates evidence/identity/timing, NOT language intent.
CREATE FUNCTION public.cotironda_piloto_terms_review_decide_auth_p0(
 p_message_hmac text,p_notice_message_hmac text,
 p_reviewed_text text,p_decision text,p_human_attestation boolean
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE actor uuid; candidate record; calculated_sha text;
 decision_sha text; stamp timestamptz;
BEGIN
 actor:=cotironda_piloto_privado.operator_session_mvp267();
 IF actor IS NULL THEN RETURN jsonb_build_object('state','not_authorized');END IF;
 IF p_message_hmac IS NULL OR p_message_hmac !~ '^[a-f0-9]{64}$'
   OR p_notice_message_hmac IS NULL
   OR p_notice_message_hmac !~ '^[a-f0-9]{64}$'
   OR p_reviewed_text IS NULL OR length(p_reviewed_text) NOT BETWEEN 1 AND 3000
   OR p_decision IS NULL OR p_decision NOT IN ('explicit_accept','not_explicit')
   OR p_human_attestation IS DISTINCT FROM true
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 -- Lock the evidence row so duplicate human decisions serialize. Never
 -- derive permission from a client-supplied supplier, phone or reviewer UUID.
 PERFORM 1 FROM cotironda_piloto_privado.whapi_inbox
 WHERE message_hmac=p_message_hmac FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','unavailable');END IF;
 SELECT * INTO candidate
 FROM cotironda_piloto_privado.terms_review_candidate_p0(p_message_hmac);
 IF NOT FOUND OR candidate.notice_message_hmac<>p_notice_message_hmac
 THEN RETURN jsonb_build_object('state','unavailable');END IF;
 calculated_sha:=encode(extensions.digest(
     convert_to(p_reviewed_text,'UTF8'),'sha256'),'hex');
 IF calculated_sha<>candidate.plaintext_sha256
 THEN RETURN jsonb_build_object('state','mismatch');END IF;
 stamp:=clock_timestamp();
 decision_sha:=encode(extensions.digest(convert_to(
   'cotironda|p0|review|1|'||actor::text||'|'||
   p_message_hmac||'|'||p_notice_message_hmac||'|'||
   calculated_sha||'|'||p_decision||'|'||
   to_char(stamp AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US'),
  'UTF8'),'sha256'),'hex');
 INSERT INTO cotironda_piloto_privado.supplier_original_reviews_p0
 (evidence_message_hmac,supplier_key,notice_message_hmac,terms_version,
  plaintext_sha256,decision,reviewed_by_operator,review_sha256,reviewed_at)
 VALUES(p_message_hmac,candidate.supplier_key,p_notice_message_hmac,
  candidate.terms_version,calculated_sha,p_decision,actor,decision_sha,stamp);
 IF p_decision='explicit_accept' THEN
   -- This INSERT must COMMIT together with review ledger; never produce
   -- opt-in from transport ACK, without an inbox event or from old rounds.
   INSERT INTO cotironda_piloto_privado.supplier_original_optins_mvp362
   (supplier_key,terms_version,terms_sha256,notice_message_hmac,
    evidence_message_hmac,ack_plaintext_sha256,accepted_at,recorded_at,
    reviewed_by_operator,evidence_review_sha256)
   VALUES(candidate.supplier_key,candidate.terms_version,
    candidate.terms_sha256,candidate.notice_message_hmac,
    candidate.message_hmac,calculated_sha,candidate.received_at,stamp,
    actor,decision_sha);
 END IF;
 RETURN jsonb_build_object('state','recorded','decision',p_decision);
END;$fn$;
REVOKE ALL ON FUNCTION
 public.cotironda_piloto_terms_review_decide_auth_p0(
 text,text,text,text,boolean)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_terms_review_decide_auth_p0(
 text,text,text,text,boolean)
 TO authenticated;
