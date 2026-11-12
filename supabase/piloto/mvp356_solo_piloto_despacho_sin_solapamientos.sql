-- MVP356 PILOTO ONLY — DEVELOPMENT, NEVER run without explicit publication.
-- Source snapshot: public.claim_mvp222/mvp314 read from PILOTO 2026-11-12.
-- One supplier may have only one active dispatched request while this pilot
-- safeguard is enabled. This is NOT a production scalability policy.
-- Both claim paths get the SAME PostgreSQL transaction advisory lock.
-- No Whapi, network, AI, PII, original download or outgoing messages here.
-- Update this source snapshot if pilot functions change before release.

CREATE OR REPLACE FUNCTION cotironda_piloto_privado.hay_despacho_solapado_mvp356(
 p_request uuid, p_supplier text
) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path TO ''
AS $mvp356$
WITH target AS (
 SELECT r.id,r.created_at,r.closes_at
 FROM cotironda_piloto_privado.requests r
 WHERE r.id=p_request AND r.state='prepared'
   AND r.closes_at>clock_timestamp()
)
SELECT
  NOT EXISTS (SELECT 1 FROM target)
  OR p_supplier IS NULL
  OR btrim(p_supplier)=''
  OR EXISTS (
   SELECT 1 FROM target t
   JOIN cotironda_piloto_privado.ai_dispatch_jobs_mvp222 other_job
     ON other_job.supplier_key=p_supplier
       AND other_job.request_id<>t.id
       AND other_job.state IN ('leased','api_accepted','uncertain')
   JOIN cotironda_piloto_privado.requests other_round
     ON other_round.id=other_job.request_id
       AND other_round.state='prepared'
       AND other_round.closes_at>clock_timestamp()
   WHERE other_round.created_at<t.closes_at
     AND t.created_at<other_round.closes_at
  )
  OR EXISTS (
   SELECT 1 FROM target t
   JOIN cotironda_piloto_privado.whapi_outbox o
     ON o.supplier_key=p_supplier
       AND o.request_id<>t.id
       AND o.state IN ('leased','api_accepted','uncertain')
   JOIN cotironda_piloto_privado.requests old_round
     ON old_round.id=o.request_id
       AND old_round.state='prepared'
       AND old_round.closes_at>clock_timestamp()
   WHERE old_round.created_at<t.closes_at
     AND t.created_at<old_round.closes_at
  );
$mvp356$;
REVOKE ALL ON FUNCTION cotironda_piloto_privado.hay_despacho_solapado_mvp356(uuid,text)
 FROM PUBLIC,anon,authenticated;
-- Private helper is invoked by SECURITY DEFINER claim functions.
-- It is NOT a public RPC. Keep private schema closed to clients.

CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_claim_mvp222(p_request uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE j record; lease uuid;
BEGIN
 -- New gate ON means both webhook and batch MUST share the same budget.
 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_batch_gate_mvp314
  WHERE only_row AND enabled AND activated_at IS NOT NULL)
 THEN RETURN public.cotironda_piloto_ia_claim_mvp314(p_request);END IF;
 IF NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_dispatch_gate_mvp222
  WHERE only_row AND enabled AND activated_at IS NOT NULL)
 OR NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.integration_flags
  WHERE only_row AND whatsapp_outbound_enabled)
 THEN RETURN jsonb_build_object('state','disabled');END IF;
 -- MVP356: serializar los dos métodos de claim mientras el flag piloto
 -- aplique. La ejecución HTTP ocurre DESPUÉS de esta transacción.
 PERFORM pg_advisory_xact_lock(7835634);
 SELECT d.request_id,d.supplier_key,p.chat_hmac INTO j
 FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 d
 JOIN cotironda_piloto_privado.requests r ON r.id=d.request_id
 JOIN cotironda_piloto_privado.participants p ON p.key=d.supplier_key
 JOIN cotironda_piloto_privado.invitations i
   ON i.request_id=d.request_id AND i.supplier_key=d.supplier_key
 WHERE d.request_id=p_request AND d.state='pending'
  AND r.state='prepared' AND r.closes_at>clock_timestamp()
  AND cotironda_piloto_privado.confirmada_comprador_mvp280(r.id)
  AND i.state='prepared' AND p.participant_role='supplier'
  AND p.chat_hmac IS NOT NULL AND p.consent_at IS NOT NULL
  AND p.opted_out_at IS NULL
  AND lower(btrim(r.delivery_city))=lower(btrim(p.delivery_city))
  AND NOT cotironda_piloto_privado.hay_despacho_solapado_mvp356(
   d.request_id,d.supplier_key)
 ORDER BY d.supplier_key FOR UPDATE OF d SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','empty');END IF;
 lease:=gen_random_uuid();
 UPDATE cotironda_piloto_privado.ai_dispatch_jobs_mvp222
 SET state='leased',lease_token=lease,leased_at=clock_timestamp()
 WHERE request_id=j.request_id AND supplier_key=j.supplier_key;
 RETURN jsonb_build_object('state','leased','request_id',j.request_id,
   'supplier_key',j.supplier_key,'chat_hmac',j.chat_hmac,'lease_token',lease);
END;
$function$;


CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_claim_mvp314(p_request uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE gate record;j record;v_day date;v_used integer;v_lease uuid;
 v_buyer text;v_buyer_used integer;
BEGIN
 IF p_request IS NULL THEN RETURN jsonb_build_object('state','invalid');END IF;
 SELECT g.enabled,g.activated_at,g.daily_attempt_limit,
  g.buyer_daily_attempt_limit INTO gate
 FROM cotironda_piloto_privado.ai_batch_gate_mvp314 g
 WHERE g.only_row FOR UPDATE;
 IF NOT FOUND OR NOT gate.enabled OR gate.activated_at IS NULL
  OR NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_dispatch_gate_mvp222
    WHERE only_row AND enabled AND activated_at IS NOT NULL)
  OR NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.integration_flags
    WHERE only_row AND whatsapp_outbound_enabled)
 THEN RETURN jsonb_build_object('state','disabled');END IF;
 -- Mismo lock que MVP222: evita dos claims simultáneos para el
 -- mismo proveedor antes de que el primero quede en estado leased.
 PERFORM pg_advisory_xact_lock(7835634);
 v_day:=(clock_timestamp() AT TIME ZONE 'UTC')::date;
 SELECT attempts_reserved INTO v_used
 FROM cotironda_piloto_privado.ai_batch_budget_mvp314
 WHERE day_utc=v_day FOR UPDATE;
 IF coalesce(v_used,0)>=gate.daily_attempt_limit
 THEN RETURN jsonb_build_object('state','budget_exhausted');END IF;
 SELECT j0.request_id,j0.supplier_key,s.chat_hmac,r.buyer_key INTO j
 FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 j0
 JOIN cotironda_piloto_privado.requests r ON r.id=j0.request_id
 JOIN cotironda_piloto_privado.ai_shadow_requests_mvp221 sh
   ON sh.request_id=r.id AND sh.status='shadow'
 JOIN cotironda_piloto_privado.participants s ON s.key=j0.supplier_key
 JOIN cotironda_piloto_privado.participants b ON b.key=r.buyer_key
 JOIN cotironda_piloto_privado.invitations i
   ON i.request_id=j0.request_id AND i.supplier_key=j0.supplier_key
 JOIN cotironda_piloto_privado.whapi_inbox src
   ON src.message_hmac=r.source_hmac AND src.request_id=r.id
   AND src.participant_key=b.key AND src.chat_hmac=b.chat_hmac
 WHERE j0.request_id=p_request AND j0.state='pending'
  AND j0.created_at>=gate.activated_at
  AND r.state='prepared' AND r.closes_at>clock_timestamp()
  AND i.state='prepared'
  AND s.participant_role='supplier' AND s.chat_hmac IS NOT NULL
  AND s.consent_at IS NOT NULL AND s.opted_out_at IS NULL
  AND b.participant_role='buyer' AND b.chat_hmac IS NOT NULL
  AND b.consent_at IS NOT NULL AND b.opted_out_at IS NULL
  AND s.delivery_city IS NOT NULL
  AND lower(btrim(r.delivery_city))=lower(btrim(s.delivery_city))
  AND cotironda_piloto_privado.confirmada_comprador_mvp280(r.id)
  AND cotironda_piloto_privado.proveedor_contactable_mvp307(s.key)
  AND coalesce((SELECT bb.attempts_reserved
    FROM cotironda_piloto_privado.ai_batch_buyer_budget_mvp314 bb
    WHERE bb.day_utc=v_day AND bb.buyer_key=r.buyer_key),0)
    <gate.buyer_daily_attempt_limit
  AND NOT cotironda_piloto_privado.hay_despacho_solapado_mvp356(
   j0.request_id,j0.supplier_key)
 ORDER BY j0.created_at,j0.supplier_key
 FOR UPDATE OF j0 SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','empty');END IF;
 v_lease:=gen_random_uuid();
 UPDATE cotironda_piloto_privado.ai_dispatch_jobs_mvp222
 SET state='leased',lease_token=v_lease,leased_at=clock_timestamp()
 WHERE request_id=j.request_id AND supplier_key=j.supplier_key
  AND state='pending';
 IF NOT FOUND THEN RAISE EXCEPTION 'mvp314_lost_job_lock';END IF;
 INSERT INTO cotironda_piloto_privado.ai_batch_buyer_budget_mvp314(
   day_utc,buyer_key,attempts_reserved)
 VALUES(v_day,j.buyer_key,1)
 ON CONFLICT(day_utc,buyer_key) DO UPDATE
 SET attempts_reserved=
   cotironda_piloto_privado.ai_batch_buyer_budget_mvp314.attempts_reserved+1;
 INSERT INTO cotironda_piloto_privado.ai_batch_budget_mvp314(
  day_utc,attempts_reserved,updated_at)
 VALUES(v_day,1,clock_timestamp())
 ON CONFLICT(day_utc) DO UPDATE
 SET attempts_reserved=
   cotironda_piloto_privado.ai_batch_budget_mvp314.attempts_reserved+1,
     updated_at=clock_timestamp();
 RETURN jsonb_build_object('state','leased',
   'request_id',j.request_id,'supplier_key',j.supplier_key,
   'chat_hmac',j.chat_hmac,'lease_token',v_lease);
END $function$;


-- Existing finish semantics preserved verbatim as tested source snapshot.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_finish_mvp222(p_request uuid, p_supplier text, p_lease uuid, p_state text, p_message_id text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE n integer;
BEGIN
 IF p_request IS NULL OR p_supplier IS NULL OR p_lease IS NULL
 OR p_state NOT IN('api_accepted','uncertain')
 OR (p_state='api_accepted' AND
   (p_message_id IS NULL OR length(p_message_id) NOT BETWEEN 8 AND 160
    OR p_message_id !~ '^[A-Za-z0-9._:-]+$'))
 OR (p_state='uncertain' AND p_message_id IS NOT NULL)
 THEN RETURN false;END IF;
 UPDATE cotironda_piloto_privado.ai_dispatch_jobs_mvp222
 SET state=p_state,
     whapi_message_id=CASE WHEN p_state='api_accepted'
       THEN p_message_id ELSE NULL END,
     finished_at=clock_timestamp()
 WHERE request_id=p_request AND supplier_key=p_supplier
   AND state='leased' AND lease_token=p_lease;
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN n=1;
END
$function$;

