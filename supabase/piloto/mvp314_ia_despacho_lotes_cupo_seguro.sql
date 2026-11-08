-- MVP314 — durable, bounded continuation of IA Central invitations.
-- Install only AFTER MVP309-313; initially OFF. NO cron, Whapi or flag activation.
-- Budget counts irrevocable attempts/leases, including unknown remote outcomes.
-- Each claim reserves ONE daily slot in the SAME transaction as its lease.
CREATE TABLE IF NOT EXISTS cotironda_piloto_privado.ai_batch_gate_mvp314(
 only_row boolean PRIMARY KEY DEFAULT true CHECK(only_row),
 enabled boolean NOT NULL DEFAULT false,
 activated_at timestamptz,
 daily_attempt_limit integer NOT NULL DEFAULT 20
  CHECK(daily_attempt_limit BETWEEN 1 AND 100),
 buyer_daily_attempt_limit integer NOT NULL DEFAULT 8
  CHECK(buyer_daily_attempt_limit BETWEEN 1 AND 100),
 CHECK((NOT enabled AND activated_at IS NULL) OR
       (enabled AND activated_at IS NOT NULL))
);
INSERT INTO cotironda_piloto_privado.ai_batch_gate_mvp314(
 only_row,enabled,daily_attempt_limit)
VALUES(true,false,20) ON CONFLICT(only_row) DO NOTHING;
ALTER TABLE cotironda_piloto_privado.ai_batch_gate_mvp314
 ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS cotironda_piloto_privado.ai_batch_budget_mvp314(
 day_utc date PRIMARY KEY,
 attempts_reserved integer NOT NULL DEFAULT 0
  CHECK(attempts_reserved BETWEEN 0 AND 1000000),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE cotironda_piloto_privado.ai_batch_budget_mvp314
 ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS cotironda_piloto_privado.ai_batch_buyer_budget_mvp314(
 day_utc date NOT NULL,
 buyer_key text NOT NULL REFERENCES cotironda_piloto_privado.participants(key),
 attempts_reserved integer NOT NULL DEFAULT 0 CHECK(attempts_reserved BETWEEN 0 AND 1000000),
 PRIMARY KEY(day_utc,buyer_key)
);
ALTER TABLE cotironda_piloto_privado.ai_batch_buyer_budget_mvp314
 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE
 cotironda_piloto_privado.ai_batch_gate_mvp314,
 cotironda_piloto_privado.ai_batch_budget_mvp314,
 cotironda_piloto_privado.ai_batch_buyer_budget_mvp314
 FROM PUBLIC,anon,authenticated,service_role;

-- Only new jobs CREATED after activation can be drained; existing pilot
-- / uncertain / leased jobs never silently re-enter the queue.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_next_batch_mvp314()
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $next314$
DECLARE gate record;v_day date;v_used int;v_request uuid;
BEGIN
 SELECT g.enabled,g.activated_at,g.daily_attempt_limit,
  g.buyer_daily_attempt_limit INTO gate
 FROM cotironda_piloto_privado.ai_batch_gate_mvp314 g
 WHERE g.only_row;
 IF NOT FOUND OR NOT gate.enabled OR gate.activated_at IS NULL
  OR NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_dispatch_gate_mvp222
    WHERE only_row AND enabled AND activated_at IS NOT NULL)
  OR NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.integration_flags
    WHERE only_row AND whatsapp_outbound_enabled)
 THEN RETURN jsonb_build_object('state','disabled');END IF;
 v_day:=(clock_timestamp() AT TIME ZONE 'UTC')::date;
 SELECT b.attempts_reserved INTO v_used
 FROM cotironda_piloto_privado.ai_batch_budget_mvp314 b
 WHERE b.day_utc=v_day;
 IF coalesce(v_used,0)>=gate.daily_attempt_limit
 THEN RETURN jsonb_build_object('state','budget_exhausted');END IF;
 SELECT j.request_id INTO v_request
 FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 j
 JOIN cotironda_piloto_privado.requests r ON r.id=j.request_id
 JOIN cotironda_piloto_privado.ai_shadow_requests_mvp221 sh
   ON sh.request_id=r.id AND sh.status='shadow'
 JOIN cotironda_piloto_privado.participants s ON s.key=j.supplier_key
 JOIN cotironda_piloto_privado.participants b ON b.key=r.buyer_key
 JOIN cotironda_piloto_privado.invitations i
   ON i.request_id=j.request_id AND i.supplier_key=j.supplier_key
 LEFT JOIN cotironda_piloto_privado.ai_batch_buyer_budget_mvp314 quota
   ON quota.buyer_key=r.buyer_key AND quota.day_utc=v_day
 JOIN cotironda_piloto_privado.whapi_inbox src
   ON src.message_hmac=r.source_hmac AND src.request_id=r.id
   AND src.participant_key=b.key AND src.chat_hmac=b.chat_hmac
 WHERE j.state='pending' AND j.created_at>=gate.activated_at
  AND coalesce(quota.attempts_reserved,0)<gate.buyer_daily_attempt_limit
  AND r.state='prepared' AND r.closes_at>clock_timestamp()
  AND i.state='prepared' AND s.participant_role='supplier'
  AND s.chat_hmac IS NOT NULL AND s.consent_at IS NOT NULL
  AND s.opted_out_at IS NULL
  AND b.participant_role='buyer' AND b.chat_hmac IS NOT NULL
  AND b.consent_at IS NOT NULL AND b.opted_out_at IS NULL
  AND s.delivery_city IS NOT NULL
  AND lower(btrim(r.delivery_city))=lower(btrim(s.delivery_city))
  AND src.kind='text' AND src.plaintext_sha256=
    encode(sha256(convert_to(r.original_request,'UTF8')),'hex')
  AND cotironda_piloto_privado.proveedor_contactable_mvp307(s.key)
 ORDER BY j.created_at,j.request_id,j.supplier_key LIMIT 1;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','empty');END IF;
 RETURN jsonb_build_object('state','ready','request_id',v_request);
