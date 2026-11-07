-- MVP274 — PILOTO CONTINUO DE COSTO CERO, SOLO esquema; OFF por defecto.
-- 06/11/2026: se conserva el control de consentimiento, doble gate IA,
-- puerta de despacho, cuotas, limites de archivos, dedupe y reintentos.
-- No activa la prueba, Whapi, cron, ni modifica pedidos existentes.
-- El operador puede configurar expires_at=NULL SOLO al activar con
-- autorizacion especifica. Valor por defecto: enabled=false.
-- Modo legacy con expires_at mantiene MAXIMO 4 horas intacto.
-- Precaucion: esto no habilita uso ilimitado de OpenAI/Whapi.
ALTER TABLE cotironda_piloto_privado.ai_trial_control_mvp229
 DROP CONSTRAINT ai_trial_control_mvp229_check;
ALTER TABLE cotironda_piloto_privado.ai_trial_control_mvp229
 ADD CONSTRAINT ai_trial_control_mvp229_check CHECK (
  (enabled IS FALSE AND activated_at IS NULL AND expires_at IS NULL)
  OR (enabled IS TRUE AND activated_at IS NOT NULL AND
   (expires_at IS NULL OR (expires_at>activated_at
    AND expires_at<=activated_at+interval '4 hours')))
 );

-- Reusar la asociacion segura MVP230: proveedores con invitacion
-- entregada mantienen continuidad incluso si se apaga el modo,
-- solo durante el plazo y sin permitir nuevos envios.
-- MVP230: Durante prueba temporal, los PERMISOS DE ENVIO vencen,
-- pero un proveedor ya invitado puede cotizar hasta el cierre de su ronda.
-- Ninguna acción de creación/publicación/dispatch se activa aquí.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_trial_flags_mvp229(
 p_chat_hmac text
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE
 v_trial_active boolean:=false;
 v_buyer boolean:=false;
 v_dispatch boolean:=false;
 v_quote boolean:=false;
 v_role text;
 v_supplier text;
 v_inbound boolean:=false;
 v_outbound boolean:=false;
BEGIN
 IF p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$'
 THEN RETURN jsonb_build_object('state','inactive',
  'buyer',false,'dispatch',false,'quote_link',false,'quote_analysis',false);END IF;
 SELECT p.participant_role,p.key INTO v_role,v_supplier
 FROM cotironda_piloto_privado.participants p
 WHERE p.chat_hmac=p_chat_hmac
   AND p.consent_at IS NOT NULL AND p.opted_out_at IS NULL
   AND ((p.participant_role='buyer' AND p.key='arquitecto')
    OR (p.participant_role='supplier'
      AND p.key IN('corralon_ailin','corralon_nahuel')));
 IF NOT FOUND THEN RETURN jsonb_build_object('state','inactive',
  'buyer',false,'dispatch',false,'quote_link',false,'quote_analysis',false);END IF;
 SELECT t.enabled AND t.activated_at<=clock_timestamp()
  AND (t.expires_at IS NULL OR t.expires_at>clock_timestamp())
 INTO v_trial_active
 FROM cotironda_piloto_privado.ai_trial_control_mvp229 t WHERE t.only_row;
 SELECT f.whatsapp_inbound_enabled,f.whatsapp_outbound_enabled
 INTO v_inbound,v_outbound FROM cotironda_piloto_privado.integration_flags f
 WHERE f.only_row;
 IF NOT coalesce(v_inbound,false)
 THEN RETURN jsonb_build_object('state','inactive',
  'buyer',false,'dispatch',false,'quote_link',false,'quote_analysis',false);END IF;
 -- SOLO compradores con modo piloto vigente pueden iniciar nuevas rondas
 -- y solo si todas las autorizaciones de despacho siguen activadas.
 v_buyer:=coalesce(v_trial_active,false) AND coalesce(v_outbound,false)
  AND v_role='buyer'
  AND EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_central_control_mvp226 g
   WHERE g.only_row AND g.enabled AND g.activated_at IS NOT NULL);
 v_dispatch:=v_buyer
  AND EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_dispatch_gate_mvp222 g
   WHERE g.only_row AND g.enabled AND g.activated_at IS NOT NULL);
 -- Un proveedor autorizado conserva el derecho a RESPONDER a una
 -- solicitud efectivamente entregada, sin necesidad de activar envío.
 -- Nunca habilitar pendientes, leased, inciertos ni rondas legacy.
 v_quote:=v_role='supplier' AND EXISTS(
  SELECT 1
  FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 j
  JOIN cotironda_piloto_privado.requests r ON r.id=j.request_id
  JOIN cotironda_piloto_privado.ai_shadow_requests_mvp221 sr
   ON sr.request_id=r.id AND sr.source_hmac=r.source_hmac
  WHERE j.supplier_key=v_supplier
    AND j.state='api_accepted'
    AND j.whapi_message_id IS NOT NULL
    AND j.finished_at IS NOT NULL
    AND r.state='prepared' AND r.closes_at>clock_timestamp()
    AND r.created_at<=j.finished_at
 );
 RETURN jsonb_build_object(
  'state',CASE WHEN coalesce(v_trial_active,false) THEN 'active'
    WHEN v_quote THEN 'continuation' ELSE 'inactive' END,
  'buyer',v_buyer,'dispatch',v_dispatch,
  'quote_link',v_quote,'quote_analysis',v_quote);
END
$fn$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_ia_trial_flags_mvp229(text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_ia_trial_flags_mvp229(text)
 TO service_role;

-- No se cambia la ACL: verificar explicitamente que solo service_role
-- pueda invocar el RPC; revocar de nuevo como defensa contra drift.
REVOKE ALL ON FUNCTION public.cotironda_piloto_ia_trial_flags_mvp229(text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_ia_trial_flags_mvp229(text)
 TO service_role;
