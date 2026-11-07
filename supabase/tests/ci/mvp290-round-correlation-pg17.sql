-- MVP290 CI ONLY: two overlapping RFQs (IA Central + legacy) and one
-- encrypted, archived supplier document. Synthetic data; rollback outer tx.
DO $test$
DECLARE
 aid uuid;lid uuid;src text;reply text;foreign_reply text;chat text;other_chat text;
 original_sha text;choice text;choice_other text;answer jsonb;options jsonb;
 expected_count integer;pre_jobs integer;post_jobs integer;pre_outbox integer;post_outbox integer;
 second jsonb;
BEGIN
 IF has_function_privilege('anon','public.cotironda_piloto_reserve_supplier_choice_mvp290(text,text)','EXECUTE')
 OR has_function_privilege('authenticated','public.cotironda_piloto_resolve_supplier_choice_mvp290(text,text,text)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.cotironda_piloto_resolve_supplier_choice_mvp290(text,text,text)','EXECUTE')
 THEN RAISE EXCEPTION 'mvp290_privilege_failure';END IF;
 IF has_table_privilege('authenticated','cotironda_piloto_privado.ai_supplier_choice_options_mvp290','SELECT')
 OR (SELECT NOT relrowsecurity FROM pg_class
     WHERE oid='cotironda_piloto_privado.ai_supplier_choice_options_mvp290'::regclass)
 THEN RAISE EXCEPTION 'mvp290_private_table_exposed';END IF;
 SELECT chat_hmac INTO chat FROM cotironda_piloto_privado.participants WHERE key='corralon_ailin';
 SELECT chat_hmac INTO other_chat FROM cotironda_piloto_privado.participants WHERE key='corralon_nahuel';
 IF chat IS NULL OR other_chat IS NULL THEN RAISE EXCEPTION 'missing_suppliers_fixture';END IF;
 -- One new AI Central round plus an overlapping legacy round with
 -- independent accepted Whapi evidence. Same supplier, same locality.
 INSERT INTO cotironda_piloto_privado.requests(
  buyer_key,delivery_city,original_request,source_hmac,state)
 VALUES('arquitecto','La Plata','CI pedido cemento 50kg y arena big bag',
  encode(sha256(convert_to('mvp290_ai_round','UTF8')),'hex'),'prepared')
 RETURNING id INTO aid;
 INSERT INTO cotironda_piloto_privado.requests(
  buyer_key,delivery_city,original_request,source_hmac,state)
 VALUES('arquitecto','La Plata','CI pedido cemento 25kg y arena big bag',
  encode(sha256(convert_to('mvp290_legacy_round','UTF8')),'hex'),'prepared')
 RETURNING id INTO lid;
 INSERT INTO cotironda_piloto_privado.request_lines(
  request_id,line_no,original_description,quantity,unit,family_code)
 VALUES(aid,1,'20 bolsas de cemento CPC 50 kg',20,'bag',null),
 (aid,2,'3 bolsones de arena',3,'bag',null),
 (lid,1,'40 bolsas de cemento gris 25 kg',40,'bag',null),
 (lid,2,'3 bolsones de arena',3,'bag',null);
 INSERT INTO cotironda_piloto_privado.invitations(request_id,supplier_key)
 VALUES(aid,'corralon_ailin'),(lid,'corralon_ailin');
 INSERT INTO cotironda_piloto_privado.ai_shadow_requests_mvp221(request_id,source_hmac)
 VALUES(aid,encode(sha256(convert_to('mvp290_ai_round','UTF8')),'hex'));
 INSERT INTO cotironda_piloto_privado.ai_dispatch_jobs_mvp222(
  request_id,supplier_key,state,lease_token,leased_at,finished_at,whapi_message_id)
 VALUES(aid,'corralon_ailin','api_accepted',gen_random_uuid(),
  clock_timestamp()-interval '2 minutes',
  clock_timestamp()-interval '1 minute','mvp290-central-invite-0001');
 INSERT INTO cotironda_piloto_privado.whapi_outbox(
  request_id,supplier_key,message_body,state,whapi_message_id,sent_at)
 VALUES(lid,'corralon_ailin','Cotironda solicitud legacy de prueba aislada',
  'api_accepted','mvp290-legacy-invite-0001',
  clock_timestamp()-interval '1 minute');
 SELECT count(*) INTO pre_jobs FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222;
 SELECT count(*) INTO pre_outbox FROM cotironda_piloto_privado.whapi_outbox;
 src:=encode(sha256(convert_to('mvp290_signed_original_pdf','UTF8')),'hex');
 original_sha:=encode(sha256(convert_to('mvp290_fake_pdf_bytes','UTF8')),'hex');
 second:=jsonb_build_object('kind','supplier_quote','status','review_required',
   'lines',jsonb_build_array(jsonb_build_object('original_description','cemento de 25 kg',
     'quantity','40','unit','bolsas','unit_price','$100','line_total','$4000',
     'evidence_location','p1','ambiguity',null)),
   'unanswered',jsonb_build_array(),'total_declared','$4000',
   'delivery_city',null,'requested_delivery_note',null);
 INSERT INTO cotironda_piloto_privado.whapi_inbox(
  message_hmac,chat_hmac,participant_key,kind,
  nonce_b64,ciphertext_b64,plaintext_sha256,source_unix,processing_state)
 VALUES(src,chat,'corralon_ailin','document',
  'AAAAAAAAAAAAAAAA','AAAAAAAAAAAAAAAAAAAAAAAA',
  original_sha,extract(epoch from clock_timestamp())::bigint,
  'needs_review');
 INSERT INTO cotironda_piloto_privado.media_archive_mvp095(
  message_hmac,chat_hmac,participant_key,kind,mime,media_id_sha256,
  state,finished_at,size_bytes,content_sha256,storage_path,
  ai_reserved_at,review_state,proposal)
 VALUES(src,chat,'corralon_ailin','document','application/pdf',
  encode(sha256(convert_to('mvp290_pdf_media_id','UTF8')),'hex'),
  'stored',clock_timestamp(),1600,original_sha,'media/'||src,
  clock_timestamp(),'suggested_only',second);
 INSERT INTO cotironda_piloto_privado.ai_supplier_unresolved_mvp237(
  message_hmac,supplier_key,source_sha256,kind,state,candidate_count,
  association_method)
 VALUES(src,'corralon_ailin',original_sha,'document','ambiguous_round',
  2,'single_active_round');
 answer:=public.cotironda_piloto_stage_supplier_secondary_mvp290(src,chat,second);
 IF answer->>'state'<>'staged' THEN RAISE EXCEPTION 'mvp290_second_not_staged: %',answer;END IF;
 answer:=public.cotironda_piloto_reserve_supplier_choice_mvp290(src,other_chat);
 IF answer->>'state' IN('reserved','issued')
 THEN RAISE EXCEPTION 'mvp290_wrong_supplier_prompt';END IF;
 answer:=public.cotironda_piloto_reserve_supplier_choice_mvp290(src,chat);
 IF answer->>'state'<>'reserved'
 THEN RAISE EXCEPTION 'mvp290_prompt_not_reserved: %',answer;END IF;
 options:=answer->'options';
 IF jsonb_array_length(options)<>2 THEN
  RAISE EXCEPTION 'mvp290_expected_two_candidates: %',options;END IF;
 answer:=public.cotironda_piloto_reserve_supplier_choice_mvp290(src,chat);
 IF answer->>'state'<>'already_reserved' THEN
  RAISE EXCEPTION 'mvp290_duplicate_prompt: %',answer;END IF;
 answer:=public.cotironda_piloto_finish_supplier_choice_mvp290(
 src,'api_accepted','mvp290-choice-question-00001');
 IF answer->>'state'<>'recorded' THEN RAISE EXCEPTION 'mvp290_prompt_finish_failed';END IF;
 SELECT choice_code INTO choice FROM cotironda_piloto_privado.ai_supplier_choice_options_mvp290
 WHERE source_hmac=src AND request_id=aid;
 SELECT choice_code INTO choice_other FROM cotironda_piloto_privado.ai_supplier_choice_options_mvp290
 WHERE source_hmac=src AND request_id=lid;
 IF choice IS NULL OR choice_other IS NULL OR choice=choice_other
 THEN RAISE EXCEPTION 'mvp290_codes_not_unique';END IF;
 reply:=encode(sha256(convert_to('mvp290_signed_reply','UTF8')),'hex');
 INSERT INTO cotironda_piloto_privado.whapi_inbox(
  message_hmac,chat_hmac,participant_key,kind,nonce_b64,ciphertext_b64,
  plaintext_sha256,source_unix,processing_state)
 VALUES(reply,chat,'corralon_ailin','text','AAAAAAAAAAAAAAAA',
  'AAAAAAAAAAAAAAAAAAAAAAAA',
  encode(sha256(convert_to('COTI '||choice,'UTF8')),'hex'),
  extract(epoch from clock_timestamp())::bigint,'needs_review');
 answer:=public.cotironda_piloto_resolve_supplier_choice_mvp290(
  reply,other_chat,'COTI '||choice);
 IF answer->>'state'='resolved_private' THEN
  RAISE EXCEPTION 'mvp290_cross_chat_reply';END IF;
 IF (SELECT request_id FROM cotironda_piloto_privado.media_archive_mvp095
     WHERE message_hmac=src) IS NOT NULL
 THEN RAISE EXCEPTION 'mvp290_premature_link';END IF;
 answer:=public.cotironda_piloto_resolve_supplier_choice_mvp290(
  reply,chat,'COTI '||choice);
 IF answer->>'state'<>'resolved_private' OR answer->>'source_hmac'<>src
 THEN RAISE EXCEPTION 'mvp290_link_failed: %',answer;END IF;
 IF (SELECT request_id FROM cotironda_piloto_privado.media_archive_mvp095
     WHERE message_hmac=src)<>aid
 OR (SELECT request_id FROM cotironda_piloto_privado.whapi_inbox
     WHERE message_hmac=src)<>aid
 OR (SELECT resolved_request_id FROM cotironda_piloto_privado.ai_supplier_unresolved_mvp237
     WHERE message_hmac=src)<>aid
 OR (SELECT request_id FROM cotironda_piloto_privado.ai_supplier_links_mvp225
     WHERE message_hmac=src)<>aid
 THEN RAISE EXCEPTION 'mvp290_atomic_binding_broken';END IF;
 answer:=public.cotironda_piloto_resolve_supplier_choice_mvp290(
  reply,chat,'COTI '||choice);
 IF answer->>'state'='resolved_private'
 THEN RAISE EXCEPTION 'mvp290_duplicate_source';END IF;
 answer:=public.cotironda_piloto_reserve_supplier_replay_mvp290(src,other_chat);
 IF answer->>'state'='reserved' THEN RAISE EXCEPTION 'mvp290_other_chat_replay';END IF;
 answer:=public.cotironda_piloto_reserve_supplier_replay_mvp290(src,chat);
 IF answer->>'state'<>'reserved' OR answer->>'sha256'<>original_sha
 OR answer->'second'<>second THEN
  RAISE EXCEPTION 'mvp290_source_recovery_failed: %',answer;END IF;
 answer:=public.cotironda_piloto_reserve_supplier_replay_mvp290(src,chat);
 IF answer->>'state'='reserved' THEN RAISE EXCEPTION 'mvp290_duplicate_recovery';END IF;
 answer:=public.cotironda_piloto_finish_supplier_replay_mvp290(
  src,'review','source_not_commercially_verified');
 IF answer->>'state'<>'recorded' THEN RAISE EXCEPTION 'mvp290_replay_ledger_missing';END IF;
 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.anonymous_supplier_docs_mvp107
    WHERE message_hmac=src) THEN
  RAISE EXCEPTION 'mvp290_fake_prices_published';END IF;
 SELECT count(*) INTO post_jobs FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222;
 SELECT count(*) INTO post_outbox FROM cotironda_piloto_privado.whapi_outbox;
 IF pre_jobs<>post_jobs OR pre_outbox<>post_outbox THEN
  RAISE EXCEPTION 'mvp290_resent_supplier';END IF;
 RAISE NOTICE 'MVP290 PASS: mixed legacy/central rounds, unique codes, replay from private SHA, no resend, no published prices';
END $test$;
