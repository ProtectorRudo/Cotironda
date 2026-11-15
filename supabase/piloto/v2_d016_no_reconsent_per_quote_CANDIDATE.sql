-- COTIRONDA V2. CANDIDATE ONLY: no per-quote authorization or extra notice.
-- Publishes original only with a verified one-time, prior, unrevoked supplier
-- consent from authenticated WhatsApp and the existing V2 original policy ON.
-- Never interprets simply quoting or registration as authorization.
-- The original remains the source of truth; AI fidelity checks do not block
-- storage or read of the intact original once sharing is authorized.
-- This only removes the duplicate D016 reply-notice evidence requirement.
DO $patch$
DECLARE v_sql text;v_before text;v_after text;v_start int;v_end int;
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO STRICT v_before
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='cotironda_piloto_v2_d016_responders_private';
 IF md5(v_before)<>'993744679c3ac20eba9a7ae845580e79'
 THEN RAISE EXCEPTION 'v2_responders_source_drift';END IF;
 v_start:=strpos(v_before,'    -- Segundo comprobante independiente.');
 v_end:=strpos(v_before,'    AND link.source_sha256');
 IF v_start<1 OR v_end<=v_start
 THEN RAISE EXCEPTION 'v2_responders_evidence_boundaries_changed';END IF;
 v_sql:=substr(v_before,1,v_start-1)
   ||E'    -- Un solo consentimiento al alta. SIN confirmación por respuesta.\n'
   ||substr(v_before,v_end);
 IF strpos(v_sql,'JOIN cotironda_piloto_privado.v2_supplier_original_consents c')=0
 OR strpos(v_sql,'AND c.revoked_at IS NULL')=0
 OR strpos(v_sql,'AND c.accepted_at<=inv.created_at')=0
 OR strpos(v_sql,'AND a.content_sha256=link.source_sha256')=0
 THEN RAISE EXCEPTION 'v2_responders_critical_guards_missing';END IF;
 EXECUTE v_sql;
 SELECT pg_get_functiondef(p.oid) INTO STRICT v_after
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='cotironda_piloto_v2_d016_original_source_private';
 IF md5(v_after)<>'b0e49ded293ebd2c45904c34b1d5d3e8'
 THEN RAISE EXCEPTION 'v2_source_function_drift';END IF;
 v_start:=strpos(v_after,'  -- La fuente puede haber quedado revocada');
 v_end:=strpos(v_after,'  RETURN v_catalog;',v_start);
 IF v_start<1 OR v_end<=v_start
 THEN RAISE EXCEPTION 'v2_source_evidence_boundaries_changed';END IF;
 v_sql:=substr(v_after,1,v_start-1)
  ||E'  -- La autorización única revocable se comprueba en el catálogo y la fuente.\n'
  ||substr(v_after,v_end);
 IF strpos(v_sql,'v2_supplier_original_consents c')=0
 OR strpos(v_sql,'c.revoked_at IS NULL')=0
 OR strpos(v_sql,'c.accepted_at<=inv.created_at')=0
 OR strpos(v_sql,'a.content_sha256=link.source_sha256')=0
 THEN RAISE EXCEPTION 'v2_original_source_critical_guards_missing';END IF;
 EXECUTE v_sql;
 IF has_function_privilege('anon',
  'public.cotironda_piloto_v2_d016_responders_private(uuid,text)','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.cotironda_piloto_v2_d016_responders_private(uuid,text)','EXECUTE')
 OR has_function_privilege('anon',
  'public.cotironda_piloto_v2_d016_original_source_private(uuid,text,uuid)','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.cotironda_piloto_v2_d016_original_source_private(uuid,text,uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'v2_security_rpc_acl_regression';END IF;
END $patch$;
