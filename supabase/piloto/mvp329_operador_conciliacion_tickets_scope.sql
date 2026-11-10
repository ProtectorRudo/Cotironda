-- MVP329 STAGED ONLY — operator MFA + explicit buyer scope + one-time ticket.
-- Requires MVP267 (real Auth AAL2 session), MVP328 (encrypted envelope reader).
-- No user/operator/grant provisioning and NO quote approval or outbound traffic.
DO $deps$
BEGIN
 IF to_regprocedure('cotironda_piloto_privado.operator_session_mvp267()') IS NULL OR
    to_regprocedure('public.cotironda_piloto_read_reconciliation_envelope_mvp328(uuid,text,text)') IS NULL OR
    to_regclass('cotironda_piloto_privado.supervisor_operators_mvp265') IS NULL
 THEN RAISE EXCEPTION 'mvp329_required_operator_auth_or_custody_missing';END IF;
END
$deps$;

-- A DBA must deliberately assign a specific operator, buyer company and
-- request. No role/email/user_metadata/phone/linked supplier is inferred.
-- Both operator and buyer_key are rechecked against CURRENT DB state.
CREATE TABLE cotironda_piloto_privado.operator_reconciliation_grants_mvp329(
 operator_ref uuid NOT NULL REFERENCES
  cotironda_piloto_privado.supervisor_operators_mvp265(operator_ref),
 request_id uuid NOT NULL REFERENCES cotironda_piloto_privado.requests(id),
 buyer_key text NOT NULL REFERENCES cotironda_piloto_privado.participants(key),
 active boolean NOT NULL DEFAULT false,
 granted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 purpose_code text NOT NULL DEFAULT 'commercial_source_reconciliation'
  CHECK(purpose_code='commercial_source_reconciliation'),
 PRIMARY KEY(operator_ref,request_id),
 CHECK(expires_at>granted_at AND expires_at<=granted_at+interval '30 days')
);
ALTER TABLE cotironda_piloto_privado.operator_reconciliation_grants_mvp329 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.operator_reconciliation_grants_mvp329
 FROM PUBLIC,anon,authenticated,service_role;

-- No plaintext token is stored. A ticket is bound to the signed Auth session
-- and to exact buyer/request, source message & chat for 90 seconds.
CREATE TABLE cotironda_piloto_privado.operator_reconciliation_tickets_mvp329(
 token_sha256 text PRIMARY KEY CHECK(token_sha256~'^[a-f0-9]{64}$'),
 operator_ref uuid NOT NULL,
 auth_user_id uuid NOT NULL,
 auth_session_id uuid NOT NULL,
 request_id uuid NOT NULL,
 buyer_key text NOT NULL,
 message_hmac text NOT NULL CHECK(message_hmac~'^[a-f0-9]{64}$'),
 chat_hmac text NOT NULL CHECK(chat_hmac~'^[a-f0-9]{64}$'),
 issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 consumed_at timestamptz,
 CHECK(expires_at>issued_at AND expires_at<=issued_at+interval '90 seconds')
);
CREATE INDEX operator_reconciliation_ticket_rate_mvp329
 ON cotironda_piloto_privado.operator_reconciliation_tickets_mvp329(operator_ref,issued_at DESC);
ALTER TABLE cotironda_piloto_privado.operator_reconciliation_tickets_mvp329 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.operator_reconciliation_tickets_mvp329
 FROM PUBLIC,anon,authenticated,service_role;

