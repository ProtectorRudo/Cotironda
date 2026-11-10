-- MVP263: IA Central supervisor watchdog, private/opt-in ONLY.
-- Prerequisite MVP262. The migration DOES NOT schedule cron or enable scans.
-- Zero outbound messages, zero LLM/API calls, zero award or price mutation.
DO $gate$ BEGIN
 IF to_regprocedure('public.cotironda_piloto_supervisor_snapshot_mvp262(integer)') IS NULL
 OR to_regclass('cotironda_piloto_privado.uncertain_triage_cases_mvp258') IS NULL
 THEN RAISE EXCEPTION 'mvp263_missing_supervisor_dependencies' USING errcode='42501';
 END IF;
END $gate$;

CREATE TABLE cotironda_piloto_privado.supervisor_policy_mvp263(
 only_row boolean PRIMARY KEY DEFAULT true CHECK(only_row),
 enabled boolean NOT NULL DEFAULT false,
 max_runs_utc_day smallint NOT NULL DEFAULT 96
  CHECK(max_runs_utc_day BETWEEN 1 AND 96),
 last_run_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO cotironda_piloto_privado.supervisor_policy_mvp263(only_row,enabled)
 VALUES(true,false);
ALTER TABLE cotironda_piloto_privado.supervisor_policy_mvp263
 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.supervisor_policy_mvp263
 FROM PUBLIC,anon,authenticated,service_role;

-- One summary per 15-minute UTC bucket; maximum 96/day, 30-day retention.
-- No contact, source IDs, prompt or per-company prices in the snapshot.
CREATE TABLE cotironda_piloto_privado.supervisor_runs_mvp263(
 bucket_utc timestamptz PRIMARY KEY,
 severity text NOT NULL CHECK(severity IN('ok','attention','blocked')),
 signals jsonb NOT NULL CHECK(jsonb_typeof(signals)='object'),
 active_alerts smallint NOT NULL CHECK(active_alerts BETWEEN 0 AND 7),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE cotironda_piloto_privado.supervisor_runs_mvp263
 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.supervisor_runs_mvp263
 FROM PUBLIC,anon,authenticated,service_role;

-- A single row per allowed signal. Repeated ticks UPDATE the same row,
-- rather than inserting another alert or emitting a notification.
CREATE TABLE cotironda_piloto_privado.supervisor_alerts_mvp263(
 signal_code text PRIMARY KEY CHECK(signal_code IN(
  'outbound_uncertain','outbound_stalled_lease',
  'supplier_quotes_review','supplier_quotes_stale_reservation',
  'document_retry_due','document_manual_review',
  'whapi_triage_without_note')),
 active boolean NOT NULL,
 current_count bigint NOT NULL CHECK(current_count>=0),
 first_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 resolved_at timestamptz,
 observations integer NOT NULL DEFAULT 1 CHECK(observations BETWEEN 1 AND 1000000),
 reopen_count integer NOT NULL DEFAULT 0 CHECK(reopen_count BETWEEN 0 AND 100000),
 CHECK((active AND resolved_at IS NULL AND current_count>0)
 OR (NOT active AND resolved_at IS NOT NULL AND current_count=0))
);
ALTER TABLE cotironda_piloto_privado.supervisor_alerts_mvp263
 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.supervisor_alerts_mvp263
 FROM PUBLIC,anon,authenticated,service_role;

-- Callable by an authorized SQL scheduler; no worker/cron is installed here.
-- The row lock + unique bucket makes duplicate and concurrent ticks inert.
CREATE FUNCTION public.cotironda_piloto_supervisor_tick_mvp263()
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
 policy_ record;
 now_ timestamptz:=clock_timestamp();
 bucket_ timestamptz:=date_bin('15 minutes',now_,
   '2000-01-01 00:00:00+00'::timestamptz);
 day_start_ timestamptz:=date_trunc('day',now_ AT TIME ZONE 'UTC')
   AT TIME ZONE 'UTC';
 run_count_ bigint;inserted_ integer;
 snapshot_ jsonb;signals_ jsonb;
 signal_ text;value_ bigint;
 active_count_ integer:=0;new_alerts_ integer:=0;
 reopened_ integer:=0;resolved_ integer:=0;
 had_alert_ boolean;was_active_ boolean;
 alert_codes_ text[]:=ARRAY[
  'outbound_uncertain','outbound_stalled_lease',
  'supplier_quotes_review','supplier_quotes_stale_reservation',
  'document_retry_due','document_manual_review',
  'whapi_triage_without_note'];
BEGIN
 SELECT enabled,max_runs_utc_day,last_run_at INTO policy_
 FROM cotironda_piloto_privado.supervisor_policy_mvp263
 WHERE only_row=true FOR UPDATE;
 IF NOT FOUND OR NOT policy_.enabled THEN
  RETURN jsonb_build_object('state','disabled','messages_sent',false,
   'external_api_calls',0,'automatic_resend_allowed',false);END IF;
 -- Compare fixed UTC buckets, not elapsed wall time. A job starting a few
 -- seconds late must NOT cause the next quarter-hour cron to be skipped.
 IF policy_.last_run_at IS NOT NULL AND
    date_bin('15 minutes',policy_.last_run_at,
     '2000-01-01 00:00:00+00'::timestamptz)>=bucket_ THEN
  RETURN jsonb_build_object('state','interval_guard','messages_sent',false,
   'external_api_calls',0,'automatic_resend_allowed',false);END IF;
 SELECT count(*) INTO run_count_
 FROM cotironda_piloto_privado.supervisor_runs_mvp263
 WHERE bucket_utc>=day_start_ AND bucket_utc<day_start_+interval '1 day';
 IF run_count_>=policy_.max_runs_utc_day THEN
  RETURN jsonb_build_object('state','daily_cap','messages_sent',false,
   'external_api_calls',0,'automatic_resend_allowed',false);END IF;
 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.supervisor_runs_mvp263
  WHERE bucket_utc=bucket_) THEN
  RETURN jsonb_build_object('state','duplicate_bucket','messages_sent',false,
   'external_api_calls',0,'automatic_resend_allowed',false);END IF;

 snapshot_:=public.cotironda_piloto_supervisor_snapshot_mvp262(24);
 IF snapshot_->>'state'<>'private_supervisor_snapshot'
 OR snapshot_->>'severity' NOT IN('ok','attention','blocked')
 OR snapshot_->>'contacts_revealed'<>'false'
 OR snapshot_->>'automatic_award_allowed'<>'false'
 OR snapshot_->>'automatic_resend_allowed'<>'false'
 OR snapshot_->>'messages_sent'<>'false'
 OR snapshot_->>'records_modified'<>'false'
 OR snapshot_->>'costs_verified'<>'false'
 OR jsonb_typeof(snapshot_->'signals') IS DISTINCT FROM 'object'
 THEN RAISE EXCEPTION 'mvp263_untrusted_supervisor_snapshot'
  USING errcode='42501';END IF;
 signals_:=snapshot_->'signals';
 -- Validate every accepted signal; never trust caller-submitted alert codes.
 FOREACH signal_ IN ARRAY alert_codes_ LOOP
  IF jsonb_typeof(signals_->signal_) IS DISTINCT FROM 'number'
   OR (signals_->>signal_) !~ '^[0-9]{1,12}$'
  THEN RAISE EXCEPTION 'mvp263_invalid_signal'
   USING errcode='22023';END IF;
  value_:=(signals_->>signal_)::bigint;
  IF value_>1000000000 THEN
   RAISE EXCEPTION 'mvp263_signal_out_of_bounds' USING errcode='22023';END IF;
  IF value_>0 THEN active_count_:=active_count_+1;END IF;
 END LOOP;

 INSERT INTO cotironda_piloto_privado.supervisor_runs_mvp263(
  bucket_utc,severity,signals,active_alerts)
 VALUES(bucket_,snapshot_->>'severity',signals_,active_count_)
 ON CONFLICT(bucket_utc) DO NOTHING;
 GET DIAGNOSTICS inserted_=row_count;
 IF inserted_<>1 THEN
  RETURN jsonb_build_object('state','duplicate_bucket','messages_sent',false,
   'external_api_calls',0,'automatic_resend_allowed',false);END IF;

 FOREACH signal_ IN ARRAY alert_codes_ LOOP
  value_:=(signals_->>signal_)::bigint;
  IF value_>0 THEN
   SELECT true,a.active INTO had_alert_,was_active_
   FROM cotironda_piloto_privado.supervisor_alerts_mvp263 a
   WHERE a.signal_code=signal_;
   IF NOT FOUND THEN new_alerts_:=new_alerts_+1;
   ELSIF was_active_ IS FALSE THEN reopened_:=reopened_+1;END IF;
   INSERT INTO cotironda_piloto_privado.supervisor_alerts_mvp263(
    signal_code,active,current_count,first_seen_at,last_seen_at,
    resolved_at,observations,reopen_count)
   VALUES(signal_,true,value_,now_,now_,NULL,1,0)
   ON CONFLICT(signal_code) DO UPDATE SET
    active=true,current_count=excluded.current_count,
    first_seen_at=CASE WHEN
     cotironda_piloto_privado.supervisor_alerts_mvp263.active
     THEN cotironda_piloto_privado.supervisor_alerts_mvp263.first_seen_at
     ELSE excluded.first_seen_at END,
    last_seen_at=excluded.last_seen_at,resolved_at=NULL,
    observations=LEAST(
     cotironda_piloto_privado.supervisor_alerts_mvp263.observations+1,1000000),
    reopen_count=LEAST(
     cotironda_piloto_privado.supervisor_alerts_mvp263.reopen_count+
       CASE WHEN cotironda_piloto_privado.supervisor_alerts_mvp263.active
        THEN 0 ELSE 1 END,100000);
  ELSE
   UPDATE cotironda_piloto_privado.supervisor_alerts_mvp263
   SET active=false,current_count=0,resolved_at=now_,last_seen_at=now_
   WHERE signal_code=signal_ AND active=true;
   GET DIAGNOSTICS inserted_=row_count;
   resolved_:=resolved_+inserted_;
  END IF;
 END LOOP;
 UPDATE cotironda_piloto_privado.supervisor_policy_mvp263
 SET last_run_at=now_ WHERE only_row=true;
 -- Retention applies ONLY to the aggregate run ledger; the seven alert
 -- rows remain for manual audit. No deletion of customer or quote data.
 DELETE FROM cotironda_piloto_privado.supervisor_runs_mvp263
 WHERE bucket_utc<day_start_-interval '30 days';
 RETURN jsonb_build_object('state','recorded_private',
  'severity',snapshot_->>'severity','active_alerts',active_count_,
  'new_alerts',new_alerts_,'reopened_alerts',reopened_,
  'resolved_alerts',resolved_,
  'messages_sent',false,'external_api_calls',0,
  'model_calls',0,'costs_verified',false,
  'automatic_resend_allowed',false,
  'automatic_award_allowed',false,
  'contacts_revealed',false);
END;$fn$;

REVOKE ALL ON FUNCTION public.cotironda_piloto_supervisor_tick_mvp263()
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_supervisor_tick_mvp263()
 TO service_role;

-- Operator-only projection (never includes URLs, identities, phone or SHA).
CREATE FUNCTION public.cotironda_piloto_supervisor_alerts_mvp263()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $fn$
 SELECT jsonb_build_object(
  'state','private_alerts',
  'enabled',(SELECT enabled FROM
    cotironda_piloto_privado.supervisor_policy_mvp263 WHERE only_row=true),
  'alerts',coalesce((
   SELECT jsonb_agg(jsonb_build_object(
    'signal',signal_code,'active',active,'count',current_count,
    'first_seen_at',first_seen_at,'last_seen_at',last_seen_at,
    'resolved_at',resolved_at,'observations',observations,
    'reopens',reopen_count
    ) ORDER BY signal_code)
   FROM cotironda_piloto_privado.supervisor_alerts_mvp263
  ),'[]'::jsonb),
  'outbound_notifications_enabled',false,
  'models_called',false,'automatic_award_allowed',false)
$fn$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_supervisor_alerts_mvp263()
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_supervisor_alerts_mvp263()
 TO service_role;
