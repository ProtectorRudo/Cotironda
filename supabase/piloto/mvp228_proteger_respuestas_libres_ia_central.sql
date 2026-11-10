-- MVP228: protección de respuestas proveedor IA incluso si la IA de
-- comprador está desactivada después de publicar una ronda.
-- El guard identifica un trabajo IA existente, NO interpreta precios.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_is_supplier_mvp226(
 p_chat_hmac text
) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
 SELECT jsonb_build_object('state',
  CASE WHEN p_chat_hmac ~ '^[a-f0-9]{64}$' AND EXISTS(
   SELECT 1 FROM cotironda_piloto_privado.participants p
   JOIN cotironda_piloto_privado.ai_dispatch_jobs_mvp222 j ON j.supplier_key=p.key
   JOIN cotironda_piloto_privado.requests r ON r.id=j.request_id
   WHERE p.chat_hmac=p_chat_hmac AND p.participant_role='supplier'
     AND p.consent_at IS NOT NULL AND p.opted_out_at IS NULL
     AND r.state='prepared' AND r.closes_at>clock_timestamp()
     AND j.state IN('pending','leased','api_accepted','uncertain')
  ) THEN 'central_supplier' ELSE 'not_central_supplier' END);
$fn$;

REVOKE ALL ON FUNCTION
 public.cotironda_piloto_ia_is_supplier_mvp226(text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_ia_is_supplier_mvp226(text)
 TO service_role;
