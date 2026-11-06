-- MVP265 / IA Central 7: append-only operator casebook for supervisor alerts.
-- No automated remediation, sends, contact reveal, quote updates or cron.
-- NO operator is enrolled by the migration. All actions require service_role.
DO $gate$ BEGIN
 IF to_regclass('cotironda_piloto_privado.supervisor_alerts_mvp263') IS NULL
 THEN RAISE EXCEPTION 'mvp265_supervisor_missing' USING errcode='42501';END IF;
END $gate$;

CREATE TABLE cotironda_piloto_privado.supervisor_operators_mvp265(
 operator_ref uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
 active boolean NOT NULL DEFAULT false,
 role text NOT NULL CHECK(role IN('incident_manager')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 revoked_at timestamptz,
 CHECK((active AND revoked_at IS NULL) OR (NOT active))
);
ALTER TABLE cotironda_piloto_privado.supervisor_operators_mvp265
 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.supervisor_operators_mvp265
 FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE cotironda_piloto_privado.supervisor_case_events_mvp265(
 event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 signal_code text NOT NULL REFERENCES
  cotironda_piloto_privado.supervisor_alerts_mvp263(signal_code),
 episode_started_at timestamptz NOT NULL,
 operator_ref uuid NOT NULL REFERENCES
  cotironda_piloto_privado.supervisor_operators_mvp265(operator_ref),
 action_code text NOT NULL CHECK(action_code IN(
  'acknowledge','investigate','escalate',
  'manual_reconciliation_needed','review_resolution')),
 evidence_sha256 text NOT NULL CHECK(evidence_sha256~'^[a-f0-9]{64}$'),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(signal_code,episode_started_at,action_code,evidence_sha256)
);
CREATE INDEX supervisor_cases_mvp265_episodes ON
 cotironda_piloto_privado.supervisor_case_events_mvp265(
  signal_code,episode_started_at,recorded_at DESC,event_id DESC);
ALTER TABLE cotironda_piloto_privado.supervisor_case_events_mvp265
 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.supervisor_case_events_mvp265
 FROM PUBLIC,anon,authenticated,service_role;

-- This RPC requires the calling service to have already authenticated the
-- actual operator; matching operator_ref is NOT standalone authentication.
-- The SQL verifies that operator_ref is explicitly enrolled and active.
CREATE FUNCTION public.cotironda_piloto_supervisor_case_action_mvp265(
 p_signal_code text,p_episode_started_at timestamptz,
 p_operator_ref uuid,p_action_code text,p_evidence_sha256 text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
 SET search_path='' AS $fn$
DECLARE alert_ record;last_action_ text;
 count_today_ bigint;inserted_ integer;
BEGIN
 IF p_signal_code IS NULL OR p_signal_code NOT IN(
  'outbound_uncertain','outbound_stalled_lease',
  'supplier_quotes_review','supplier_quotes_stale_reservation',
  'document_retry_due','document_manual_review',
  'whapi_triage_without_note') OR
 p_episode_started_at IS NULL OR p_operator_ref IS NULL OR
 p_action_code IS NULL OR p_action_code NOT IN(
  'acknowledge','investigate','escalate',
  'manual_reconciliation_needed','review_resolution') OR
 p_evidence_sha256 IS NULL OR p_evidence_sha256 !~ '^[a-f0-9]{64}$'
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 -- Lock the alert only; never change its counts or its actual "active" flag.
 SELECT a.signal_code,a.first_seen_at,a.active INTO alert_
 FROM cotironda_piloto_privado.supervisor_alerts_mvp263 a
 WHERE a.signal_code=p_signal_code FOR UPDATE;
 IF NOT FOUND OR alert_.first_seen_at IS DISTINCT FROM p_episode_started_at
 THEN RETURN jsonb_build_object('state','stale_episode');END IF;
 IF NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.supervisor_operators_mvp265 o
  WHERE o.operator_ref=p_operator_ref AND o.active
  AND o.revoked_at IS NULL AND o.role='incident_manager')
 THEN RETURN jsonb_build_object('state','operator_not_authorized');END IF;
 -- Replays must be harmless even if the incident's state has advanced.
 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.supervisor_case_events_mvp265 e
  WHERE e.signal_code=p_signal_code
   AND e.episode_started_at=p_episode_started_at
   AND e.action_code=p_action_code
   AND e.evidence_sha256=p_evidence_sha256)
 THEN RETURN jsonb_build_object('state','already_recorded');END IF;
 SELECT count(*) INTO count_today_
 FROM cotironda_piloto_privado.supervisor_case_events_mvp265 e
 WHERE e.operator_ref=p_operator_ref
  AND e.recorded_at>=clock_timestamp()-interval '24 hours';
 IF count_today_>=200 THEN
  RETURN jsonb_build_object('state','operator_daily_cap');END IF;
 SELECT e.action_code INTO last_action_
 FROM cotironda_piloto_privado.supervisor_case_events_mvp265 e
 WHERE e.signal_code=p_signal_code AND
  e.episode_started_at=p_episode_started_at
 ORDER BY e.recorded_at DESC,e.event_id DESC LIMIT 1;
 IF alert_.active THEN
  IF (last_action_ IS NULL AND p_action_code<>'acknowledge') OR
    (last_action_ IS NOT NULL AND
     p_action_code NOT IN('investigate','escalate',
       'manual_reconciliation_needed')) THEN
   RETURN jsonb_build_object('state','invalid_transition');END IF;
 ELSE
  -- An operator can document review only after the actual measured signal
  -- has cleared. They cannot close an active operational incident by decree.
  IF last_action_ IS NULL OR p_action_code<>'review_resolution'
  THEN RETURN jsonb_build_object('state','requires_measured_resolution');END IF;
 END IF;
 INSERT INTO cotironda_piloto_privado.supervisor_case_events_mvp265(
  signal_code,episode_started_at,operator_ref,action_code,evidence_sha256)
 VALUES(p_signal_code,p_episode_started_at,p_operator_ref,p_action_code,p_evidence_sha256)
 ON CONFLICT(signal_code,episode_started_at,action_code,evidence_sha256)
 DO NOTHING;
 GET DIAGNOSTICS inserted_=row_count;
 RETURN jsonb_build_object('state',CASE WHEN inserted_=1
  THEN 'recorded_private' ELSE 'already_recorded' END,
  'signal_code',p_signal_code,
  'incident_resolved_by_operator',false,
  'messages_sent',false,'automatic_resend_allowed',false,
  'automatic_award_allowed',false,'contacts_revealed',false);
