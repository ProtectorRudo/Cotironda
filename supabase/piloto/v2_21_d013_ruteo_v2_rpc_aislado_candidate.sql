-- Cotironda V2-21: create ISOLATED V2 shadow-preparation function.
-- CANDIDATE ONLY: requires a future "Publicalo" for Supabase PILOT.
-- Never changes historic M221 function, WhatsApp v76 or existing requests.
-- Baseline digest observed READ-ONLY from cotironda-piloto on 2026-11-13.
DO $v2_clone$
DECLARE
 v_old regprocedure;
 v_src text;
 v_new text;
 v_header text:='FUNCTION public.cotironda_piloto_ia_shadow_prepare_mvp221(';
 v_target text:='FUNCTION public.cotironda_piloto_v2_shadow_prepare_d013(';
 v_rubro_old text:=E'    OR v_match->>\'rubroCatalogo\' IS DISTINCT FROM\n       p_items->(v_index::integer)->>\'rubro\'';
 v_rubro_new text:=E'    OR v_match->>\'rubroCatalogo\' IS NULL\n    OR v_match->>\'rubroCatalogo\' NOT IN (\'obra_gruesa\',\'pintura\',\'electricidad\',\'construccion_seca\',\'sanitarios\',\'ferreteria\',\'otros\')';
BEGIN
 v_old:=to_regprocedure(
 'public.cotironda_piloto_ia_shadow_prepare_mvp221(text,text,text,text,jsonb,jsonb)');
 IF v_old IS NULL THEN
  RAISE EXCEPTION 'v2_21_old_preparer_not_installed';END IF;
 IF to_regprocedure(
 'public.cotironda_piloto_v2_shadow_prepare_d013(text,text,text,text,jsonb,jsonb)'
 ) IS NOT NULL THEN
  RAISE EXCEPTION 'v2_21_target_preparer_already_exists';END IF;
 v_src:=pg_get_functiondef(v_old);
 IF encode(extensions.digest(convert_to(v_src,'UTF8'),'sha256'),'hex')
   <>'a2225bc790c82166a352559720673dca2bc17a97508eac0b9054411064c25cf9'
 THEN RAISE EXCEPTION 'v2_21_baseline_source_changed';END IF;
 IF (length(v_src)-length(replace(v_src,v_header,'')))<>length(v_header)
 OR (length(v_src)-length(replace(v_src,v_rubro_old,'')))<>length(v_rubro_old)
 THEN RAISE EXCEPTION 'v2_21_unique_anchors_missing';END IF;
 IF position('c.literal_description=v_original_catalogue' IN v_src)=0
 OR position('c.participant_key=v_supplier' IN v_src)=0
 OR position('lower(btrim(p.delivery_city))=lower(btrim(p_city))' IN v_src)=0
 OR position('SECURITY DEFINER' IN v_src)=0
 OR position('SET search_path TO ''''' IN v_src)=0
 THEN RAISE EXCEPTION 'v2_21_baseline_guards_missing';END IF;
 v_new:=replace(replace(v_src,v_header,v_target),v_rubro_old,v_rubro_new);
 IF v_new=v_src OR position(v_rubro_old IN v_new)>0
 THEN RAISE EXCEPTION 'v2_21_rubro_filter_not_replaced';END IF;
 EXECUTE v_new;
 REVOKE ALL ON FUNCTION
  public.cotironda_piloto_v2_shadow_prepare_d013(text,text,text,text,jsonb,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
 GRANT EXECUTE ON FUNCTION
  public.cotironda_piloto_v2_shadow_prepare_d013(text,text,text,text,jsonb,jsonb)
  TO service_role;
 IF encode(extensions.digest(convert_to(pg_get_functiondef(v_old),'UTF8'),'sha256'),'hex')
  <>'a2225bc790c82166a352559720673dca2bc17a97508eac0b9054411064c25cf9'
 THEN RAISE EXCEPTION 'v2_21_history_modified';END IF;
 IF NOT has_function_privilege('service_role',
  'public.cotironda_piloto_v2_shadow_prepare_d013(text,text,text,text,jsonb,jsonb)',
  'EXECUTE')
 OR has_function_privilege('authenticated',
  'public.cotironda_piloto_v2_shadow_prepare_d013(text,text,text,text,jsonb,jsonb)',
  'EXECUTE')
 OR has_function_privilege('anon',
  'public.cotironda_piloto_v2_shadow_prepare_d013(text,text,text,text,jsonb,jsonb)',
  'EXECUTE')
 THEN RAISE EXCEPTION 'v2_21_private_access_not_verified';END IF;
END $v2_clone$;
