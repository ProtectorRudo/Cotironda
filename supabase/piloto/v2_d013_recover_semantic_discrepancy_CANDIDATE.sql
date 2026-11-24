-- COTIRONDA V2/D013. SOLO CANDIDATO: NO APLICAR SIN «PUBLICALO».
-- Extiende el recuperador instalado para desacuerdo entre dos lecturas
-- semánticas. Nunca reinyectar WhatsApp, inventar origen o publicar ofertas.
-- Una única fuente Whapi auténtica: AES-GCM + SHA + HMAC + idempotencia.
BEGIN;
DO $d013_guard$
DECLARE
 v_read text;v_stage text;
 v_needle text:='a.failure_code=''ia_error_de_lectura''';
 v_constraint text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM vault.decrypted_secrets
  WHERE name='cotironda_d016_pilot_project_ref'
    AND decrypted_secret='ilggkalaafhtiysyzlmg')
 THEN RAISE EXCEPTION 'D013_NOT_PILOT_PROJECT';END IF;
 IF to_regprocedure('public.cotironda_piloto_v2_d013_review_source_private()') IS NULL
 OR to_regprocedure('public.cotironda_piloto_v2_d013_recovery_stage_private(text,text,text,text,text,jsonb,jsonb)') IS NULL
 OR to_regclass('cotironda_piloto_privado.v2_d013_review_recovery_receipts') IS NULL
 THEN RAISE EXCEPTION 'D013_RECOVERY_NOT_INSTALLED';END IF;
 SELECT pg_get_functiondef(
  'public.cotironda_piloto_v2_d013_review_source_private()'::regprocedure)
 INTO v_read;
 SELECT pg_get_functiondef(
  'public.cotironda_piloto_v2_d013_recovery_stage_private(text,text,text,text,text,jsonb,jsonb)'::regprocedure)
 INTO v_stage;
 IF (length(v_read)-length(replace(v_read,v_needle,'')))/length(v_needle)<>2
  OR (length(v_stage)-length(replace(v_stage,v_needle,'')))/length(v_needle)<>1
  OR strpos(v_stage,'SELECT m.message_hmac,m.plaintext_sha256 INTO v_source')=0
  OR strpos(v_stage,'VALUES(p_message_hmac,p_source_sha256,v_request,''ia_error_de_lectura'')')=0
 THEN RAISE EXCEPTION 'D013_RECOVERY_SOURCE_DRIFTED';END IF;
 SELECT pg_get_constraintdef(c.oid) INTO v_constraint
 FROM pg_constraint c
 WHERE c.conrelid='cotironda_piloto_privado.v2_d013_review_recovery_receipts'::regclass
  AND c.conname='v2_d013_review_recovery_receipts_original_failure_code_check';
 IF v_constraint IS DISTINCT FROM 'CHECK ((original_failure_code = ''ia_error_de_lectura''::text))'
 THEN RAISE EXCEPTION 'D013_RECOVERY_CONSTRAINT_DRIFTED';END IF;
 IF has_function_privilege('anon',
  'public.cotironda_piloto_v2_d013_recovery_stage_private(text,text,text,text,text,jsonb,jsonb)','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.cotironda_piloto_v2_d013_review_source_private()','EXECUTE')
 THEN RAISE EXCEPTION 'D013_RECOVERY_UNSAFE_ACL';END IF;
END $d013_guard$;

ALTER TABLE cotironda_piloto_privado.v2_d013_review_recovery_receipts
 DROP CONSTRAINT v2_d013_review_recovery_receipts_original_failure_code_check;
ALTER TABLE cotironda_piloto_privado.v2_d013_review_recovery_receipts
 ADD CONSTRAINT v2_d013_review_recovery_receipts_original_failure_code_check
 CHECK (original_failure_code IN ('ia_error_de_lectura',
                                  'lecturas_discrepan_en_articulo'));

DO $d013_patch$
DECLARE
 v_read text;v_stage text;
 v_old text:='a.failure_code=''ia_error_de_lectura''';
 v_new text:='a.failure_code IN (''ia_error_de_lectura'',''lecturas_discrepan_en_articulo'')';
BEGIN
 SELECT pg_get_functiondef(
  'public.cotironda_piloto_v2_d013_review_source_private()'::regprocedure)
 INTO v_read;
 SELECT pg_get_functiondef(
  'public.cotironda_piloto_v2_d013_recovery_stage_private(text,text,text,text,text,jsonb,jsonb)'::regprocedure)
 INTO v_stage;
 EXECUTE replace(v_read,v_old,v_new);
 v_stage:=replace(v_stage,v_old,v_new);
 v_stage:=replace(v_stage,
  'SELECT m.message_hmac,m.plaintext_sha256 INTO v_source',
  'SELECT m.message_hmac,m.plaintext_sha256,a.failure_code INTO v_source');
 v_stage:=replace(v_stage,
  'VALUES(p_message_hmac,p_source_sha256,v_request,''ia_error_de_lectura'')',
  'VALUES(p_message_hmac,p_source_sha256,v_request,v_source.failure_code)');
 EXECUTE v_stage;
END $d013_patch$;

REVOKE ALL ON FUNCTION public.cotironda_piloto_v2_d013_review_source_private()
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_v2_d013_review_source_private()
 TO service_role;
REVOKE ALL ON FUNCTION public.cotironda_piloto_v2_d013_recovery_stage_private(
 text,text,text,text,text,jsonb,jsonb)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_v2_d013_recovery_stage_private(
 text,text,text,text,text,jsonb,jsonb) TO service_role;
COMMIT;
