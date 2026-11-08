-- MVP315: one-time buyer tracking notification after ALL central supplier
-- dispatch jobs have an acknowledged Whapi ID. Development only, ALL OFF.
-- Requires MVP306/309-314. Does not schedule itself or send WhatsApp.
CREATE TABLE IF NOT EXISTS cotironda_piloto_privado.ai_buyer_notice_gate_mvp315(
 only_row boolean PRIMARY KEY DEFAULT true CHECK(only_row),
 enabled boolean NOT NULL DEFAULT false,
 activated_at timestamptz,
 daily_notice_limit integer NOT NULL DEFAULT 10
  CHECK(daily_notice_limit BETWEEN 1 AND 100),
 CHECK((enabled AND activated_at IS NOT NULL) OR
       (NOT enabled AND activated_at IS NULL))
);
INSERT INTO cotironda_piloto_privado.ai_buyer_notice_gate_mvp315(
 only_row,enabled) VALUES(true,false) ON CONFLICT(only_row) DO NOTHING;
ALTER TABLE cotironda_piloto_privado.ai_buyer_notice_gate_mvp315
 ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS cotironda_piloto_privado.ai_buyer_notice_budget_mvp315(
 day_utc date PRIMARY KEY,
 attempts_reserved integer NOT NULL DEFAULT 0 CHECK(attempts_reserved BETWEEN 0 AND 1000000)
);
ALTER TABLE cotironda_piloto_privado.ai_buyer_notice_budget_mvp315
 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE
 cotironda_piloto_privado.ai_buyer_notice_gate_mvp315,
 cotironda_piloto_privado.ai_buyer_notice_budget_mvp315
 FROM PUBLIC,anon,authenticated,service_role;

