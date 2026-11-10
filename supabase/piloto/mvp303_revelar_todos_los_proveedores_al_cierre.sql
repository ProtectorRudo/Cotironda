-- MVP303 | PROPUESTA PILOTO: todos los comercios de la ronda se identifican
-- automaticamente al CIERRE. No hay ganadores ni limite de dos.
-- Antes del cierre SIEMPRE anonimos. Los telefonos NO se revelan aqui:
-- requieren consentimiento de divulgacion de contactos separado (MVP109).
-- No modifica ni activa el planificador MVP196/MVP302 o Whapi.
-- Activacion prospectiva OFF por defecto: no revelar historicos al instalar.
CREATE TABLE IF NOT EXISTS cotironda_piloto_privado.all_supplier_reveal_activation_mvp303(
 only_row boolean PRIMARY KEY DEFAULT true CHECK(only_row),
 enabled boolean NOT NULL DEFAULT false,
 activated_at timestamptz,
 CHECK(NOT enabled OR activated_at IS NOT NULL)
);
INSERT INTO cotironda_piloto_privado.all_supplier_reveal_activation_mvp303(
 only_row,enabled,activated_at
) VALUES(true,false,NULL) ON CONFLICT(only_row) DO NOTHING;
ALTER TABLE cotironda_piloto_privado.all_supplier_reveal_activation_mvp303
 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.all_supplier_reveal_activation_mvp303
 FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_all_suppliers_closed_mvp303(
 p_token_hash text
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path='' AS $mvp303$
DECLARE
 v_request record;v_result jsonb;v_invited int;v_visible int;
BEGIN
 IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$'
 THEN RETURN jsonb_build_object('state','not_found');END IF;
 -- Unique buyer-bearer token, consent and strictly prospective activation.
 SELECT r.id,r.state,r.closes_at INTO v_request
 FROM cotironda_piloto_privado.buyer_tracking_mvp091 t
 JOIN cotironda_piloto_privado.requests r ON r.id=t.request_id
 JOIN cotironda_piloto_privado.ai_shadow_requests_mvp221 sh ON sh.request_id=r.id
 JOIN cotironda_piloto_privado.ai_buyer_review_mvp279 br
  ON br.request_id=r.id AND br.state='confirmed'
 JOIN cotironda_piloto_privado.participants buyer
  ON buyer.key=r.buyer_key AND buyer.participant_role='buyer'
  AND buyer.consent_at IS NOT NULL AND buyer.opted_out_at IS NULL
 JOIN cotironda_piloto_privado.all_supplier_reveal_activation_mvp303 gate
  ON gate.only_row AND gate.enabled AND gate.activated_at<=now()
  AND r.created_at>=gate.activated_at
 WHERE t.token_hash=p_token_hash AND t.revoked_at IS NULL
   AND t.expires_at>now();
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_found');END IF;
 IF v_request.state<>'closed' OR v_request.closes_at>now()
 THEN RETURN jsonb_build_object('state','not_ready');END IF;
 SELECT count(*) INTO v_invited
 FROM cotironda_piloto_privado.invitations i
 WHERE i.request_id=v_request.id AND i.state='prepared';
 IF v_invited>100 THEN RETURN jsonb_build_object('state','capacity_exceeded');END IF;

 -- Exact same IA verified-offer numbering as buyer_rubros MVP227:
 -- row_number by md5(request_uuid || supplier_key), *verified only*.
 -- No number for an unverified answer; never imply a rejected quote was valid.
 WITH latest AS (
  SELECT DISTINCT ON (ln.supplier_key)
   ln.supplier_key,ln.message_hmac,m.received_at
  FROM cotironda_piloto_privado.ai_supplier_links_mvp225 ln
  JOIN cotironda_piloto_privado.whapi_inbox m
    ON m.message_hmac=ln.message_hmac AND m.request_id=ln.request_id
     AND m.participant_key=ln.supplier_key
  WHERE ln.request_id=v_request.id
  ORDER BY ln.supplier_key,m.received_at DESC,ln.message_hmac DESC
 ), verified AS (
  SELECT l.supplier_key
  FROM latest l JOIN cotironda_piloto_privado.ai_supplier_review_mvp227 rev
   ON rev.message_hmac=l.message_hmac
    AND rev.request_id=v_request.id AND rev.supplier_key=l.supplier_key
   AND rev.state='verified' AND rev.summary IS NOT NULL
 ), numbered AS (
  SELECT supplier_key,
   row_number() over(ORDER BY md5(v_request.id::text||supplier_key)) AS n
  FROM verified
 ), suppliers AS (
  SELECT p.key,p.display_label,inv.state AS invitation_state,
   d.state AS dispatch_state,l.message_hmac,rev.state AS review_state,
   n.n AS verified_number
  FROM cotironda_piloto_privado.invitations inv
  JOIN cotironda_piloto_privado.participants p ON p.key=inv.supplier_key
   AND p.participant_role='supplier'
   AND p.consent_at IS NOT NULL AND p.opted_out_at IS NULL
  LEFT JOIN cotironda_piloto_privado.ai_dispatch_jobs_mvp222 d
   ON d.request_id=inv.request_id AND d.supplier_key=inv.supplier_key
  LEFT JOIN latest l ON l.supplier_key=inv.supplier_key
  LEFT JOIN cotironda_piloto_privado.ai_supplier_review_mvp227 rev
   ON rev.message_hmac=l.message_hmac AND rev.request_id=inv.request_id
   AND rev.supplier_key=inv.supplier_key
  LEFT JOIN numbered n ON n.supplier_key=inv.supplier_key
  WHERE inv.request_id=v_request.id AND inv.state='prepared'
 ) SELECT
   coalesce(jsonb_agg(jsonb_build_object(
    'nombre',trim(display_label),
    'oferta',CASE WHEN dispatch_state='api_accepted' AND verified_number IS NOT NULL
      THEN 'Presupuesto '||verified_number ELSE NULL END,
    'estado',CASE
     WHEN dispatch_state IS DISTINCT FROM 'api_accepted'
      THEN 'envio_no_confirmado'
     WHEN verified_number IS NOT NULL
      THEN 'presupuesto_verificado'
     WHEN message_hmac IS NOT NULL
      THEN 'respuesta_en_revision'
     ELSE 'sin_respuesta' END
   ) ORDER BY md5(v_request.id::text||key),key),'[]'::jsonb),
   count(*) INTO v_result,v_visible
 FROM suppliers;
 -- Names must not become a covert channel for phone numbers or markup;
 -- the browser uses textContent as its second defensive layer.
 IF EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.invitations inv
  JOIN cotironda_piloto_privado.participants p ON p.key=inv.supplier_key
  WHERE inv.request_id=v_request.id AND inv.state='prepared'
   AND p.participant_role='supplier' AND p.consent_at IS NOT NULL
   AND p.opted_out_at IS NULL
   AND (p.display_label IS NULL OR length(trim(p.display_label)) NOT BETWEEN 2 AND 100
      OR p.display_label ~ '[[:cntrl:]<>]'
      OR p.display_label ~ '[0-9]{8,}')
 ) THEN RETURN jsonb_build_object('state','invalid_supplier_label');END IF;
 RETURN jsonb_build_object(
  'state','proveedores_revelados_al_cierre',
  'proveedores',v_result,'cantidad',v_visible,
  'invitados',v_invited,
  'solo_post_cierre',true,
  'identidades_reveladas',true,
  'telefonos_revelados',false,
  'ranking_global_permitido',false,
  'adjudicacion_automatica',false,
  'mensajes_enviados',false);
END $mvp303$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_all_suppliers_closed_mvp303(text)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_all_suppliers_closed_mvp303(text)
 TO service_role;
