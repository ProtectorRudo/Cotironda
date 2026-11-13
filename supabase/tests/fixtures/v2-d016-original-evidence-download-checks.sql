-- D016 guard de originales: sintético, corre DENTRO del fixture PG17 ROLLBACK.
-- Primero se verificó el comportamiento histórico; acá la protección nueva.
DO $original_gate$
DECLARE
 r uuid:='aaaaaaaa-1111-4111-8111-111111111111';
 ses text:=repeat('a',64);
 catalog jsonb; doc uuid; text_doc uuid; src jsonb;
BEGIN
 UPDATE cotironda_piloto_privado.v2_supplier_original_consents
  SET revoked_at=NULL WHERE supplier_key='supplier_a';
 UPDATE cotironda_piloto_privado.v2_d016_browser_sessions
  SET revoked_at=NULL WHERE sesion_hmac=ses;

 catalog:=public.cotironda_piloto_v2_d016_responders_private(r,ses);
 IF catalog->>'state'<>'authorized_responders_v2'
  OR jsonb_array_length(catalog->'originals')<>0
 THEN RAISE EXCEPTION 'NO_EVIDENCE_CATALOG_LEAK:%',catalog;END IF;
 IF public.cotironda_piloto_v2_d016_responders_with_analysis_private(
 r,ses)->>'total'<>'0'
 THEN RAISE EXCEPTION 'NO_EVIDENCE_ANALYSIS_LEAK';END IF;

 INSERT INTO cotironda_piloto_privado.v2_d016_original_notice_ledger(
  request_id,supplier_key,chat_hmac,notice_version,notice_body_sha256,
  reserved_at,state,whapi_message_id,api_accepted_at
 ) VALUES(r,'supplier_a',repeat('2',64),
  'cotironda-originales-v2-respuesta-20261113',
  repeat('1',64),clock_timestamp()-interval '30 hours',
  'api_accepted','wamid.AAAA1234',clock_timestamp()-interval '25 hours');

 -- Sólo aviso aceptado SIN cotización vinculada: nunca se publica.
 catalog:=public.cotironda_piloto_v2_d016_responders_private(r,ses);
 IF jsonb_array_length(catalog->'originals')<>0
 THEN RAISE EXCEPTION 'NOTICE_ONLY_CATALOG_LEAK';END IF;

 INSERT INTO cotironda_piloto_privado.v2_d016_original_reply_evidence(
  message_hmac,request_id,supplier_key,notice_whapi_message_id,
  received_at,source_sha256,association
 ) VALUES(
  repeat('d',64),r,'supplier_a','wamid.AAAA1234',
  clock_timestamp()-interval '12 hours',repeat('0',64),'quoted_whapi_id');

 catalog:=public.cotironda_piloto_v2_d016_responders_private(r,ses);
 IF jsonb_array_length(catalog->'originals')<>1
  OR catalog->'originals'->0->>'supplierName'<>'Corralón Oriente'
 THEN RAISE EXCEPTION 'REAL_PROOF_AND_CONSENT_NOT_VISIBLE:%',catalog;END IF;
 SELECT (v->>'documentId')::uuid INTO doc
 FROM jsonb_array_elements(catalog->'originals') AS v
 WHERE v->>'mime'='application/pdf';
 IF doc IS NULL THEN RAISE EXCEPTION 'EXPECTED_PDF_MISSING';END IF;
 src:=public.cotironda_piloto_v2_d016_original_source_private(r,ses,doc);
 IF src->>'state'<>'authorized_original_v2'
  OR src->>'sha256'<>repeat('0',64)
 THEN RAISE EXCEPTION 'PROVEN_PDF_DENIED:%',src;END IF;

 -- La evidencia válida y el consentimiento V2 son DOS requisitos distintos.
 UPDATE cotironda_piloto_privado.v2_supplier_original_consents
 SET revoked_at=clock_timestamp() WHERE supplier_key='supplier_a';
 IF public.cotironda_piloto_v2_d016_original_source_private(r,ses,doc)
 IS NOT NULL THEN RAISE EXCEPTION 'OLD_CONSENT_REVOKED_PDF_LEAK';END IF;
 UPDATE cotironda_piloto_privado.v2_supplier_original_consents
 SET revoked_at=NULL WHERE supplier_key='supplier_a';

 -- Un SHA de evidencia diferente del SHA original bloquea catálogos/fuentes.
 UPDATE cotironda_piloto_privado.v2_d016_original_reply_evidence
 SET source_sha256=repeat('f',64) WHERE message_hmac=repeat('d',64);
 catalog:=public.cotironda_piloto_v2_d016_responders_private(r,ses);
 IF jsonb_array_length(catalog->'originals')<>0
 THEN RAISE EXCEPTION 'FORGED_SHA_CATALOG_LEAK';END IF;
 UPDATE cotironda_piloto_privado.v2_d016_original_reply_evidence
 SET source_sha256=repeat('0',64) WHERE message_hmac=repeat('d',64);

 -- PDF y texto tienen chequeos separados; sin evidencia TEXT original
 -- el texto tampoco puede salir ni entrar al worker de análisis.
 INSERT INTO cotironda_piloto_privado.v2_d016_original_reply_evidence(
  message_hmac,request_id,supplier_key,notice_whapi_message_id,
  received_at,source_sha256,association
 ) VALUES(
  repeat('0',64),r,'supplier_a','wamid.AAAA1234',
  clock_timestamp()-interval '6 hours',repeat('6',64),'quoted_whapi_id');
 catalog:=public.cotironda_piloto_v2_d016_responders_private(r,ses);
 IF jsonb_array_length(catalog->'originals')<>2
 THEN RAISE EXCEPTION 'PROVEN_PDF_TEXT_COUNT:%',catalog;END IF;
 SELECT (v->>'documentId')::uuid INTO text_doc
 FROM jsonb_array_elements(catalog->'originals') AS v
 WHERE v->>'kind'='text';
 IF text_doc IS NULL THEN RAISE EXCEPTION 'PROVEN_TEXT_ID_MISSING';END IF;
 src:=public.cotironda_piloto_v2_d016_original_source_private(
  r,ses,text_doc);
 IF src->>'state'<>'authorized_text_v2' OR
 src->>'sha256'<>repeat('6',64)
 THEN RAISE EXCEPTION 'PROVEN_TEXT_DENIED';END IF;

 -- Una baja posterior por WhatsApp prevalece, incluso con sesión activa.
 INSERT INTO cotironda_piloto_privado.v2_d016_original_notice_revocations
 VALUES(r,'supplier_a',repeat('c',64),clock_timestamp());
 catalog:=public.cotironda_piloto_v2_d016_responders_private(r,ses);
 IF jsonb_array_length(catalog->'originals')<>0
 THEN RAISE EXCEPTION 'OPT_OUT_CATALOG_LEAK';END IF;
 IF public.cotironda_piloto_v2_d016_original_source_private(r,ses,doc)
 IS NOT NULL OR
 public.cotironda_piloto_v2_d016_original_source_private(r,ses,text_doc)
 IS NOT NULL THEN RAISE EXCEPTION 'OPT_OUT_SOURCE_LEAK';END IF;
 IF public.cotironda_piloto_v2_d016_record_download_private(
  r,ses,doc,repeat('0',64),1234) IS DISTINCT FROM false
 OR public.cotironda_piloto_v2_d016_record_text_download_private(
  r,ses,text_doc,repeat('6',64),120) IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'OPT_OUT_AUDIT_LEAK';END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.v2_d016_original_download_audit)<>2
 THEN RAISE EXCEPTION 'OPT_OUT_ADDED_DOWNLOADS';END IF;

 IF has_function_privilege('anon',
  'public.cotironda_piloto_v2_d016_responders_private(uuid,text)','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.cotironda_piloto_v2_d016_original_source_private(uuid,text,uuid)','EXECUTE')
 OR NOT has_function_privilege('service_role',
  'public.cotironda_piloto_v2_d016_original_source_private(uuid,text,uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'PUBLIC_SOURCE_PERMISSION';END IF;
 RAISE NOTICE 'D016_PORTAL_ORIGINAL_EVIDENCE_GUARD_PG17_PASS';
END $original_gate$;
