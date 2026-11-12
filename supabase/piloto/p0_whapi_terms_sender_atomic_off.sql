-- P0 supplier terms sender — DEVELOPMENT ONLY. Never install without
-- explicit "Publicalo en cotironda-piloto", approved policy and a real MFA operator.
-- Requires M267/M362/M364/M365. NO API token, WhatsApp recipient, or secrets.
DO $deps$ BEGIN
 IF to_regprocedure('cotironda_piloto_privado.operator_session_mvp267()') IS NULL
 OR to_regclass('cotironda_piloto_privado.original_terms_policy_mvp362') IS NULL
 OR to_regclass('cotironda_piloto_privado.supplier_original_terms_notices_mvp364') IS NULL
 OR to_regclass('cotironda_piloto_privado.supplier_original_revocations_mvp362') IS NULL
 THEN RAISE EXCEPTION 'p0_missing_mfa_or_terms_dependencies'
   USING errcode='42501'; END IF;
END $deps$;

-- Dedicated NOLOGIN capability: grant to a vetted isolated DB login only
-- after approval. Never grant this role to service_role, anon or authenticated.
DO $role$ BEGIN
 IF to_regrole('cotironda_pilot_terms_sender_p0') IS NULL THEN
   CREATE ROLE cotironda_pilot_terms_sender_p0 NOLOGIN;
 END IF;
END $role$;

CREATE TABLE cotironda_piloto_privado.supplier_terms_send_jobs_p0 (
 job_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 supplier_key text NOT NULL REFERENCES cotironda_piloto_privado.participants(key),
 terms_version text NOT NULL REFERENCES
   cotironda_piloto_privado.original_terms_policy_mvp362(terms_version),
 terms_sha256 text NOT NULL CHECK(terms_sha256 ~ '^[a-f0-9]{64}$'),
 channel text NOT NULL CHECK(channel ~ '^[A-Za-z0-9_-]{4,64}$'),
 chat_hmac text NOT NULL CHECK(chat_hmac ~ '^[a-f0-9]{64}$'),
 body text NOT NULL CHECK(length(body) BETWEEN 200 AND 1500),
 episode_no integer NOT NULL CHECK(episode_no BETWEEN 0 AND 1000000),
 state text NOT NULL DEFAULT 'queued'
   CHECK(state IN ('queued','leased','in_flight','api_accepted',
     'uncertain','cancelled')),
 created_by_operator uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 lease_token uuid,
 leased_at timestamptz,
 began_at timestamptz,
 finished_at timestamptz,
 notice_message_hmac text UNIQUE
   CHECK(notice_message_hmac IS NULL OR notice_message_hmac ~ '^[a-f0-9]{64}$'),
 UNIQUE(supplier_key,terms_version,episode_no),
 CHECK((state='api_accepted')=(notice_message_hmac IS NOT NULL)),
 CHECK(state <> 'queued' OR (lease_token IS NULL AND began_at IS NULL)),
 CHECK(state <> 'in_flight' OR (lease_token IS NOT NULL AND began_at IS NOT NULL))
);
ALTER TABLE cotironda_piloto_privado.supplier_terms_send_jobs_p0
 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.supplier_terms_send_jobs_p0
 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON SCHEMA cotironda_piloto_privado FROM PUBLIC;
GRANT USAGE ON SCHEMA cotironda_piloto_privado
 TO cotironda_pilot_terms_sender_p0;

