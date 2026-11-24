-- ROLLBACK ONLY: revierte el selector/claim de reintento limitado.
-- CONSERVA el ledger privado y el contador real de intentos, no borra evidencias.
-- Ejecutar ÚNICAMENTE con autorización específica de reversión.
DO $undo$
DECLARE
 v_due text;v_claim text;v_old_due text;v_old_claim text;
 a text:=$literal$a.status='ready' OR (a.attempt_count>=3 AND NOT (
        a.attempt_count=3 AND a.status='review' AND EXISTS (
         SELECT 1 FROM cotironda_piloto_privado.v2_analysis_retry_permits permit
         WHERE permit.request_id=a.request_id
          AND permit.document_id=a.document_id
          AND permit.original_sha256=a.original_sha256
          AND permit.authorized_attempt=4
          AND permit.expires_at>clock_timestamp()
        )
       )) OR$literal$;
 b text:=$literal$a.status='ready' OR a.attempt_count>=3 OR$literal$;
 c text:=$literal$AND (
    cotironda_piloto_privado.v2_original_analysis.attempt_count<3
    OR (
      cotironda_piloto_privado.v2_original_analysis.attempt_count=3
      AND cotironda_piloto_privado.v2_original_analysis.status='review'
      AND EXISTS (
       SELECT 1 FROM cotironda_piloto_privado.v2_analysis_retry_permits permit
       WHERE permit.request_id=p_request_id
        AND permit.document_id=p_document_id
        AND permit.original_sha256=v_sha
        AND permit.authorized_attempt=4
        AND permit.expires_at>clock_timestamp()
      )
    )
   )$literal$;
 d text:=$literal$AND cotironda_piloto_privado.v2_original_analysis.attempt_count<3$literal$;
BEGIN
 v_due:=pg_get_functiondef('public.cotironda_piloto_v2_d016_worker_due_private(integer)'::regprocedure);
 v_claim:=pg_get_functiondef('public.cotironda_piloto_v2_d016_worker_claim_private(uuid,uuid)'::regprocedure);
 IF encode(extensions.digest(convert_to(v_due,'UTF8'),'sha256'),'hex')<>'4019e2650c358215ca80cd7c59da7b249822e2ac9262a4f586ff1512aee3c037'
 OR encode(extensions.digest(convert_to(v_claim,'UTF8'),'sha256'),'hex')<>'3467ae42600d872014b119f026ed71ba9e52e3762e45d8f10b0abc660d8715ce'
 THEN RAISE EXCEPTION 'v2_retry_rollback_live_drift';END IF;
 IF length(v_due)-length(replace(v_due,a,''))<>length(a)
 OR length(v_claim)-length(replace(v_claim,c,''))<>length(c)
 THEN RAISE EXCEPTION 'v2_retry_rollback_anchor_drift';END IF;
 v_old_due:=replace(v_due,a,b);
 v_old_claim:=replace(v_claim,c,d);
 IF encode(extensions.digest(convert_to(v_old_due,'UTF8'),'sha256'),'hex')<>'c857dbcc95b29de9cc91a1fda22d26686ac7eee792c8e5f50dd46c3ad9cf7fee'
 OR encode(extensions.digest(convert_to(v_old_claim,'UTF8'),'sha256'),'hex')<>'42b8e804a0bc52494e4c65c32ebb6004e6c07ecec8305b8d8c9f3f0037decb65'
 THEN RAISE EXCEPTION 'v2_retry_rollback_expected_hash_changed';END IF;
 EXECUTE v_old_due;
 EXECUTE v_old_claim;
 IF encode(extensions.digest(convert_to(pg_get_functiondef('public.cotironda_piloto_v2_d016_worker_due_private(integer)'::regprocedure),'UTF8'),'sha256'),'hex')<>'c857dbcc95b29de9cc91a1fda22d26686ac7eee792c8e5f50dd46c3ad9cf7fee'
 OR encode(extensions.digest(convert_to(pg_get_functiondef('public.cotironda_piloto_v2_d016_worker_claim_private(uuid,uuid)'::regprocedure),'UTF8'),'sha256'),'hex')<>'42b8e804a0bc52494e4c65c32ebb6004e6c07ecec8305b8d8c9f3f0037decb65'
 OR has_function_privilege('anon','public.cotironda_piloto_v2_d016_worker_due_private(integer)','EXECUTE')
 OR has_function_privilege('authenticated','public.cotironda_piloto_v2_d016_worker_claim_private(uuid,uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'v2_retry_rollback_postcheck_failed';END IF;
END $undo$;
