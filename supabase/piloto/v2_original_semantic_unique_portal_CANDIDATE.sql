-- COTIRONDA V2 · CANDIDATE — NO PUBLICAR SIN «Publicalo».
-- El original asociado NO depende del parser económico, pero SÍ de
-- sesión privada, proveedor, comprador, consentimiento revocable y SHA.
-- Parchea solamente el portal V2 D016 ya existente (no V1, no Whapi).
DO $v2_original_single_reader$
DECLARE
 old_catalog text;
 old_source text;
 new_catalog text;
 new_source text;
 catalog_association_before text := $A$
      link.association IN ('quoted_whapi_id','single_active_round')
      OR (
       link.association='prior_supplier_preamble'$A$;
 catalog_association_after text := $B$
      link.association IN ('quoted_whapi_id','single_active_round')
      OR (
       link.association='semantic_unique_mvp291'
       AND EXISTS (
        SELECT 1 FROM cotironda_piloto_privado.ai_supplier_auto_correlation_mvp291 decision
        JOIN cotironda_piloto_privado.ai_supplier_unresolved_mvp237 u
          ON u.message_hmac=decision.source_hmac
          AND u.supplier_key=decision.supplier_key
          AND u.source_sha256=decision.source_sha256
        WHERE decision.source_hmac=link.message_hmac
          AND decision.supplier_key=link.supplier_key
          AND decision.source_sha256=link.source_sha256
          AND decision.selected_request_id=link.request_id
          AND decision.state='linked'
          AND decision.finished_at IS NOT NULL
          AND u.resolved_request_id=link.request_id
          AND u.state='ambiguous_round'
       )
      )
      OR (
       link.association='prior_supplier_preamble'$B$;
 catalog_unresolved_before text := $C$
      AND bad.state IN ('ambiguous_round','media_context_conflict')$C$;
 catalog_unresolved_after text := $D$
      AND (
       bad.state='media_context_conflict'
       OR (bad.state='ambiguous_round'
           AND (link.association IS DISTINCT FROM 'semantic_unique_mvp291'
                OR bad.resolved_request_id IS DISTINCT FROM link.request_id))
      )$D$;
 source_unresolved_before text := $G$
      AND bad.state IN ('ambiguous_round','media_context_conflict')$G$;
 source_unresolved_after text := $H$
      AND (
       bad.state='media_context_conflict'
       OR (bad.state='ambiguous_round'
           AND (link.association IS DISTINCT FROM 'semantic_unique_mvp291'
                OR bad.resolved_request_id IS DISTINCT FROM link.request_id))
      )$H$;
 source_association_before text := $E$
   AND link.association IN (
    'quoted_whapi_id','single_active_round','prior_supplier_preamble')$E$;
 source_association_after text := $F$
   AND (
    link.association IN (
     'quoted_whapi_id','single_active_round','prior_supplier_preamble')
    OR (
     link.association='semantic_unique_mvp291'
     AND EXISTS (
      SELECT 1 FROM cotironda_piloto_privado.ai_supplier_auto_correlation_mvp291 decision
      JOIN cotironda_piloto_privado.ai_supplier_unresolved_mvp237 u
       ON u.message_hmac=decision.source_hmac
       AND u.supplier_key=decision.supplier_key
       AND u.source_sha256=decision.source_sha256
      WHERE decision.source_hmac=link.message_hmac
       AND decision.supplier_key=link.supplier_key
       AND decision.source_sha256=link.source_sha256
       AND decision.selected_request_id=link.request_id
       AND decision.state='linked'
       AND decision.finished_at IS NOT NULL
       AND u.state='ambiguous_round'
       AND u.resolved_request_id=link.request_id
     )
    )
   )$F$;
BEGIN
 IF to_regprocedure('public.cotironda_piloto_v2_d016_responders_private(uuid,text)') IS NULL
 OR to_regprocedure('public.cotironda_piloto_v2_d016_original_source_private(uuid,text,uuid)') IS NULL
 THEN RAISE EXCEPTION 'v2_portal_existing_functions_missing';END IF;

 SELECT pg_get_functiondef('public.cotironda_piloto_v2_d016_responders_private(uuid,text)'::regprocedure)
 INTO old_catalog;
 SELECT pg_get_functiondef('public.cotironda_piloto_v2_d016_original_source_private(uuid,text,uuid)'::regprocedure)
 INTO old_source;

 IF encode(extensions.digest(convert_to(old_catalog,'UTF8'),'sha256'),'hex')
  <> '9c89416f5ba4cf43039ff769dc7daebb071615fd11f051c6654bef67b54de9a9'
 OR encode(extensions.digest(convert_to(old_source,'UTF8'),'sha256'),'hex')
  <> '70a964168c5ca9cd284d4e9fdd2ff8bf67827c09f0ec07719669e4c1f2abd87c'
 THEN RAISE EXCEPTION 'v2_portal_live_source_drifted';END IF;

 IF length(old_catalog)-length(replace(old_catalog,catalog_association_before,''))
    <> length(catalog_association_before)
 OR length(old_catalog)-length(replace(old_catalog,catalog_unresolved_before,''))
    <> length(catalog_unresolved_before)
 OR length(old_source)-length(replace(old_source,source_association_before,''))
    <> length(source_association_before)
 OR length(old_source)-length(replace(old_source,source_unresolved_before,''))
    <> length(source_unresolved_before)
 THEN RAISE EXCEPTION 'v2_portal_patch_anchor_not_unique';END IF;

 new_catalog:=replace(replace(old_catalog,catalog_association_before,
   catalog_association_after),catalog_unresolved_before,catalog_unresolved_after);
 new_source:=replace(replace(old_source,source_association_before,
  source_association_after),source_unresolved_before,source_unresolved_after);

 IF new_catalog=old_catalog OR new_source=old_source
 OR encode(extensions.digest(convert_to(new_catalog,'UTF8'),'sha256'),'hex')
    <> '0106761b2a4fc103ec3010788c0335f21550ae8d75995e4e28cdea6c22c848c4'
 OR encode(extensions.digest(convert_to(new_source,'UTF8'),'sha256'),'hex')
    <> '4be254ef7351da8f43e0673ece96022d287f53e5a6b608b8a2713be1ab4274ba'
 OR new_catalog NOT LIKE '%v2_d016_effective_original_consent_private%'
 OR new_catalog NOT LIKE '%v2_d016_session_context_private%'
 OR new_source NOT LIKE '%v2_d016_effective_original_consent_private%'
 OR new_source NOT LIKE '%v2_d016_responders_private%'
 OR new_catalog NOT LIKE '%semantic_unique_mvp291%'
 OR new_source NOT LIKE '%semantic_unique_mvp291%'
 THEN RAISE EXCEPTION 'v2_portal_privacy_guards_changed';END IF;

 EXECUTE new_catalog;
 EXECUTE new_source;

 IF encode(extensions.digest(convert_to(pg_get_functiondef(
    'public.cotironda_piloto_v2_d016_responders_private(uuid,text)'::regprocedure),
    'UTF8'),'sha256'),'hex')
    <> '0106761b2a4fc103ec3010788c0335f21550ae8d75995e4e28cdea6c22c848c4'
 OR encode(extensions.digest(convert_to(pg_get_functiondef(
    'public.cotironda_piloto_v2_d016_original_source_private(uuid,text,uuid)'::regprocedure),
    'UTF8'),'sha256'),'hex')
    <> '4be254ef7351da8f43e0673ece96022d287f53e5a6b608b8a2713be1ab4274ba'
 THEN RAISE EXCEPTION 'v2_portal_post_source_mismatch';END IF;

 IF has_function_privilege('anon',
   'public.cotironda_piloto_v2_d016_responders_private(uuid,text)','EXECUTE')
 OR has_function_privilege('authenticated',
   'public.cotironda_piloto_v2_d016_responders_private(uuid,text)','EXECUTE')
 OR has_function_privilege('anon',
   'public.cotironda_piloto_v2_d016_original_source_private(uuid,text,uuid)','EXECUTE')
 OR has_function_privilege('authenticated',
   'public.cotironda_piloto_v2_d016_original_source_private(uuid,text,uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'v2_portal_access_postcheck_failed';END IF;
END $v2_original_single_reader$;
