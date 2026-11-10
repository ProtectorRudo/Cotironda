-- MVP229 — control de prueba real de IA CENTRAL, SOLO cotironda-piloto.
-- Feature flags NO son secretos; quedan en esquema privado bajo RLS.
-- Sin activación explícita el webhook se comporta como antes.
-- Una prueba vence automáticamente en un máximo de 4 horas.
CREATE TABLE IF NOT EXISTS cotironda_piloto_privado.ai_trial_control_mvp229 (
 only_row boolean PRIMARY KEY DEFAULT true CHECK(only_row),
 enabled boolean NOT NULL DEFAULT false,
 activated_at timestamptz,
 expires_at timestamptz,
 CHECK (
  (enabled=false AND activated_at IS NULL AND expires_at IS NULL)
  OR
  (enabled=true AND activated_at IS NOT NULL AND expires_at IS NOT NULL
   AND expires_at>activated_at
   AND expires_at<=activated_at+interval '4 hours')
 )
);
INSERT INTO cotironda_piloto_privado.ai_trial_control_mvp229
 (only_row,enabled) VALUES (true,false)
 ON CONFLICT(only_row) DO NOTHING;
ALTER TABLE cotironda_piloto_privado.ai_trial_control_mvp229 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.ai_trial_control_mvp229
 FROM PUBLIC,anon,authenticated,service_role;

-- Este RPC se llama SOLO después de verificar firma Whapi y derivar
-- el HMAC del remitente. No acepta un nombre ni un teléfono arbitrario.
-- La SQL definer no revela el catálogo, teléfonos ni los secretos.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_trial_flags_mvp229(
 p_chat_hmac text
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE
 v_active boolean:=false;
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
 SELECT (t.enabled AND t.activated_at<=clock_timestamp()
      AND t.expires_at>clock_timestamp())
 INTO v_active
 FROM cotironda_piloto_privado.ai_trial_control_mvp229 t WHERE t.only_row;
 IF coalesce(v_active,false)=false
 THEN RETURN jsonb_build_object('state','inactive',
   'buyer',false,'dispatch',false,'quote_link',false,'quote_analysis',false);
 END IF;
 SELECT p.key,p.participant_role INTO v_participant
 FROM cotironda_piloto_privado.participants p
 WHERE p.chat_hmac=p_chat_hmac
   AND p.consent_at IS NOT NULL AND p.opted_out_at IS NULL
   AND ((p.participant_role='buyer' AND p.key='arquitecto')
     OR (p.participant_role='supplier' AND
       p.key IN('corralon_ailin','corralon_nahuel')));
 IF NOT FOUND
 THEN RETURN jsonb_build_object('state','inactive',
   'buyer',false,'dispatch',false,'quote_link',false,'quote_analysis',false);
 END IF;
 SELECT f.whatsapp_inbound_enabled,f.whatsapp_outbound_enabled
 INTO v_inbound,v_outbound
 FROM cotironda_piloto_privado.integration_flags f WHERE f.only_row;
 v_buyer:=v_participant.participant_role='buyer'
  AND coalesce(v_inbound,false) AND coalesce(v_outbound,false)
  AND EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_central_control_mvp226 c
    WHERE c.only_row AND c.enabled AND c.activated_at IS NOT NULL);
 v_dispatch:=v_buyer
  AND EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_dispatch_gate_mvp222 g
    WHERE g.only_row AND g.enabled AND g.activated_at IS NOT NULL);
 v_supplier:=v_participant.participant_role='supplier'
  AND coalesce(v_inbound,false) AND coalesce(v_outbound,false)
  AND EXISTS(
   SELECT 1 FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 j
   JOIN cotironda_piloto_privado.requests r ON r.id=j.request_id
   WHERE j.supplier_key=v_participant.key
     AND j.state IN('pending','leased','api_accepted')
     AND r.state='prepared' AND r.closes_at>clock_timestamp()
  );
 RETURN jsonb_build_object('state','active',
  'buyer',v_buyer,'dispatch',v_dispatch,
  'quote_link',v_supplier,'quote_analysis',v_supplier);
END;
$fn$;
REVOKE ALL ON FUNCTION
 public.cotironda_piloto_ia_trial_flags_mvp229(text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_ia_trial_flags_mvp229(text)
 TO service_role;
