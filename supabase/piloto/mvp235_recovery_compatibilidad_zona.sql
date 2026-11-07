-- MVP235: el reloj de una reserva reactivada no es el reloj del pedido original.
-- Compatible con MVP233. No cambia created_at historico ni habilita WhatsApp.
-- La conciliacion MVP230 se ejecuta cada 5 minutos, con umbral 30 minutos.
DO $guard$ BEGIN
 IF to_regclass('cotironda_piloto_privado.ai_zone_replies_mvp233') IS NULL
 THEN RAISE EXCEPTION 'mvp233_required'; END IF;
 IF to_regprocedure('cotironda_piloto_privado.ai_central_reconcile_mvp230(boolean,integer)') IS NULL
 THEN RAISE EXCEPTION 'mvp230_required'; END IF;
END $guard$;
CREATE OR REPLACE FUNCTION cotironda_piloto_privado.ai_central_reconcile_mvp230(p_apply boolean DEFAULT false, p_min_age_minutes integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_cutoff timestamptz;
  v_buyer_linked integer := 0;
  v_buyer_review integer := 0;
  v_supplier_review integer := 0;
  v_dispatch_uncertain integer := 0;
  v_reserved_buyer integer := 0;
  v_reserved_supplier integer := 0;
  v_leased_dispatch integer := 0;
BEGIN
  IF p_min_age_minutes IS NULL OR p_min_age_minutes NOT BETWEEN 15 AND 1440
  THEN RAISE EXCEPTION 'invalid_min_age_minutes' USING ERRCODE='22023'; END IF;
  v_cutoff := clock_timestamp() - make_interval(mins => p_min_age_minutes);
  IF p_apply THEN
    IF NOT pg_catalog.pg_try_advisory_xact_lock(230, 1)
    THEN RETURN jsonb_build_object('state','busy'); END IF;
    -- Only reconcile attempts tied to their original inbox message, buyer and shadow round.
    WITH candidates AS (
      SELECT a.message_hmac, a.chat_hmac,
        CASE WHEN r.state='prepared' THEN 'prepared' ELSE 'staged' END AS target_state
      FROM cotironda_piloto_privado.ai_central_attempts_mvp226 a
      JOIN cotironda_piloto_privado.requests r
        ON r.source_hmac=a.message_hmac AND r.buyer_key=a.buyer_key
      JOIN cotironda_piloto_privado.ai_shadow_requests_mvp221 sh
        ON sh.request_id=r.id AND sh.source_hmac=a.message_hmac
      JOIN cotironda_piloto_privado.whapi_inbox m
        ON m.message_hmac=a.message_hmac AND m.chat_hmac=a.chat_hmac
       AND m.request_id=r.id AND m.plaintext_sha256=a.source_sha256
      WHERE a.state='reserved' AND greatest(a.created_at,coalesce((select z.claimed_at from cotironda_piloto_privado.ai_zone_replies_mvp233 z where z.source_hmac=a.message_hmac),a.created_at))<=v_cutoff
        AND r.state IN ('draft','prepared')
    )
    UPDATE cotironda_piloto_privado.ai_central_attempts_mvp226 a
      SET state=c.target_state, failure_code=NULL, finished_at=clock_timestamp()
    FROM candidates c
    WHERE a.message_hmac=c.message_hmac AND a.chat_hmac=c.chat_hmac
      AND a.state='reserved' AND greatest(a.created_at,coalesce((select z.claimed_at from cotironda_piloto_privado.ai_zone_replies_mvp233 z where z.source_hmac=a.message_hmac),a.created_at))<=v_cutoff;
    GET DIAGNOSTICS v_buyer_linked=ROW_COUNT;

    -- If there is no trustworthy persisted round, preserve source for review;
    -- never synthesize a round or invoke AI again.
    UPDATE cotironda_piloto_privado.ai_central_attempts_mvp226 a
       SET state='review', failure_code='reconciliation_required',
           finished_at=clock_timestamp()
    WHERE a.state='reserved' AND greatest(a.created_at,coalesce((select z.claimed_at from cotironda_piloto_privado.ai_zone_replies_mvp233 z where z.source_hmac=a.message_hmac),a.created_at))<=v_cutoff;
    GET DIAGNOSTICS v_buyer_review=ROW_COUNT;

    -- A stale quote reservation cannot be declared verified without source validation.
    UPDATE cotironda_piloto_privado.ai_supplier_review_mvp227 q
       SET state='review', reason_code='reconciliation_required',
           finished_at=clock_timestamp()
    WHERE q.state='reserved' AND q.reserved_at<=v_cutoff;
    GET DIAGNOSTICS v_supplier_review=ROW_COUNT;

    -- A timed-out Whapi lease may have reached its recipient.
    -- Terminal uncertain is intentional: NEVER retry automatically.
    UPDATE cotironda_piloto_privado.ai_dispatch_jobs_mvp222 d
       SET state='uncertain', finished_at=clock_timestamp()
    WHERE d.state='leased' AND d.leased_at<=v_cutoff;
    GET DIAGNOSTICS v_dispatch_uncertain=ROW_COUNT;
  END IF;
  SELECT count(*) INTO v_reserved_buyer
    FROM cotironda_piloto_privado.ai_central_attempts_mvp226 a
    WHERE state='reserved' AND greatest(a.created_at,coalesce((select z.claimed_at from cotironda_piloto_privado.ai_zone_replies_mvp233 z where z.source_hmac=a.message_hmac),a.created_at))<=v_cutoff;
  SELECT count(*) INTO v_reserved_supplier
    FROM cotironda_piloto_privado.ai_supplier_review_mvp227
    WHERE state='reserved' AND reserved_at<=v_cutoff;
  SELECT count(*) INTO v_leased_dispatch
    FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222
    WHERE state='leased' AND leased_at<=v_cutoff;
  RETURN jsonb_build_object('state',CASE WHEN p_apply THEN 'reconciled' ELSE 'dry_run' END,
    'buyer_restored',v_buyer_linked,
    'buyer_to_review',v_buyer_review,
    'quotes_to_review',v_supplier_review,
    'leases_to_uncertain',v_dispatch_uncertain,
    'pending_buyer',v_reserved_buyer,
    'pending_quotes',v_reserved_supplier,
    'pending_leases',v_leased_dispatch);
END
$function$;

REVOKE ALL ON FUNCTION cotironda_piloto_privado.ai_central_reconcile_mvp230(boolean,integer) FROM PUBLIC,anon,authenticated;
COMMENT ON FUNCTION cotironda_piloto_privado.ai_central_reconcile_mvp230(boolean,integer)
IS 'Piloto: concilia reservas IA con reloj efectivo max(created_at, reanudacion MVP233); nunca reenvia Whapi.';
