-- D016: PG17 fixture dentro del BEGIN/ROLLBACK de v2-03-respondedores.
-- Conserva el catálogo original con 0/1/+ documentos; no crea Auth falsa.
DO $d016_resp$
DECLARE
 old_catalog jsonb;new_catalog jsonb;old_source jsonb;new_source jsonb;
 old_text jsonb;new_text jsonb;text_doc uuid;
 analysis_claim jsonb;analysis_points jsonb;with_analysis jsonb;
 doc uuid;session_hmac text:=repeat('a',64);
BEGIN
 -- V2-14 revocó consentimiento al terminar; devolverlo en fixture
 -- sintético para contrastar la MISMA fuente contra Auth anterior.
 UPDATE cotironda_piloto_privado.v2_supplier_original_consents
 SET revoked_at=NULL WHERE supplier_key='supplier_a';

 IF public.cotironda_piloto_v2_d016_responders_private(
   'aaaaaaaa-1111-4111-8111-111111111111',session_hmac) IS NOT NULL
 THEN RAISE EXCEPTION 'd016_catalog_without_session';END IF;

 IF public.cotironda_piloto_v2_d016_issue_ticket_private(
  repeat('9',64),'buyer_a',
  'aaaaaaaa-1111-4111-8111-111111111111',repeat('1',64))
 IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'd016_ticket_issue_failed';END IF;

 IF public.cotironda_piloto_v2_d016_claim_session_private(
  repeat('9',64),session_hmac) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'd016_session_claim_failed';END IF;
 old_catalog:=public.cotironda_piloto_v2_responders_private(
  'aaaaaaaa-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 new_catalog:=public.cotironda_piloto_v2_d016_responders_private(
  'aaaaaaaa-1111-4111-8111-111111111111',session_hmac);
 IF old_catalog IS NULL OR new_catalog IS NULL
  OR new_catalog->>'state'<>'authorized_responders_v2'
  OR jsonb_array_length(new_catalog->'originals')<1
  OR new_catalog->'originals'<>old_catalog->'originals'
 THEN RAISE EXCEPTION 'd016_catalog_diverged_from_original_auth';END IF;

 SELECT (value->>'documentId')::uuid INTO doc
 FROM jsonb_array_elements(new_catalog->'originals')
 WHERE value->>'mime'='application/pdf' LIMIT 1;
 IF doc IS NULL THEN RAISE EXCEPTION 'd016_pdf_not_available';END IF;
 old_source:=public.cotironda_piloto_v2_original_source_private(
  'aaaaaaaa-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',doc);
 new_source:=public.cotironda_piloto_v2_d016_original_source_private(
  'aaaaaaaa-1111-4111-8111-111111111111',session_hmac,doc);
 IF old_source IS NULL OR new_source IS NULL
 OR new_source->>'state'<>'authorized_original_v2'
 OR new_source->>'sha256'<>old_source->>'sha256'
 OR new_source->>'path'<>old_source->>'path'
 OR new_source->>'supplierKey'<>old_source->>'supplierKey'
 THEN RAISE EXCEPTION 'd016_source_not_equivalent';END IF;

