-- Cotironda V2: ANÁLISIS INDIVIDUAL AUTÓNOMO, CANDIDATO NO PUBLICADO.
-- La tarea privada reutiliza SOLO el original ya identificado por SHA y
-- la asociación semántica auditada. No crea un nuevo parser de presupuesto,
-- no otorga acceso al comprador ni elimina aislamiento o consentimientos.
DO $worker_v2$
DECLARE
 old_catalog text;old_source text;new_catalog text;new_source text;
 a text:=$A$
      link.association IN ('quoted_whapi_id','single_active_round')
      OR (
       link.association='prior_supplier_preamble'$A$;
 b text:=$B$
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
 c text:=$C$
      AND bad.state IN ('ambiguous_round','media_context_conflict')$C$;
 d text:=$D$
      AND (
       bad.state='media_context_conflict'
       OR (bad.state='ambiguous_round'
           AND (link.association IS DISTINCT FROM 'semantic_unique_mvp291'
                OR bad.resolved_request_id IS DISTINCT FROM link.request_id))
      )$D$;
 e text:=$E$
   AND link.association IN (
    'quoted_whapi_id','single_active_round','prior_supplier_preamble')$E$;
 f text:=$F$
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
 g text:=$G$
      AND bad.state IN ('ambiguous_round','media_context_conflict')$G$;
 h text:=$H$
      AND (
       bad.state='media_context_conflict'
       OR (bad.state='ambiguous_round'
           AND (link.association IS DISTINCT FROM 'semantic_unique_mvp291'
                OR bad.resolved_request_id IS DISTINCT FROM link.request_id))
      )$H$;
BEGIN
 old_catalog:=pg_get_functiondef('public.cotironda_piloto_v2_d016_worker_catalog_private(uuid)'::regprocedure);
 old_source:=pg_get_functiondef('public.cotironda_piloto_v2_d016_worker_source_private(uuid,uuid)'::regprocedure);
 IF encode(extensions.digest(convert_to(old_catalog,'UTF8'),'sha256'),'hex')
   <> '84dfc3dc799820d7e7ffeafe33f6a877736f0672bc5e7a437ff18cd3423ba4e8'
 OR encode(extensions.digest(convert_to(old_source,'UTF8'),'sha256'),'hex')
   <> '9e2bd4515da1d2359757fc11cf05239dfdb663973eff73e1cdfda2b08d570147'
 THEN RAISE EXCEPTION 'v2_worker_old_source_drift';END IF;
 IF length(old_catalog)-length(replace(old_catalog,a,''))<>length(a)
 OR length(old_catalog)-length(replace(old_catalog,c,''))<>length(c)
 OR length(old_source)-length(replace(old_source,e,''))<>length(e)
 OR length(old_source)-length(replace(old_source,g,''))<>length(g)
 THEN RAISE EXCEPTION 'v2_worker_anchors_not_unique';END IF;
 new_catalog:=replace(replace(old_catalog,a,b),c,d);
 new_source:=replace(replace(old_source,e,f),g,h);
 IF encode(extensions.digest(convert_to(new_catalog,'UTF8'),'sha256'),'hex')
   <> '4794aae1506cf8d089a1450186bc7da3095d2c09f7f58af577dca0488f2bd37b'
 OR encode(extensions.digest(convert_to(new_source,'UTF8'),'sha256'),'hex')
   <> 'a6dddfeff1d04698ce6074b1274b841eb42a7a8bbce4cda3a32b57774c854093'
 OR new_catalog NOT LIKE '%v2_business_calendar%'
 OR new_catalog NOT LIKE '%participant_channels_mvp109%'
 OR new_source NOT LIKE '%v2_d016_worker_catalog_private%'
 OR new_source NOT LIKE '%source_msg.request_id=link.request_id%'
 OR new_source NOT LIKE '%a.content_sha256=link.source_sha256%'
 THEN RAISE EXCEPTION 'v2_worker_guard_drift';END IF;
 EXECUTE new_catalog;EXECUTE new_source;
 IF encode(extensions.digest(convert_to(pg_get_functiondef('public.cotironda_piloto_v2_d016_worker_catalog_private(uuid)'::regprocedure),'UTF8'),'sha256'),'hex')
   <> '4794aae1506cf8d089a1450186bc7da3095d2c09f7f58af577dca0488f2bd37b'
 OR encode(extensions.digest(convert_to(pg_get_functiondef('public.cotironda_piloto_v2_d016_worker_source_private(uuid,uuid)'::regprocedure),'UTF8'),'sha256'),'hex')
   <> 'a6dddfeff1d04698ce6074b1274b841eb42a7a8bbce4cda3a32b57774c854093'
 OR has_function_privilege('anon','public.cotironda_piloto_v2_d016_worker_catalog_private(uuid)','EXECUTE')
 OR has_function_privilege('authenticated','public.cotironda_piloto_v2_d016_worker_catalog_private(uuid)','EXECUTE')
 OR has_function_privilege('anon','public.cotironda_piloto_v2_d016_worker_source_private(uuid,uuid)','EXECUTE')
 OR has_function_privilege('authenticated','public.cotironda_piloto_v2_d016_worker_source_private(uuid,uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'v2_worker_postcheck_failed';END IF;
END $worker_v2$;

-- El worker OFFLINE usa su propio finish: mismo límite de ocho puntos que
-- el finish de portal; cada evidencia debe seguir referida al original.
DO $worker_analysis_finish$
DECLARE oldf text;newf text;
BEGIN
 oldf:=pg_get_functiondef('public.cotironda_piloto_v2_d016_worker_finish_private(uuid,uuid,uuid,text,text,jsonb,text)'::regprocedure);
 IF encode(extensions.digest(convert_to(oldf,'UTF8'),'sha256'),'hex')
   <> '2642a66841c0ced30824bac6612b6fb0616d5af4c905720ad7d978ffe31fb3e7'
 OR length(oldf)-length(replace(oldf,'jsonb_array_length(p_points) NOT BETWEEN 2 AND 4',''))<>length('jsonb_array_length(p_points) NOT BETWEEN 2 AND 4')
 THEN RAISE EXCEPTION 'v2_worker_finish_drift';END IF;
 newf:=replace(oldf,'jsonb_array_length(p_points) NOT BETWEEN 2 AND 4','jsonb_array_length(p_points) NOT BETWEEN 2 AND 8');
 IF encode(extensions.digest(convert_to(newf,'UTF8'),'sha256'),'hex')
   <> '1693e2155c4631be24211dd1300007a9f8eb0e906a43132ba0480e08ff12cb6a'
 OR newf NOT LIKE '%v2_d016_worker_source_private%'
 OR newf NOT LIKE '%job_token=p_job_token%'
 THEN RAISE EXCEPTION 'v2_worker_finish_guards_changed';END IF;
 EXECUTE newf;
 IF encode(extensions.digest(convert_to(pg_get_functiondef('public.cotironda_piloto_v2_d016_worker_finish_private(uuid,uuid,uuid,text,text,jsonb,text)'::regprocedure),'UTF8'),'sha256'),'hex')
   <> '1693e2155c4631be24211dd1300007a9f8eb0e906a43132ba0480e08ff12cb6a'
 OR has_function_privilege('anon','public.cotironda_piloto_v2_d016_worker_finish_private(uuid,uuid,uuid,text,text,jsonb,text)','EXECUTE')
 OR has_function_privilege('authenticated','public.cotironda_piloto_v2_d016_worker_finish_private(uuid,uuid,uuid,text,text,jsonb,text)','EXECUTE')
 THEN RAISE EXCEPTION 'v2_worker_finish_postcheck_failed';END IF;
END $worker_analysis_finish$;
