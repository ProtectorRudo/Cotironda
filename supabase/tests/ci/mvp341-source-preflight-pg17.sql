-- MVP341: preflight de Storage y privacidad, datos SOLO SINTÉTICOS.
-- Inyectado dentro del acumulado PG17 BEGIN/ROLLBACK (MVP340 ya probado).
DO $mvp341$
DECLARE
 v_source text; v_round uuid; v_result jsonb; v_archive record;
 v_supplier_chat text;
BEGIN
 IF has_function_privilege('anon',
  'public.cotironda_piloto_source_for_lots_mvp341(text)','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.cotironda_piloto_source_for_lots_mvp341(text)','EXECUTE')
 OR NOT has_function_privilege('service_role',
  'public.cotironda_piloto_source_for_lots_mvp341(text)','EXECUTE')
 THEN RAISE EXCEPTION 'mvp341_function_acl_failed';END IF;

 v_source:=pg_catalog.encode(
  public.digest('mvp336_document_15_2_1'::text,'sha256'),'hex');
 SELECT ledger.request_id INTO v_round
 FROM cotironda_piloto_privado.ai_supplier_lot_ledger_mvp340 ledger
 WHERE ledger.source_hmac=v_source;
 IF v_round IS NULL THEN RAISE EXCEPTION 'mvp341_missing_340_fixture';END IF;

 v_result:=public.cotironda_piloto_source_for_lots_mvp341(v_source);
 IF v_result->>'state'<>'already_processed'
 THEN RAISE EXCEPTION 'mvp341_duplicate_source_not_detected';END IF;

 -- Synthetic-only reset of successful MVP340 row, inside ROLLBACK.
 DELETE FROM cotironda_piloto_privado.ai_supplier_lot_ledger_mvp340
 WHERE source_hmac=v_source;
 SELECT a.content_sha256,a.mime,a.size_bytes,a.storage_path,
  m.chat_hmac,m.participant_key
 INTO v_archive
 FROM cotironda_piloto_privado.media_archive_mvp095 a
 JOIN cotironda_piloto_privado.whapi_inbox m ON m.message_hmac=a.message_hmac
 WHERE a.message_hmac=v_source;
 IF NOT FOUND THEN RAISE EXCEPTION 'mvp341_missing_archive_fixture';END IF;
 v_result:=public.cotironda_piloto_source_for_lots_mvp341(v_source);
 IF v_result->>'state'<>'candidate'
 OR v_result->>'sourceSha256'<>v_archive.content_sha256
 OR v_result->>'mime'<>v_archive.mime
 OR (v_result->>'sizeBytes')::int<>v_archive.size_bytes
 OR v_result->>'storagePath'<>'media/'||v_source
 OR v_result->>'roundId'<>v_round::text
 OR v_result->>'supplierKey'<>'corralon_ailin'
 OR v_result->>'chatHmac'<>v_archive.chat_hmac
 OR v_result->>'messageHmac'<>v_source
 THEN RAISE EXCEPTION 'mvp341_linked_source_metadata_incorrect: %',v_result;END IF;
 -- Return keys must contain no supplier quote text, buyer PII or public URL.
 IF (SELECT count(*) FROM pg_catalog.jsonb_object_keys(v_result))<>9
 OR v_result::text ~* '(ciphertext|phone|original_request|signedurl|buyer_name|prices|provider_name)'
 THEN RAISE EXCEPTION 'mvp341_metadata_leak';END IF;

 IF (public.cotironda_piloto_source_for_lots_mvp341(repeat('f',64)))->>'state'<>'not_eligible'
 OR (public.cotironda_piloto_source_for_lots_mvp341('invalid')) ->>'state'<>'not_eligible'
 THEN RAISE EXCEPTION 'mvp341_unknown_source_allowed';END IF;

 UPDATE cotironda_piloto_privado.participants
 SET opted_out_at=pg_catalog.clock_timestamp()
 WHERE key='corralon_ailin';
 v_result:=public.cotironda_piloto_source_for_lots_mvp341(v_source);
 IF v_result->>'state'<>'not_eligible'
 THEN RAISE EXCEPTION 'mvp341_opted_out_supplier_allowed';END IF;
 UPDATE cotironda_piloto_privado.participants SET opted_out_at=NULL
 WHERE key='corralon_ailin';

 UPDATE cotironda_piloto_privado.participants
 SET opted_out_at=pg_catalog.clock_timestamp() WHERE key='arquitecto';
 v_result:=public.cotironda_piloto_source_for_lots_mvp341(v_source);
 IF v_result->>'state'<>'not_eligible'
 THEN RAISE EXCEPTION 'mvp341_opted_out_buyer_allowed';END IF;
 UPDATE cotironda_piloto_privado.participants SET opted_out_at=NULL
 WHERE key='arquitecto';

 -- Preserve receipt integrity, only simulate accepted AFTER inbound.
 UPDATE cotironda_piloto_privado.ai_dispatch_jobs_mvp222
 SET finished_at=pg_catalog.clock_timestamp()+interval '1 hour'
 WHERE request_id=v_round AND supplier_key='corralon_ailin';
 v_result:=public.cotironda_piloto_source_for_lots_mvp341(v_source);
 IF v_result->>'state'<>'not_eligible'
 THEN RAISE EXCEPTION 'mvp341_unaccepted_dispatch_allowed';END IF;
 RAISE NOTICE 'MVP341 PASS: private candidate, no PII, duplicate guard, consent and delivery';
END $mvp341$;
