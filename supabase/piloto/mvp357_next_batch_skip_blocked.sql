-- MVP357 development / PILOT only / NEVER execute without publication approval.
-- Snapshot of live public.next_batch_mvp314 12/11/2026, with exactly one
-- added predicate. Depends on MVP356 helper (gate OFF -> no effect).
-- This does NOT enqueue HTTP, install cron, alter secrets or contact suppliers.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_next_batch_mvp314()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  AND cotironda_piloto_privado.confirmada_comprador_mvp280(r.id)
  AND cotironda_piloto_privado.proveedor_contactable_mvp307(s.key)
  -- MVP357: no elegir continuamente un pending cuyo proveedor está
  -- bloqueado por un despacho de otra ronda. Elegir el siguiente apto.
  AND NOT cotironda_piloto_privado.hay_despacho_solapado_mvp356(
   j.request_id,j.supplier_key)
 ORDER BY j.created_at,j.request_id,j.supplier_key LIMIT 1;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','empty');END IF;
 RETURN jsonb_build_object('state','ready','request_id',v_request);
END $function$;
