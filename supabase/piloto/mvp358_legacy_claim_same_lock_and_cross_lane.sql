-- MVP358: legacy outbound cannot bypass the PILOT-only MVP356 guard.
-- DEVELOPMENT ONLY. Never apply without "Publicalo" (PILOT exclusively).
-- DDL snapshot copied from installed public.cotironda_piloto_claim_whapi_v1
-- on 2026-11-12. Recompare with live SQL before deployment.
-- Depends on MVP356, leaves private gate OFF by default.
-- Guard rejects active sends from either pipeline, even SAME request,
-- preventing duplicate buyer-to-supplier deliveries.
-- No network/Whapi call, no new grants, no logs with PII.

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
  EXISTS (
   SELECT 1 FROM cotironda_piloto_privado.ai_supplier_overlap_gate_mvp356 gate
   WHERE gate.only_row AND gate.enabled AND gate.activated_at IS NOT NULL
     AND gate.activated_at<=clock_timestamp()
  ) AND (
  NOT EXISTS (SELECT 1 FROM target)
  OR p_supplier IS NULL
  OR btrim(p_supplier)=''
  OR EXISTS (
   SELECT 1 FROM target t
   JOIN cotironda_piloto_privado.ai_dispatch_jobs_mvp222 other_job
     ON other_job.supplier_key=p_supplier
       -- Include SAME request in the opposite outbound pipeline.
       -- A delivered legacy PDF and an IA PDF must never be sent twice.

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
       -- Include SAME request in the opposite outbound pipeline.

       AND o.state IN ('leased','api_accepted','uncertain')
   JOIN cotironda_piloto_privado.requests old_round
     ON old_round.id=o.request_id
       AND old_round.state='prepared'
       AND old_round.closes_at>clock_timestamp()
   WHERE old_round.created_at<t.closes_at
     AND t.created_at<old_round.closes_at
  )
  );
$mvp356$;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_claim_whapi_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare row_ record; token uuid;
begin
 -- MVP358: all claim lanes share SAME xact lock; serial in pilot.
 -- No extra message is ever sent by this SQL function.
 PERFORM pg_advisory_xact_lock(7835634);
 if not exists(select 1 from cotironda_piloto_privado.integration_flags
 where only_row and whatsapp_outbound_enabled=true) then
  return jsonb_build_object('state','outbound_disabled');
 end if;
 select o.request_id,o.supplier_key,o.message_body,p.chat_hmac into row_
 from cotironda_piloto_privado.whapi_outbox o
 join cotironda_piloto_privado.participants p on p.key=o.supplier_key
 where o.state='pending'
  and (cotironda_piloto_privado.allow_next_pilot_send_mvp091(
      o.request_id,o.supplier_key)
   or cotironda_piloto_privado.allow_document_send_mvp099(
      o.request_id,o.supplier_key))
  AND NOT cotironda_piloto_privado.hay_despacho_solapado_mvp356(
     o.request_id,o.supplier_key)
 order by o.created_at,o.supplier_key
 for update of o skip locked limit 1;
 if not found then return jsonb_build_object('state','empty');end if;
 token:=gen_random_uuid();
 update cotironda_piloto_privado.whapi_outbox
 set state='leased',lease_token=token,leased_at=clock_timestamp()
 where request_id=row_.request_id and supplier_key=row_.supplier_key;
 return jsonb_build_object('state','leased','request_id',row_.request_id,
 'supplier_key',row_.supplier_key,'chat_hmac',row_.chat_hmac,
 'message_body',row_.message_body,'lease_token',token);
end;
$function$;
