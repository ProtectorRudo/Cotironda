-- MVP326: status only. Never reveal a source, supplier identity, price,
-- reason_code, hash, contact or a previous verified quotation.
-- PILOT migration candidate; "Luz verde" authorizes development/tests ONLY.
-- No writes to invoices, reviews, inbox, jobs, outbox or buyer ledger.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_review_status_mvp326(
 p_token_hash text
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $mvp326$
DECLARE
 v_request uuid;
 v_state text;
 v_linked integer := 0;
 v_review integer := 0;
 v_processing integer := 0;
 v_verified integer := 0;
BEGIN
 IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$'
 THEN RETURN jsonb_build_object('state','not_found'); END IF;
 -- Identical independent buyer-token authorization to MVP227/MVP299.
 SELECT r.id,r.state INTO v_request,v_state
 FROM cotironda_piloto_privado.buyer_tracking_mvp091 t
 JOIN cotironda_piloto_privado.requests r ON r.id=t.request_id
 JOIN cotironda_piloto_privado.ai_shadow_requests_mvp221 sh ON sh.request_id=r.id
 JOIN cotironda_piloto_privado.participants buyer ON buyer.key=r.buyer_key
 WHERE t.token_hash=p_token_hash AND t.revoked_at IS NULL
  AND t.expires_at>clock_timestamp()
  AND r.state IN ('prepared','closed','cancelled')
  AND buyer.participant_role='buyer'
  AND buyer.consent_at IS NOT NULL AND buyer.opted_out_at IS NULL;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_found');END IF;
 IF v_state='cancelled' THEN RETURN jsonb_build_object('state','cancelled');END IF;

 -- Only the supplier's CURRENT, cryptographically linked response.
 -- Earlier verified copies must not resurface while a newer one is in review.
 WITH latest AS (
  SELECT DISTINCT ON (l.supplier_key)
   l.request_id,l.supplier_key,l.message_hmac,l.source_sha256,
   l.kind,m.kind AS received_kind,m.chat_hmac,
   m.plaintext_sha256,m.received_at
  FROM cotironda_piloto_privado.ai_supplier_links_mvp225 l
  JOIN cotironda_piloto_privado.whapi_inbox m
   ON m.message_hmac=l.message_hmac
    AND m.request_id=l.request_id
    AND m.participant_key=l.supplier_key
  JOIN cotironda_piloto_privado.participants supplier
   ON supplier.key=l.supplier_key
    AND supplier.chat_hmac=m.chat_hmac
  JOIN cotironda_piloto_privado.ai_dispatch_jobs_mvp222 d
   ON d.request_id=l.request_id AND d.supplier_key=l.supplier_key
  WHERE l.request_id=v_request
   AND supplier.participant_role='supplier'
   AND supplier.consent_at IS NOT NULL AND supplier.opted_out_at IS NULL
   AND d.state='api_accepted' AND d.finished_at<=m.received_at
  ORDER BY l.supplier_key,m.received_at DESC,l.message_hmac DESC
 ), classified AS (
  SELECT CASE
   -- Evaluate integrity AFTER choosing the latest link. A malformed later
   -- source must shadow the older result, not resurrect it.
   WHEN l.kind<>l.received_kind OR
    l.source_sha256 !~ '^[a-f0-9]{64}
    AND jsonb_typeof(r.summary)='object'
    THEN 'verified'
   WHEN r.state='review' AND r.finished_at IS NOT NULL
    THEN 'review'
   ELSE 'processing'
  END AS stage
  FROM latest l
  LEFT JOIN cotironda_piloto_privado.ai_supplier_review_mvp227 r
   ON r.message_hmac=l.message_hmac
    AND r.request_id=l.request_id
    AND r.supplier_key=l.supplier_key
    AND r.source_sha256=l.source_sha256
 )
 SELECT count(*) FILTER(WHERE stage<>'invalid')::integer,
        count(*) FILTER(WHERE stage='review')::integer,
        count(*) FILTER(WHERE stage='processing')::integer,
        count(*) FILTER(WHERE stage='verified')::integer
 INTO v_linked,v_review,v_processing,v_verified
 FROM classified;

 IF v_linked>25 OR v_review+v_processing+v_verified<>v_linked
 THEN RETURN jsonb_build_object('state','unavailable');END IF;
 RETURN jsonb_build_object(
  'state','estado_comercial_sin_precios',
  'vinculados',v_linked,
  'requieren_revision',v_review,
  'en_proceso',v_processing,
  'verificados',v_verified,
  'precios_incluidos',false,
  'identidades_reveladas',false,
  'reproceso_automatico',false
 );
END
$mvp326$;
REVOKE ALL ON FUNCTION
 public.cotironda_piloto_ia_review_status_mvp326(text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_ia_review_status_mvp326(text)
 TO service_role;
COMMENT ON FUNCTION public.cotironda_piloto_ia_review_status_mvp326(text)
 IS 'MVP326: protected status-only count of most recent linked supplier replies; no prices, identities or AI retry.';
 OR NOT (
     (l.kind='text' AND l.plaintext_sha256=l.source_sha256)
     OR (l.kind='document' AND EXISTS (
       SELECT 1 FROM cotironda_piloto_privado.media_archive_mvp095 media
       WHERE media.message_hmac=l.message_hmac
        AND media.request_id=l.request_id
        AND media.participant_key=l.supplier_key
        AND media.chat_hmac=l.chat_hmac
        AND media.state='stored'
        AND media.content_sha256=l.source_sha256
     ))
    ) THEN 'invalid'
   WHEN r.state='verified' AND r.finished_at IS NOT NULL
    AND jsonb_typeof(r.summary)='object'
    THEN 'verified'
   WHEN r.state='review' AND r.finished_at IS NOT NULL
    THEN 'review'
   ELSE 'processing'
  END AS stage
  FROM latest l
  LEFT JOIN cotironda_piloto_privado.ai_supplier_review_mvp227 r
   ON r.message_hmac=l.message_hmac
    AND r.request_id=l.request_id
    AND r.supplier_key=l.supplier_key
    AND r.source_sha256=l.source_sha256
 )
 SELECT count(*)::integer,
        count(*) FILTER(WHERE stage='review')::integer,
        count(*) FILTER(WHERE stage='processing')::integer,
        count(*) FILTER(WHERE stage='verified')::integer
 INTO v_linked,v_review,v_processing,v_verified
 FROM classified;

 IF v_linked>25 OR v_review+v_processing+v_verified<>v_linked
 THEN RETURN jsonb_build_object('state','unavailable');END IF;
 RETURN jsonb_build_object(
  'state','estado_comercial_sin_precios',
  'vinculados',v_linked,
  'requieren_revision',v_review,
  'en_proceso',v_processing,
  'verificados',v_verified,
  'precios_incluidos',false,
  'identidades_reveladas',false,
  'reproceso_automatico',false
 );
END
$mvp326$;
REVOKE ALL ON FUNCTION
 public.cotironda_piloto_ia_review_status_mvp326(text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_ia_review_status_mvp326(text)
 TO service_role;
COMMENT ON FUNCTION public.cotironda_piloto_ia_review_status_mvp326(text)
 IS 'MVP326: protected status-only count of most recent linked supplier replies; no prices, identities or AI retry.';