-- D016 analysis: no SMS, misma fuente SHA y consentimiento original.
 DELETE FROM cotironda_piloto_privado.v2_original_analysis
 WHERE request_id='aaaaaaaa-1111-4111-8111-111111111111'
  AND document_id=doc;
 IF public.cotironda_piloto_v2_d016_analysis_claim_private(
   'aaaaaaaa-1111-4111-8111-111111111111',repeat('b',64),doc)
 IS NOT NULL THEN RAISE EXCEPTION 'd016_analysis_claim_without_session';END IF;
 IF public.cotironda_piloto_v2_d016_analysis_claim_private(
   'bbbbbbbb-2222-4222-8222-222222222222',session_hmac,doc)
 IS NOT NULL THEN RAISE EXCEPTION 'd016_analysis_claim_cross_round';END IF;
 analysis_claim:=public.cotironda_piloto_v2_d016_analysis_claim_private(
  'aaaaaaaa-1111-4111-8111-111111111111',session_hmac,doc);
 IF analysis_claim->>'state'<>'analysis_claimed_v2'
  OR analysis_claim->>'sourceSha256'<>new_source->>'sha256'
 THEN RAISE EXCEPTION 'd016_analysis_claim_bad:%',analysis_claim;END IF;
 IF public.cotironda_piloto_v2_d016_analysis_claim_private(
  'aaaaaaaa-1111-4111-8111-111111111111',session_hmac,doc) IS NOT NULL
 THEN RAISE EXCEPTION 'd016_analysis_double_cost';END IF;
 analysis_points:=jsonb_build_array(
  jsonb_build_object('categoria','material',
   'evidencia','Cemento Portland 50 kg',
   'observacion','La presentación requiere comprobar la equivalencia de bolsas.'),
  jsonb_build_object('categoria','iva',
   'evidencia','IVA no informado',
   'observacion','La cotización no especifica el tratamiento del IVA.')
 );
 IF public.cotironda_piloto_v2_d016_analysis_finish_private(
  'aaaaaaaa-1111-4111-8111-111111111111',session_hmac,doc,
  gen_random_uuid(),new_source->>'sha256',
  repeat('f',64),analysis_points,'ready') IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'd016_analysis_forged_job';END IF;
 IF public.cotironda_piloto_v2_d016_analysis_finish_private(
  'aaaaaaaa-1111-4111-8111-111111111111',session_hmac,doc,
  (analysis_claim->>'jobToken')::uuid,new_source->>'sha256',
  repeat('f',64),analysis_points,'ready') IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'd016_analysis_finish_failed';END IF;
 IF public.cotironda_piloto_v2_d016_analysis_finish_private(
  'aaaaaaaa-1111-4111-8111-111111111111',session_hmac,doc,
  (analysis_claim->>'jobToken')::uuid,new_source->>'sha256',
  repeat('f',64),analysis_points,'ready') IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'd016_analysis_double_finish';END IF;
 with_analysis:=public.cotironda_piloto_v2_d016_responders_with_analysis_private(
  'aaaaaaaa-1111-4111-8111-111111111111',session_hmac);
 IF NOT EXISTS(
  SELECT 1 FROM jsonb_array_elements(with_analysis->'originals') t(value)
  WHERE t.value->>'documentId'=doc::text
   AND t.value->'analysis'->>'state'='ready'
   AND jsonb_array_length(t.value->'analysis'->'points')=2
 ) THEN RAISE EXCEPTION 'd016_analysis_not_visible_to_buyer';END IF;
  IF public.cotironda_piloto_v2_d016_original_source_private(
  'bbbbbbbb-2222-4222-8222-222222222222',session_hmac,doc)
 IS NOT NULL THEN RAISE EXCEPTION 'd016_cross_request_original';END IF;
 IF public.cotironda_piloto_v2_d016_record_download_private(
  'aaaaaaaa-1111-4111-8111-111111111111',
  session_hmac,doc,repeat('f',64),1234)
 IS DISTINCT FROM false THEN RAISE EXCEPTION 'd016_wrong_sha_audit';END IF;
 IF public.cotironda_piloto_v2_d016_record_download_private(
  'aaaaaaaa-1111-4111-8111-111111111111',
  session_hmac,doc,new_source->>'sha256',
  (new_source->>'byteCount')::integer)
 IS DISTINCT FROM true THEN RAISE EXCEPTION 'd016_audit_denied';END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.v2_d016_original_download_audit)<>1
 THEN RAISE EXCEPTION 'd016_audit_count_wrong';END IF;

