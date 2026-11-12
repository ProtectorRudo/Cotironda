-- Synthetic only. Executed after V2-03a/03b and in ROLLBACK.
DO $check$
DECLARE rid uuid:='aaaaaaaa-1111-4111-8111-111111111111';
 uid uuid:='11111111-1111-4111-8111-111111111111';
 sid uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 outsider uuid:='22222222-2222-4222-8222-222222222222';
 doc uuid; catalog jsonb; ticket jsonb; job uuid;
 notes jsonb:='[
 {"categoria":"material","evidencia":"Cemento Portland 50 kg",
  "observacion":"Se describe cemento Portland en esa presentación."},
 {"categoria":"forma_pago","evidencia":"Pago por transferencia",
  "observacion":"Se indica transferencia como medio de pago."}]'::jsonb;
BEGIN
 catalog:=public.cotironda_piloto_v2_responders_with_analysis_private(rid,uid,sid);
 IF jsonb_array_length(catalog->'originals')<>1
 OR catalog->'originals'->0 ? 'analysis'
 THEN RAISE EXCEPTION 'unexpected_catalog_before_analysis';END IF;
 doc:=(catalog->'originals'->0->>'documentId')::uuid;
 IF public.cotironda_piloto_v2_analysis_claim_private(
 rid,outsider,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',doc) IS NOT NULL
 THEN RAISE EXCEPTION 'outsider_claim';END IF;
 ticket:=public.cotironda_piloto_v2_analysis_claim_private(rid,uid,sid,doc);
 IF ticket->>'state'<>'analysis_claimed_v2'
 OR ticket->>'sourceSha256'<>repeat('0',64)
 THEN RAISE EXCEPTION 'claim_failed:%',ticket;END IF;
 job:=(ticket->>'jobToken')::uuid;
 IF public.cotironda_piloto_v2_analysis_claim_private(rid,uid,sid,doc) IS NOT NULL
 THEN RAISE EXCEPTION 'duplicate_cost';END IF;
 IF public.cotironda_piloto_v2_analysis_finish_private(rid,uid,sid,
 doc,gen_random_uuid(),repeat('0',64),repeat('9',64),notes,'ready')
 IS DISTINCT FROM false THEN RAISE EXCEPTION 'wrong_lease';END IF;
 IF public.cotironda_piloto_v2_analysis_finish_private(rid,uid,sid,
 doc,job,repeat('1',64),repeat('9',64),notes,'ready')
 IS DISTINCT FROM false THEN RAISE EXCEPTION 'wrong_sha';END IF;
 -- Controlled retry: review status cools down, cannot spend twice in 5 min.
 IF public.cotironda_piloto_v2_analysis_finish_private(rid,uid,sid,
 doc,job,repeat('0',64),NULL,NULL,'review')
 IS DISTINCT FROM true THEN RAISE EXCEPTION 'review_status_not_persisted'; END IF;
 IF public.cotironda_piloto_v2_analysis_claim_private(rid,uid,sid,doc)
 IS NOT NULL THEN RAISE EXCEPTION 'review_retry_without_cooldown';END IF;
 UPDATE cotironda_piloto_privado.v2_original_analysis
 SET updated_at=clock_timestamp()-interval '6 minutes'
 WHERE request_id=rid AND document_id=doc;
 ticket:=public.cotironda_piloto_v2_analysis_claim_private(rid,uid,sid,doc);
 IF ticket->>'state'<>'analysis_claimed_v2'
 THEN RAISE EXCEPTION 'review_retry_after_cooldown_denied';END IF;
 IF (ticket->>'jobToken')::uuid=job
 THEN RAISE EXCEPTION 'reused_lease_token';END IF;
 IF public.cotironda_piloto_v2_analysis_finish_private(rid,uid,sid,
 doc,job,repeat('0',64),repeat('9',64),notes,'ready')
 IS DISTINCT FROM false THEN RAISE EXCEPTION 'stale_lease_accepted';END IF;
 job:=(ticket->>'jobToken')::uuid;
 IF public.cotironda_piloto_v2_analysis_finish_private(rid,uid,sid,
 doc,job,repeat('0',64),repeat('9',64),notes,'ready')
 IS DISTINCT FROM true THEN RAISE EXCEPTION 'persist_failed';END IF;
 catalog:=public.cotironda_piloto_v2_responders_with_analysis_private(rid,uid,sid);
 IF catalog->'originals'->0->'analysis'->>'state'<>'ready'
 OR jsonb_array_length(catalog->'originals'->0->'analysis'->'points')<>2
 OR catalog::text LIKE '%message_hmac%'
 OR catalog::text LIKE '%original_sha256%'
 THEN RAISE EXCEPTION 'summary_projection_invalid:%',catalog;END IF;
 IF public.cotironda_piloto_v2_analysis_claim_private(rid,uid,sid,doc) IS NOT NULL
 THEN RAISE EXCEPTION 'ready_reprocessed';END IF;
 UPDATE cotironda_piloto_privado.v2_supplier_original_consents
 SET revoked_at=clock_timestamp() WHERE supplier_key='supplier_a';
 catalog:=public.cotironda_piloto_v2_responders_with_analysis_private(rid,uid,sid);
 IF jsonb_array_length(catalog->'originals')<>0
 THEN RAISE EXCEPTION 'revoked_supplier_leak';END IF;
 IF has_function_privilege('anon',
  'public.cotironda_piloto_v2_analysis_claim_private(uuid,uuid,uuid,uuid)','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.cotironda_piloto_v2_analysis_finish_private(uuid,uuid,uuid,uuid,uuid,text,text,jsonb,text)','EXECUTE')
 OR has_function_privilege('anon',
  'public.cotironda_piloto_v2_responders_with_analysis_private(uuid,uuid,uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'public_rpc_exposed';END IF;
 RAISE NOTICE 'V2_04B_ANALYSIS_PG17_PASS';
END $check$;