-- Always re-evaluate the CURRENT supplier/terms/episode; do not trust the
-- claimed queue's prior authorization or a caller supplied actor.
CREATE FUNCTION cotironda_piloto_privado.terms_job_allowed_p0(
 p_job uuid
) RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
 SELECT EXISTS (
  SELECT 1
  FROM cotironda_piloto_privado.supplier_terms_send_jobs_p0 j
  JOIN cotironda_piloto_privado.participants p
    ON p.key=j.supplier_key AND p.participant_role='supplier'
    AND p.chat_hmac=j.chat_hmac AND p.consent_at IS NOT NULL
    AND p.opted_out_at IS NULL
  -- Recheck the authenticated, encrypted contact even AFTER BEGIN:
  -- deleting/revoking a bound channel before HTTP must block delivery.
  JOIN cotironda_piloto_privado.participant_channels_mvp109 c
    ON c.participant_key=j.supplier_key AND c.chat_hmac=j.chat_hmac
    AND c.authenticated_message_hmac ~ '^[a-f0-9]{64}$'
    AND c.contact_sha256 ~ '^[a-f0-9]{64}$'
    AND c.nonce_b64 IS NOT NULL AND c.ciphertext_b64 IS NOT NULL
    AND c.bound_at IS NOT NULL AND c.bound_at<=j.created_at
  JOIN cotironda_piloto_privado.original_terms_policy_mvp362 t
    ON t.terms_version=j.terms_version AND t.enabled IS TRUE
    AND t.approved_at IS NOT NULL AND t.activated_at IS NOT NULL
    AND t.activated_at<=clock_timestamp()
    AND t.terms_sha256=j.terms_sha256
    AND t.terms_body=j.body
    AND t.terms_sha256=encode(extensions.digest(
      convert_to(t.terms_body,'UTF8'),'sha256'),'hex')
  WHERE j.job_id=p_job
    AND j.episode_no=(
      SELECT count(*)::integer
      FROM cotironda_piloto_privado.supplier_original_revocations_mvp362 rev
      WHERE rev.supplier_key=j.supplier_key
        AND rev.terms_version=j.terms_version
        AND rev.recorded_at<=clock_timestamp()
    )
 );
$fn$;
REVOKE ALL ON FUNCTION cotironda_piloto_privado.terms_job_allowed_p0(uuid)
 FROM PUBLIC,anon,authenticated,service_role;

