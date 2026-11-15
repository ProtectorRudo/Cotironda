-- Cotironda D016: resumen comercial OPCIONAL sobre original previamente autorizado.
-- Nunca abre archivos ni altera IA, importes o condiciones. Conserva el PDF fuente.
-- Acotado a la ronda/empresa validada por el catálogo existente, source SHA,
-- y sin devolver contactos, HMAC, rutas ni datos de proveedores pendientes.
DO $patch$
DECLARE v_old text; v_new text;
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO STRICT v_new
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='cotironda_piloto_v2_d016_responders_with_analysis_private';
 IF md5(v_new)<>'9701785e429d79e4233d5c663f4b2831'
 THEN RAISE EXCEPTION 'd016_commercial_existing_analysis_rpc_drift'; END IF;
 v_old:=v_new;
 v_new:=replace(v_new,
 $find$  v_items:=v_items||jsonb_build_array(v_entry);$find$,
 $replacement$
  -- Sólo se adjunta información ya extraída del mismo PDF autorizado y SHA.
  -- Si el parser no generó una extracción coherente, retorna NULL opcional;
  -- el original y las cuatro observaciones anteriores siguen visibles.
  v_entry:=v_entry||jsonb_build_object('commercial',(
    SELECT jsonb_build_object(
     'totalLiteral',NULLIF(btrim(q.declared_total_literal),''),
     'requestItems',(
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
       'line',requested.line_no,
       'description',requested.original_description,
       'quantity',requested.quantity::text,
       'unit',requested.unit
      ) ORDER BY requested.line_no),'[]'::jsonb)
      FROM (
       SELECT line_no,original_description,quantity,unit
       FROM cotironda_piloto_privado.request_lines
       WHERE request_id=p_request_id ORDER BY line_no LIMIT 100
      ) requested
     ),
     'quotedItems',(
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
       'line',offered.line_no,
       'description',offered.description_literal,
       'quantity',offered.quantity_literal,
       'unit',offered.unit_literal,
       'ambiguity',offered.ambiguity_literal
      ) ORDER BY offered.line_no),'[]'::jsonb)
      FROM (
       SELECT line_no,description_literal,quantity_literal,
        unit_literal,ambiguity_literal
       FROM cotironda_piloto_privado.supplier_quote_lines_mvp101
       WHERE message_hmac=q.message_hmac ORDER BY line_no LIMIT 100
      ) offered
     )
    )
    FROM cotironda_piloto_privado.supplier_media_quotes_mvp098 q
    WHERE q.request_id=p_request_id
     AND q.message_hmac=v_source->>'messageHmac'
     AND q.supplier_key=v_source->>'supplierKey'
     AND q.source_sha256=v_source->>'sha256'
     AND q.state IN ('awaiting_fidelity_check','verified')
     AND q.line_count BETWEEN 0 AND 100
    LIMIT 1
  ));
  v_items:=v_items||jsonb_build_array(v_entry);$replacement$);
 IF v_new=v_old THEN RAISE EXCEPTION 'd016_commercial_missing_anchor'; END IF;
 EXECUTE v_new;
END $patch$;
-- Los permisos del RPC se conservan: service_role solamente.
DO $acl$
BEGIN
 IF has_function_privilege('anon',
 'public.cotironda_piloto_v2_d016_responders_with_analysis_private(uuid,text)','EXECUTE')
 OR has_function_privilege('authenticated',
 'public.cotironda_piloto_v2_d016_responders_with_analysis_private(uuid,text)','EXECUTE')
 THEN RAISE EXCEPTION 'd016_commercial_exposed_rpc'; END IF;
END $acl$;