-- MVP352 synthetic source-backed arithmetic. Executed in the existing
-- PostgreSQL 17 BEGIN / ROLLBACK. No outbound messages or publications.
DO $test$
DECLARE
 sc text;rid uuid;msg text;sha text;proposal jsonb;
 result jsonb; row_ record;messages_before int;offers_before int;
BEGIN
 SELECT chat_hmac INTO sc FROM cotironda_piloto_privado.participants
 WHERE key='corralon_nahuel' AND participant_role='supplier'
  AND consent_at IS NOT NULL AND opted_out_at IS NULL;
 SELECT i.request_id INTO rid FROM cotironda_piloto_privado.invitations i
 JOIN cotironda_piloto_privado.requests r ON r.id=i.request_id
 WHERE i.supplier_key='corralon_nahuel' AND i.state='prepared'
  AND r.state='prepared' AND r.closes_at>clock_timestamp()
 LIMIT 1;
 IF sc IS NULL OR rid IS NULL THEN RAISE EXCEPTION 'mvp352_discount_fixture_missing';END IF;
 SELECT count(*) INTO messages_before FROM cotironda_piloto_privado.whapi_outbox;
 SELECT count(*) INTO offers_before FROM cotironda_piloto_privado.offer_versions;
 IF has_function_privilege('anon',
   'public.cotironda_piloto_audit_supplier_amounts_mvp103(text)','EXECUTE')
 OR has_function_privilege('authenticated',
   'public.cotironda_piloto_audit_supplier_amounts_mvp103(text)','EXECUTE')
 THEN RAISE EXCEPTION 'mvp352_discount_rpc_public';END IF;
 FOR row_ IN SELECT * FROM (VALUES
  ('unit_discount_exact','Cemento; Dscto. 22.4%','$1.164,75','balanced','balanced'),
  ('unit_discount_wrong_amount','Cemento; Dscto. 22.4%','$1.164,81','difference','line_multiplication_mismatch'),
  ('discount_not_explicit','Cemento descuento condicional','$1.164,75','difference','discount_sign_inconsistent'),
  ('no_discount','Cemento CPC','$1.164,75','difference','line_multiplication_mismatch'),
  ('unbounded_discount','Cemento; Dscto. 101%','$1.164,75','difference','line_multiplication_mismatch')
 ) AS cases(name,description,total_literal,expected_state,expected_reason)
 LOOP
  msg:=encode(sha256(convert_to('mvp352_discount_'||row_.name,'UTF8')),'hex');
  sha:=encode(sha256(convert_to('mvp352_discount_pdf_'||row_.name,'UTF8')),'hex');
  proposal:=jsonb_build_object(
   'kind','supplier_quote','status','review_required',
   'delivery_city',null,'requested_delivery_note','Flete a convenir',
   'total_declared',row_.total_literal,'unanswered','[]'::jsonb,
   'lines',jsonb_build_array(
    jsonb_build_object('original_description',row_.description,
     'quantity','15','unit',null,'unit_price','$100,07',
     'line_total',row_.total_literal,'evidence_location','p1 fila 1','ambiguity',null)
   ));
  INSERT INTO cotironda_piloto_privado.whapi_inbox(
   message_hmac,chat_hmac,participant_key,kind,nonce_b64,ciphertext_b64,
   plaintext_sha256,source_unix,processing_state)
  VALUES(msg,sc,'corralon_nahuel','document','AAAAAAAAAAAAAAAA',
   'AAAAAAAAAAAAAAAAAAAAAAAA',sha,
   extract(epoch FROM clock_timestamp())::bigint,'needs_review');
  INSERT INTO cotironda_piloto_privado.media_archive_mvp095(
   message_hmac,chat_hmac,participant_key,request_id,kind,mime,media_id_sha256,
   state,size_bytes,content_sha256,storage_path,review_state,proposal)
  VALUES(msg,sc,'corralon_nahuel',rid,'document','application/pdf',sha,
   'stored',2048,sha,'media/'||msg,'suggested_only',proposal);
  result:=public.cotironda_piloto_record_supplier_media_mvp098(msg);
  IF result->>'state'<>'stored_unverified' THEN
   RAISE EXCEPTION 'mvp352_discount_intake_failed %, %',row_.name,result;END IF;
  result:=public.cotironda_piloto_compare_supplier_readings_mvp102(msg,proposal);
  IF result->>'state'<>'model_readings_match' THEN
   RAISE EXCEPTION 'mvp352_discount_model_gate_failed %, %',row_.name,result;END IF;
  result:=public.cotironda_piloto_audit_supplier_amounts_mvp103(msg);
  IF result->>'state'<>row_.expected_state
   OR result->>'reason'<>row_.expected_reason
   OR result->>'source_verified'<>'false'
   OR result->>'ranking_allowed'<>'false'
  THEN RAISE EXCEPTION 'mvp352_discount_arithmetic_failed %, %',row_.name,result;END IF;
  IF (public.cotironda_piloto_audit_supplier_amounts_mvp103(msg))->>'state'<>'already_checked'
  THEN RAISE EXCEPTION 'mvp352_discount_audit_not_idempotent';END IF;
  IF (SELECT proposal FROM cotironda_piloto_privado.media_archive_mvp095 WHERE message_hmac=msg)<>proposal
  THEN RAISE EXCEPTION 'mvp352_discount_original_mutated';END IF;
 END LOOP;
 IF (SELECT count(*) FROM cotironda_piloto_privado.whapi_outbox)<>messages_before
 OR (SELECT count(*) FROM cotironda_piloto_privado.offer_versions)<>offers_before
 THEN RAISE EXCEPTION 'mvp352_discount_created_messages_or_offers';END IF;
 RAISE NOTICE 'MVP352 discount PASS: unit discount rounded cents, wrong prices denied, SQL source gate retained, zero WhatsApp';
END $test$;
