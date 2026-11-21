-- Cotironda V2 D016: fix único del catálogo autorizado del portal comprador.
-- SOLO CANDIDATO: aplicar al PILOTO exclusivamente con «Publicalo».
-- La RPC ya solicita unitPrice/lineTotal a la subconsulta quotedItems;
-- los precios existen en las columnas privadas originales, pero faltaban
-- en el SELECT interno (SQLSTATE 42703 al entrar con sesión válida).
-- No toca HMAC, sesión, autorizaciones, originales, IA, WhatsApp ni Vercel.
DO $d016_quoted_lines_fix$
DECLARE
 old_source text;
 new_source text;
 target_sql text := $original$       SELECT line_no,description_literal,quantity_literal,
        unit_literal,ambiguity_literal
       FROM cotironda_piloto_privado.supplier_quote_lines_mvp101$original$;
 replacement_sql text := $corrected$       SELECT line_no,description_literal,quantity_literal,
        unit_literal,unit_price_literal,line_total_literal,
        ambiguity_literal
       FROM cotironda_piloto_privado.supplier_quote_lines_mvp101$corrected$;
BEGIN
 old_source:=pg_get_functiondef(
  'public.cotironda_piloto_v2_d016_responders_with_analysis_private(uuid,text)'::regprocedure
 );
 IF encode(extensions.digest(convert_to(old_source,'UTF8'),'sha256'),'hex')<>'76521ef0d7ed90fc6a78b2bb9541811984724b2fe56b454d1fd24d689264835b'
 THEN RAISE EXCEPTION 'd016_quoted_lines_live_rpc_drift'; END IF;
 IF length(old_source)-length(replace(old_source,target_sql,''))<>length(target_sql)
 THEN RAISE EXCEPTION 'd016_quoted_lines_anchor_not_unique'; END IF;
 new_source:=replace(old_source,target_sql,replacement_sql);
 IF encode(extensions.digest(convert_to(new_source,'UTF8'),'sha256'),'hex')<>'52b2d9f2894fc623c54140c99c78ab5ea807dd6833eb9de52c5fcfb3289aa102'
 OR new_source NOT LIKE '%v2_d016_responders_private%'
 OR new_source NOT LIKE '%v2_d016_original_source_private%'
 OR new_source NOT LIKE '%v2_original_analysis%'
 OR new_source NOT LIKE '%q.source_sha256=v_source->>%'
 OR new_source NOT LIKE '%q.supplier_key=v_source->>%'
 THEN RAISE EXCEPTION 'd016_quoted_lines_security_or_source_mismatch';END IF;
 EXECUTE new_source;
 IF encode(extensions.digest(convert_to(pg_get_functiondef(
    'public.cotironda_piloto_v2_d016_responders_with_analysis_private(uuid,text)'::regprocedure
   ),'UTF8'),'sha256'),'hex')<>'52b2d9f2894fc623c54140c99c78ab5ea807dd6833eb9de52c5fcfb3289aa102'
 OR has_function_privilege('anon',
   'public.cotironda_piloto_v2_d016_responders_with_analysis_private(uuid,text)','EXECUTE')
 OR has_function_privilege('authenticated',
   'public.cotironda_piloto_v2_d016_responders_with_analysis_private(uuid,text)','EXECUTE')
 OR NOT has_function_privilege('service_role',
   'public.cotironda_piloto_v2_d016_responders_with_analysis_private(uuid,text)','EXECUTE')
 OR NOT (SELECT p.prosecdef AND p.provolatile='s' AND
   pg_get_userbyid(p.proowner)='postgres' AND
   'search_path=""'=ANY(p.proconfig)
  FROM pg_proc p
  WHERE p.oid='public.cotironda_piloto_v2_d016_responders_with_analysis_private(uuid,text)'::regprocedure)
 THEN RAISE EXCEPTION 'd016_quoted_lines_acl_or_hash_postcheck_failed';END IF;
END $d016_quoted_lines_fix$;
