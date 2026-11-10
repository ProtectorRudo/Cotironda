-- MVP300: auditoría E2E de SOLO LECTURA, ejecutable en cotironda-piloto.
-- NO BEGIN/COMMIT, no writes, no API externa, no consumo IA ni WhatsApp.
-- Exclusivamente contadores y estados agregados: sin token, teléfono,
-- HMAC, ID de ronda, proveedor, presupuesto ni documento original.
-- Una prueba de SQL/CI no sustituye el evento externo de WhatsApp.
WITH current_round AS (
 SELECT r.id,r.state,r.closes_at,t.token_hash
 FROM cotironda_piloto_privado.requests r
 JOIN cotironda_piloto_privado.ai_shadow_requests_mvp221 sh ON sh.request_id=r.id
 JOIN cotironda_piloto_privado.ai_buyer_review_mvp279 rev ON rev.request_id=r.id
  AND rev.state='confirmed'
 JOIN cotironda_piloto_privado.buyer_tracking_mvp091 t ON t.request_id=r.id
  AND t.revoked_at IS NULL AND t.expires_at>now()
 JOIN cotironda_piloto_privado.participants buyer ON buyer.key=r.buyer_key
  AND buyer.participant_role='buyer'
  AND buyer.consent_at IS NOT NULL AND buyer.opted_out_at IS NULL
 WHERE r.state IN ('prepared','closed')
 ORDER BY r.created_at DESC LIMIT 1
), witness AS (
 SELECT r.id,r.state AS round_state,
  r.closes_at>now() AS before_deadline,
  (SELECT count(*) FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 d
    WHERE d.request_id=r.id) AS dispatch_jobs,
  (SELECT count(*) FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 d
    WHERE d.request_id=r.id AND d.state='api_accepted' AND
     d.whapi_message_id IS NOT NULL) AS dispatch_with_whapi_id,
  (SELECT count(DISTINCT d.supplier_key)
   FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 d
   JOIN cotironda_piloto_privado.whapi_inbox m ON
    m.request_id=r.id AND m.participant_key=d.supplier_key
    AND m.received_at>=d.finished_at
   WHERE d.request_id=r.id AND d.state='api_accepted') AS suppliers_replied_after_dispatch,
  (SELECT count(DISTINCT rev.supplier_key)
   FROM cotironda_piloto_privado.ai_supplier_review_mvp227 rev
   WHERE rev.request_id=r.id AND rev.state='verified' AND
     rev.summary IS NOT NULL) AS verified_supplier_quotes,
  (SELECT count(DISTINCT rev.supplier_key)
   FROM cotironda_piloto_privado.ai_supplier_review_mvp227 rev
   WHERE rev.request_id=r.id AND rev.state='review') AS reviewed_supplier_quotes,
  (SELECT count(*) FROM cotironda_piloto_privado.ai_supplier_unresolved_mvp237 u
   WHERE u.resolved_request_id=r.id AND u.state='ambiguous_round') AS unresolved_for_round,
  public.cotironda_piloto_ia_buyer_rubros_mvp227(r.token_hash) AS buyer_rubros,
  public.cotironda_piloto_ia_pending_coverage_mvp299(r.token_hash) AS buyer_pending
 FROM current_round r
)
SELECT
 now() AS audited_at_utc,
 'MVP300_READ_ONLY_NO_OUTBOUND' AS execution,
 (SELECT enabled FROM cotironda_piloto_privado.ai_central_control_mvp226) AS central_enabled,
 (SELECT enabled FROM cotironda_piloto_privado.ai_dispatch_gate_mvp222) AS dispatch_enabled,
 (SELECT whatsapp_inbound_enabled FROM cotironda_piloto_privado.integration_flags) AS whatsapp_inbound_enabled,
 (SELECT whatsapp_outbound_enabled FROM cotironda_piloto_privado.integration_flags) AS whatsapp_outbound_enabled,
 (SELECT enabled FROM cotironda_piloto_privado.ai_trial_control_mvp229) AS trial_enabled,
 COALESCE((SELECT count(*) FROM witness),0) AS eligible_latest_rounds,
 (SELECT round_state FROM witness) AS round_state,
 (SELECT before_deadline FROM witness) AS before_deadline,
 (SELECT dispatch_jobs FROM witness) AS dispatch_jobs,
 (SELECT dispatch_with_whapi_id FROM witness) AS dispatch_with_whapi_id,
 (SELECT suppliers_replied_after_dispatch FROM witness) AS suppliers_replied_after_dispatch,
 (SELECT verified_supplier_quotes FROM witness) AS verified_supplier_quotes,
 (SELECT reviewed_supplier_quotes FROM witness) AS reviewed_supplier_quotes,
 (SELECT buyer_rubros->>'state' FROM witness) AS buyer_rubros_state,
 (SELECT CASE WHEN jsonb_typeof(buyer_rubros->'ofertas')='array'
   THEN jsonb_array_length(buyer_rubros->'ofertas') ELSE 0 END FROM witness
 ) AS buyer_verified_offers,
 (SELECT buyer_pending->>'state' FROM witness) AS buyer_pending_state,
 (SELECT CASE WHEN jsonb_typeof(buyer_pending->'respuestas')='array'
   THEN jsonb_array_length(buyer_pending->'respuestas') ELSE 0 END FROM witness
 ) AS buyer_pending_responses,
 false AS external_browser_test_observed,
 false AS verified_real_whatsapp_roundtrip_observed,
 false AS final_contact_release_observed,
 false AS full_e2e_certified;
