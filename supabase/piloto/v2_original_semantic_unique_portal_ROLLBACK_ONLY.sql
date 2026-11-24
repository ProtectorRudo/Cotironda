-- Rollback de emergencia SOLO del permiso de asociación semántica del portal.
-- NO PUBLICAR SIN AUTORIZACIÓN. Mantiene sesión, RLS, consentimientos, originales.
DO $undo_v2_semantic$
DECLARE
 catalog text;
 source text;
 undo_catalog text;
 undo_source text;
 a text := $A$
      link.association IN ('quoted_whapi_id','single_active_round')
      OR (
       link.association='prior_supplier_preamble'$A$;
 b text := $B$
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
 c text := $C$
      AND bad.state IN ('ambiguous_round','media_context_conflict')$C$;
 d text := $D$
      AND (
       bad.state='media_context_conflict'
       OR (bad.state='ambiguous_round'
           AND (link.association IS DISTINCT FROM 'semantic_unique_mvp291'
                OR bad.resolved_request_id IS DISTINCT FROM link.request_id))
      )$D$;
 g text := $G$
      AND bad.state IN ('ambiguous_round','media_context_conflict')$G$;
 h text := $H$
      AND (
       bad.state='media_context_conflict'
       OR (bad.state='ambiguous_round'
           AND (link.association IS DISTINCT FROM 'semantic_unique_mvp291'
                OR bad.resolved_request_id IS DISTINCT FROM link.request_id))
      )$H$;
 e text := $E$
   AND link.association IN (
    'quoted_whapi_id','single_active_round','prior_supplier_preamble')$E$;
 f text := $F$
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
 SELECT pg_get_functiondef('public.cotironda_piloto_v2_d016_responders_private(uuid,text)'::regprocedure)
 INTO catalog;
 SELECT pg_get_functiondef('public.cotironda_piloto_v2_d016_original_source_private(uuid,text,uuid)'::regprocedure)
 INTO source;
 IF encode(extensions.digest(convert_to(catalog,'UTF8'),'sha256'),'hex')
    <> '0106761b2a4fc103ec3010788c0335f21550ae8d75995e4e28cdea6c22c848c4'
 OR encode(extensions.digest(convert_to(source,'UTF8'),'sha256'),'hex')
    <> '4be254ef7351da8f43e0673ece96022d287f53e5a6b608b8a2713be1ab4274ba'
 THEN RAISE EXCEPTION 'v2_semantic_rollback_live_drift';END IF;
 undo_catalog:=replace(replace(catalog,b,a),d,c);
 undo_source:=replace(replace(source,f,e),h,g);
 IF encode(extensions.digest(convert_to(undo_catalog,'UTF8'),'sha256'),'hex')
    <> '9c89416f5ba4cf43039ff769dc7daebb071615fd11f051c6654bef67b54de9a9'
 OR encode(extensions.digest(convert_to(undo_source,'UTF8'),'sha256'),'hex')
    <> '70a964168c5ca9cd284d4e9fdd2ff8bf67827c09f0ec07719669e4c1f2abd87c'
 THEN RAISE EXCEPTION 'v2_semantic_rollback_source_drift';END IF;
 EXECUTE undo_catalog;EXECUTE undo_source;
END $undo_v2_semantic$;
