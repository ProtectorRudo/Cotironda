-- Cotironda V2-04b: guia de cada original privado; install ONLY with Publicalo.
-- Depends V2-03a responders_private and V2-03b original_source_private.
-- Feature flags V2-03 OFF and analysis HTTP OFF until authorized.
CREATE TABLE cotironda_piloto_privado.v2_original_analysis (
 request_id uuid NOT NULL REFERENCES cotironda_piloto_privado.requests(id),
 document_id uuid NOT NULL,
 original_sha256 text NOT NULL CHECK(original_sha256 ~ '^[a-f0-9]{64}$'),
 text_sha256 text,
 status text NOT NULL CHECK(status IN ('processing','ready','review')),
 attempt_count integer NOT NULL DEFAULT 1 CHECK(attempt_count BETWEEN 1 AND 3),
 job_token uuid NOT NULL DEFAULT gen_random_uuid(),
 lease_until timestamptz NOT NULL,
 points jsonb,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(request_id,document_id),
 CHECK (
 (status='ready' AND text_sha256 ~ '^[a-f0-9]{64}$'
  AND jsonb_typeof(points)='array' AND jsonb_array_length(points) BETWEEN 2 AND 4)
 OR (status IN ('processing','review') AND points IS NULL)
 )
);
ALTER TABLE cotironda_piloto_privado.v2_original_analysis ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.v2_original_analysis
 FROM PUBLIC,anon,authenticated,service_role;
-- No direct database client SELECT/INSERT, even with service_role.
-- All state changes and reads go through authenticated, restricted RPCs.

-- Claim a 90-second job in an atomic UPSERT; maximum 3 model attempts.
-- Revalidates real buyer session, document bytes SHA and LIVE consent using
-- the V2-03b source RPC. No claim on old ambiguous or unconsented originals.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_v2_analysis_claim_private(
 p_request_id uuid,p_auth_user_id uuid,p_auth_session_id uuid,p_document_id uuid
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO ''
AS $claim$
DECLARE v_source jsonb; v_token uuid; v_sha text;
BEGIN
 v_source:=public.cotironda_piloto_v2_original_source_private(
  p_request_id,p_auth_user_id,p_auth_session_id,p_document_id);
 IF v_source IS NULL OR v_source->>'state'<>'authorized_original_v2'
 THEN RETURN NULL;END IF;
 v_sha:=v_source->>'sha256';
 INSERT INTO cotironda_piloto_privado.v2_original_analysis(
  request_id,document_id,original_sha256,status,job_token,lease_until)
 VALUES(p_request_id,p_document_id,v_sha,'processing',
        gen_random_uuid(),clock_timestamp()+interval '90 seconds')
 ON CONFLICT(request_id,document_id) DO UPDATE
 SET job_token=gen_random_uuid(),
     attempt_count=cotironda_piloto_privado.v2_original_analysis.attempt_count+1,
     lease_until=clock_timestamp()+interval '90 seconds',
     updated_at=clock_timestamp()
 WHERE cotironda_piloto_privado.v2_original_analysis.status='processing'
   AND cotironda_piloto_privado.v2_original_analysis.lease_until<clock_timestamp()
   AND cotironda_piloto_privado.v2_original_analysis.attempt_count<3
   AND cotironda_piloto_privado.v2_original_analysis.original_sha256=v_sha
 RETURNING job_token INTO v_token;
 IF v_token IS NULL THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('state','analysis_claimed_v2',
  'jobToken',v_token::text,'sourceSha256',v_sha);
END $claim$;
REVOKE ALL ON FUNCTION
 public.cotironda_piloto_v2_analysis_claim_private(uuid,uuid,uuid,uuid)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_v2_analysis_claim_private(uuid,uuid,uuid,uuid)
 TO service_role;

-- Complete a claimed job only if buyer Auth and supplier consent are
-- CURRENTLY still valid; read-only review state on unsupported files.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_v2_analysis_finish_private(
 p_request_id uuid,p_auth_user_id uuid,p_auth_session_id uuid,
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
 v_src:=public.cotironda_piloto_v2_original_source_private(
  p_request_id,p_auth_user_id,p_auth_session_id,p_document_id);
 IF v_src IS NULL OR v_src->>'state'<>'authorized_original_v2'
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
REVOKE ALL ON FUNCTION
 public.cotironda_piloto_v2_analysis_finish_private(
  uuid,uuid,uuid,uuid,uuid,text,text,jsonb,text)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_v2_analysis_finish_private(
  uuid,uuid,uuid,uuid,uuid,text,text,jsonb,text)
 TO service_role;

-- Wrap the existing Auth-protected catalog. No pending invitations or extra
-- supplier can leak: only decorate an original the private catalog returned.
-- Re-check original-source consent before showing a stored summary.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_v2_responders_with_analysis_private(
 p_request_id uuid,p_auth_user_id uuid,p_auth_session_id uuid
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $listing$
DECLARE v_catalog jsonb; v_items jsonb:='[]'::jsonb;
 v_entry jsonb;v_source jsonb;v_summary record;
BEGIN
 v_catalog:=public.cotironda_piloto_v2_responders_private(
  p_request_id,p_auth_user_id,p_auth_session_id);
 IF v_catalog IS NULL OR v_catalog->>'state'<>'authorized_responders_v2'
 OR jsonb_typeof(v_catalog->'originals')<>'array' THEN RETURN NULL;END IF;
 FOR v_entry IN SELECT value FROM jsonb_array_elements(v_catalog->'originals') LOOP
  v_source:=public.cotironda_piloto_v2_original_source_private(
   p_request_id,p_auth_user_id,p_auth_session_id,
   (v_entry->>'documentId')::uuid);
  IF v_source IS NULL OR v_source->>'state'<>'authorized_original_v2'
  THEN RETURN NULL;END IF;
  SELECT status,original_sha256,points,text_sha256
   INTO v_summary
  FROM cotironda_piloto_privado.v2_original_analysis
  WHERE request_id=p_request_id AND
   document_id=(v_entry->>'documentId')::uuid
   AND original_sha256=v_source->>'sha256'
   AND status='ready'
  LIMIT 1;
  IF FOUND THEN
   v_entry:=v_entry||jsonb_build_object('analysis',jsonb_build_object(
    'state','ready','points',v_summary.points));
  END IF;
  v_items:=v_items||jsonb_build_array(v_entry);
 END LOOP;
 RETURN jsonb_set(v_catalog,'{originals}',v_items);
END $listing$;
REVOKE ALL ON FUNCTION
 public.cotironda_piloto_v2_responders_with_analysis_private(uuid,uuid,uuid)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_v2_responders_with_analysis_private(uuid,uuid,uuid)
 TO service_role;