-- Public Auth endpoint via PostgREST, but it returns ONLY an opaque ticket,
-- never the encrypted envelope. auth.uid()/auth.jwt() originate from the
-- Supabase gateway's verified JWT, and MVP267 validates LIVE auth.sessions,
-- MFA aal2, account state, operator binding and issuer.
CREATE FUNCTION public.cotironda_piloto_operator_issue_reconciliation_mvp329(
 p_request_id uuid,p_message_hmac text,p_chat_hmac text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO ''
AS $mvp329_issue$
DECLARE
 op uuid;user_id uuid;sess_id uuid;buyer text;
 secret text;fingerprint text;active_count integer;day_count integer;
 src jsonb;v_now timestamptz;
BEGIN
 IF p_request_id IS NULL OR
    p_message_hmac IS NULL OR p_message_hmac !~ '^[a-f0-9]{64}$' OR
    p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$'
 THEN RETURN jsonb_build_object('state','not_authorized');END IF;
 op:=cotironda_piloto_privado.operator_session_mvp267();
 IF op IS NULL THEN RETURN jsonb_build_object('state','not_authorized');END IF;
 user_id:=auth.uid();
 sess_id:=(auth.jwt()->>'session_id')::uuid;
 SELECT r.buyer_key INTO buyer
 FROM cotironda_piloto_privado.requests r
 JOIN cotironda_piloto_privado.operator_reconciliation_grants_mvp329 g
 ON g.request_id=r.id AND g.buyer_key=r.buyer_key
 WHERE r.id=p_request_id AND g.operator_ref=op
  AND g.active=true AND g.revoked_at IS NULL
  AND g.granted_at<=clock_timestamp() AND g.expires_at>clock_timestamp()
  AND r.state IN ('prepared','closed');
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_authorized');END IF;
 -- SQL source revalidates consent, latest supplier version, SHA, dispatch,
 -- review terminal state. Do not expose its ciphertext in this response.
 src:=public.cotironda_piloto_read_reconciliation_envelope_mvp328(
  p_request_id,p_message_hmac,p_chat_hmac
 );
 IF src->>'state'<>'eligible_encrypted'
 THEN RETURN jsonb_build_object('state','not_authorized');END IF;

 SELECT count(*) FILTER(WHERE consumed_at IS NULL AND expires_at>clock_timestamp()),
        count(*) FILTER(WHERE issued_at>clock_timestamp()-interval '24 hours')
 INTO active_count,day_count
 FROM cotironda_piloto_privado.operator_reconciliation_tickets_mvp329
 WHERE operator_ref=op;
 IF active_count>=3 OR day_count>=40
 THEN RETURN jsonb_build_object('state','not_authorized');END IF;

 v_now:=clock_timestamp();
 secret:=encode(extensions.gen_random_bytes(32),'hex');
 fingerprint:=encode(extensions.digest(secret,'sha256'),'hex');
 INSERT INTO cotironda_piloto_privado.operator_reconciliation_tickets_mvp329(
 token_sha256,operator_ref,auth_user_id,auth_session_id,
 request_id,buyer_key,message_hmac,chat_hmac,issued_at,expires_at)
 VALUES(fingerprint,op,user_id,sess_id,p_request_id,buyer,
  p_message_hmac,p_chat_hmac,v_now,v_now+interval '90 seconds');
 RETURN jsonb_build_object('state','issued','ticket',secret,'expires_in_seconds',90);
END
$mvp329_issue$;
REVOKE ALL ON FUNCTION
 public.cotironda_piloto_operator_issue_reconciliation_mvp329(uuid,text,text)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_operator_issue_reconciliation_mvp329(uuid,text,text)
 TO authenticated;

-- Only a server-side service_role may consume a ticket (never the browser).
-- SINGLE USE via row lock; claimant obtains a non-PII SHA identity derived
-- from the persisted Auth account, not from a caller-supplied "verified" flag.
CREATE FUNCTION public.cotironda_piloto_claim_reconciliation_mvp329(
 p_ticket text,p_request_id uuid,p_message_hmac text,p_chat_hmac text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO ''
AS $mvp329_claim$
DECLARE
 t record; fingerprint text;src jsonb;
BEGIN
 IF p_ticket IS NULL OR p_ticket !~ '^[a-f0-9]{64}$' OR
    p_request_id IS NULL OR p_message_hmac IS NULL OR
    p_message_hmac !~ '^[a-f0-9]{64}$' OR p_chat_hmac IS NULL OR
    p_chat_hmac !~ '^[a-f0-9]{64}$'
 THEN RETURN jsonb_build_object('state','not_authorized');END IF;
 fingerprint:=encode(extensions.digest(p_ticket,'sha256'),'hex');
 SELECT ticket.* INTO t
 FROM cotironda_piloto_privado.operator_reconciliation_tickets_mvp329 ticket
 JOIN cotironda_piloto_privado.operator_reconciliation_grants_mvp329 g
  ON g.operator_ref=ticket.operator_ref AND g.request_id=ticket.request_id
  AND g.buyer_key=ticket.buyer_key
 JOIN cotironda_piloto_privado.requests r ON r.id=ticket.request_id
  AND r.buyer_key=ticket.buyer_key
 JOIN cotironda_piloto_privado.supervisor_operators_mvp265 op
  ON op.operator_ref=ticket.operator_ref
 JOIN auth.users u ON u.id=ticket.auth_user_id
  AND op.auth_user_id=u.id
 JOIN auth.sessions sess ON sess.id=ticket.auth_session_id
  AND sess.user_id=u.id
 WHERE ticket.token_sha256=fingerprint
  AND ticket.request_id=p_request_id
  AND ticket.message_hmac=p_message_hmac
  AND ticket.chat_hmac=p_chat_hmac
  AND ticket.consumed_at IS NULL AND ticket.expires_at>clock_timestamp()
  AND g.active=true AND g.revoked_at IS NULL
  AND g.granted_at<=clock_timestamp() AND g.expires_at>clock_timestamp()
  AND r.state IN ('prepared','closed')
  AND op.active=true AND op.revoked_at IS NULL AND op.role='incident_manager'
  AND u.is_anonymous IS FALSE AND u.deleted_at IS NULL
  AND (u.banned_until IS NULL OR u.banned_until<=clock_timestamp())
  AND (sess.not_after IS NULL OR sess.not_after>clock_timestamp())
 FOR UPDATE OF ticket SKIP LOCKED;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_authorized');END IF;
 src:=public.cotironda_piloto_read_reconciliation_envelope_mvp328(
  p_request_id,p_message_hmac,p_chat_hmac);
 IF src->>'state'<>'eligible_encrypted'
 THEN RETURN jsonb_build_object('state','not_authorized');END IF;
 UPDATE cotironda_piloto_privado.operator_reconciliation_tickets_mvp329
 SET consumed_at=clock_timestamp()
 WHERE token_sha256=fingerprint AND consumed_at IS NULL;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_authorized');END IF;
 RETURN jsonb_build_object(
  'state','claimed_internal',
  'actor_subject_sha256',
    encode(extensions.digest('mvp329|operator|'||t.auth_user_id::text,'sha256'),'hex'),
  'request_id',t.request_id,
  'message_hmac',t.message_hmac,
  'chat_hmac',t.chat_hmac
 );
END
$mvp329_claim$;
REVOKE ALL ON FUNCTION
 public.cotironda_piloto_claim_reconciliation_mvp329(text,uuid,text,text)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_claim_reconciliation_mvp329(text,uuid,text,text)
 TO service_role;

-- Deliberately no grant creation RPC, no operator enrollment, no plaintext
-- endpoint, no quote promotion and no scheduled tasks.