-- V2-14 incluye presupuesto original de texto cifrado: replicar la
 -- fuente pero jamás descifrar en PostgreSQL; el Edge valida AES/SHA.
 SELECT (value->>'documentId')::uuid INTO text_doc
 FROM jsonb_array_elements(new_catalog->'originals')
 WHERE value->>'kind'='text' LIMIT 1;
 IF text_doc IS NULL THEN RAISE EXCEPTION 'd016_text_not_listed';END IF;
 old_text:=public.cotironda_piloto_v2_original_source_private(
  'aaaaaaaa-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',text_doc);
 new_text:=public.cotironda_piloto_v2_d016_original_source_private(
  'aaaaaaaa-1111-4111-8111-111111111111',session_hmac,text_doc);
 IF new_text IS NULL OR new_text->>'state'<>'authorized_text_v2'
 OR new_text->>'sha256'<>old_text->>'sha256'
 OR new_text->>'nonceB64'<>old_text->>'nonceB64'
 OR new_text->>'ciphertextB64'<>old_text->>'ciphertextB64'
 OR new_text->>'chatHmac'<>old_text->>'chatHmac'
 THEN RAISE EXCEPTION 'd016_text_source_differs_from_auth';END IF;
 IF public.cotironda_piloto_v2_d016_record_text_download_private(
  'aaaaaaaa-1111-4111-8111-111111111111',
  session_hmac,text_doc,repeat('f',64),120) IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'd016_wrong_text_sha_audited';END IF;
 IF public.cotironda_piloto_v2_d016_record_text_download_private(
  'aaaaaaaa-1111-4111-8111-111111111111',
  session_hmac,text_doc,new_text->>'sha256',120) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'd016_text_audit_denied';END IF;
 IF public.cotironda_piloto_v2_d016_record_text_download_private(
  'aaaaaaaa-1111-4111-8111-111111111111',
  session_hmac,doc,new_source->>'sha256',120) IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'd016_pdf_as_text_audited';END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.v2_d016_original_download_audit)<>2
 THEN RAISE EXCEPTION 'd016_text_audit_count';END IF;

  IF public.cotironda_piloto_v2_d016_responders_with_analysis_private(
  'aaaaaaaa-1111-4111-8111-111111111111',session_hmac) IS NULL
 THEN RAISE EXCEPTION 'd016_analysis_projection_denied';END IF;

 UPDATE cotironda_piloto_privado.v2_supplier_original_consents
 SET revoked_at=clock_timestamp() WHERE supplier_key='supplier_a';
 IF public.cotironda_piloto_v2_d016_original_source_private(
  'aaaaaaaa-1111-4111-8111-111111111111',session_hmac,doc)
 IS NOT NULL
 OR public.cotironda_piloto_v2_d016_record_download_private(
  'aaaaaaaa-1111-4111-8111-111111111111',
  session_hmac,doc,new_source->>'sha256',
  (new_source->>'byteCount')::integer) IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'd016_supplier_revocation_ignored';END IF;

 IF public.cotironda_piloto_v2_d016_original_source_private(
  'aaaaaaaa-1111-4111-8111-111111111111',session_hmac,text_doc)
 IS NOT NULL
 OR public.cotironda_piloto_v2_d016_record_text_download_private(
  'aaaaaaaa-1111-4111-8111-111111111111',
  session_hmac,text_doc,new_text->>'sha256',120) IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'd016_text_revoked';END IF;

 UPDATE cotironda_piloto_privado.v2_d016_browser_sessions
 SET revoked_at=clock_timestamp() WHERE sesion_hmac=session_hmac;
 IF public.cotironda_piloto_v2_d016_responders_private(
  'aaaaaaaa-1111-4111-8111-111111111111',session_hmac) IS NOT NULL
 THEN RAISE EXCEPTION 'd016_revoked_session_catalog_visible';END IF;

 IF has_function_privilege('anon',
  'public.cotironda_piloto_v2_d016_original_source_private(uuid,text,uuid)','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.cotironda_piloto_v2_d016_responders_private(uuid,text)','EXECUTE')
 OR NOT has_function_privilege('service_role',
  'public.cotironda_piloto_v2_d016_record_download_private(uuid,text,uuid,text,integer)','EXECUTE')
 OR NOT has_function_privilege('service_role',
  'public.cotironda_piloto_v2_d016_record_text_download_private(uuid,text,uuid,text,integer)','EXECUTE')
 OR has_function_privilege('anon',
  'public.cotironda_piloto_v2_d016_record_text_download_private(uuid,text,uuid,text,integer)','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.cotironda_piloto_v2_d016_record_text_download_private(uuid,text,uuid,text,integer)','EXECUTE')
 OR has_table_privilege('anon',
  'cotironda_piloto_privado.v2_d016_original_download_audit','SELECT')
 THEN RAISE EXCEPTION 'd016_acl_broken';END IF;
 RAISE NOTICE 'V2_D016_RESPONDERS_ORIGINALS_PG17_PASS';
END $d016_resp$;