-- Public name is technically exposed, but accepts no operator_id or phone;
-- signed Supabase Auth JWT + live AAL2 session + administrator operator
-- is required inside M267. No policy, no permitted supplier => no queue.
CREATE FUNCTION public.cotironda_piloto_terms_enqueue_auth_p0(
 p_supplier_key text,p_channel text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE actor uuid; pol record; supplier record; episode integer;
 new_job uuid;
BEGIN
 actor:=cotironda_piloto_privado.operator_session_mvp267();
 IF actor IS NULL THEN RETURN jsonb_build_object('state','not_authorized');END IF;
 IF p_supplier_key IS NULL OR p_supplier_key !~ '^[a-z][a-z0-9_]{2,63}$'
 OR p_channel IS NULL OR p_channel !~ '^[A-Za-z0-9_-]{4,64}$'
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 SELECT t.* INTO pol FROM cotironda_piloto_privado.original_terms_policy_mvp362 t
 WHERE t.terms_version='cotironda-originales-alta-v1'
  AND t.enabled IS TRUE AND t.approved_at IS NOT NULL
  AND t.activated_at IS NOT NULL AND t.activated_at<=clock_timestamp()
  AND length(t.terms_body) BETWEEN 200 AND 1500
  AND t.terms_sha256=encode(extensions.digest(
    convert_to(t.terms_body,'UTF8'),'sha256'),'hex')
 FOR SHARE;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','policy_off');END IF;
 SELECT p.* INTO supplier FROM cotironda_piloto_privado.participants p
 WHERE p.key=p_supplier_key AND p.participant_role='supplier'
  AND p.consent_at IS NOT NULL AND p.opted_out_at IS NULL
  AND p.chat_hmac ~ '^[a-f0-9]{64}$' FOR SHARE;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','supplier_not_allowed');END IF;
 -- Every withdrawal creates one new possible episode, not a reusable retry
 -- of an uncertain send. An attempted requeue in the same episode is inert.
 SELECT count(*)::integer INTO episode
 FROM cotironda_piloto_privado.supplier_original_revocations_mvp362
 WHERE supplier_key=p_supplier_key AND terms_version=pol.terms_version
  AND recorded_at<=clock_timestamp();
 INSERT INTO cotironda_piloto_privado.supplier_terms_send_jobs_p0
 (supplier_key,terms_version,terms_sha256,channel,chat_hmac,body,
   episode_no,created_by_operator)
 VALUES(p_supplier_key,pol.terms_version,pol.terms_sha256,
   p_channel,supplier.chat_hmac,pol.terms_body,episode,actor)
 ON CONFLICT (supplier_key,terms_version,episode_no) DO NOTHING
 RETURNING job_id INTO new_job;
 IF new_job IS NULL
 THEN RETURN jsonb_build_object('state','already_queued');END IF;
 RETURN jsonb_build_object('state','queued');
END;$fn$;
REVOKE ALL ON FUNCTION
 public.cotironda_piloto_terms_enqueue_auth_p0(text,text)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_terms_enqueue_auth_p0(text,text)
 TO authenticated;

CREATE FUNCTION cotironda_piloto_privado.terms_claim_p0()
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE job record;
BEGIN
 WITH next AS (
  SELECT j.job_id FROM cotironda_piloto_privado.supplier_terms_send_jobs_p0 j
  WHERE (j.state='queued' OR
    (j.state='leased' AND j.leased_at<clock_timestamp()-interval '2 minutes'))
   AND cotironda_piloto_privado.terms_job_allowed_p0(j.job_id)
   -- A supplier is eligible only with a verified pre-round encrypted channel.
   -- Otherwise do not burn leases every two minutes without any destination.
   AND EXISTS (
     SELECT 1 FROM cotironda_piloto_privado.participant_channels_mvp109 c
     WHERE c.participant_key=j.supplier_key AND c.chat_hmac=j.chat_hmac
       AND c.authenticated_message_hmac ~ '^[a-f0-9]{64}$'
       AND c.contact_sha256 ~ '^[a-f0-9]{64}$'
       AND c.nonce_b64 IS NOT NULL AND c.ciphertext_b64 IS NOT NULL
       AND c.bound_at IS NOT NULL AND c.bound_at<=j.created_at
   )
  ORDER BY j.created_at,j.job_id
  LIMIT 1 FOR UPDATE OF j SKIP LOCKED
 )
 UPDATE cotironda_piloto_privado.supplier_terms_send_jobs_p0 j
 SET state='leased',lease_token=gen_random_uuid(),leased_at=clock_timestamp()
 FROM next WHERE j.job_id=next.job_id RETURNING j.* INTO job;
 IF NOT FOUND THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('state','leased','jobId',job.job_id,
  'leaseToken',job.lease_token,'supplierKey',job.supplier_key,
  'channel',job.channel,'chatHmac',job.chat_hmac,
  'termsVersion',job.terms_version,'termsSha256',job.terms_sha256,
  'body',job.body);
END;$fn$;
REVOKE ALL ON FUNCTION cotironda_piloto_privado.terms_claim_p0()
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION cotironda_piloto_privado.terms_claim_p0()
 TO cotironda_pilot_terms_sender_p0;

CREATE FUNCTION cotironda_piloto_privado.terms_begin_p0(
 p_job uuid,p_lease uuid
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE locked record;
BEGIN
 SELECT * INTO locked
 FROM cotironda_piloto_privado.supplier_terms_send_jobs_p0
 WHERE job_id=p_job AND lease_token=p_lease AND state='leased'
  AND leased_at>=clock_timestamp()-interval '2 minutes'
 FOR UPDATE;
 IF NOT FOUND OR NOT cotironda_piloto_privado.terms_job_allowed_p0(p_job)
 THEN RETURN jsonb_build_object('state','cancelled');END IF;
 UPDATE cotironda_piloto_privado.supplier_terms_send_jobs_p0
 SET state='in_flight',began_at=clock_timestamp()
 WHERE job_id=p_job;
 RETURN jsonb_build_object('state','in_flight','jobId',p_job);
END;$fn$;
REVOKE ALL ON FUNCTION cotironda_piloto_privado.terms_begin_p0(uuid,uuid)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION cotironda_piloto_privado.terms_begin_p0(uuid,uuid)
 TO cotironda_pilot_terms_sender_p0;

CREATE FUNCTION cotironda_piloto_privado.terms_authorize_p0(
 p_job uuid,p_lease uuid,p_chat_hmac text
) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
 RETURN EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.supplier_terms_send_jobs_p0 j
  WHERE j.job_id=p_job AND j.lease_token=p_lease
    AND j.state='in_flight' AND j.began_at IS NOT NULL
    AND j.chat_hmac=p_chat_hmac
    AND cotironda_piloto_privado.terms_job_allowed_p0(j.job_id)
 );
END;$fn$;
REVOKE ALL ON FUNCTION cotironda_piloto_privado.terms_authorize_p0(uuid,uuid,text)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION cotironda_piloto_privado.terms_authorize_p0(uuid,uuid,text)
 TO cotironda_pilot_terms_sender_p0;

-- Atomic ACK+notice. Only this guarded private capability writes the M364
-- notice. No receipt is EVER recorded when the HTTP state is uncertain.
CREATE FUNCTION cotironda_piloto_privado.terms_finish_p0(
 p_job uuid,p_lease uuid,p_supplier_key text,p_terms_version text,
 p_terms_sha256 text,p_state text,p_message_hmac text,p_body_sha256 text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE job record; stamp timestamptz;
BEGIN
 SELECT * INTO job
 FROM cotironda_piloto_privado.supplier_terms_send_jobs_p0
 WHERE job_id=p_job AND lease_token=p_lease AND state='in_flight'
 FOR UPDATE;
 IF NOT FOUND OR job.supplier_key IS DISTINCT FROM p_supplier_key
  OR job.terms_version IS DISTINCT FROM p_terms_version
  OR job.terms_sha256 IS DISTINCT FROM p_terms_sha256
  OR job.terms_sha256 IS DISTINCT FROM p_body_sha256
  OR p_state NOT IN ('api_accepted','uncertain')
  OR (p_state='api_accepted' AND (
     p_message_hmac IS NULL OR p_message_hmac !~ '^[a-f0-9]{64}$'))
  OR (p_state='uncertain' AND p_message_hmac IS NOT NULL)
 THEN RETURN jsonb_build_object('state','rejected');END IF;
 stamp:=clock_timestamp();
 IF p_state='api_accepted' THEN
  IF NOT cotironda_piloto_privado.terms_job_allowed_p0(p_job)
  THEN RETURN jsonb_build_object('state','rejected');END IF;
  INSERT INTO cotironda_piloto_privado.supplier_original_terms_notices_mvp364
  (notice_message_hmac,supplier_key,terms_version,terms_sha256,
   supplier_chat_hmac,outbound_body_sha256,delivery_state,sent_at,recorded_at)
  VALUES(p_message_hmac,job.supplier_key,job.terms_version,
   job.terms_sha256,job.chat_hmac,job.terms_sha256,'api_accepted',
   stamp,stamp);
 END IF;
 UPDATE cotironda_piloto_privado.supplier_terms_send_jobs_p0
 SET state=p_state,notice_message_hmac=p_message_hmac,finished_at=stamp
 WHERE job_id=p_job;
 RETURN jsonb_build_object('state',p_state);
END;$fn$;
REVOKE ALL ON FUNCTION cotironda_piloto_privado.terms_finish_p0(
 uuid,uuid,text,text,text,text,text,text)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION cotironda_piloto_privado.terms_finish_p0(
 uuid,uuid,text,text,text,text,text,text)
 TO cotironda_pilot_terms_sender_p0;

-- Pre-round supplier contact: use the EXISTING MVP109 encrypted channel,
-- NOT MVP313 (which requires a live request_id). This private read returns
-- only AES-GCM material tied to the exact sender lease, never a clear phone.
-- Its caller must use the same PILOT contact key/AAD as the native Edge
-- webhook; receipt of a packet alone is NOT send authorization.
CREATE FUNCTION cotironda_piloto_privado.terms_recipient_packet_p0(
 p_job uuid,p_lease uuid
) RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
 SELECT jsonb_build_object(
   'state','ready','jobId',j.job_id,'leaseToken',j.lease_token,
   'supplierKey',j.supplier_key,'channel',j.channel,'chatHmac',j.chat_hmac,
   'contactSha256',c.contact_sha256,
   'nonceB64',c.nonce_b64,'ciphertextB64',c.ciphertext_b64)
 FROM cotironda_piloto_privado.supplier_terms_send_jobs_p0 j
 JOIN cotironda_piloto_privado.participant_channels_mvp109 c
   ON c.participant_key=j.supplier_key AND c.chat_hmac=j.chat_hmac
   AND c.authenticated_message_hmac ~ '^[a-f0-9]{64}$'
   AND c.contact_sha256 ~ '^[a-f0-9]{64}$'
   AND c.nonce_b64 IS NOT NULL AND c.ciphertext_b64 IS NOT NULL
   AND c.bound_at IS NOT NULL AND c.bound_at<=j.created_at
 WHERE j.job_id=p_job AND j.lease_token=p_lease
   AND j.state='leased'
   AND j.leased_at>=clock_timestamp()-interval '2 minutes'
   AND cotironda_piloto_privado.terms_job_allowed_p0(j.job_id)
 LIMIT 1;
$fn$;
REVOKE ALL ON FUNCTION
 cotironda_piloto_privado.terms_recipient_packet_p0(uuid,uuid)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION
 cotironda_piloto_privado.terms_recipient_packet_p0(uuid,uuid)
 TO cotironda_pilot_terms_sender_p0;
