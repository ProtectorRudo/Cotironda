-- Cotironda V2 D016: permiso excepcional para UN reintento auditado.
-- SOLO CANDIDATO. NO ejecutar hasta la orden explícita "Publicalo".
-- Reutiliza el worker v51 vigente y la ronda ya asociada; no invoca WhatsApp,
-- no rehace la lectura ni reabre el documento. Conserva los 3 intentos y suma
-- uno cuarto atómico si el cron de Vault lo reclama a tiempo.
-- No asigna permisos al navegador ni a usuarios públicos.
DO $preflight$
DECLARE
 v_due text;
 v_claim text;
 v_source jsonb;
 v_eligible integer;
BEGIN
 IF to_regclass('cotironda_piloto_privado.v2_analysis_retry_permits') IS NOT NULL
 THEN RAISE EXCEPTION 'v2_retry_ledger_already_exists'; END IF;
 v_due:=pg_get_functiondef('public.cotironda_piloto_v2_d016_worker_due_private(integer)'::regprocedure);
 v_claim:=pg_get_functiondef('public.cotironda_piloto_v2_d016_worker_claim_private(uuid,uuid)'::regprocedure);
 IF encode(extensions.digest(convert_to(v_due,'UTF8'),'sha256'),'hex')<>'c857dbcc95b29de9cc91a1fda22d26686ac7eee792c8e5f50dd46c3ad9cf7fee'
 OR encode(extensions.digest(convert_to(v_claim,'UTF8'),'sha256'),'hex')<>'42b8e804a0bc52494e4c65c32ebb6004e6c07ecec8305b8d8c9f3f0037decb65'
 THEN RAISE EXCEPTION 'v2_retry_live_rpc_drift'; END IF;
 v_source:=public.cotironda_piloto_v2_d016_worker_source_private('facc90b9-3da9-48db-b113-563409ba9760'::uuid,'78e1027a-525f-4139-a59b-e470914ca9fc'::uuid);
 IF v_source IS NULL OR v_source->>'state'<>'internal_original_v2'
 OR v_source->>'requestId'<>'facc90b9-3da9-48db-b113-563409ba9760'
 OR v_source->>'documentId'<>'78e1027a-525f-4139-a59b-e470914ca9fc'
 OR v_source->>'sha256'<>'d6b4be163e01a8b8d98cbc5edca11a75ee862bcb1528854d129817ea5f0ac823'
 THEN RAISE EXCEPTION 'v2_retry_source_not_verified'; END IF;
 SELECT count(*) INTO v_eligible FROM cotironda_piloto_privado.v2_original_analysis a
 WHERE a.request_id='facc90b9-3da9-48db-b113-563409ba9760'::uuid
 AND a.document_id='78e1027a-525f-4139-a59b-e470914ca9fc'::uuid
 AND a.original_sha256='d6b4be163e01a8b8d98cbc5edca11a75ee862bcb1528854d129817ea5f0ac823'
 AND a.status='review'
 AND a.attempt_count=3
 AND a.points IS NULL AND a.text_sha256 IS NULL
 AND a.updated_at<clock_timestamp()-interval '5 minutes';
 IF v_eligible<>1 THEN RAISE EXCEPTION 'v2_retry_not_exactly_one_failed_job';END IF;
END $preflight$;

CREATE TABLE cotironda_piloto_privado.v2_analysis_retry_permits(
 request_id uuid NOT NULL,
 document_id uuid NOT NULL,
 original_sha256 text NOT NULL CHECK(original_sha256 ~ '^[a-f0-9]{64}$'),
 authorized_attempt smallint NOT NULL CHECK(authorized_attempt=4),
 attempt_count_before smallint NOT NULL CHECK(attempt_count_before=3),
 reason_code text NOT NULL CHECK(reason_code='v51_individual_evidence_validation'),
 release_sha text NOT NULL CHECK(release_sha ~ '^[0-9a-f]{40}$'),
 granted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 PRIMARY KEY(request_id,document_id),
 CHECK(expires_at>granted_at AND expires_at<=granted_at+interval '90 minutes')
);
ALTER TABLE cotironda_piloto_privado.v2_analysis_retry_permits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE cotironda_piloto_privado.v2_analysis_retry_permits
 FROM PUBLIC,anon,authenticated,service_role;
-- Ledger privado sin políticas RLS; únicamente la función SQL preexistente,
-- bajo su propietario postgres y su ACL service_role previa, puede leerlo.
-- Una fila con expiración corta. NO se reinicia ni borra attempt_count.
INSERT INTO cotironda_piloto_privado.v2_analysis_retry_permits(
 request_id,document_id,original_sha256,authorized_attempt,attempt_count_before,
 reason_code,release_sha,granted_at,expires_at
) VALUES (
 'facc90b9-3da9-48db-b113-563409ba9760'::uuid,'78e1027a-525f-4139-a59b-e470914ca9fc'::uuid,
 'd6b4be163e01a8b8d98cbc5edca11a75ee862bcb1528854d129817ea5f0ac823',4,3,
 'v51_individual_evidence_validation',
 'ef8fdb525af56f3fc0003ede6c72ab26ca44cc06',
 clock_timestamp(),clock_timestamp()+interval '75 minutes'
);

