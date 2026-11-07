-- MVP285: conmutador de activación del ensayo real, exclusivo PILOTO.
-- Nadie recibe invitaciones por instalarlo; comienza OFF.
-- La activación requiere autorización del operador fuera del webhook.
CREATE TABLE cotironda_piloto_privado.ai_review_launch_mvp285(
 only_row boolean PRIMARY KEY DEFAULT true CHECK(only_row),
 enabled boolean NOT NULL DEFAULT false,
 activated_at timestamptz,
 CHECK ((enabled IS FALSE AND activated_at IS NULL)
     OR (enabled IS TRUE AND activated_at IS NOT NULL))
);
INSERT INTO cotironda_piloto_privado.ai_review_launch_mvp285(only_row,enabled)
VALUES(true,false);
ALTER TABLE cotironda_piloto_privado.ai_review_launch_mvp285
 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.ai_review_launch_mvp285
 FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_review_launch_mvp285(
 p_chat_hmac text
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE can_review boolean:=false; v_trial jsonb;
BEGIN
 IF p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$'
 THEN RETURN jsonb_build_object('state','inactive','send',false,
   'confirm',false,'release',false); END IF;
 -- Fuente autorizada de vigencia, identidad y rol, nunca contexto IA.
 v_trial:=public.cotironda_piloto_ia_trial_flags_mvp229(p_chat_hmac);
 can_review:=coalesce(v_trial->>'state'='active',false)
    AND coalesce(v_trial->>'buyer'='true',false)
    AND coalesce(v_trial->>'dispatch'='true',false)
    AND EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_review_launch_mvp285 l
       WHERE l.only_row AND l.enabled AND l.activated_at IS NOT NULL)
    AND EXISTS(SELECT 1 FROM cotironda_piloto_privado.participants p
       WHERE p.key='arquitecto' AND p.participant_role='buyer'
       AND p.chat_hmac=p_chat_hmac AND p.consent_at IS NOT NULL
       AND p.opted_out_at IS NULL);
 RETURN jsonb_build_object('state',CASE WHEN can_review
    THEN 'active' ELSE 'inactive' END,
   'send',can_review,'confirm',can_review,'release',can_review);
END
$fn$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_ia_review_launch_mvp285(text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_ia_review_launch_mvp285(text) TO service_role;