END;$fn$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_supervisor_case_action_mvp265(
 text,timestamptz,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_supervisor_case_action_mvp265(
 text,timestamptz,uuid,text,text) TO service_role;

-- Operator queue: only aggregate signal, age, SLA and documented state.
-- No operator identity, private evidence hash, request/company/phone/price.
CREATE FUNCTION public.cotironda_piloto_supervisor_case_queue_mvp265()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $fn$
 WITH cases AS (
  SELECT a.signal_code,a.active,a.current_count,a.first_seen_at,
   CASE WHEN a.signal_code IN('outbound_uncertain',
     'outbound_stalled_lease','document_manual_review')
    THEN 'blocked' ELSE 'attention' END AS severity,
   GREATEST(0,floor(extract(epoch FROM (
     clock_timestamp()-a.first_seen_at))/60))::bigint AS age_minutes,
   e.action_code AS last_action,
   e.recorded_at AS last_action_at
  FROM cotironda_piloto_privado.supervisor_alerts_mvp263 a
  LEFT JOIN LATERAL(
   SELECT event_.action_code,event_.recorded_at
   FROM cotironda_piloto_privado.supervisor_case_events_mvp265 event_
   WHERE event_.signal_code=a.signal_code AND
    event_.episode_started_at=a.first_seen_at
   ORDER BY event_.recorded_at DESC,event_.event_id DESC LIMIT 1
  ) e ON true
 )
 SELECT jsonb_build_object(
  'state','private_operator_cases',
  'cases',coalesce(jsonb_agg(jsonb_build_object(
   'signal_code',signal_code,'severity',severity,
   'active',active,'count',current_count,
   'opened_at',first_seen_at,'age_minutes',age_minutes,
   'sla_minutes',CASE WHEN severity='blocked' THEN 30 ELSE 120 END,
   'unacknowledged_over_sla',active AND last_action IS NULL AND
     age_minutes>=CASE WHEN severity='blocked' THEN 30 ELSE 120 END,
   'review_state',CASE
    WHEN NOT active THEN 'source_resolved'
    WHEN last_action IS NULL THEN 'awaiting_operator'
    ELSE last_action END
   ) ORDER BY active DESC,severity,first_seen_at,signal_code),'[]'::jsonb),
  'notifications_sent',false,
  'operator_actions_execute_business_processes',false,
  'costs_verified',false
 )
 FROM cases
$fn$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_supervisor_case_queue_mvp265()
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_supervisor_case_queue_mvp265()
 TO service_role;
