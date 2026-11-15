-- COTIRONDA V2 / D017 - candidato: "Mi Cotironda" sin nuevos enlaces públicos.
-- El ticket D016 continúa creando 1 sesión privada por comprador. La sesión
-- puede consultar SOLO otras rondas de ESE MISMO comprador, nunca otro buyer.
-- Originales siguen protegidos por D016: identidad, activación V2, consentimiento,
-- SHA, empresa, revocación y mismo documento. Históricos anteriores solo índice.
-- NO PUBLICAR SQL antes de orden expresa "Publicalo".

DO $patch$
DECLARE v_old text;v_new text;
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO STRICT v_new
 FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
 WHERE ns.nspname='public'
 AND p.proname='cotironda_piloto_v2_d016_session_context_private';
 IF md5(v_new)<>'36477e1e4bee3ad38b7db0180b5f644f'
 THEN RAISE EXCEPTION 'd017_d016_session_context_drift'; END IF;

 v_old:=v_new;
 v_new:=replace(v_new,
 $anchorA$  'buyerKey',s.buyer_key,'requestId',s.request_id::text$anchorA$,
 $newA$  'buyerKey',s.buyer_key,'requestId',p_request_id::text$newA$);
 IF v_old=v_new THEN RAISE EXCEPTION 'd017_missing_requestId_anchor';END IF;

 v_old:=v_new;
 v_new:=replace(v_new,
 $anchorB$WHERE s.sesion_hmac=p_sesion_hmac AND s.request_id=p_request_id$anchorB$,
 $newB$WHERE s.sesion_hmac=p_sesion_hmac
  -- No se muta la sesión: múltiples pestañas pueden navegar simultáneamente.
  -- El título histórico puede ser viejo, pero el acceso a originales NO:
  -- solo rondas creadas tras política vigente V2.
  AND EXISTS (
   SELECT 1 FROM cotironda_piloto_privado.requests target
   JOIN cotironda_piloto_privado.v2_business_policy policy
    ON policy.singleton=true AND policy.enabled=true
    AND policy.activated_at IS NOT NULL
    AND target.created_at>=policy.activated_at
   WHERE target.id=p_request_id AND target.buyer_key=s.buyer_key
    AND target.state IN ('prepared','closed')
  )$newB$);
 IF v_old=v_new THEN RAISE EXCEPTION 'd017_missing_session_scope_anchor';END IF;
 EXECUTE v_new;
END $patch$;

-- ÍNDICE DEL COMPRADOR: no comparte originales históricos no autorizados.
-- Autenticación siempre por cookie HMAC en servidor + validación contextual D016.
CREATE FUNCTION public.cotironda_piloto_v2_d017_buyer_history_private(
 p_sesion_hmac text
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
 v_buyer text;
 v_round uuid;
 v_ctx jsonb;
 v_history jsonb:='[]'::jsonb;
 v_name text;
BEGIN
 IF p_sesion_hmac IS NULL OR p_sesion_hmac !~ '^[a-f0-9]{64}$'
 THEN RETURN NULL; END IF;

 SELECT s.buyer_key,s.request_id
 INTO v_buyer,v_round
 FROM cotironda_piloto_privado.v2_d016_browser_sessions s
 WHERE s.sesion_hmac=p_sesion_hmac
  AND s.purpose='whatsapp_buyer_session'
  AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp()
 LIMIT 1;
 IF NOT FOUND OR v_round IS NULL THEN RETURN NULL; END IF;

 v_ctx:=public.cotironda_piloto_v2_d016_session_context_private(
  p_sesion_hmac,v_round);
 IF v_ctx IS NULL OR v_ctx->>'state'<>'authorized_buyer_whatsapp_session'
  OR v_ctx->>'buyerKey' IS DISTINCT FROM v_buyer
  OR v_ctx->>'requestId' IS DISTINCT FROM v_round::text
 THEN RETURN NULL; END IF;

 SELECT nullif(btrim(p.display_label),'') INTO v_name
 FROM cotironda_piloto_privado.participants p
 WHERE p.key=v_buyer AND p.participant_role='buyer'
  AND p.opted_out_at IS NULL AND p.consent_at IS NOT NULL
 LIMIT 1;

 SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'requestId',x.id::text,
  'createdAtMs',(extract(epoch from x.created_at)*1000)::bigint,
  'status',x.state,
  'deliveryCity',left(COALESCE(x.delivery_city,''),100),
  'requestedItems',x.line_count,
  'canOpenOffers',x.can_open,
  -- Nº de originales efectivamente autorizados, NUNCA proveedores invitados.
  'availableDocuments',CASE WHEN x.can_open THEN
   COALESCE((public.cotironda_piloto_v2_d016_responders_private(
    x.id,p_sesion_hmac)->>'total')::integer,0) ELSE 0 END
 ) ORDER BY x.created_at DESC,x.id DESC),'[]'::jsonb)
 INTO v_history
 FROM (
  SELECT r.id,r.created_at,r.state,r.delivery_city,
   (SELECT count(*)::integer FROM cotironda_piloto_privado.request_lines ln
     WHERE ln.request_id=r.id) line_count,
   EXISTS(
    SELECT 1 FROM cotironda_piloto_privado.v2_business_policy bp
    WHERE bp.singleton=true AND bp.enabled=true
     AND bp.activated_at IS NOT NULL AND r.created_at>=bp.activated_at
   ) can_open
  FROM cotironda_piloto_privado.requests r
  WHERE r.buyer_key=v_buyer
   AND r.state IN ('prepared','closed')
  ORDER BY r.created_at DESC,r.id DESC LIMIT 100
 ) x;

 -- Protección adicional ante baja o revocación durante el SELECT.
 IF public.cotironda_piloto_v2_d016_session_context_private(
    p_sesion_hmac,v_round) IS NULL THEN RETURN NULL;END IF;

 RETURN jsonb_build_object(
  'state','authorized_buyer_history_v2',
  'buyerName',coalesce(v_name,'Comprador'),
  'total',jsonb_array_length(v_history),
  'rounds',v_history
 );
END $function$;

REVOKE ALL ON FUNCTION public.cotironda_piloto_v2_d017_buyer_history_private(text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_v2_d017_buyer_history_private(text)
 TO service_role;

DO $acl$
BEGIN
 IF has_function_privilege('anon',
  'public.cotironda_piloto_v2_d017_buyer_history_private(text)','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.cotironda_piloto_v2_d017_buyer_history_private(text)','EXECUTE')
 THEN RAISE EXCEPTION 'd017_index_visible_without_private_session';END IF;
END $acl$;
