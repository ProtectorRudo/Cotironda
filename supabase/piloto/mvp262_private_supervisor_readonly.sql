-- MVP262 / IA Central etapa 7: private, aggregate, read-only supervisor.
-- NO outbox writes, notifications, price modifications, contact reveal,
-- cron activation, payments or automatic adjudication.
DO $gate$ BEGIN
 IF to_regclass('cotironda_piloto_privado.ai_dispatch_jobs_mvp222') IS NULL OR
 to_regclass('cotironda_piloto_privado.ai_supplier_review_mvp227') IS NULL OR
 to_regclass('cotironda_piloto_privado.document_ai_diagnostics_mvp127') IS NULL OR
 to_regclass('cotironda_piloto_privado.uncertain_triage_cases_mvp258') IS NULL OR
 to_regclass('cotironda_piloto_privado.uncertain_whapi_receipts_mvp257') IS NULL
 THEN RAISE EXCEPTION 'mvp262_dependency_missing' USING errcode='42501';
 END IF;
END $gate$;

-- Even service_role must invoke this function; direct access to the
-- underlying sensitive tables is not granted.
CREATE FUNCTION public.cotironda_piloto_supervisor_snapshot_mvp262(
 p_window_hours integer DEFAULT 24
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path='' AS $fn$
DECLARE
 t_ timestamptz:=statement_timestamp();
 uncertain_ bigint;stalled_ bigint;
 pending_ bigint;review_ bigint;quote_reserved_ bigint;
 retry_due_ bigint;manual_document_ bigint;
 triage_ bigint;new_triage_ bigint;receipt_ bigint;
 memory_expiring_ bigint;
 priority_ text;
BEGIN
 IF p_window_hours IS NULL OR p_window_hours NOT BETWEEN 1 AND 168
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 SELECT count(*) FILTER(WHERE state='uncertain'),
  count(*) FILTER(WHERE state='leased'
   AND leased_at<t_-interval '15 minutes'),
  count(*) FILTER(WHERE state='pending')
 INTO uncertain_,stalled_,pending_
 FROM (
  SELECT state,leased_at FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222
  UNION ALL
  SELECT state,leased_at FROM cotironda_piloto_privado.whapi_outbox
 ) deliveries;
 SELECT count(*) FILTER(
    WHERE state='review' AND finished_at >=
     t_-make_interval(hours=>p_window_hours)),
  count(*) FILTER(
    WHERE state='reserved' AND reserved_at<t_-interval '15 minutes')
 INTO review_,quote_reserved_
 FROM cotironda_piloto_privado.ai_supplier_review_mvp227;
 SELECT count(*) FILTER(WHERE state='failed' AND attempt_count<3
    AND next_retry_at<=t_
    AND public.cotironda_piloto_retryable_document_error_mvp256(reason_code)),
  count(*) FILTER(WHERE state='failed'
    AND last_attempt_at>=t_-make_interval(hours=>p_window_hours)
    AND NOT public.cotironda_piloto_retryable_document_error_mvp256(reason_code))
 INTO retry_due_,manual_document_
 FROM cotironda_piloto_privado.document_ai_diagnostics_mvp127;
 SELECT count(*),count(*) FILTER(WHERE n.case_id IS NULL)
 INTO triage_,new_triage_
 FROM cotironda_piloto_privado.uncertain_triage_cases_mvp258 c
 LEFT JOIN LATERAL (
  SELECT x.case_id FROM cotironda_piloto_privado.uncertain_review_notes_mvp258 x
  WHERE x.case_id=c.case_id LIMIT 1
 ) n ON true;
 SELECT count(*) INTO receipt_
 FROM cotironda_piloto_privado.uncertain_whapi_receipts_mvp257;
 SELECT count(*) INTO memory_expiring_
 FROM cotironda_piloto_privado.commercial_context_events_mvp259
 WHERE expires_at>t_ AND expires_at<=t_+interval '24 hours';
 -- Active uncertainty is NEVER cleared on the basis of an observed receipt:
 -- original outbox status stays uncertain until independent reconciliation.
 priority_:=CASE
  WHEN uncertain_>0 OR stalled_>0 OR manual_document_>0 THEN 'blocked'
  WHEN quote_reserved_>0 OR review_>0 OR retry_due_>0
       OR new_triage_>0 THEN 'attention'
  ELSE 'ok' END;
 RETURN jsonb_build_object(
  'state','private_supervisor_snapshot',
  'severity',priority_,
  'window_hours',p_window_hours,
  'signals',jsonb_build_object(
   'outbound_uncertain',uncertain_,
   'outbound_stalled_lease',stalled_,
   'outbound_pending',pending_,
   'supplier_quotes_review',review_,
   'supplier_quotes_stale_reservation',quote_reserved_,
   'document_retry_due',retry_due_,
   'document_manual_review',manual_document_,
   'whapi_triage_cases',triage_,
   'whapi_triage_without_note',new_triage_,
   'whapi_status_evidence',receipt_,
   'commercial_memories_expiring_24h',memory_expiring_),
  'operator_actions',jsonb_build_array(
   CASE WHEN uncertain_>0 OR stalled_>0
     THEN 'investigate_uncertain_whapi_without_resend' ELSE NULL END,
   CASE WHEN manual_document_>0
     THEN 'inspect_permanent_document_failure' ELSE NULL END,
   CASE WHEN review_>0 OR quote_reserved_>0
     THEN 'review_supplier_quote_source' ELSE NULL END,
   CASE WHEN retry_due_>0
     THEN 'inspect_safe_document_retry_worker' ELSE NULL END),
  'costs_verified',false,
  'records_modified',false,
  'messages_sent',false,
  'automatic_resend_allowed',false,
  'automatic_award_allowed',false,
  'contacts_revealed',false
 );
END;$fn$;

REVOKE ALL ON FUNCTION public.cotironda_piloto_supervisor_snapshot_mvp262(
 integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_supervisor_snapshot_mvp262(
 integer) TO service_role;
