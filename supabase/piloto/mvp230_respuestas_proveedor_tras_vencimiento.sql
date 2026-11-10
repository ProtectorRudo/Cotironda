-- MVP230: el cierre de la ventana de NUEVOS pedidos no bloquea
-- presupuestos de rondas ya despachadas a un proveedor consentido.
-- Solo permite recepción de respuestas contra envío aceptado por Whapi.
-- El vínculo y la validación económica siguen siendo MVP225/227.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_trial_flags_mvp229(
 p_chat_hmac text
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE
 v_trial boolean:=false;
 v_participant record;
 v_buyer boolean:=false;
 v_supplier boolean:=false;
 v_dispatch boolean:=false;
 v_inbound boolean:=false;
 v_outbound boolean:=false;
BEGIN
 IF p_chat_hmac IS NULL OR p_chat_hmac !~ '^[0-9a-f]{64}$'
 THEN RETURN jsonb_build_object('state','inactive',
   'buyer',false,'dispatch',false,'quote_link',false,'quote_analysis',false);
 END IF;
 SELECT p.key,p.participant_role INTO v_participant
 FROM cotironda_piloto_privado.participants p
 WHERE p.chat_hmac=p_chat_hmac AND p.consent_at IS NOT NULL
   AND p.opted_out_at IS NULL
   AND (
    (p.key='arquitecto' AND p.participant_role='buyer')
    OR
    (p.key IN('corralon_ailin','corralon_nahuel') AND p.participant_role='supplier')
   );
 IF NOT FOUND THEN RETURN jsonb_build_object('state','inactive',
   'buyer',false,'dispatch',false,'quote_link',false,'quote_analysis',false);
 END IF;

 SELECT t.enabled AND t.activated_at<=clock_timestamp()
       AND t.expires_at>clock_timestamp()
 INTO v_trial FROM cotironda_piloto_privado.ai_trial_control_mvp229 t
 WHERE t.only_row;
 SELECT f.whatsapp_inbound_enabled,f.whatsapp_outbound_enabled
 INTO v_inbound,v_outbound
 FROM cotironda_piloto_privado.integration_flags f WHERE f.only_row;

 -- CREAR una ronda nueva es el único permiso que caduca con la prueba.
 v_buyer:=coalesce(v_trial,false)
   AND v_participant.participant_role='buyer'
   AND coalesce(v_inbound,false) AND coalesce(v_outbound,false)
   AND EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_central_control_mvp226 c
      WHERE c.only_row AND c.enabled AND c.activated_at IS NOT NULL);
 v_dispatch:=v_buyer
   AND EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_dispatch_gate_mvp222 g
      WHERE g.only_row AND g.enabled AND g.activated_at IS NOT NULL);

 -- RESPONDER una ronda previa: la autorización no depende de que
 -- siga abierto el ensayo. Solo aceptamos presupuesto de un negocio
 -- elegido y cuyo PDF recibió aceptación API, dentro del plazo real.
 -- No basta con pending, leased o uncertain: el envío pudo no ocurrir.
 v_supplier:=v_participant.participant_role='supplier'
   AND coalesce(v_inbound,false)
   AND EXISTS(
     SELECT 1 FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 j
     JOIN cotironda_piloto_privado.requests r ON r.id=j.request_id
     JOIN cotironda_piloto_privado.ai_shadow_requests_mvp221 shadow
       ON shadow.request_id=r.id
     JOIN cotironda_piloto_privado.invitations i
       ON i.request_id=r.id AND i.supplier_key=j.supplier_key
     JOIN cotironda_piloto_privado.participants buyer ON buyer.key=r.buyer_key
     WHERE j.supplier_key=v_participant.key
       AND j.state='api_accepted' AND j.finished_at IS NOT NULL
       AND r.state='prepared' AND r.closes_at>clock_timestamp()
       AND i.state='prepared'
       AND buyer.participant_role='buyer' AND buyer.consent_at IS NOT NULL
       AND buyer.opted_out_at IS NULL
   );
 RETURN jsonb_build_object(
   'state',CASE WHEN coalesce(v_trial,false) THEN 'active'
               WHEN v_supplier THEN 'reply_only'
               ELSE 'inactive' END,
   'buyer',v_buyer,'dispatch',v_dispatch,
   'quote_link',v_supplier,'quote_analysis',v_supplier
 );
END;
$fn$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_ia_trial_flags_mvp229(text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_ia_trial_flags_mvp229(text)
 TO service_role;
