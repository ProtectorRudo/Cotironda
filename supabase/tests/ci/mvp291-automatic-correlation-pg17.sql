-- MVP291 PG17: synthetic overlaps legacy/new request, independent dispatch
-- evidence, private archive. No external service and one outer ROLLBACK.
DO $test$
DECLARE
 rid_new uuid;rid_old uuid; h text;chat text;sha text;result jsonb;
 before_jobs integer;before_outbox integer;after_jobs integer;after_outbox integer;
 doc jsonb;count_options integer;
BEGIN
 IF has_function_privilege('anon',
   'public.cotironda_piloto_auto_correlation_prepare_mvp291(text,text)','EXECUTE')
 OR has_function_privilege('authenticated',
   'public.cotironda_piloto_auto_correlation_bind_mvp291(text,text,text,uuid)','EXECUTE')
 OR NOT has_function_privilege('service_role',
   'public.cotironda_piloto_auto_correlation_bind_mvp291(text,text,text,uuid)','EXECUTE')
 OR has_table_privilege('authenticated',
   'cotironda_piloto_privado.ai_supplier_auto_correlation_mvp291','SELECT')
 OR (SELECT NOT relrowsecurity FROM pg_class
     WHERE oid='cotironda_piloto_privado.ai_supplier_auto_correlation_mvp291'::regclass)
 THEN RAISE EXCEPTION 'mvp291_acl_failed';END IF;

 SELECT chat_hmac INTO chat FROM cotironda_piloto_privado.participants
 WHERE key='corralon_ailin';
 IF chat IS NULL THEN RAISE EXCEPTION 'mvp291_no_supplier_fixture';END IF;
 INSERT INTO cotironda_piloto_privado.requests(
  buyer_key,delivery_city,original_request,source_hmac,state)
 VALUES('arquitecto','La Plata','Pedido sintético nuevo: cemento CPC 50 kg y arena',
  encode(sha256(convert_to('mvp291_new_request','UTF8')),'hex'),'prepared')
 RETURNING id INTO rid_new;
 INSERT INTO cotironda_piloto_privado.requests(
  buyer_key,delivery_city,original_request,source_hmac,state)
 VALUES('arquitecto','La Plata','Pedido sintético legado: 10 bolsas cemento y arena fina',
  encode(sha256(convert_to('mvp291_old_request','UTF8')),'hex'),'prepared')
 RETURNING id INTO rid_old;
 INSERT INTO cotironda_piloto_privado.request_lines(
  request_id,line_no,original_description,quantity,unit,family_code)
 VALUES(rid_new,1,'Cemento CPC de 50 kg',20,'bag',null),
 (rid_new,2,'Bolsones de arena',3,'bag',null),
 (rid_old,1,'Cemento CPC de 50 kg',10,'bag',null),
 (rid_old,2,'Arena fina',4,'m3',null);
 INSERT INTO cotironda_piloto_privado.invitations(request_id,supplier_key)
 VALUES(rid_new,'corralon_ailin'),(rid_old,'corralon_ailin');
 INSERT INTO cotironda_piloto_privado.ai_shadow_requests_mvp221(request_id,source_hmac)
 VALUES(rid_new,encode(sha256(convert_to('mvp291_new_request','UTF8')),'hex'));
 INSERT INTO cotironda_piloto_privado.ai_shadow_rubros_mvp221(
  request_id,line_no,rubro,evidencia)
 VALUES(rid_new,1,'obra_gruesa','Cemento CPC de 50 kg'),
       (rid_new,2,'obra_gruesa','Bolsones de arena');
 INSERT INTO cotironda_piloto_privado.catalogue_lines(
  participant_key,line_no,literal_description,family_code,recognition_state)
 VALUES('corralon_ailin',2,'Arena a granel','arena_gruesa','curated_family');
 INSERT INTO cotironda_piloto_privado.ai_shadow_destinos_mvp221(
  request_id,supplier_key,line_no,catalogue_line_no,catalogue_description,tipo,explicacion)
 VALUES(rid_new,'corralon_ailin',1,1,'Cemento', 'producto_declarado','Prueba'),
 (rid_new,'corralon_ailin',2,2,'Arena','producto_declarado','Prueba');
 INSERT INTO cotironda_piloto_privado.ai_dispatch_jobs_mvp222(
  request_id,supplier_key,state,lease_token,leased_at,finished_at,whapi_message_id)
 VALUES(rid_new,'corralon_ailin','api_accepted',gen_random_uuid(),
  clock_timestamp()-interval '2 minutes',clock_timestamp()-interval '1 minute',
  'mvp291-central-sent-0001');
 INSERT INTO cotironda_piloto_privado.whapi_outbox(
  request_id,supplier_key,message_body,state,whapi_message_id,sent_at)
 VALUES(rid_old,'corralon_ailin','Cotironda solicitud antigua sintetica de prueba',
  'api_accepted','mvp291-legacy-sent-0001',clock_timestamp()-interval '1 minute');
 SELECT count(*) INTO before_jobs FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222;
 SELECT count(*) INTO before_outbox FROM cotironda_piloto_privado.whapi_outbox;
 h:=encode(sha256(convert_to('mvp291_source_binary_sha_id','UTF8')),'hex');
 sha:=encode(sha256(convert_to('mvp291_original_pdf_bytes','UTF8')),'hex');
 doc:=jsonb_build_object('kind','supplier_quote','status','review_required',
  'delivery_city',null,'requested_delivery_note',null,
  'lines',jsonb_build_array(
   jsonb_build_object('original_description','Cemento Avellaneda bolsa 25 kg',
    'quantity','40','unit','bolsas','unit_price','$100',
    'line_total','$4000','evidence_location','p1','ambiguity',null),
   jsonb_build_object('original_description','Arena BIG BAG',
    'quantity','3','unit','big bag','unit_price','$200',
    'line_total','$600','evidence_location','p1','ambiguity',null)
  ),'total_declared','$4600','unanswered',jsonb_build_array());
 INSERT INTO cotironda_piloto_privado.whapi_inbox(
  message_hmac,chat_hmac,participant_key,kind,nonce_b64,ciphertext_b64,
  plaintext_sha256,source_unix,processing_state,received_at)
 VALUES(h,chat,'corralon_ailin','document','AAAAAAAAAAAAAAAA',
  'AAAAAAAAAAAAAAAAAAAAAAAA',sha,
  extract(epoch from clock_timestamp())::bigint,
  'needs_review',clock_timestamp());
 INSERT INTO cotironda_piloto_privado.media_archive_mvp095(
  message_hmac,chat_hmac,participant_key,kind,mime,media_id_sha256,
  state,finished_at,size_bytes,content_sha256,storage_path,
  ai_reserved_at,review_state,proposal)
 VALUES(h,chat,'corralon_ailin','document','application/pdf',
  encode(sha256(convert_to('mvp291_media_id','UTF8')),'hex'),
  'stored',clock_timestamp(),1500,sha,'media/'||h,
  clock_timestamp(),'suggested_only',doc);
 INSERT INTO cotironda_piloto_privado.ai_supplier_unresolved_mvp237(
  message_hmac,supplier_key,source_sha256,kind,state,candidate_count,
  association_method)
 VALUES(h,'corralon_ailin',sha,'document','ambiguous_round',2,'single_active_round');
 result:=public.cotironda_piloto_auto_correlation_prepare_mvp291(
  h,repeat('9',64));
 IF result->>'state'='reserved' THEN RAISE EXCEPTION 'mvp291_foreign_chat_read';END IF;
 result:=public.cotironda_piloto_auto_correlation_prepare_mvp291(h,chat);
 IF result->>'state'<>'reserved' THEN
  RAISE EXCEPTION 'mvp291_snapshot_not_reserved: %',result;END IF;
 count_options:=jsonb_array_length(result->'candidates');
 IF count_options<2 OR count_options>8 OR jsonb_array_length(result->'quote')<>2
 THEN RAISE EXCEPTION 'mvp291_incomplete_snapshot: %',result;END IF;
 IF result::text LIKE '%unit_price%' OR result::text LIKE '%line_total%'
 OR result::text LIKE '%supplier_key%'
 THEN RAISE EXCEPTION 'mvp291_private_price_or_identity_leak';END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(result->'candidates') v
   WHERE v->>'request_id'=rid_new::text
   AND jsonb_array_length(v->'lines')=2)
 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(result->'candidates') v
   WHERE v->>'request_id'=rid_old::text
   AND jsonb_array_length(v->'lines')=2)
 THEN RAISE EXCEPTION 'mvp291_candidates_missing';END IF;
 result:=public.cotironda_piloto_auto_correlation_prepare_mvp291(h,chat);
 IF result->>'state'<>'already_reserved' THEN
  RAISE EXCEPTION 'mvp291_duplicate_model_call_possible';END IF;
 result:=public.cotironda_piloto_auto_correlation_bind_mvp291(
  h,repeat('9',64),sha,rid_new);
 IF result->>'state'='linked_private' THEN RAISE EXCEPTION 'mvp291_cross_chat_bind';END IF;
 result:=public.cotironda_piloto_auto_correlation_bind_mvp291(
  h,chat,repeat('f',64),rid_new);
 IF result->>'state'='linked_private' THEN RAISE EXCEPTION 'mvp291_wrong_sha_bound';END IF;
 result:=public.cotironda_piloto_auto_correlation_bind_mvp291(
  h,chat,sha,rid_new);
 IF result->>'state'<>'linked_private' THEN
  RAISE EXCEPTION 'mvp291_authorized_bind_failed: %',result;END IF;
 IF (SELECT request_id FROM cotironda_piloto_privado.whapi_inbox WHERE message_hmac=h)<>rid_new
 OR (SELECT request_id FROM cotironda_piloto_privado.media_archive_mvp095 WHERE message_hmac=h)<>rid_new
 OR (SELECT resolved_request_id FROM cotironda_piloto_privado.ai_supplier_unresolved_mvp237 WHERE message_hmac=h)<>rid_new
 OR (SELECT association FROM cotironda_piloto_privado.ai_supplier_links_mvp225 WHERE message_hmac=h)<>'semantic_unique_mvp291'
 OR (SELECT state FROM cotironda_piloto_privado.ai_supplier_auto_correlation_mvp291 WHERE source_hmac=h)<>'linked'
 THEN RAISE EXCEPTION 'mvp291_atomic_binding_inconsistent';END IF;
 result:=public.cotironda_piloto_auto_correlation_bind_mvp291(h,chat,sha,rid_old);
 IF result->>'state'='linked_private' THEN
  RAISE EXCEPTION 'mvp291_duplicate_cannot_rebind';END IF;
 SELECT count(*) INTO after_jobs FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222;
 SELECT count(*) INTO after_outbox FROM cotironda_piloto_privado.whapi_outbox;
 IF before_jobs<>after_jobs OR before_outbox<>after_outbox OR EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.anonymous_supplier_docs_mvp107
   WHERE message_hmac=h)
 THEN RAISE EXCEPTION 'mvp291_unsolicited_send_or_unverified_publication';END IF;
 RAISE NOTICE 'MVP291 PASS: 2 candidates legacy/central, ACL, no PII/prices, atomic bind, no Whapi, no publication';
END $test$;
