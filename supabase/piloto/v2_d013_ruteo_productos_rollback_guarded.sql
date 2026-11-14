-- Cotironda PILOTO V2 D013: rollback DE EMERGENCIA, NO ejecutar por rutina.
-- Revierte EXCLUSIVAMENTE el cambio de guardia rubro del shadow prepare M221.
-- No toca rondas, catálogos, permisos, originales, cron, dispatch ni WhatsApp.
-- SHA de origen = POST-D013 EXACTO a54091b...; de salida = V76 BASELINE a2225...
DO $d013_revert$
DECLARE
 v_prev text;
 v_new text;
 v_anchor text:=E'    OR v_match->>\'rubroCatalogo\' IS NULL\n    OR v_match->>\'rubroCatalogo\' NOT IN (\'obra_gruesa\',\'pintura\',\'electricidad\',\'construccion_seca\',\'sanitarios\',\'ferreteria\',\'otros\')';
 v_replacement text:=E'    OR v_match->>\'rubroCatalogo\' IS DISTINCT FROM\n       p_items->(v_index::integer)->>\'rubro\'';
BEGIN
 IF to_regprocedure('public.cotironda_piloto_ia_shadow_prepare_mvp221(text,text,text,text,jsonb,jsonb)') IS NULL
 THEN RAISE EXCEPTION 'D013 rollback baseline missing'; END IF;
 SELECT pg_get_functiondef(
  'public.cotironda_piloto_ia_shadow_prepare_mvp221(text,text,text,text,jsonb,jsonb)'::regprocedure
 ) INTO v_prev;
 IF encode(extensions.digest(convert_to(v_prev,'UTF8'),'sha256'),'hex')
    <> 'a54091b87a0eb57f0111749cd3151a2623b76f129130714b6830ae4a8943bc02'
 THEN RAISE EXCEPTION 'D013 rollback source drifted, no changes'; END IF;
 IF length(v_prev)-length(replace(v_prev,v_anchor,''))<>length(v_anchor)
 THEN RAISE EXCEPTION 'D013 rollback guard absent or repeated'; END IF;
 IF position('c.literal_description=v_original_catalogue' IN v_prev)=0
 OR position('c.participant_key=v_supplier' IN v_prev)=0
 THEN RAISE EXCEPTION 'D013 rollback source guards missing'; END IF;
 v_new:=replace(v_prev,v_anchor,v_replacement);
 IF v_new=v_prev OR position(v_anchor IN v_new)>0
 THEN RAISE EXCEPTION 'D013 rollback failed to transform'; END IF;
 EXECUTE v_new;
 IF encode(extensions.digest(convert_to(pg_get_functiondef(
  'public.cotironda_piloto_ia_shadow_prepare_mvp221(text,text,text,text,jsonb,jsonb)'::regprocedure
 ),'UTF8'),'sha256'),'hex')
 <> 'a2225bc790c82166a352559720673dca2bc17a97508eac0b9054411064c25cf9'
 THEN RAISE EXCEPTION 'D013 rollback hash mismatch, transaction will abort'; END IF;
END $d013_revert$;