-- Encrypted buyer contact is *never* in logs or a client response.
-- This RPC is service-only and usable just for a verified completed round,
-- with a valid WhatsApp binding or the administrator's exact role/scope.
-- A token hash after issuing checks that the same buyer is still authorized.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_buyer_packet_mvp315(
 p_request uuid,p_channel text,p_token_hash text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $packet315$
DECLARE v record;v_direct record;v_admin record;v_source text;
BEGIN
 IF p_request IS NULL OR p_channel IS NULL OR
    p_channel !~ '^[A-Za-z0-9_-]{4,64}$' OR
    (p_token_hash IS NOT NULL AND p_token_hash !~ '^[a-f0-9]{64}$')
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 SELECT r.id,r.buyer_key,r.source_hmac,b.chat_hmac INTO v
 FROM cotironda_piloto_privado.requests r
 JOIN cotironda_piloto_privado.ai_shadow_requests_mvp221 sh
   ON sh.request_id=r.id AND sh.status='shadow'
 JOIN cotironda_piloto_privado.participants b
   ON b.key=r.buyer_key AND b.participant_role='buyer'
 JOIN cotironda_piloto_privado.ai_buyer_auto_release_mvp306 ar
   ON ar.request_id=r.id AND ar.buyer_key=b.key
    AND ar.chat_hmac=b.chat_hmac AND ar.source_hmac=r.source_hmac
 JOIN cotironda_piloto_privado.whapi_inbox src
   ON src.message_hmac=r.source_hmac AND src.request_id=r.id
    AND src.participant_key=b.key AND src.chat_hmac=b.chat_hmac
 JOIN cotironda_piloto_privado.ai_buyer_notice_gate_mvp315 g
   ON g.only_row AND g.enabled AND g.activated_at IS NOT NULL
 JOIN cotironda_piloto_privado.ai_auto_release_gate_mvp306 a
   ON a.only_row AND a.enabled AND a.activated_at IS NOT NULL
 JOIN cotironda_piloto_privado.ai_batch_gate_mvp314 bg
   ON bg.only_row AND bg.enabled AND bg.activated_at IS NOT NULL
 JOIN cotironda_piloto_privado.integration_flags flags
   ON flags.only_row AND flags.whatsapp_outbound_enabled
 WHERE r.id=p_request AND r.state='prepared'
   AND r.created_at>=g.activated_at
   AND r.created_at>=a.activated_at
   AND r.closes_at>clock_timestamp()
   AND b.consent_at IS NOT NULL AND b.opted_out_at IS NULL
   AND src.processing_state='needs_review'
   AND cotironda_piloto_privado.confirmada_comprador_mvp280(r.id)
   AND EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 j
     WHERE j.request_id=r.id)
   AND NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 j
     WHERE j.request_id=r.id
       AND (j.state<>'api_accepted' OR j.whapi_message_id IS NULL))
   AND ((p_token_hash IS NULL AND NOT EXISTS(
      SELECT 1 FROM cotironda_piloto_privado.buyer_tracking_mvp091 t
      WHERE t.request_id=r.id))
    OR (p_token_hash IS NOT NULL AND EXISTS(
      SELECT 1 FROM cotironda_piloto_privado.buyer_tracking_mvp091 t
      WHERE t.request_id=r.id AND t.token_hash=p_token_hash
        AND t.revoked_at IS NULL AND t.expires_at>clock_timestamp()
        AND t.send_state='pending' AND t.send_attempted_at IS NULL))
   );
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_ready');END IF;
 SELECT ch.chat_hmac,ch.contact_sha256,ch.nonce_b64,ch.ciphertext_b64
 INTO v_direct FROM cotironda_piloto_privado.participant_channels_mvp109 ch
 WHERE ch.participant_key=v.buyer_key AND ch.chat_hmac=v.chat_hmac
   AND EXISTS(SELECT 1 FROM cotironda_piloto_privado.whapi_inbox msg
    WHERE msg.message_hmac=ch.authenticated_message_hmac
      AND msg.participant_key=v.buyer_key AND msg.chat_hmac=v.chat_hmac);
 SELECT ch.chat_hmac,ch.contact_sha256,ch.nonce_b64,ch.ciphertext_b64
 INTO v_admin FROM cotironda_piloto_privado.admin_channels_mvp312 ch
 JOIN cotironda_piloto_privado.admin_authorizations_mvp309 att
   ON att.participant_key=ch.participant_key
    AND att.source_reference=ch.source_reference AND att.role='buyer'
    AND att.scope='buyer_standard_operations'
    AND att.statement_kind='owner_reported_prior_permission'
 JOIN cotironda_piloto_privado.enrollment_policies_mvp308 pol
   ON pol.role=att.role AND pol.version=att.policy_version
 WHERE ch.participant_key=v.buyer_key
   AND ch.chat_hmac=v.chat_hmac
   AND ch.participant_role='buyer' AND ch.channel_id=p_channel
   AND ch.evidence_kind='owner_vouched_phone'
   AND att.policy_text_sha256=encode(sha256(convert_to(pol.policy_text,'UTF8')),'hex')
   AND NOT EXISTS(SELECT 1
     FROM cotironda_piloto_privado.admin_authorization_revocations_mvp309 rev
     WHERE rev.participant_key=att.participant_key);
 IF v_direct.chat_hmac IS NULL AND v_admin.chat_hmac IS NULL
 THEN RETURN jsonb_build_object('state','contact_unavailable');END IF;
 IF v_direct.chat_hmac IS NOT NULL AND v_admin.chat_hmac IS NOT NULL AND
  (v_direct.contact_sha256<>v_admin.contact_sha256 OR
   v_direct.chat_hmac<>v_admin.chat_hmac)
 THEN RETURN jsonb_build_object('state','contact_conflict');END IF;
 v_source:=CASE WHEN v_direct.chat_hmac IS NOT NULL
   THEN 'authenticated_whapi' ELSE 'owner_statement' END;
 RETURN jsonb_build_object('state','ready',
   'request_id',v.id,'chat_hmac',v.chat_hmac,
   'event_hmac',v.source_hmac,'channel_id',p_channel,
   'contact_sha256',coalesce(v_direct.contact_sha256,v_admin.contact_sha256),
   'nonce_b64',coalesce(v_direct.nonce_b64,v_admin.nonce_b64),
   'ciphertext_b64',coalesce(v_direct.ciphertext_b64,v_admin.ciphertext_b64),
   'source',v_source);
END $packet315$;

-- Scan at most 12 completed requests; never accept an HTTP-supplied buyer ID.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_next_buyer_notice_mvp315(
 p_channel text
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $next315$
DECLARE rec record;v jsonb;g record;v_count integer;
BEGIN
 SELECT enabled,activated_at,daily_notice_limit INTO g
 FROM cotironda_piloto_privado.ai_buyer_notice_gate_mvp315 WHERE only_row;
 IF NOT FOUND OR NOT g.enabled OR g.activated_at IS NULL
 THEN RETURN jsonb_build_object('state','disabled');END IF;
 SELECT attempts_reserved INTO v_count
 FROM cotironda_piloto_privado.ai_buyer_notice_budget_mvp315
 WHERE day_utc=(clock_timestamp() AT TIME ZONE 'UTC')::date;
 IF coalesce(v_count,0)>=g.daily_notice_limit
 THEN RETURN jsonb_build_object('state','budget_exhausted');END IF;
 FOR rec IN SELECT r.id FROM cotironda_piloto_privado.requests r
  JOIN cotironda_piloto_privado.ai_buyer_auto_release_mvp306 a
   ON a.request_id=r.id
  WHERE r.created_at>=g.activated_at AND r.state='prepared'
    AND r.closes_at>clock_timestamp()
    AND NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.buyer_tracking_mvp091 t
      WHERE t.request_id=r.id)
  ORDER BY r.created_at,r.id LIMIT 12
 LOOP
  v:=public.cotironda_piloto_ia_buyer_packet_mvp315(rec.id,p_channel,NULL);
  IF v->>'state'='ready' THEN RETURN v;END IF;
 END LOOP;
 RETURN jsonb_build_object('state','empty');
