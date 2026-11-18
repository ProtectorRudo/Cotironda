-- Cotironda D016 rollback-only. NO ejecutar si el cuarto intento ya ocurrió:
-- haría inválido el registro histórico. Nunca se modifica attempt_count.
DO $precheck$
DECLARE a text;p text;
BEGIN
 SELECT pg_get_constraintdef(oid,true) INTO a FROM pg_constraint
 WHERE conrelid='cotironda_piloto_privado.v2_original_analysis'::regclass
 AND conname='v2_original_analysis_attempt_count_check';
 SELECT pg_get_constraintdef(oid,true) INTO p FROM pg_constraint
 WHERE conrelid='cotironda_piloto_privado.v2_original_analysis'::regclass
 AND conname='v2_original_analysis_check';
 IF a NOT LIKE '%attempt_count = 4%' OR
    a NOT LIKE '%facc90b9-3da9-48db-b113-563409ba9760%' OR
    p NOT LIKE '%jsonb_array_length(points)%' OR p NOT LIKE '%8%'
 THEN RAISE EXCEPTION 'v2_retry_check_rollback_drift';END IF;
 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.v2_original_analysis WHERE attempt_count>3)
 THEN RAISE EXCEPTION 'v2_retry_check_rollback_would_destroy_history';END IF;
END $precheck$;
ALTER TABLE cotironda_piloto_privado.v2_original_analysis
 DROP CONSTRAINT v2_original_analysis_attempt_count_check,
 ADD CONSTRAINT v2_original_analysis_attempt_count_check CHECK (attempt_count>=1 AND attempt_count<=3),
 DROP CONSTRAINT v2_original_analysis_check,
 ADD CONSTRAINT v2_original_analysis_check CHECK (
  (status='ready' AND text_sha256 ~ '^[a-f0-9]{64}$'
  AND jsonb_typeof(points)='array' AND jsonb_array_length(points) BETWEEN 2 AND 4)
  OR (status IN ('processing','review') AND points IS NULL)
 );
