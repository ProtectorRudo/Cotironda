-- D013: candidate only, NOT to install without Publicalo.
-- Rewrite the EXACT current PILOT RPC, pinned SHA-256, fail closed on drift.
-- Removes rubro equality as business exclusion. Actual supplier's catalogue
-- literal (supplier_key, line_no, literal_description), consent and city
-- are still verified by the untouched body of the function.
DO $d013$
DECLARE
 v_prev text;
 v_new text;
 v_anchor text:=E'    OR v_match->>\'rubroCatalogo\' IS DISTINCT FROM\n       p_items->(v_index::integer)->>\'rubro\'';
 v_replacement text:=E'    OR v_match->>\'rubroCatalogo\' IS NULL\n    OR v_match->>\'rubroCatalogo\' NOT IN (\'obra_gruesa\',\'pintura\',\'electricidad\',\'construccion_seca\',\'sanitarios\',\'ferreteria\',\'otros\')';
BEGIN
 IF to_regprocedure('public.cotironda_piloto_ia_shadow_prepare_mvp221(text,text,text,text,jsonb,jsonb)') IS NULL
 THEN RAISE EXCEPTION 'D013 baseline missing'; END IF;
 SELECT pg_get_functiondef(
  'public.cotironda_piloto_ia_shadow_prepare_mvp221(text,text,text,text,jsonb,jsonb)'::regprocedure
 ) INTO v_prev;
 IF encode(extensions.digest(convert_to(v_prev,'UTF8'),'sha256'),'hex')
  <> 'a2225bc790c82166a352559720673dca2bc17a97508eac0b9054411064c25cf9'
 THEN RAISE EXCEPTION 'D013 source drifted; re-review live RPC'; END IF;
 IF length(v_prev)-length(replace(v_prev,v_anchor,''))<>length(v_anchor)
 THEN RAISE EXCEPTION 'D013 guard absent or repeated'; END IF;
 IF position('c.literal_description=v_original_catalogue' IN v_prev)=0
 OR position('c.participant_key=v_supplier' IN v_prev)=0
 OR position('lower(btrim(p.delivery_city))=lower(btrim(p_city))' IN v_prev)=0
 THEN RAISE EXCEPTION 'D013 supplier/catalogue/zone guard missing';END IF;
 v_new:=replace(v_prev,v_anchor,v_replacement);
 IF v_new=v_prev OR position(v_anchor IN v_new)>0
 THEN RAISE EXCEPTION 'D013 patch was not applied'; END IF;
 EXECUTE v_new;
 -- no DDL grants or dispatch settings changed.
END $d013$;