DO $patch$
DECLARE v_due text;v_claim text;v_new_due text;v_new_claim text;
 a text:=$literal$a.status='ready' OR a.attempt_count>=3 OR$literal$;
 b text:=$literal$a.status='ready' OR (a.attempt_count>=3 AND NOT (
        a.attempt_count=3 AND a.status='review' AND EXISTS (
         SELECT 1 FROM cotironda_piloto_privado.v2_analysis_retry_permits permit
         WHERE permit.request_id=a.request_id
          AND permit.document_id=a.document_id
          AND permit.original_sha256=a.original_sha256
          AND permit.authorized_attempt=4
          AND permit.expires_at>clock_timestamp()
        )
       )) OR$literal$;
 c text:=$literal$AND cotironda_piloto_privado.v2_original_analysis.attempt_count<3$literal$;
 d text:=$literal$AND (
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
BEGIN
 v_due:=pg_get_functiondef('public.cotironda_piloto_v2_d016_worker_due_private(integer)'::regprocedure);
 v_claim:=pg_get_functiondef('public.cotironda_piloto_v2_d016_worker_claim_private(uuid,uuid)'::regprocedure);
 IF encode(extensions.digest(convert_to(v_due,'UTF8'),'sha256'),'hex')<>'c857dbcc95b29de9cc91a1fda22d26686ac7eee792c8e5f50dd46c3ad9cf7fee'
 OR encode(extensions.digest(convert_to(v_claim,'UTF8'),'sha256'),'hex')<>'42b8e804a0bc52494e4c65c32ebb6004e6c07ecec8305b8d8c9f3f0037decb65'
 THEN RAISE EXCEPTION 'v2_retry_before_patch_drift';END IF;
 IF (length(v_due)-length(replace(v_due,a,'')))<>length(a)
 OR (length(v_claim)-length(replace(v_claim,c,'')))<>length(c)
 THEN RAISE EXCEPTION 'v2_retry_anchors_not_unique';END IF;
 v_new_due:=replace(v_due,a,b);
 v_new_claim:=replace(v_claim,c,d);
 IF encode(extensions.digest(convert_to(v_new_due,'UTF8'),'sha256'),'hex')<>'4019e2650c358215ca80cd7c59da7b249822e2ac9262a4f586ff1512aee3c037'
 OR encode(extensions.digest(convert_to(v_new_claim,'UTF8'),'sha256'),'hex')<>'3467ae42600d872014b119f026ed71ba9e52e3762e45d8f10b0abc660d8715ce'
 OR v_new_due NOT LIKE '%v2_d016_worker_source_private%'
 OR v_new_due NOT LIKE '%v2_business_policy%'
 OR v_new_claim NOT LIKE '%status=''processing''%'
 OR v_new_claim NOT LIKE '%attempt_count+1%'
 THEN RAISE EXCEPTION 'v2_retry_candidate_hash_or_guard_changed';END IF;
 EXECUTE v_new_due;
 EXECUTE v_new_claim;
 IF encode(extensions.digest(convert_to(pg_get_functiondef('public.cotironda_piloto_v2_d016_worker_due_private(integer)'::regprocedure),'UTF8'),'sha256'),'hex')<>'4019e2650c358215ca80cd7c59da7b249822e2ac9262a4f586ff1512aee3c037'
 OR encode(extensions.digest(convert_to(pg_get_functiondef('public.cotironda_piloto_v2_d016_worker_claim_private(uuid,uuid)'::regprocedure),'UTF8'),'sha256'),'hex')<>'3467ae42600d872014b119f026ed71ba9e52e3762e45d8f10b0abc660d8715ce'
 OR has_function_privilege('anon','public.cotironda_piloto_v2_d016_worker_due_private(integer)','EXECUTE')
 OR has_function_privilege('authenticated','public.cotironda_piloto_v2_d016_worker_due_private(integer)','EXECUTE')
 OR has_function_privilege('anon','public.cotironda_piloto_v2_d016_worker_claim_private(uuid,uuid)','EXECUTE')
 OR has_function_privilege('authenticated','public.cotironda_piloto_v2_d016_worker_claim_private(uuid,uuid)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.cotironda_piloto_v2_d016_worker_due_private(integer)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.cotironda_piloto_v2_d016_worker_claim_private(uuid,uuid)','EXECUTE')
 OR has_table_privilege('anon','cotironda_piloto_privado.v2_analysis_retry_permits','SELECT')
 OR has_table_privilege('authenticated','cotironda_piloto_privado.v2_analysis_retry_permits','SELECT')
 THEN RAISE EXCEPTION 'v2_retry_postcheck_failed';END IF;
END $patch$;
