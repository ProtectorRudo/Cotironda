-- Cotironda V2 D016 CANDIDATE: automated individual analysis under
-- a PRIVATE WhatsApp session, NEVER a fabricated GoTrue JWT.
-- DEPENDS on v2_04b_analisis_original_idempotente_privado.sql and
-- v2_d016_respuestas_y_originales_CANDIDATE.sql. OFF until Publicalo.
-- Reuses the original's lease, quota and exact-source evidence checks.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_v2_d016_analysis_claim_private(
 p_request_id uuid,p_sesion_hmac text,p_document_id uuid
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO ''
AS $claim$
DECLARE v_source jsonb; v_token uuid; v_sha text;
BEGIN
 v_source:=public.cotironda_piloto_v2_d016_original_source_private(
  p_request_id,p_sesion_hmac,p_document_id);
 IF v_source IS NULL OR v_source->>'state' NOT IN('authorized_original_v2','authorized_text_v2')
 THEN RETURN NULL;END IF;
 v_sha:=v_source->>'sha256';
 INSERT INTO cotironda_piloto_privado.v2_original_analysis(
  request_id,document_id,original_sha256,status,job_token,lease_until)
 VALUES(p_request_id,p_document_id,v_sha,'processing',
        gen_random_uuid(),clock_timestamp()+interval '90 seconds')
 ON CONFLICT(request_id,document_id) DO UPDATE
 SET job_token=gen_random_uuid(),
     attempt_count=cotironda_piloto_privado.v2_original_analysis.attempt_count+1,
     status='processing',
     text_sha256=NULL,
     points=NULL,
     lease_until=clock_timestamp()+interval '90 seconds',
     updated_at=clock_timestamp()
 WHERE (
    (cotironda_piloto_privado.v2_original_analysis.status='processing'
     AND cotironda_piloto_privado.v2_original_analysis.lease_until<clock_timestamp())
    OR
    (cotironda_piloto_privado.v2_original_analysis.status='review'
     AND cotironda_piloto_privado.v2_original_analysis.updated_at<
       clock_timestamp()-interval '5 minutes')
   )
   AND cotironda_piloto_privado.v2_original_analysis.attempt_count<3
   AND cotironda_piloto_privado.v2_original_analysis.original_sha256=v_sha
 RETURNING job_token INTO v_token;
 IF v_token IS NULL THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('state','analysis_claimed_v2',
  'jobToken',v_token::text,'sourceSha256',v_sha);
END $claim$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_v2_d016_analysis_claim_private(uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_v2_d016_analysis_claim_private(uuid,text,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_v2_d016_analysis_finish_private(
 p_request_id uuid,p_sesion_hmac text,
 p_document_id uuid,p_job_token uuid,p_source_sha256 text,
 p_text_sha256 text,p_points jsonb,p_status text
) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO ''
AS $finish$
DECLARE v_src jsonb; v_point jsonb; v_total integer;
BEGIN
 IF p_job_token IS NULL OR p_source_sha256 !~ '^[a-f0-9]{64}$'
 OR p_status NOT IN('ready','review')
 THEN RETURN false;END IF;
 v_src:=public.cotironda_piloto_v2_d016_original_source_private(
  p_request_id,p_sesion_hmac,p_document_id);
 IF v_src IS NULL OR v_src->>'state' NOT IN('authorized_original_v2','authorized_text_v2')
 OR v_src->>'sha256'<>p_source_sha256 THEN RETURN false;END IF;
 IF p_status='ready' THEN
  IF p_text_sha256 IS NULL OR p_text_sha256 !~ '^[a-f0-9]{64}$'
  OR jsonb_typeof(p_points)<>'array' OR
   jsonb_array_length(p_points) NOT BETWEEN 2 AND 4 THEN RETURN false;END IF;
  FOR v_point IN SELECT value FROM jsonb_array_elements(p_points) LOOP
   IF jsonb_typeof(v_point)<>'object'
   OR length(v_point->>'categoria') NOT BETWEEN 3 AND 40
   OR v_point->>'categoria' NOT IN(
    'cobertura','precio','iva','flete','forma_pago','plazo',
    'disponibilidad','material','presentacion','aclaracion')
   OR length(v_point->>'evidencia') NOT BETWEEN 6 AND 180
   OR length(v_point->>'observacion') NOT BETWEEN 12 AND 240
   OR v_point->>'observacion' ~ '[<>]'
   OR v_point->>'observacion' ~* '[a-z0-9._%+-]+@[a-z0-9.-]+'
   THEN RETURN false; END IF;
  END LOOP;
 ELSE
  IF p_points IS NOT NULL OR p_text_sha256 IS NOT NULL THEN RETURN false;END IF;
 END IF;
 UPDATE cotironda_piloto_privado.v2_original_analysis
 SET status=p_status,points=p_points,text_sha256=p_text_sha256,
  updated_at=clock_timestamp()
 WHERE request_id=p_request_id AND document_id=p_document_id
 AND original_sha256=p_source_sha256 AND job_token=p_job_token
 AND status='processing' AND lease_until>=clock_timestamp();
 RETURN FOUND;
END $finish$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_v2_d016_analysis_finish_private(uuid,text,uuid,uuid,text,text,jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_v2_d016_analysis_finish_private(uuid,text,uuid,uuid,text,text,jsonb,text) TO service_role;