END $next314$;

-- Serializes all MVP314 claims on policy row. No HTTP in this transaction.
-- The old MVP222 claim is preserved while this gate is OFF. When ON,
-- its trusted webhook calls delegate to this same budgeted claim.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_claim_mvp314(
 p_request uuid
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $claim314$
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
  AND src.kind='text' AND src.plaintext_sha256=
    encode(sha256(convert_to(r.original_request,'UTF8')),'hex')
  AND cotironda_piloto_privado.proveedor_contactable_mvp307(s.key)
  AND coalesce((SELECT bb.attempts_reserved
    FROM cotironda_piloto_privado.ai_batch_buyer_budget_mvp314 bb
    WHERE bb.day_utc=v_day AND bb.buyer_key=r.buyer_key),0)
    <gate.buyer_daily_attempt_limit
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
END $claim314$;

-- Prevent the original signed webhook from bypassing the new budget.
-- Gate OFF keeps exactly its prior implementation and behavior.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_claim_mvp222(
 p_request uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $claim$
DECLARE j record; lease uuid;
BEGIN
 -- When MVP314 is enabled the signed buyer webhook and the autonomous
 -- worker share ONE atomic daily budget. Never bypass via the old RPC.
 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_batch_gate_mvp314
  WHERE only_row AND enabled AND activated_at IS NOT NULL)
 THEN RETURN public.cotironda_piloto_ia_claim_mvp314(p_request);END IF;
 IF NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_dispatch_gate_mvp222
  WHERE only_row AND enabled AND activated_at IS NOT NULL)
 OR NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.integration_flags
  WHERE only_row AND whatsapp_outbound_enabled)
 THEN RETURN jsonb_build_object('state','disabled');END IF;
 SELECT d.request_id,d.supplier_key,p.chat_hmac INTO j
 FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 d
 JOIN cotironda_piloto_privado.requests r ON r.id=d.request_id
 JOIN cotironda_piloto_privado.participants p ON p.key=d.supplier_key
 JOIN cotironda_piloto_privado.invitations i
   ON i.request_id=d.request_id AND i.supplier_key=d.supplier_key
 WHERE d.request_id=p_request AND d.state='pending'
  AND r.state='prepared' AND r.closes_at>clock_timestamp()
  AND i.state='prepared' AND p.participant_role='supplier'
  AND p.chat_hmac IS NOT NULL AND p.consent_at IS NOT NULL
  AND p.opted_out_at IS NULL
  AND lower(btrim(r.delivery_city))=lower(btrim(p.delivery_city))
 ORDER BY d.supplier_key FOR UPDATE OF d SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','empty');END IF;
 lease:=gen_random_uuid();
 UPDATE cotironda_piloto_privado.ai_dispatch_jobs_mvp222
 SET state='leased',lease_token=lease,leased_at=clock_timestamp()
 WHERE request_id=j.request_id AND supplier_key=j.supplier_key;
 RETURN jsonb_build_object('state','leased','request_id',j.request_id,
   'supplier_key',j.supplier_key,'chat_hmac',j.chat_hmac,'lease_token',lease);
END;
$claim$;


-- Counts only: safe for service-only monitoring, without phone/PII.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_batch_health_mvp314()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $health314$
 SELECT jsonb_build_object('enabled',g.enabled,
  'daily_limit',g.daily_attempt_limit,
  'buyer_daily_limit',g.buyer_daily_attempt_limit,
  'reserved_today',coalesce((SELECT b.attempts_reserved
     FROM cotironda_piloto_privado.ai_batch_budget_mvp314 b
     WHERE b.day_utc=(clock_timestamp() AT TIME ZONE 'UTC')::date),0),
  'pending_new',(SELECT count(*) FROM
    cotironda_piloto_privado.ai_dispatch_jobs_mvp222 j
    WHERE j.state='pending' AND g.activated_at IS NOT NULL
      AND j.created_at>=g.activated_at),
  'stale_leased_new',(SELECT count(*) FROM
    cotironda_piloto_privado.ai_dispatch_jobs_mvp222 j
    WHERE j.state='leased' AND g.activated_at IS NOT NULL
      AND j.created_at>=g.activated_at
      AND j.leased_at<clock_timestamp()-interval '20 minutes'))
 FROM cotironda_piloto_privado.ai_batch_gate_mvp314 g WHERE g.only_row;
$health314$;
REVOKE ALL ON FUNCTION
 public.cotironda_piloto_ia_next_batch_mvp314(),
 public.cotironda_piloto_ia_claim_mvp314(uuid),
 public.cotironda_piloto_ia_batch_health_mvp314()
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_ia_next_batch_mvp314(),
 public.cotironda_piloto_ia_claim_mvp314(uuid),
 public.cotironda_piloto_ia_batch_health_mvp314()
 TO service_role;
