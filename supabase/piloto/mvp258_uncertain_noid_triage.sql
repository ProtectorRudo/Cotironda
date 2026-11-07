-- MVP258 / IA Central 5. Manual triage for Whapi uncertainty WITHOUT message ID.
-- Passive only. No network, no retry, no changes to any outbound table.
DO $preflight$
BEGIN
 IF to_regclass('cotironda_piloto_privado.whapi_outbox') IS NULL OR
    to_regclass('cotironda_piloto_privado.ai_dispatch_jobs_mvp222') IS NULL OR
    to_regclass('cotironda_piloto_privado.buyer_tracking_mvp091') IS NULL OR
    to_regclass('cotironda_piloto_privado.supplier_ack_mvp104') IS NULL OR
    to_regclass('cotironda_piloto_privado.finalist_whapi_outbox_mvp110') IS NULL
 THEN RAISE EXCEPTION 'mvp258_wrong_schema' USING errcode='42501';END IF;
END $preflight$;

CREATE TABLE cotironda_piloto_privado.uncertain_triage_cases_mvp258(
 case_id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
 source_fingerprint text NOT NULL UNIQUE
   CHECK(source_fingerprint~'^[a-f0-9]{64}$'),
 source_kind text NOT NULL CHECK(source_kind IN(
  'supplier_request','ai_supplier_request','buyer_tracking','supplier_ack','finalist')),
 reason text NOT NULL CHECK(reason IN(
  'uncertain_without_id','stale_lease_unverified')),
 request_id uuid,
 recipient_key text,
 source_message_hmac text CHECK(source_message_hmac IS NULL OR
   source_message_hmac~'^[a-f0-9]{64}$'),
 source_at timestamptz,
 first_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(source_message_hmac IS NULL OR source_kind='supplier_ack')
);
ALTER TABLE cotironda_piloto_privado.uncertain_triage_cases_mvp258
 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.uncertain_triage_cases_mvp258
 FROM public,anon,authenticated,service_role;

-- Operator review notes never claim delivery. Only a SHA256 digest of the
-- operator's independently retained evidence, no text or contact details.
CREATE TABLE cotironda_piloto_privado.uncertain_review_notes_mvp258(
 event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 case_id uuid NOT NULL REFERENCES
  cotironda_piloto_privado.uncertain_triage_cases_mvp258(case_id),
 note_code text NOT NULL CHECK(note_code IN (
  'awaiting_provider_evidence','manual_investigation_incomplete',
  'operator_escalation_required')),
 evidence_sha256 text NOT NULL CHECK(evidence_sha256~'^[a-f0-9]{64}$'),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(case_id,note_code,evidence_sha256)
);
ALTER TABLE cotironda_piloto_privado.uncertain_review_notes_mvp258
 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.uncertain_review_notes_mvp258
 FROM public,anon,authenticated,service_role;

