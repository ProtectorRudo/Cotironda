-- MVP257 / Etapa 5. PASSIVE, authenticated Whapi status reconciliation ONLY.
-- No resends, no checkout, no automatic change to ANY outbound ledger.
-- Status without a known Whapi message ID is NEVER treated as proof.
DO $gate$ BEGIN
 IF to_regclass('cotironda_piloto_privado.whapi_outbox') IS NULL OR
 to_regclass('cotironda_piloto_privado.ai_dispatch_jobs_mvp222') IS NULL OR
 to_regclass('cotironda_piloto_privado.delivery_receipts_mvp119') IS NULL
 THEN RAISE EXCEPTION 'mvp257_wrong_schema' USING errcode='42501';
 END IF;
END $gate$;

CREATE TABLE cotironda_piloto_privado.uncertain_whapi_receipts_mvp257(
 message_id_sha256 text PRIMARY KEY CHECK(message_id_sha256 ~ '^[a-f0-9]{64}$'),
 source_kind text NOT NULL CHECK(source_kind IN (
  'supplier_request','ai_supplier_request','buyer_tracking','supplier_ack','finalist'
 )),
 request_id uuid,
 recipient_key text NOT NULL,
 state text NOT NULL CHECK(state IN(
  'pending','sent','failed','deleted','delivered','read','played')),
 status_code integer NOT NULL CHECK(status_code BETWEEN 0 AND 6),
 event_unix bigint NOT NULL CHECK(event_unix>0),
 first_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE cotironda_piloto_privado.uncertain_whapi_receipts_mvp257
 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.uncertain_whapi_receipts_mvp257
 FROM public,anon,authenticated,service_role;

-- Authorized status events (validated signature/channel in Edge), NOT a
-- generic "check by phone" or a command to requeue a WhatsApp send.
CREATE FUNCTION public.cotironda_piloto_observe_uncertain_whapi_mvp257(
 p_whapi_message_id text,p_status text,p_status_code integer,
 p_recipient_chat_hmac text,p_event_unix bigint
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
 SET search_path='' AS $fn$
DECLARE
 matches_ integer;kind_ text;request_ uuid;recipient_ text;
 evidence_ record;digest_ text;old_rank_ integer;new_rank_ integer;inserted_ integer;
BEGIN
 IF p_whapi_message_id IS NULL OR
 p_whapi_message_id !~ '^[A-Za-z0-9_-]{8,160}$' OR
 p_recipient_chat_hmac IS NULL OR
 p_recipient_chat_hmac !~ '^[a-f0-9]{64}$' OR
 p_status NOT IN('failed','pending','sent','delivered','read','played','deleted') OR
 p_status_code IS DISTINCT FROM (CASE p_status
  WHEN 'failed' THEN 0 WHEN 'pending' THEN 1 WHEN 'sent' THEN 2
  WHEN 'delivered' THEN 3 WHEN 'read' THEN 4 WHEN 'played' THEN 5
  WHEN 'deleted' THEN 6 ELSE -1 END) OR
 p_event_unix IS NULL OR
 p_event_unix<extract(epoch from clock_timestamp()-interval '7 days')::bigint OR
 p_event_unix>extract(epoch from clock_timestamp()+interval '5 minutes')::bigint
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 -- Reject reused IDs even when only one recipient hash matches. A reused
 -- ID across companies or outbox types is ambiguous, never proof.
 IF (
  (SELECT count(*) FROM cotironda_piloto_privado.whapi_outbox
   WHERE whapi_message_id=p_whapi_message_id)+
  (SELECT count(*) FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222
   WHERE whapi_message_id=p_whapi_message_id)+
  (SELECT count(*) FROM cotironda_piloto_privado.buyer_tracking_mvp091
   WHERE whapi_message_id=p_whapi_message_id)+
  (SELECT count(*) FROM cotironda_piloto_privado.supplier_ack_mvp104
   WHERE whapi_message_id=p_whapi_message_id)+
  (SELECT count(*) FROM cotironda_piloto_privado.finalist_whapi_outbox_mvp110
   WHERE whapi_message_id=p_whapi_message_id)
 )<>1 THEN RETURN jsonb_build_object('state','unmatched');END IF;
 -- Each opaque Whapi message ID must correspond to EXACTLY one existing
 -- uncertain entry AND recipient. Source membership is never inferred.
 SELECT count(*),max(x.source_kind),max(x.request_id::text)::uuid,
  max(x.recipient_key)
 INTO matches_,kind_,request_,recipient_
 FROM (
   SELECT 'supplier_request'::text source_kind,o.request_id,o.supplier_key recipient_key
   FROM cotironda_piloto_privado.whapi_outbox o
   WHERE o.state='uncertain' AND o.whapi_message_id=p_whapi_message_id
   UNION ALL
   SELECT 'ai_supplier_request',o.request_id,o.supplier_key
   FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 o
   WHERE o.state='uncertain' AND o.whapi_message_id=p_whapi_message_id
   UNION ALL
   SELECT 'buyer_tracking',t.request_id,r.buyer_key
   FROM cotironda_piloto_privado.buyer_tracking_mvp091 t
   JOIN cotironda_piloto_privado.requests r ON r.id=t.request_id
   WHERE t.send_state='uncertain' AND t.whapi_message_id=p_whapi_message_id
   UNION ALL
   SELECT 'supplier_ack',m.request_id,m.participant_key
   FROM cotironda_piloto_privado.supplier_ack_mvp104 a
   JOIN cotironda_piloto_privado.whapi_inbox m ON m.message_hmac=a.message_hmac
   WHERE a.state='uncertain' AND a.whapi_message_id=p_whapi_message_id
   UNION ALL
   SELECT 'finalist',o.request_id,o.recipient_key
   FROM cotironda_piloto_privado.finalist_whapi_outbox_mvp110 o
   WHERE o.state='uncertain' AND o.whapi_message_id=p_whapi_message_id
 ) x JOIN cotironda_piloto_privado.participants p
 ON p.key=x.recipient_key AND p.chat_hmac=p_recipient_chat_hmac;
 IF matches_<>1 THEN RETURN jsonb_build_object('state','unmatched');END IF;
 digest_:=encode(extensions.digest(p_whapi_message_id,'sha256'),'hex');
 new_rank_:=CASE p_status
  WHEN 'pending' THEN 0 WHEN 'sent' THEN 1
  WHEN 'failed' THEN 2 WHEN 'deleted' THEN 2
  WHEN 'delivered' THEN 3 WHEN 'read' THEN 4 WHEN 'played' THEN 5 END;
 INSERT INTO cotironda_piloto_privado.uncertain_whapi_receipts_mvp257(
  message_id_sha256,source_kind,request_id,recipient_key,
  state,status_code,event_unix)
 VALUES(digest_,kind_,request_,recipient_,p_status,p_status_code,p_event_unix)
 ON CONFLICT(message_id_sha256) DO NOTHING;
 GET DIAGNOSTICS inserted_=row_count;
 IF inserted_=1 THEN RETURN jsonb_build_object('state','observed_uncertain');END IF;
 SELECT * INTO evidence_
 FROM cotironda_piloto_privado.uncertain_whapi_receipts_mvp257
 WHERE message_id_sha256=digest_ FOR UPDATE;
 IF NOT FOUND OR evidence_.source_kind IS DISTINCT FROM kind_
 OR evidence_.request_id IS DISTINCT FROM request_
 OR evidence_.recipient_key IS DISTINCT FROM recipient_
 THEN RETURN jsonb_build_object('state','unmatched');END IF;
 old_rank_:=CASE evidence_.state
  WHEN 'pending' THEN 0 WHEN 'sent' THEN 1
  WHEN 'failed' THEN 2 WHEN 'deleted' THEN 2
  WHEN 'delivered' THEN 3 WHEN 'read' THEN 4 WHEN 'played' THEN 5 END;
 IF new_rank_<=old_rank_
 THEN RETURN jsonb_build_object('state','unchanged');END IF;
 UPDATE cotironda_piloto_privado.uncertain_whapi_receipts_mvp257
 SET state=p_status,status_code=p_status_code,
     event_unix=p_event_unix,last_seen_at=clock_timestamp()
 WHERE message_id_sha256=digest_;
 RETURN jsonb_build_object('state','advanced');
END;$fn$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_observe_uncertain_whapi_mvp257(
 text,text,integer,text,bigint) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_observe_uncertain_whapi_mvp257(
 text,text,integer,text,bigint) TO service_role;

-- Aggregate-only operator signal, zero identifiers; no requeue operation.
CREATE FUNCTION public.cotironda_piloto_uncertain_summary_mvp257()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $fn$
 WITH all_jobs AS (
  SELECT 'supplier_request'::text source_kind, state,
   whapi_message_id,leased_at AS at_
  FROM cotironda_piloto_privado.whapi_outbox
  UNION ALL SELECT 'ai_supplier_request',state,whapi_message_id,leased_at
  FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222
  UNION ALL SELECT 'buyer_tracking',send_state,whapi_message_id,send_attempted_at
  FROM cotironda_piloto_privado.buyer_tracking_mvp091
  UNION ALL SELECT 'supplier_ack',state,whapi_message_id,reserved_at
  FROM cotironda_piloto_privado.supplier_ack_mvp104
  UNION ALL SELECT 'finalist',state,whapi_message_id,leased_at
  FROM cotironda_piloto_privado.finalist_whapi_outbox_mvp110
 ), counts AS (
  SELECT count(*) FILTER(WHERE state='uncertain') AS uncertain,
   count(*) FILTER(WHERE state='uncertain' AND whapi_message_id IS NULL)
    AS without_id,
   count(*) FILTER(WHERE state='uncertain' AND whapi_message_id IS NOT NULL)
    AS with_id,
   count(*) FILTER(WHERE state='leased' AND at_<clock_timestamp()-interval '15 minutes')
    AS stalled_leases
  FROM all_jobs
 )
 SELECT jsonb_build_object(
  'state','private_uncertain_summary',
  'uncertain',counts.uncertain,
  'without_whapi_id',counts.without_id,
  'with_whapi_id',counts.with_id,
  'stalled_leases',counts.stalled_leases,
  'observed_with_authenticated_status',
   (SELECT count(*) FROM cotironda_piloto_privado.uncertain_whapi_receipts_mvp257),
  'automatic_resend_allowed',false
 ) FROM counts
$fn$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_uncertain_summary_mvp257()
 FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_uncertain_summary_mvp257()
 TO service_role;
