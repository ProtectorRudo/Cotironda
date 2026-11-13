-- Cotironda V2-24 · liberar SIN confirmacion, SOLO tras verificar calendario.
-- CANDIDATE ONLY: NO PUBLICAR con "Avanza", no modifica MVP306/MVP222.
-- DEPENDE EN PILOTO de V2-21 (RPC aislada), V2-05 calendario y V2-22,
-- y de MVP306 existente. Nueva política independiente OFF por defecto.
CREATE TABLE cotironda_piloto_privado.v2_auto_release_policy (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 enabled boolean NOT NULL DEFAULT false,
 activated_at timestamptz,
 CHECK ((enabled AND activated_at IS NOT NULL)
     OR (NOT enabled AND activated_at IS NULL))
);
INSERT INTO cotironda_piloto_privado.v2_auto_release_policy
 (singleton,enabled) VALUES (true,false);
ALTER TABLE cotironda_piloto_privado.v2_auto_release_policy ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE cotironda_piloto_privado.v2_auto_release_policy
 FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.cotironda_piloto_v2_auto_release_d013(
 p_chat_hmac text,p_source_hmac text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $v2_release$
DECLARE
 v_request record;
 v_expected timestamptz;
 v_revision text;
 v_approved jsonb;
 v_published jsonb;
BEGIN
 IF p_chat_hmac IS NULL OR p_chat_hmac !~ '^[0-9a-f]{64}$'
 OR p_source_hmac IS NULL OR p_source_hmac !~ '^[0-9a-f]{64}$'
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 IF NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.v2_auto_release_policy
  WHERE singleton AND enabled AND activated_at IS NOT NULL)
 THEN RETURN jsonb_build_object('state','disabled');END IF;
 IF to_regclass('cotironda_piloto_privado.v2_business_calendar') IS NULL
 OR to_regclass('cotironda_piloto_privado.v2_business_policy') IS NULL
 OR to_regprocedure('cotironda_piloto_privado.v2_deadline(timestamptz,text)') IS NULL
 OR to_regprocedure('public.cotironda_piloto_v2_shadow_prepare_d013(text,text,text,text,jsonb,jsonb)') IS NULL
 THEN RETURN jsonb_build_object('state','calendar_not_installed');END IF;
 IF NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.v2_business_policy
  WHERE singleton AND enabled AND activated_at IS NOT NULL)
 THEN RETURN jsonb_build_object('state','calendar_disabled');END IF;
 -- Serializar contra otra aprobacion/reescritura del mismo pedido.
 SELECT r.id,r.created_at,r.closes_at,r.delivery_city,r.round_days,
  r.timing_mode,r.v2_calendar_revision INTO v_request
 FROM cotironda_piloto_privado.requests r
 JOIN cotironda_piloto_privado.participants b
  ON b.key=r.buyer_key AND b.participant_role='buyer'
 JOIN cotironda_piloto_privado.ai_shadow_requests_mvp221 shadow
  ON shadow.request_id=r.id AND shadow.status='shadow'
 JOIN cotironda_piloto_privado.v2_auto_release_policy policy
  ON policy.singleton AND policy.enabled AND r.created_at>=policy.activated_at
 WHERE r.source_hmac=p_source_hmac AND r.state='draft'
  AND r.closes_at>clock_timestamp()+interval '1 hour'
  AND b.chat_hmac=p_chat_hmac AND b.consent_at IS NOT NULL
  AND b.opted_out_at IS NULL
 FOR UPDATE OF r;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','source_not_eligible');END IF;
 IF v_request.timing_mode IS DISTINCT FROM 'business_two_days'
 OR v_request.round_days IS DISTINCT FROM 2
 OR v_request.v2_calendar_revision IS NULL
 OR v_request.created_at>clock_timestamp()+interval '5 minutes'
 THEN RETURN jsonb_build_object('state','v2_timing_invalid');END IF;
 -- Debe calcularse desde el original ya creado, no desde el reloj actual.
 v_expected:=cotironda_piloto_privado.v2_deadline(
  v_request.created_at,v_request.delivery_city);
 IF v_expected IS NULL OR v_expected IS DISTINCT FROM v_request.closes_at
 THEN RETURN jsonb_build_object('state','deadline_not_verified');END IF;
 SELECT c.revision INTO v_revision
 FROM cotironda_piloto_privado.v2_business_calendar c
 WHERE c.locality=lower(btrim(v_request.delivery_city))
  AND c.year=EXTRACT(YEAR FROM
   (v_request.closes_at AT TIME ZONE 'America/Argentina/Buenos_Aires'))::integer
  AND c.approved_at IS NOT NULL;
 IF v_revision IS NULL OR v_revision IS DISTINCT FROM v_request.v2_calendar_revision
 THEN RETURN jsonb_build_object('state','calendar_revision_invalid');END IF;
 -- MVP306 ya verifica fuente original, SHA, autorizaciones, cotizacion
 -- solo de catalogos, consentimiento proveedor y estado de la ronda.
 v_approved:=public.cotironda_piloto_ia_auto_release_mvp306(
  p_chat_hmac,p_source_hmac);
 IF v_approved->>'state' NOT IN ('approved','already_approved')
 OR v_approved->>'request_id' IS DISTINCT FROM v_request.id::text
 THEN RETURN jsonb_build_object('state','auto_release_not_authorized');END IF;
 -- MVP222 hace la ultima verificacion bajo locks de identidad, inventario,
 -- zona, ventana y cola idempotente antes de habilitar el despachador.
 v_published:=public.cotironda_piloto_ia_publish_mvp222(v_request.id);
 IF v_published->>'state' NOT IN ('ready_for_delivery','already_published')
 THEN RETURN jsonb_build_object('state','publication_not_ready');END IF;
 RETURN jsonb_build_object('state',v_published->>'state',
  'request_id',v_request.id);
END $v2_release$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_v2_auto_release_d013(text,text)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_v2_auto_release_d013(text,text)
 TO service_role;
-- No UPDATE de politicas ni de rondas antiguas. No WhatsApp, SQL policy OFF.
