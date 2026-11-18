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
           AND bad.resolved_request_id IS DISTINCT FROM link.request_id)
      )$D$;
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
    <> '72bf82d597beb16872b7e893d7562b5419180df715050ffd05d7221ad36808cd'
 OR encode(extensions.digest(convert_to(source,'UTF8'),'sha256'),'hex')
    <> '21e52c8b1fa968e561573bc103c365c8ac668bd957fe556e1f6fbee48da746c9'
 THEN RAISE EXCEPTION 'v2_semantic_rollback_live_drift';END IF;
 undo_catalog:=replace(replace(catalog,b,a),d,c);
 undo_source:=replace(source,f,e);
 IF encode(extensions.digest(convert_to(undo_catalog,'UTF8'),'sha256'),'hex')
    <> '9c89416f5ba4cf43039ff769dc7daebb071615fd11f051c6654bef67b54de9a9'
 OR encode(extensions.digest(convert_to(undo_source,'UTF8'),'sha256'),'hex')
    <> '70a964168c5ca9cd284d4e9fdd2ff8bf67827c09f0ec07719669e4c1f2abd87c'
 THEN RAISE EXCEPTION 'v2_semantic_rollback_source_drift';END IF;
 EXECUTE undo_catalog;EXECUTE undo_source;
END $undo_v2_semantic$;