END $next315$;

-- The SQL issue and quota reservation happen in the SAME transaction.
-- Existing MVP306 RPC rechecks buyer, provenance, all dispatch IDs and
-- uniqueness. We do not bypass its private token issuance.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_issue_buyer_notice_mvp315(
 p_request uuid,p_chat_hmac text,p_event_hmac text,
 p_token_hash text,p_channel text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $issue315$
DECLARE g record;v_used integer;v_packet jsonb;v_result jsonb;v_day date;
BEGIN
 IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$'
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 SELECT enabled,activated_at,daily_notice_limit INTO g
 FROM cotironda_piloto_privado.ai_buyer_notice_gate_mvp315
 WHERE only_row FOR UPDATE;
 IF NOT FOUND OR NOT g.enabled OR g.activated_at IS NULL
 THEN RETURN jsonb_build_object('state','disabled');END IF;
 v_day:=(clock_timestamp() AT TIME ZONE 'UTC')::date;
 SELECT b.attempts_reserved INTO v_used
 FROM cotironda_piloto_privado.ai_buyer_notice_budget_mvp315 b
 WHERE b.day_utc=v_day FOR UPDATE;
 IF coalesce(v_used,0)>=g.daily_notice_limit
 THEN RETURN jsonb_build_object('state','budget_exhausted');END IF;
 v_packet:=public.cotironda_piloto_ia_buyer_packet_mvp315(
   p_request,p_channel,NULL);
 IF v_packet->>'state'<>'ready'
   OR v_packet->>'chat_hmac' IS DISTINCT FROM p_chat_hmac
   OR v_packet->>'event_hmac' IS DISTINCT FROM p_event_hmac
 THEN RETURN jsonb_build_object('state','not_ready');END IF;
 v_result:=public.cotironda_piloto_issue_auto_tracking_mvp306(
   p_chat_hmac,p_event_hmac,p_request,p_token_hash);
 IF v_result->>'state'<>'issued' THEN RETURN v_result;END IF;
 INSERT INTO cotironda_piloto_privado.ai_buyer_notice_budget_mvp315(
  day_utc,attempts_reserved)
 VALUES(v_day,1) ON CONFLICT(day_utc) DO UPDATE
 SET attempts_reserved=
   cotironda_piloto_privado.ai_buyer_notice_budget_mvp315.attempts_reserved+1;
 RETURN v_result;
END $issue315$;

-- Re-read the contact/authorization immediately before HTTP. Token
-- already reserved, so a rejection leaves it terminally non-retryable.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_authorize_buyer_notice_mvp315(
 p_request uuid,p_chat_hmac text,p_token_hash text,p_channel text
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $auth315$
 SELECT coalesce((
  SELECT packet->>'state'='ready' AND packet->>'chat_hmac'=p_chat_hmac
  FROM (SELECT public.cotironda_piloto_ia_buyer_packet_mvp315(
      p_request,p_channel,p_token_hash) packet) x
 ),false);
$auth315$;
REVOKE ALL ON FUNCTION
 public.cotironda_piloto_ia_buyer_packet_mvp315(uuid,text,text),
 public.cotironda_piloto_ia_next_buyer_notice_mvp315(text),
 public.cotironda_piloto_ia_issue_buyer_notice_mvp315(uuid,text,text,text,text),
 public.cotironda_piloto_ia_authorize_buyer_notice_mvp315(uuid,text,text,text)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_ia_buyer_packet_mvp315(uuid,text,text),
 public.cotironda_piloto_ia_next_buyer_notice_mvp315(text),
 public.cotironda_piloto_ia_issue_buyer_notice_mvp315(uuid,text,text,text,text),
 public.cotironda_piloto_ia_authorize_buyer_notice_mvp315(uuid,text,text,text)
 TO service_role;
