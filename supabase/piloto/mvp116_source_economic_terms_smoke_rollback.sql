-- MVP-116: verify that newly blocked economic terms/money omissions remain
-- private and cannot be promoted as source-covered. Original image is denied.
-- SQL tests RPC reason persistence; binary source tests run in Node.
-- MVP-106: no network, no outgoing WhatsApp; run in one transaction and ROLLBACK.
begin;
do $test$
declare sc text;rid uuid;msg text;sha text;proposal jsonb;
 receipt jsonb;cmp jsonb;arith jsonb;result jsonb;
 previous_offers bigint; row_ record;
begin
 select chat_hmac into sc from cotironda_piloto_privado.participants
 where key='corralon_nahuel' and participant_role='supplier'
 and consent_at is not null and opted_out_at is null;
 select i.request_id into rid from cotironda_piloto_privado.invitations i
 join cotironda_piloto_privado.requests r on r.id=i.request_id
 where i.supplier_key='corralon_nahuel' and i.state='prepared'
 and r.state='prepared' and r.closes_at>clock_timestamp()
 limit 1;
 if sc is null or rid is null then raise exception 'mvp106_fixture_missing';end if;
 select count(*) into previous_offers
 from cotironda_piloto_privado.offer_versions;
 for row_ in select * from(values
  ('source_text_covered','covered','text/plain','source_text_covered'),
  ('needs_source_review','uncovered_terms','text/plain','needs_source_review'),
  ('needs_source_review','uncovered_money','text/csv','needs_source_review'),
  ('needs_source_review','unsupported_format','image/jpeg','needs_source_review')
 ) as x(st,reason,mime,expected)
 loop
  msg:=encode(extensions.gen_random_bytes(32),'hex');
  sha:=encode(extensions.gen_random_bytes(32),'hex');
  proposal:=jsonb_build_object(
   'kind','supplier_quote','status','review_required','delivery_city',null,
   'requested_delivery_note',null,'unanswered','[]'::jsonb,
   'total_declared','$ 214.500,00',
   'lines',jsonb_build_array(
    jsonb_build_object('original_description','Cemento CPC 50 kg',
      'quantity','20','unit','bolsas','unit_price','$ 9.500,00',
      'line_total','$ 190.000,00','evidence_location','fila 1','ambiguity',null),
    jsonb_build_object('original_description','pallets vacíos',
      'quantity','2','unit','unidades','unit_price','$ 7.000,00',
      'line_total','$ 14.000,00','evidence_location','fila 2','ambiguity',null),
    jsonb_build_object('original_description','bolsones vacíos',
      'quantity','3','unit','unidades','unit_price','$ 500,00',
      'line_total','$ 1.500,00','evidence_location','fila 3','ambiguity',null),
    jsonb_build_object('original_description','Flete a obra',
      'quantity',null,'unit',null,'unit_price',null,
      'line_total','$ 12.000,00','evidence_location','fila 4','ambiguity',null),
    jsonb_build_object('original_description','Descuento comercial',
      'quantity',null,'unit',null,'unit_price',null,
      'line_total','-$ 3.000,00','evidence_location','fila 5','ambiguity',null)
   ));
  insert into cotironda_piloto_privado.whapi_inbox(
   message_hmac,chat_hmac,participant_key,kind,nonce_b64,ciphertext_b64,
   plaintext_sha256,source_unix,processing_state)
  values(msg,sc,'corralon_nahuel','document','AAAAAAAAAAAAAAAA',
   'AAAAAAAAAAAAAAAAAAAAAAAA',sha,
   extract(epoch from clock_timestamp())::bigint,'needs_review');
  insert into cotironda_piloto_privado.media_archive_mvp095(
   message_hmac,chat_hmac,participant_key,request_id,kind,mime,
   media_id_sha256,state,size_bytes,content_sha256,storage_path,
   review_state,proposal)
  values(msg,sc,'corralon_nahuel',rid,'document',row_.mime,
   sha,'stored',1024,sha,'media/'||msg,'suggested_only',proposal);
  receipt:=public.cotironda_piloto_record_supplier_media_mvp098(msg);
  if receipt->>'state'<>'stored_unverified' or
    (receipt->>'mirror_lines')::int<>5 then
   raise exception 'mvp106_receipt %',receipt;end if;
  cmp:=public.cotironda_piloto_compare_supplier_readings_mvp102(msg,proposal);
  if cmp->>'state'<>'model_readings_match' then
   raise exception 'mvp106_double_read %',cmp;end if;
  arith:=public.cotironda_piloto_audit_supplier_amounts_mvp103(msg);
  if arith->>'state'<>'balanced' then
   raise exception 'mvp106_amount_audit %',arith;end if;
  if (public.cotironda_piloto_record_supplier_source_check_mvp106(
    msg,repeat('b',64),row_.st,row_.reason,5))->>'state'
      <>'source_mismatch'
  then raise exception 'mvp106_wrong_sha_accepted';end if;
  if (public.cotironda_piloto_record_supplier_source_check_mvp106(
    msg,sha,row_.st,row_.reason,4))->>'state'
      <>'source_mismatch'
  then raise exception 'mvp106_partial_line_count_accepted';end if;
  if row_.mime='image/jpeg' and
   (public.cotironda_piloto_record_supplier_source_check_mvp106(
    msg,sha,'source_text_covered','covered',5))->>'state'
      <>'unsupported_format'
  then raise exception 'mvp116_photo_could_be_attested_as_txt';end if;
  result:=public.cotironda_piloto_record_supplier_source_check_mvp106(
    msg,sha,row_.st,row_.reason,5);
  if result->>'state'<>row_.expected or
    result->>'publication_allowed'<>'false' or
    result->>'ranking_allowed'<>'false' or
    result->>'source_verified'<>'false'
  then raise exception 'mvp106_fidelity_result_failed %',result;end if;
  if (public.cotironda_piloto_record_supplier_source_check_mvp106(
    msg,sha,row_.st,row_.reason,5))->>'state'<>'already_checked'
  then raise exception 'mvp106_replay';end if;
  if (select source_sha256
    from cotironda_piloto_privado.supplier_source_checks_mvp106
    where message_hmac=msg)<>sha
  then raise exception 'mvp106_sha_not_recorded';end if;
  begin
   update cotironda_piloto_privado.supplier_source_checks_mvp106
   set reason='line_not_found' where message_hmac=msg;
   raise exception 'mvp106_ledger_mutable';
  exception when check_violation then null;
  end;
  if (select source_sha256 from
    cotironda_piloto_privado.supplier_media_quotes_mvp098
    where message_hmac=msg)<>sha
  then raise exception 'mvp106_original_modified';end if;
 end loop;
 if (select count(*) from cotironda_piloto_privado.offer_versions)
   <>previous_offers
 then raise exception 'mvp106_created_economic_offer';end if;
 if has_table_privilege('anon',
  'cotironda_piloto_privado.supplier_source_checks_mvp106','SELECT')
 or has_table_privilege('authenticated',
  'cotironda_piloto_privado.supplier_source_checks_mvp106','SELECT')
 or has_function_privilege('anon',
  'public.cotironda_piloto_record_supplier_source_check_mvp106(text,text,text,text,integer)','EXECUTE')
 then raise exception 'mvp106_public_access';end if;
end;$test$;
rollback;