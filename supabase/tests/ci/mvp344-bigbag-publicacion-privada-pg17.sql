-- MVP344 — Synthetic 3-row PDF draft + real SQL publication pipeline.
-- Parent runner holds BEGIN + ROLLBACK. No pilot, Whapi, OpenAI or PII.
DO $mvp344$
DECLARE
 v_source text;v_other text;v_sha text;v_chat text;v_round uuid;
 v_proposal jsonb;v_bad jsonb;v_result jsonb;v_text text;
 v_before_quotes integer;v_before_outbox integer;
BEGIN
 IF has_function_privilege('anon',
  'public.cotironda_piloto_publish_source_text_mvp107(text)','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.cotironda_piloto_publish_source_text_mvp107(text)','EXECUTE')
 OR NOT has_function_privilege('service_role',
  'public.cotironda_piloto_publish_source_text_mvp107(text)','EXECUTE')
 THEN RAISE EXCEPTION 'mvp344_publication_acl_regressed';END IF;

 v_source:=pg_catalog.encode(pg_catalog.sha256(
   pg_catalog.convert_to('mvp336_document_15_2_1','UTF8')),'hex');
 SELECT a.request_id,a.content_sha256,a.chat_hmac,a.proposal
 INTO v_round,v_sha,v_chat,v_proposal
 FROM cotironda_piloto_privado.media_archive_mvp095 a
 WHERE a.message_hmac=v_source;
 IF v_round IS NULL OR
  pg_catalog.jsonb_array_length(v_proposal->'lines')<>3 OR
  (v_proposal->'lines'->1->>'original_description')<>'BIG BAG de Arena' OR
  (v_proposal->'lines'->2->>'original_description')<>'BIG BAG de Piedra'
 THEN RAISE EXCEPTION 'mvp344_missing_unitless_pdf_fixture';END IF;

 SELECT count(*) INTO v_before_quotes
 FROM cotironda_piloto_privado.offer_versions;
 SELECT count(*) INTO v_before_outbox
 FROM cotironda_piloto_privado.whapi_outbox;

 v_result:=public.cotironda_piloto_record_supplier_media_mvp098(v_source);
 IF v_result->>'state'<>'stored_unverified'
 THEN RAISE EXCEPTION 'mvp344_undeclared_source: %',v_result;END IF;
 v_result:=public.cotironda_piloto_compare_supplier_readings_mvp102(
  v_source,v_proposal);
 IF v_result->>'state'<>'model_readings_match'
 THEN RAISE EXCEPTION 'mvp344_double_reading_failed: %',v_result;END IF;
 v_result:=public.cotironda_piloto_audit_supplier_amounts_mvp103(v_source);
 IF v_result->>'state'<>'balanced'
 THEN RAISE EXCEPTION 'mvp344_amounts_not_balanced: %',v_result;END IF;

 -- Before a completely independent original-source check, no text or
 -- aggregate may be published even if models and arithmetic agree.
 v_result:=public.cotironda_piloto_publish_source_text_mvp107(v_source);
 IF v_result->>'state'<>'not_permitted'
 THEN RAISE EXCEPTION 'mvp344_unverified_pdf_was_published';END IF;
 v_result:=public.cotironda_piloto_record_supplier_source_check_mvp106(
  v_source,v_sha,'source_text_covered','covered',3);
 IF v_result->>'state'<>'source_text_covered'
 THEN RAISE EXCEPTION 'mvp344_source_check_failed: %',v_result;END IF;

 v_result:=public.cotironda_piloto_publish_source_text_mvp107(v_source);
 IF v_result->>'state'<>'published_anonymous'
 OR v_result->>'lines'<>'3'
 OR v_result->>'ranking_allowed'<>'false'
 OR v_result->>'contact_revealed'<>'false'
 THEN RAISE EXCEPTION 'mvp344_bigbag_not_publishable: %',v_result;END IF;
 IF (public.cotironda_piloto_publish_source_text_mvp107(v_source))
  ->>'state'<>'already_published'
 THEN RAISE EXCEPTION 'mvp344_duplicate_document_published';END IF;

 SELECT public_text INTO v_text
 FROM cotironda_piloto_privado.anonymous_supplier_docs_mvp107
 WHERE message_hmac=v_source;
 IF v_text NOT LIKE '%BIG BAG de Arena%'
 OR v_text NOT LIKE '%BIG BAG de Piedra%'
 OR v_text NOT LIKE '%Cemento Avellaneda%'
 OR v_text NOT LIKE '%Cantidad: 15,00%'
 OR v_text NOT LIKE '%Cantidad: 2,00%'
 OR v_text NOT LIKE '%Cantidad: 1,00%'
 OR v_text NOT LIKE '%TOTAL DECLARADO: $2200%'
 OR v_text LIKE '%corralon_ailin%'
 THEN RAISE EXCEPTION 'mvp344_source_literals_or_privacy_lost';END IF;

 -- A SECOND entirely synthetic quote proves the existing privacy ban
 -- was NOT relaxed just because a row now starts with BIG BAG.
 v_other:=pg_catalog.encode(pg_catalog.sha256(
   pg_catalog.convert_to('mvp344_unsafe_source','UTF8')),'hex');
 v_bad:=pg_catalog.jsonb_set(v_proposal,
  '{lines,1,original_description}',
  pg_catalog.to_jsonb('BIG BAG de Arena WhatsApp 22112222'::text),false);
 INSERT INTO cotironda_piloto_privado.whapi_inbox(
  message_hmac,chat_hmac,participant_key,kind,nonce_b64,ciphertext_b64,
  plaintext_sha256,source_unix,processing_state)
 VALUES(v_other,v_chat,'corralon_ailin','document',
  'AAAAAAAAAAAAAAAA','AAAAAAAAAAAAAAAAAAAAAAAA',v_sha,
  extract(epoch from pg_catalog.clock_timestamp())::bigint,'needs_review');
 INSERT INTO cotironda_piloto_privado.media_archive_mvp095(
  message_hmac,chat_hmac,participant_key,request_id,kind,mime,
  media_id_sha256,state,size_bytes,content_sha256,storage_path,
  review_state,proposal)
 VALUES(v_other,v_chat,'corralon_ailin',v_round,
  'document','application/pdf',v_sha,'stored',1500,v_sha,
  'media/'||v_other,'suggested_only',v_bad);
 v_result:=public.cotironda_piloto_record_supplier_media_mvp098(v_other);
 IF v_result->>'state'<>'stored_unverified'
 THEN RAISE EXCEPTION 'mvp344_negative_source_not_recorded';END IF;
 v_result:=public.cotironda_piloto_compare_supplier_readings_mvp102(
  v_other,v_bad);
 IF v_result->>'state'<>'model_readings_match'
 THEN RAISE EXCEPTION 'mvp344_negative_second_reading_failed';END IF;
 v_result:=public.cotironda_piloto_audit_supplier_amounts_mvp103(v_other);
 IF v_result->>'state'<>'balanced'
 THEN RAISE EXCEPTION 'mvp344_negative_amounts_changed';END IF;
 v_result:=public.cotironda_piloto_record_supplier_source_check_mvp106(
  v_other,v_sha,'source_text_covered','covered',3);
 IF v_result->>'state'<>'source_text_covered'
 THEN RAISE EXCEPTION 'mvp344_negative_check_missing';END IF;
 v_result:=public.cotironda_piloto_publish_source_text_mvp107(v_other);
 IF v_result->>'state'<>'privacy_or_quality_review'
 THEN RAISE EXCEPTION 'mvp344_contact_leaked_in_bigbag_quote: %',v_result;END IF;
 IF EXISTS(SELECT 1
  FROM cotironda_piloto_privado.anonymous_supplier_docs_mvp107
  WHERE message_hmac=v_other)
 THEN RAISE EXCEPTION 'mvp344_contact_public_record_created';END IF;

 IF (SELECT count(*) FROM cotironda_piloto_privado.offer_versions)
  <>v_before_quotes
 OR (SELECT count(*) FROM cotironda_piloto_privado.whapi_outbox)
  <>v_before_outbox
 THEN RAISE EXCEPTION 'mvp344_unintended_rank_or_whatsapp';END IF;
 RAISE NOTICE 'MVP344 PASS: BIG BAG verified anonymous, contact blocked, no rankings/Whapi';
END $mvp344$;
