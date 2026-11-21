-- Cotironda V2 D016: completar la habilitación excepcional YA AUTORIZADA.
-- Hallazgo post-deploy: la CHECK del intento restringe 1..3 y bloquea la
-- transición 3->4; otra CHECK conserva límite antiguo de 4 hallazgos,
-- mientras el analizador v51 y el worker_finish ya admiten hasta 8.
-- NO cambia WhatsApp, Vault, IA, original, permisos, ningún registro.
-- El permiso y los RPC de reintento único deben existir previamente.
DO $preflight$
DECLARE c_attempt text; c_points text;
BEGIN
 SELECT pg_get_constraintdef(oid,true) INTO c_attempt
 FROM pg_constraint WHERE conrelid='cotironda_piloto_privado.v2_original_analysis'::regclass
 AND conname='v2_original_analysis_attempt_count_check';
 SELECT pg_get_constraintdef(oid,true) INTO c_points
 FROM pg_constraint WHERE conrelid='cotironda_piloto_privado.v2_original_analysis'::regclass
 AND conname='v2_original_analysis_check';
 IF c_attempt IS DISTINCT FROM 'CHECK (attempt_count >= 1 AND attempt_count <= 3)'
 OR c_points IS NULL
 OR c_points NOT LIKE '%jsonb_array_length(points) >= 2%'
 OR c_points NOT LIKE '%jsonb_array_length(points) <= 4%'
 OR c_points NOT LIKE '%status = ''ready''::text%'
 OR c_points NOT LIKE '%points IS NULL%'
 THEN RAISE EXCEPTION 'v2_retry_check_constraint_drift'; END IF;
 IF encode(extensions.digest(convert_to(pg_get_functiondef('public.cotironda_piloto_v2_d016_worker_due_private(integer)'::regprocedure),'UTF8'),'sha256'),'hex')
   <> '4019e2650c358215ca80cd7c59da7b249822e2ac9262a4f586ff1512aee3c037'
 OR encode(extensions.digest(convert_to(pg_get_functiondef('public.cotironda_piloto_v2_d016_worker_claim_private(uuid,uuid)'::regprocedure),'UTF8'),'sha256'),'hex')
   <> '3467ae42600d872014b119f026ed71ba9e52e3762e45d8f10b0abc660d8715ce'
 THEN RAISE EXCEPTION 'v2_retry_check_rpc_drift';END IF;
 IF NOT EXISTS(
 SELECT 1 FROM cotironda_piloto_privado.v2_analysis_retry_permits p
 JOIN cotironda_piloto_privado.v2_original_analysis a USING(request_id,document_id,original_sha256)
 WHERE a.request_id='facc90b9-3da9-48db-b113-563409ba9760'::uuid AND a.document_id='78e1027a-525f-4139-a59b-e470914ca9fc'::uuid
 AND a.original_sha256='d6b4be163e01a8b8d98cbc5edca11a75ee862bcb1528854d129817ea5f0ac823'
 AND a.status='review' AND a.attempt_count=3
 AND a.points IS NULL AND a.text_sha256 IS NULL
 AND p.authorized_attempt=4 AND p.attempt_count_before=3
 AND p.reason_code='v51_individual_evidence_validation'
 AND p.expires_at>clock_timestamp()
 ) THEN RAISE EXCEPTION 'v2_retry_check_permit_or_original_missing';END IF;
END $preflight$;

ALTER TABLE cotironda_piloto_privado.v2_original_analysis
 DROP CONSTRAINT v2_original_analysis_attempt_count_check,
 ADD CONSTRAINT v2_original_analysis_attempt_count_check CHECK (
   (attempt_count BETWEEN 1 AND 3)
   OR (attempt_count=4
       AND request_id='facc90b9-3da9-48db-b113-563409ba9760'::uuid
       AND document_id='78e1027a-525f-4139-a59b-e470914ca9fc'::uuid
       AND original_sha256='d6b4be163e01a8b8d98cbc5edca11a75ee862bcb1528854d129817ea5f0ac823')
 ),
 DROP CONSTRAINT v2_original_analysis_check,
 ADD CONSTRAINT v2_original_analysis_check CHECK (
   (status='ready' AND text_sha256 ~ '^[a-f0-9]{64}$'
    AND jsonb_typeof(points)='array'
    AND jsonb_array_length(points) BETWEEN 2 AND 8)
   OR (status IN ('processing','review') AND points IS NULL)
 );

DO $postcheck$
DECLARE ca text;cp text;
BEGIN
 SELECT pg_get_constraintdef(oid,true) INTO ca
 FROM pg_constraint WHERE conrelid='cotironda_piloto_privado.v2_original_analysis'::regclass
 AND conname='v2_original_analysis_attempt_count_check';
 SELECT pg_get_constraintdef(oid,true) INTO cp
 FROM pg_constraint WHERE conrelid='cotironda_piloto_privado.v2_original_analysis'::regclass
 AND conname='v2_original_analysis_check';
 IF ca IS NULL OR ca NOT LIKE '%attempt_count = 4%'
 OR ca NOT LIKE '%facc90b9-3da9-48db-b113-563409ba9760%'
 OR ca NOT LIKE '%78e1027a-525f-4139-a59b-e470914ca9fc%'
 OR ca NOT LIKE '%d6b4be163e01a8b8d98cbc5edca11a75ee862bcb1528854d129817ea5f0ac823%'
 OR cp IS NULL OR cp NOT LIKE '%jsonb_array_length(points)%'
 OR cp NOT LIKE '%8%'
 OR cp NOT LIKE '%ready%'
 OR cp NOT LIKE '%processing%'
 OR cp NOT LIKE '%review%'
 THEN RAISE EXCEPTION 'v2_retry_check_postcheck_drift'; END IF;
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='cotironda_piloto_privado.v2_original_analysis'::regclass)
 OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid='cotironda_piloto_privado.v2_analysis_retry_permits'::regclass)
 OR has_table_privilege('anon','cotironda_piloto_privado.v2_analysis_retry_permits','SELECT')
 OR has_table_privilege('authenticated','cotironda_piloto_privado.v2_analysis_retry_permits','SELECT')
 OR has_function_privilege('anon','public.cotironda_piloto_v2_d016_worker_claim_private(uuid,uuid)','EXECUTE')
 OR has_function_privilege('authenticated','public.cotironda_piloto_v2_d016_worker_claim_private(uuid,uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'v2_retry_check_privacy_drift';END IF;
END $postcheck$;