-- Fair scan: previously unseen cases are oldest; scan updates last_seen,
-- meaning the next invocation can progress through the full backlog.
CREATE FUNCTION public.cotironda_piloto_scan_uncertain_mvp258(p_limit integer DEFAULT 25)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE scanned_ integer;
BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 WITH source_rows AS (
  SELECT 'supplier_request'::text kind,
   o.request_id,o.supplier_key recipient,NULL::text message_hmac,
   o.state,o.whapi_message_id,o.leased_at AS source_at,
   o.request_id::text||':'||o.supplier_key AS key_
  FROM cotironda_piloto_privado.whapi_outbox o
  UNION ALL
  SELECT 'ai_supplier_request',o.request_id,o.supplier_key,NULL::text,
   o.state,o.whapi_message_id,o.leased_at,
   o.request_id::text||':'||o.supplier_key
  FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 o
  UNION ALL
  SELECT 'buyer_tracking',t.request_id,r.buyer_key,NULL::text,
   t.send_state,t.whapi_message_id,t.send_attempted_at,
   t.request_id::text
  FROM cotironda_piloto_privado.buyer_tracking_mvp091 t
  JOIN cotironda_piloto_privado.requests r ON r.id=t.request_id
  UNION ALL
  SELECT 'supplier_ack',m.request_id,m.participant_key,a.message_hmac,
   a.state,a.whapi_message_id,a.reserved_at,
   a.message_hmac
  FROM cotironda_piloto_privado.supplier_ack_mvp104 a
  JOIN cotironda_piloto_privado.whapi_inbox m ON m.message_hmac=a.message_hmac
  UNION ALL
  SELECT 'finalist',o.request_id,o.recipient_key,NULL::text,
   o.state,o.whapi_message_id,o.leased_at,
   o.request_id::text||':'||o.recipient_key
  FROM cotironda_piloto_privado.finalist_whapi_outbox_mvp110 o
 ), eligible AS (
  SELECT source_rows.*,
   CASE WHEN state='uncertain' THEN 'uncertain_without_id'
    ELSE 'stale_lease_unverified' END AS reason_,
   encode(extensions.digest(kind||':'||key_,'sha256'),'hex') AS fingerprint_
  FROM source_rows
  WHERE key_ IS NOT NULL AND whapi_message_id IS NULL AND (
   state='uncertain' OR
   (state='leased' AND source_at<clock_timestamp()-interval '15 minutes'))
 ), chosen AS (
  SELECT e.* FROM eligible e
  LEFT JOIN cotironda_piloto_privado.uncertain_triage_cases_mvp258 c
   ON c.source_fingerprint=e.fingerprint_
  ORDER BY c.last_seen_at NULLS FIRST,e.source_at NULLS LAST,e.fingerprint_
  LIMIT p_limit
 ), written AS (
  INSERT INTO cotironda_piloto_privado.uncertain_triage_cases_mvp258(
   source_fingerprint,source_kind,reason,request_id,
   recipient_key,source_message_hmac,source_at)
  SELECT fingerprint_,kind,reason_,request_id,recipient,message_hmac,source_at
  FROM chosen
  ON CONFLICT(source_fingerprint) DO UPDATE
   SET last_seen_at=clock_timestamp(),
       reason=excluded.reason,
       source_at=excluded.source_at
  RETURNING case_id
 )
 SELECT count(*) INTO scanned_ FROM written;
 RETURN jsonb_build_object('state','triage_scanned_private',
  'scanned',scanned_,'messages_sent',0,'automatic_resend_allowed',false);
END;$fn$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_scan_uncertain_mvp258(integer)
 FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_scan_uncertain_mvp258(integer)
 TO service_role;

-- Read-only operator queue: never returns request ID, contact, token or HMAC.
CREATE FUNCTION public.cotironda_piloto_list_uncertain_mvp258(p_limit integer DEFAULT 25)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v jsonb;
BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'case_id',c.case_id,'source_kind',c.source_kind,'reason',c.reason,
  'first_seen_at',c.first_seen_at,'last_seen_at',c.last_seen_at,
  'review_notes',coalesce(n.count_,0)
 ) ORDER BY c.first_seen_at,c.case_id),'[]'::jsonb)
 INTO v
 FROM (
  SELECT * FROM cotironda_piloto_privado.uncertain_triage_cases_mvp258
  ORDER BY first_seen_at,case_id LIMIT p_limit
 ) c
 LEFT JOIN LATERAL(
  SELECT count(*) AS count_ FROM cotironda_piloto_privado.uncertain_review_notes_mvp258 n
  WHERE n.case_id=c.case_id
 ) n ON true;
 RETURN jsonb_build_object('state','operator_review_only','cases',v,
  'automatic_resend_allowed',false);
END;$fn$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_list_uncertain_mvp258(integer)
 FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_list_uncertain_mvp258(integer)
 TO service_role;

-- A manual operator can only leave an immutable "not resolved" evidence
-- note; no "delivered" or "failed therefore retry" action exists.
CREATE FUNCTION public.cotironda_piloto_note_uncertain_mvp258(
 p_case_id uuid,p_note_code text,p_evidence_sha256 text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE inserted_ integer;
BEGIN
 IF p_case_id IS NULL OR p_note_code NOT IN(
  'awaiting_provider_evidence','manual_investigation_incomplete',
  'operator_escalation_required') OR
  p_evidence_sha256 IS NULL OR p_evidence_sha256 !~ '^[a-f0-9]{64}$'
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 INSERT INTO cotironda_piloto_privado.uncertain_review_notes_mvp258(
  case_id,note_code,evidence_sha256)
 SELECT c.case_id,p_note_code,p_evidence_sha256
 FROM cotironda_piloto_privado.uncertain_triage_cases_mvp258 c
 WHERE c.case_id=p_case_id
 ON CONFLICT(case_id,note_code,evidence_sha256) DO NOTHING;
 GET DIAGNOSTICS inserted_=row_count;
 RETURN jsonb_build_object('state',CASE WHEN inserted_=1 THEN 'review_noted'
  ELSE 'no_change' END,'automatic_resend_allowed',false);
END;$fn$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_note_uncertain_mvp258(
 uuid,text,text) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_note_uncertain_mvp258(
 uuid,text,text) TO service_role;
