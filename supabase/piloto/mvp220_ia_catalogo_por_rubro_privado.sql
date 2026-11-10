-- MVP220 · SOLO cotironda-piloto · lectura semántica del catálogo.
-- No altera mensajes, envíos, ofertas, catálogos ni confirmaciones.
-- IMPORTANT: el catálogo de Ailín/Nahuel NO está confirmado hoy.
-- La IA puede leerlo en modo diagnóstico; su estado NO habilita despacho.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_catalogo_mvp220(
  p_buyer_chat_hmac text,
  p_delivery_city text
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_suppliers integer;
  v_too_large boolean;
  v_catalogues jsonb;
BEGIN
  IF p_buyer_chat_hmac IS NULL
     OR p_buyer_chat_hmac !~ '^[a-f0-9]{64}$'
     OR p_delivery_city IS NULL
     OR length(btrim(p_delivery_city)) NOT BETWEEN 3 AND 80
     OR p_delivery_city ~ '[[:cntrl:]]'
  THEN RETURN jsonb_build_object('state','invalid_input'); END IF;

  -- El comprador debe existir y estar autorizado. No se expone contacto.
  IF NOT EXISTS(
    SELECT 1 FROM cotironda_piloto_privado.participants buyer
    WHERE buyer.participant_role='buyer'
      AND buyer.chat_hmac=p_buyer_chat_hmac
      AND buyer.consent_at IS NOT NULL
      AND buyer.opted_out_at IS NULL
  ) THEN RETURN jsonb_build_object('state','not_authorized'); END IF;

  -- No devolver TODOS los catálogos truncados: fallar explícitamente.
  SELECT count(*), coalesce(bool_or(s.items_count>150),false)
  INTO v_suppliers,v_too_large
  FROM (
    SELECT p.key,count(c.line_no)::integer AS items_count
    FROM cotironda_piloto_privado.participants p
    JOIN cotironda_piloto_privado.catalogue_lines c
      ON c.participant_key=p.key
    WHERE p.participant_role='supplier'
      AND p.chat_hmac IS NOT NULL
      AND p.consent_at IS NOT NULL AND p.opted_out_at IS NULL
      AND lower(btrim(p.delivery_city))=lower(btrim(p_delivery_city))
    GROUP BY p.key
  ) s;
  IF v_suppliers>25 OR v_too_large THEN
    RETURN jsonb_build_object('state','too_many_catalogue_lines');
  END IF;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'clave',p.key,
      'localidad',p.delivery_city,
      'catalogoConfirmado',p.catalogue_confirmed_at IS NOT NULL,
      'articulos',cl.lines
    ) ORDER BY p.key
  ),'[]'::jsonb) INTO v_catalogues
  FROM cotironda_piloto_privado.participants p
  CROSS JOIN LATERAL (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'numero',c.line_no,
      'descripcion',c.literal_description,
      'familiaAnterior',c.family_code,
      'revisionAnterior',c.recognition_state
    ) ORDER BY c.line_no),'[]'::jsonb) AS lines
    FROM cotironda_piloto_privado.catalogue_lines c
    WHERE c.participant_key=p.key
  ) cl
  WHERE p.participant_role='supplier'
    AND p.chat_hmac IS NOT NULL
    AND p.consent_at IS NOT NULL AND p.opted_out_at IS NULL
    AND lower(btrim(p.delivery_city))=lower(btrim(p_delivery_city))
    AND jsonb_array_length(cl.lines)>0;

  RETURN jsonb_build_object(
    'state','catalogue_snapshot',
    'localidad',btrim(p_delivery_city),
    'proveedores',v_catalogues,
    'proveedoresSinConfirmar',(
      SELECT count(*) FROM jsonb_array_elements(v_catalogues) x
      WHERE x->>'catalogoConfirmado'='false'
    )
  );
END
$function$;

-- SECURITY DEFINER en public: acceso SOLO al backend con service_role.
REVOKE ALL ON FUNCTION
 public.cotironda_piloto_ia_catalogo_mvp220(text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_ia_catalogo_mvp220(text,text)
 TO service_role;
