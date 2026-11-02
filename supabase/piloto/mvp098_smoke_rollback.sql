-- MVP-098 SQL real PG17 smoke: all inputs synthetic, ROLLBACK.
begin;
do $s$
declare buyer_chat text;su_chat text;buyer_msg text;su_msg text;
 old_request uuid;source_sha text;answer jsonb;coverage jsonb;n int;
begin
 select chat_hmac into buyer_chat from cotironda_piloto_privado.participants
  where key='arquitecto' and consent_at is not null and opted_out_at is null;
 select chat_hmac into su_chat from cotironda_piloto_privado.participants
  where key='corralon_nahuel' and consent_at is not null and opted_out_at is null;
 select i.request_id into old_request from cotironda_piloto_privado.invitations i
  join cotironda_piloto_privado.requests r on r.id=i.request_id
  where i.supplier_key='corralon_nahuel' and i.state='prepared'
   and r.state='prepared' and r.closes_at>clock_timestamp() limit 1;
 if buyer_chat is null or su_chat is null or old_request is null then
  raise exception 'mvp098_test_missing_enrollment';end if;
 buyer_msg:=encode(extensions.gen_random_bytes(32),'hex');
 source_sha:=encode(extensions.gen_random_bytes(32),'hex');
 insert into cotironda_piloto_privado.whapi_inbox(
  message_hmac,chat_hmac,participant_key,kind,nonce_b64,ciphertext_b64,
  plaintext_sha256,source_unix,processing_state)
 values(buyer_msg,buyer_chat,'arquitecto','image','AAAAAAAAAAAAAAAA',
  'AAAAAAAAAAAAAAAAAAAAAAAA',source_sha,
  extract(epoch from clock_timestamp())::bigint,'needs_review');
 insert into cotironda_piloto_privado.media_archive_mvp095(
  message_hmac,chat_hmac,participant_key,kind,mime,media_id_sha256,
  state,size_bytes,content_sha256,storage_path,review_state,proposal)
 values(buyer_msg,buyer_chat,'arquitecto','image','image/jpeg',source_sha,
  'stored',127213,source_sha,'media/'||buyer_msg,'suggested_only',
  jsonb_build_object('status','review_required','kind','buyer_request',
   'delivery_city',null,'lines',jsonb_build_array(
    jsonb_build_object('original_description','Cemento','quantity','10','unit',null,
      'evidence_location','Página 1: 10 Cemento'),
    jsonb_build_object('original_description','Arena','quantity','2','unit',null,
      'evidence_location','Página 1: 2 Arena'),
    jsonb_build_object('original_description','Huecos del 12','quantity','288','unit',null,
      'evidence_location','Página 1: 288 Huecos del 12'))));

 answer:=public.cotironda_piloto_plan_document_mvp098(buyer_msg);
 if answer->>'state'<>'planned_private'
 or (answer->>'lines')::int<>3 then raise exception 'mvp098_plan_failed %',answer;end if;
 if (public.cotironda_piloto_plan_document_mvp098(buyer_msg))->>'state'<>'already_planned'
 then raise exception 'mvp098_replay_created_duplicate';end if;
 if (select count(*) from cotironda_piloto_privado.document_lines_mvp098
  where message_hmac=buyer_msg)<>3 then raise exception 'mvp098_missing_lines';end if;
 if (select count(*) from cotironda_piloto_privado.document_lines_mvp098
  where message_hmac=buyer_msg and blocker='missing_unit')<>3
 then raise exception 'mvp098_invented_units';end if;
 if (select count(*) from cotironda_piloto_privado.document_lines_mvp098
  where message_hmac=buyer_msg and classified_family is null)<>1
 then raise exception 'mvp098_arena_was_assumed';end if;
 if (select count(*) from cotironda_piloto_privado.document_lines_mvp098
  where message_hmac=buyer_msg and classified_family in
  ('cemento_gris_obra','ladrillo_hueco'))<>2
 then raise exception 'mvp098_family_mapping_wrong';end if;
 coverage:=public.cotironda_piloto_document_coverage_mvp098(buyer_msg);
 if jsonb_array_length(coverage)<>3
 or coverage->0->>'delivery_city_known'<>'false'
 or coverage->0->>'source_verified'<>'false'
 then raise exception 'mvp098_false_ready';end if;
 update cotironda_piloto_privado.media_archive_mvp095
  set delivery_city_confirmed='La Plata',delivery_zone_source_hmac=buyer_msg
 where message_hmac=buyer_msg;
 coverage:=public.cotironda_piloto_document_coverage_mvp098(buyer_msg);
 if coverage->0->>'delivery_city_known'<>'true'
 or jsonb_array_length(coverage->0->'suppliers')<1
 or jsonb_array_length(coverage->1->'suppliers')<>0
 or jsonb_array_length(coverage->2->'suppliers')<1
 then raise exception 'mvp098_catalog_routing_wrong %',coverage;end if;
 if coverage->0->'suppliers'->0->>'catalogue_confirmed'<>'false'
 then raise exception 'mvp098_catalog_confirmation_fabricated';end if;
 if public.cotironda_piloto_document_coverage_mvp098('x')<>'[]'::jsonb
 then raise exception 'mvp098_invalid_source_exposed';end if;
 if has_table_privilege('anon','cotironda_piloto_privado.document_lines_mvp098','SELECT')
 or has_table_privilege('authenticated','cotironda_piloto_privado.supplier_media_quotes_mvp098','SELECT')
 or has_function_privilege('anon',
  'public.cotironda_piloto_plan_document_mvp098(text)','EXECUTE')
 or has_function_privilege('anon',
  'public.cotironda_piloto_document_coverage_mvp098(text)','EXECUTE')
 then raise exception 'mvp098_public_access';end if;

 su_msg:=encode(extensions.gen_random_bytes(32),'hex');
 insert into cotironda_piloto_privado.whapi_inbox(
  message_hmac,chat_hmac,participant_key,kind,nonce_b64,ciphertext_b64,
  plaintext_sha256,source_unix,processing_state)
 values(su_msg,su_chat,'corralon_nahuel','document','AAAAAAAAAAAAAAAA',
  'AAAAAAAAAAAAAAAAAAAAAAAA',source_sha,
  extract(epoch from clock_timestamp())::bigint,'needs_review');
 insert into cotironda_piloto_privado.media_archive_mvp095(
  message_hmac,chat_hmac,participant_key,request_id,kind,mime,media_id_sha256,
  state,size_bytes,content_sha256,storage_path,review_state,proposal)
 values(su_msg,su_chat,'corralon_nahuel',old_request,'document','application/pdf',source_sha,
  'stored',2048,source_sha,'media/'||su_msg,'suggested_only',
  jsonb_build_object('status','review_required','kind','supplier_quote',
  'total_declared','$ 130.000',
  'lines',jsonb_build_array(
   jsonb_build_object('original_description','Cemento x bolsa','quantity','10',
    'unit_price','$ 12.000','line_total','$ 120.000','evidence_location','Página 1'),
   jsonb_build_object('original_description','Pallet vacío','quantity','1',
    'unit_price','$ 10.000','line_total','$ 10.000','evidence_location','Página 1'))));
 answer:=public.cotironda_piloto_record_supplier_media_mvp098(su_msg);
 if answer->>'state'<>'stored_unverified' or (answer->>'lines')::int<>2
 then raise exception 'mvp098_supplier_media_not_received %',answer;end if;
 if (public.cotironda_piloto_record_supplier_media_mvp098(su_msg))->>'state'<>'duplicate'
 then raise exception 'mvp098_offer_duplicate';end if;
 if (select declared_total_literal from cotironda_piloto_privado.supplier_media_quotes_mvp098
   where message_hmac=su_msg)<>'$ 130.000'
 then raise exception 'mvp098_total_was_mutated';end if;
 if (select count(*) from cotironda_piloto_privado.offer_versions
  where request_id=old_request and supplier_key='corralon_nahuel')<>0
 then raise exception 'mvp098_media_falsely_verified';end if;
end;$s$;
rollback;
