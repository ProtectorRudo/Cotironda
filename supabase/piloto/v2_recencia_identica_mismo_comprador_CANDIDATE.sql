-- COTIRONDA V2 · CANDIDATO NO PUBLICADO. Necesita orden «Publicalo».
-- Último desempate: todas las solicitudes realmente enviadas AL MISMO
-- proveedor tienen EXACTAMENTE los mismos materiales, cantidades, unidades,
-- variantes y EL MISMO COMPRADOR; elegir sólo la más reciente.
-- Reutiliza el binder MPC291 ya existente, sin reenvío, sin adjudicación y
-- sin visibilidad pública. La IA debe haber obtenido dos lecturas concordantes.
-- Nunca se ejecuta para V1 ni para rondas cerradas, sin consentimiento o
-- con solicitudes distintas. No se guarda ni revela la identidad del comprador.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_auto_correlation_bind_latest_same_buyer_v2(
 p_source_hmac text,p_chat_hmac text,p_source_sha256 text,p_request uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
 v_source record;
 v_round record;
 v_count int:=0;
 v_buyer text;
 v_latest_id uuid;
 v_latest_at timestamptz;
 v_original_signature jsonb;
 v_supplier_signature jsonb;
 v_full jsonb;
 v_supplied jsonb;
 v_bound jsonb;
 v_rows int;
BEGIN
 IF p_source_hmac IS NULL OR p_source_hmac !~ '^[a-f0-9]{64}$'
 OR p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$'
 OR p_source_sha256 IS NULL OR p_source_sha256 !~ '^[a-f0-9]{64}$'
 OR p_request IS NULL THEN RETURN jsonb_build_object('state','invalid'); END IF;

 -- Sólo una fuente ya archivada, autenticada y aún ambigua.
 SELECT m.participant_key,m.received_at,m.kind INTO v_source
 FROM cotironda_piloto_privado.ai_supplier_auto_correlation_mvp291 decision
 JOIN cotironda_piloto_privado.ai_supplier_unresolved_mvp237 unresolved
   ON unresolved.message_hmac=decision.source_hmac
   AND unresolved.supplier_key=decision.supplier_key
 JOIN cotironda_piloto_privado.whapi_inbox m
   ON m.message_hmac=decision.source_hmac
   AND m.participant_key=decision.supplier_key
 JOIN cotironda_piloto_privado.participants supplier
   ON supplier.key=m.participant_key AND supplier.chat_hmac=m.chat_hmac
 WHERE decision.source_hmac=p_source_hmac
   AND decision.state='reserved'
   AND decision.source_sha256=p_source_sha256
   AND decision.reserved_at>=clock_timestamp()-interval '2 minutes'
   AND m.chat_hmac=p_chat_hmac
   AND m.request_id IS NULL AND m.kind IN('text','document','image')
   AND m.processing_state IN('needs_review','unmatched_quote')
   AND unresolved.state='ambiguous_round'
   AND unresolved.resolved_request_id IS NULL
   AND supplier.participant_role='supplier'
   AND supplier.consent_at IS NOT NULL AND supplier.opted_out_at IS NULL
 FOR UPDATE OF m,unresolved,decision;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_eligible'); END IF;

 -- Exactamente las rondas que este comercio tenía acreditadas y ABIERTAS
 -- al llegar el mensaje. No usar rondas nuevas, cerradas ni otros comercios.
 FOR v_round IN
  SELECT r.id,r.buyer_key,r.created_at
  FROM cotironda_piloto_privado.requests r
  JOIN cotironda_piloto_privado.invitations i
    ON i.request_id=r.id AND i.supplier_key=v_source.participant_key
    AND i.state='prepared'
  JOIN cotironda_piloto_privado.participants buyer
    ON buyer.key=r.buyer_key AND buyer.participant_role='buyer'
    AND buyer.consent_at IS NOT NULL AND buyer.opted_out_at IS NULL
  WHERE r.state='prepared'
    AND r.timing_mode='business_two_days' AND r.round_days=2
    AND r.v2_calendar_revision IS NOT NULL
    AND r.created_at<=v_source.received_at
    AND r.closes_at>v_source.received_at AND r.closes_at>clock_timestamp()
    AND (EXISTS (
      SELECT 1 FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 j
      WHERE j.request_id=r.id AND j.supplier_key=v_source.participant_key
        AND j.state='api_accepted' AND j.whapi_message_id IS NOT NULL
        AND j.finished_at IS NOT NULL AND j.finished_at<=v_source.received_at
     ) OR EXISTS (
      SELECT 1 FROM cotironda_piloto_privado.whapi_outbox o
      WHERE o.request_id=r.id AND o.supplier_key=v_source.participant_key
        AND o.state='api_accepted' AND o.whapi_message_id IS NOT NULL
        AND o.sent_at IS NOT NULL AND o.sent_at<=v_source.received_at))
  ORDER BY r.created_at DESC,r.id DESC
 LOOP
  v_count:=v_count+1;
  IF v_count>8 THEN RETURN jsonb_build_object('state','too_many_candidates'); END IF;
  -- Firma del pedido ENTERO: no confundir pedidos iguales para este corralón
  -- si contienen otros rubros diferentes.
  SELECT jsonb_agg(jsonb_build_array(
    lower(btrim(regexp_replace(rl.original_description,
      '[[:space:]]+',' ','g'))),
    rl.quantity::text,lower(btrim(rl.unit)),rl.family_code)
    ORDER BY lower(btrim(regexp_replace(rl.original_description,
      '[[:space:]]+',' ','g'))),
    rl.quantity::text,lower(btrim(rl.unit)),rl.family_code)
  INTO v_full
  FROM cotironda_piloto_privado.request_lines rl
  WHERE rl.request_id=v_round.id;

  -- Firma de la invitación específica que recibió el proveedor.
  SELECT jsonb_agg(jsonb_build_array(
    lower(btrim(regexp_replace(rl.original_description,
      '[[:space:]]+',' ','g'))),
    rl.quantity::text,lower(btrim(rl.unit)),rl.family_code)
    ORDER BY lower(btrim(regexp_replace(rl.original_description,
      '[[:space:]]+',' ','g'))),
    rl.quantity::text,lower(btrim(rl.unit)),rl.family_code)
  INTO v_supplied
  FROM cotironda_piloto_privado.invitation_lines_mvp099 il
  JOIN cotironda_piloto_privado.request_lines rl
    ON rl.request_id=il.request_id AND rl.line_no=il.line_no
  WHERE il.request_id=v_round.id AND il.supplier_key=v_source.participant_key;

  IF v_full IS NULL OR v_supplied IS NULL
  THEN RETURN jsonb_build_object('state','no_source_lines'); END IF;
  IF v_count=1 THEN
   v_buyer:=v_round.buyer_key;
   v_latest_id:=v_round.id;
   v_latest_at:=v_round.created_at;
   v_original_signature:=v_full;
   v_supplier_signature:=v_supplied;
  ELSE
   IF v_round.buyer_key IS DISTINCT FROM v_buyer
   THEN RETURN jsonb_build_object('state','different_buyers'); END IF;
   IF v_round.created_at=v_latest_at
   THEN RETURN jsonb_build_object('state','same_timestamp'); END IF;
   IF v_full IS DISTINCT FROM v_original_signature
      OR v_supplied IS DISTINCT FROM v_supplier_signature
   THEN RETURN jsonb_build_object('state','different_materials'); END IF;
  END IF;
 END LOOP;
 IF v_count<2 OR v_latest_id IS DISTINCT FROM p_request
 THEN RETURN jsonb_build_object('state','not_unique_latest'); END IF;

 -- Validación y escritura atómica reutilizadas, sin duplicar lógica de
 -- archivos, invitaciones, transportes, deduplicación y permisos.
 SELECT public.cotironda_piloto_auto_correlation_bind_mvp291(
   p_source_hmac,p_chat_hmac,p_source_sha256,p_request
 ) INTO v_bound;
 IF v_bound->>'state'='linked_private' THEN
  UPDATE cotironda_piloto_privado.ai_supplier_auto_correlation_mvp291
  SET reason='recent_identical_same_buyer_v2'
  WHERE source_hmac=p_source_hmac AND selected_request_id=p_request
    AND state='linked';
  GET DIAGNOSTICS v_rows=ROW_COUNT;
  IF v_rows<>1 THEN RAISE EXCEPTION 'v2_recency_audit_failed'; END IF;
 END IF;
 RETURN v_bound;
END $function$;

-- Function defaults to PUBLIC EXECUTE unless explicitly revoked.
REVOKE ALL ON FUNCTION
 public.cotironda_piloto_auto_correlation_bind_latest_same_buyer_v2(text,text,text,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_auto_correlation_bind_latest_same_buyer_v2(text,text,text,uuid)
 TO service_role;
