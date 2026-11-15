-- COTIRONDA V2 — SOLAMENTE CANDIDATO, NO PUBLICAR SIN «PUBLICALO».
-- Read-only selector for the already-existing Vault-authenticated scheduled
-- document-recovery worker. Does NOT create invitations, approve buyers,
-- change policies, send WhatsApps, access originals or bypass supplier consent.
-- Original downloads remain guarded independently by V2 informed consent.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_v2_d013_scheduled_dispatch_due_private()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $v2dispatch$
DECLARE v_request uuid;
BEGIN
 IF NOT EXISTS(
   SELECT 1 FROM cotironda_piloto_privado.v2_business_policy p
   WHERE p.singleton=true AND p.enabled=true
     AND p.activated_at IS NOT NULL)
 OR NOT EXISTS(
   SELECT 1 FROM cotironda_piloto_privado.v2_auto_release_policy p
   WHERE p.singleton=true AND p.enabled=true
     AND p.activated_at IS NOT NULL)
 OR NOT EXISTS(
   SELECT 1 FROM cotironda_piloto_privado.ai_dispatch_gate_mvp222 g
   WHERE g.only_row AND g.enabled=true AND g.activated_at IS NOT NULL)
 OR NOT EXISTS(
   SELECT 1 FROM cotironda_piloto_privado.integration_flags i
   WHERE i.only_row AND i.whatsapp_outbound_enabled=true)
 THEN RETURN jsonb_build_object('state','disabled'); END IF;

 SELECT r.id INTO v_request
 FROM cotironda_piloto_privado.requests r
 JOIN cotironda_piloto_privado.v2_business_policy v2
   ON v2.singleton=true AND v2.enabled=true
   AND v2.activated_at IS NOT NULL
   AND r.created_at>=v2.activated_at
 JOIN cotironda_piloto_privado.ai_shadow_requests_mvp221 shadow
   ON shadow.request_id=r.id AND shadow.status='shadow'
 JOIN cotironda_piloto_privado.participants buyer
   ON buyer.key=r.buyer_key
   AND buyer.participant_role='buyer'
   AND buyer.chat_hmac IS NOT NULL
   AND buyer.consent_at IS NOT NULL
   AND buyer.opted_out_at IS NULL
 JOIN cotironda_piloto_privado.whapi_inbox source
   ON source.message_hmac=r.source_hmac
   AND source.request_id=r.id
   AND source.participant_key=buyer.key
   AND source.chat_hmac=buyer.chat_hmac
   AND source.processing_state='needs_review'
 JOIN cotironda_piloto_privado.ai_dispatch_jobs_mvp222 job
   ON job.request_id=r.id AND job.state='pending'
 JOIN cotironda_piloto_privado.invitations inv
   ON inv.request_id=job.request_id
   AND inv.supplier_key=job.supplier_key
   AND inv.state='prepared'
 WHERE r.state='prepared'
   AND r.timing_mode='business_two_days'
   AND r.round_days=2
   AND r.closes_at>clock_timestamp()
   AND r.created_at>=clock_timestamp()-interval '3 days'
   AND r.closes_at=cotironda_piloto_privado.v2_deadline(
      r.created_at,r.delivery_city)
   AND cotironda_piloto_privado.confirmada_comprador_mvp280(r.id)
   AND cotironda_piloto_privado.proveedores_contactables_mvp306(r.id)
   AND EXISTS(SELECT 1
     FROM cotironda_piloto_privado.ai_buyer_auto_release_mvp306 a
     WHERE a.request_id=r.id
       AND a.buyer_key=r.buyer_key
       AND a.source_hmac=r.source_hmac)
 GROUP BY r.id,r.created_at
 ORDER BY r.created_at,r.id
 LIMIT 1;

 IF v_request IS NULL THEN
   RETURN jsonb_build_object('state','empty');
 END IF;
 RETURN jsonb_build_object('state','ready','request_id',v_request::text);
END $v2dispatch$;

REVOKE ALL ON FUNCTION public.cotironda_piloto_v2_d013_scheduled_dispatch_due_private()
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_v2_d013_scheduled_dispatch_due_private()
 TO service_role;
