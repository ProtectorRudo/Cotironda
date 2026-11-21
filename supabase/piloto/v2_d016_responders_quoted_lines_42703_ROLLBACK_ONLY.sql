-- Rollback protegido: SOLO si la función sigue exactamente en el release
-- de dos columnas corregidas. No borra originales ni historial.
-- Revertir la RPC puede restaurar el error 42703, no ejecutarlo rutinariamente.
DO $d016_quoted_lines_rollback$
DECLARE old_source text;new_source text;
 target_sql text := $fixed$       SELECT line_no,description_literal,quantity_literal,
        unit_literal,unit_price_literal,line_total_literal,
        ambiguity_literal
       FROM cotironda_piloto_privado.supplier_quote_lines_mvp101$fixed$;
 replacement_sql text := $original$       SELECT line_no,description_literal,quantity_literal,
        unit_literal,ambiguity_literal
       FROM cotironda_piloto_privado.supplier_quote_lines_mvp101$original$;
BEGIN
 old_source:=pg_get_functiondef(
  'public.cotironda_piloto_v2_d016_responders_with_analysis_private(uuid,text)'::regprocedure
 );
 IF encode(extensions.digest(convert_to(old_source,'UTF8'),'sha256'),'hex')<>'52b2d9f2894fc623c54140c99c78ab5ea807dd6833eb9de52c5fcfb3289aa102'
 THEN RAISE EXCEPTION 'd016_quoted_lines_rollback_drift';END IF;
 IF length(old_source)-length(replace(old_source,target_sql,''))<>length(target_sql)
 THEN RAISE EXCEPTION 'd016_quoted_lines_rollback_anchor_drift';END IF;
 new_source:=replace(old_source,target_sql,replacement_sql);
 IF encode(extensions.digest(convert_to(new_source,'UTF8'),'sha256'),'hex')<>'76521ef0d7ed90fc6a78b2bb9541811984724b2fe56b454d1fd24d689264835b'
 THEN RAISE EXCEPTION 'd016_quoted_lines_rollback_unexpected_hash';END IF;
 EXECUTE new_source;
 IF encode(extensions.digest(convert_to(pg_get_functiondef(
  'public.cotironda_piloto_v2_d016_responders_with_analysis_private(uuid,text)'::regprocedure),'UTF8'),'sha256'),'hex')<>'76521ef0d7ed90fc6a78b2bb9541811984724b2fe56b454d1fd24d689264835b'
 OR has_function_privilege('anon',
  'public.cotironda_piloto_v2_d016_responders_with_analysis_private(uuid,text)','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.cotironda_piloto_v2_d016_responders_with_analysis_private(uuid,text)','EXECUTE')
 THEN RAISE EXCEPTION 'd016_quoted_lines_rollback_acl_failed';END IF;
END $d016_quoted_lines_rollback$;
