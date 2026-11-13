-- Cotironda V2 D016: cierre de DOS días hábiles comprobado, solo lectura.
-- CANDIDATO: no altera estados/cron ni abre rondas sin calendario aprobado.
-- Requiere v2_business_policy, v2_business_calendar, D016 sesión/consentimiento.
-- No revela invitados, proveedores pendientes, contactos ni precios inferidos.
CREATE FUNCTION public.cotironda_piloto_v2_d016_final_status_private(
 p_request_id uuid,p_sesion_hmac text
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $final_d016$
DECLARE v_request record; v_buyer text;
BEGIN
 IF p_request_id IS NULL OR p_sesion_hmac IS NULL OR
  p_sesion_hmac !~ '^[a-f0-9]{64}$' THEN RETURN NULL;END IF;
 v_buyer:=public.cotironda_piloto_v2_d016_session_context_private(
  p_sesion_hmac,p_request_id)->>'buyerKey';
 IF v_buyer IS NULL THEN RETURN NULL;END IF;
 SELECT r.id,r.state,r.buyer_key,r.created_at,r.closes_at,r.closed_at
 INTO v_request
 FROM cotironda_piloto_privado.requests r
 JOIN cotironda_piloto_privado.v2_business_policy bp
  ON bp.singleton=true AND bp.enabled=true AND bp.activated_at IS NOT NULL
  AND bp.activated_at<=r.created_at
 JOIN cotironda_piloto_privado.v2_original_share_policy share
  ON share.singleton=true AND share.enabled=true
  AND share.activated_at IS NOT NULL
  AND share.activated_at<=r.created_at
 WHERE r.id=p_request_id AND r.buyer_key=v_buyer
  AND r.state IN ('prepared','closed')
  AND r.timing_mode='business_two_days' AND r.round_days=2
  AND r.v2_calendar_revision IS NOT NULL
  AND EXISTS (
   SELECT 1 FROM cotironda_piloto_privado.v2_business_calendar cal
   WHERE cal.revision=r.v2_calendar_revision
    AND lower(btrim(cal.locality))=lower(btrim(r.delivery_city))
    AND cal.year=extract(year from r.created_at AT TIME ZONE
      'America/Argentina/Buenos_Aires')::integer
    AND cal.approved_at IS NOT NULL AND cal.approved_at<=r.created_at
  )
  AND EXISTS (
   SELECT 1 FROM cotironda_piloto_privado.v2_business_calendar cal
   WHERE cal.revision=r.v2_calendar_revision
    AND lower(btrim(cal.locality))=lower(btrim(r.delivery_city))
    AND cal.year=extract(year from r.closes_at AT TIME ZONE
      'America/Argentina/Buenos_Aires')::integer
    AND cal.approved_at IS NOT NULL AND cal.approved_at<=r.created_at
  )
 LIMIT 1;
 IF NOT FOUND THEN RETURN NULL;END IF;
 IF v_request.state<>'closed' OR v_request.closed_at IS NULL OR
  v_request.closed_at<v_request.closes_at OR
  v_request.closed_at>clock_timestamp() OR
  v_request.closes_at>clock_timestamp() THEN
  RETURN jsonb_build_object('state','waiting_for_close');
 END IF;
 RETURN jsonb_build_object('state','closed_verified_business_two_days',
  'requestId',p_request_id::text,
  'closedAtMs',(extract(epoch from v_request.closed_at)*1000)::bigint);
END $final_d016$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_v2_d016_final_status_private(
 uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_v2_d016_final_status_private(
 uuid,text) TO service_role;
