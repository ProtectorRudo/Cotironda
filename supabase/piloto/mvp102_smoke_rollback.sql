-- MVP-102: real PostgreSQL 17 rollback of dual-reading decisions.
-- Requires MVP-101 and MVP-102 migrations in the same isolated transaction.
begin;
do $test$
declare sc text;rid uuid;source_sha text;msg text;proposal jsonb;
 second jsonb; result jsonb; recorded jsonb; step text;expected text;
 expected_line integer;row_ record; before_offers bigint;
begin
 select p.chat_hmac into sc from cotironda_piloto_privado.participants p
 where p.key='corralon_nahuel' and p.participant_role='supplier'
   and p.consent_at is not null and p.opted_out_at is null;
 select i.request_id into rid from cotironda_piloto_privado.invitations i
 join cotironda_piloto_privado.requests r on r.id=i.request_id
 where i.supplier_key='corralon_nahuel' and i.state='prepared'
  and r.state='prepared' and r.closes_at>clock_timestamp() limit 1;
 if sc is null or rid is null then
  raise exception 'mvp102_missing_supplier_round';end if;
 select count(*) into before_offers
 from cotironda_piloto_privado.offer_versions
 where request_id=rid and supplier_key='corralon_nahuel';
 for row_ in select * from (values
  ('match','matched',null::integer),
  ('changed_price','line_disagreement',1),
  ('changed_discount','line_disagreement',5),
  ('changed_total','total_disagreement',null::integer),
  ('omitted_pallet','line_count_disagreement',null::integer),
  ('unavailable','second_unavailable',null::integer),
  ('wrong_kind','kind_disagreement',null::integer),
  ('notes','metadata_disagreement',null::integer),
  ('unanswered','unanswered_questions',null::integer),
  ('ambiguous','unresolved_ambiguity',2),
  ('no_evidence','evidence_missing',3),
  ('malformed','second_invalid',null::integer),
  ('missing_kind','second_invalid',null::integer),
  ('missing_null_field','line_disagreement',3)
 ) as x(scenario,reason,expected_line)
 loop
  step:=row_.scenario;expected:=row_.reason;expected_line:=row_.expected_line;
  msg:=encode(extensions.gen_random_bytes(32),'hex');
  source_sha:=encode(extensions.gen_random_bytes(32),'hex');
  proposal:=jsonb_build_object(
   'status','review_required','kind','supplier_quote',
   'delivery_city',null,'requested_delivery_note',null,
   'unanswered','[]'::jsonb,'total_declared','$ 211.000,00',
   'lines',jsonb_build_array(
     jsonb_build_object('original_description','Cemento CPC 50 kg',
      'quantity','20','unit','bolsas','unit_price','$ 9.500,00',
      'line_total','$ 190.000,00','ambiguity',null,
      'evidence_location','Página 1 fila 1: cemento 20 bolsas'),
     jsonb_build_object('original_description','2 pallets vacíos',
      'quantity','2','unit','unidades','unit_price','$ 7.000,00',
      'line_total','$ 14.000,00','ambiguity',null,
      'evidence_location','Página 1 fila 2: pallets vacíos'),
     jsonb_build_object('original_description','3 bolsones vacíos',
      'quantity','3','unit',null,'unit_price',null,
      'line_total','$ 1.500,00','ambiguity',null,
      'evidence_location','Página 1 fila 3: bolsones'),
     jsonb_build_object('original_description','Flete a obra',
      'quantity',null,'unit',null,'unit_price',null,
      'line_total','$ 12.000,00','ambiguity',null,
      'evidence_location','Página 1 fila 4: flete'),
     jsonb_build_object('original_description','Descuento comercial',
      'quantity',null,'unit',null,'unit_price',null,
      'line_total','-$ 3.000,00','ambiguity',null,
      'evidence_location','Página 1 fila 5: descuento')
    ));
  if step='ambiguous' then
   proposal:=jsonb_set(proposal,'{lines,1,ambiguity}',
    to_jsonb('No indica si los pallets son retornables'::text));
  elsif step='unanswered' then
   proposal:=jsonb_set(proposal,'{unanswered}',
    '["Falta condición de IVA"]'::jsonb);
  end if;
  insert into cotironda_piloto_privado.whapi_inbox(
   message_hmac,chat_hmac,participant_key,kind,nonce_b64,ciphertext_b64,
   plaintext_sha256,source_unix,processing_state)
  values(msg,sc,'corralon_nahuel','document','AAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAA',source_sha,
    extract(epoch from clock_timestamp())::bigint,'needs_review');
  insert into cotironda_piloto_privado.media_archive_mvp095(
   message_hmac,chat_hmac,participant_key,request_id,kind,mime,media_id_sha256,
   state,size_bytes,content_sha256,storage_path,review_state,proposal)
  values(msg,sc,'corralon_nahuel',rid,'document','application/pdf',source_sha,
   'stored',2048,source_sha,'media/'||msg,'suggested_only',proposal);
  recorded:=public.cotironda_piloto_record_supplier_media_mvp098(msg);
  if recorded->>'state'<>'stored_unverified'
   or (recorded->>'mirror_lines')::integer<>5 then
   raise exception 'mvp102_receipt_failed % %',step,recorded;end if;
  second:=proposal;
  if step='changed_price' then
   second:=jsonb_set(second,'{lines,0,unit_price}',
     to_jsonb('$ 9.600,00'::text));
  elsif step='changed_discount' then
   second:=jsonb_set(second,'{lines,4,line_total}',
     to_jsonb('$ 3.000,00'::text));
  elsif step='changed_total' then
   second:=jsonb_set(second,'{total_declared}',
     to_jsonb('$ 999.000,00'::text));
  elsif step='omitted_pallet' then
   second:=jsonb_set(second,'{lines}',(second->'lines')-1);
  elsif step='unavailable' then second:=null;
  elsif step='wrong_kind' then
   second:=jsonb_set(second,'{kind}',to_jsonb('buyer_request'::text));
  elsif step='notes' then
   second:=jsonb_set(second,'{requested_delivery_note}',
     to_jsonb('entrega lunes'::text));
  elsif step='no_evidence' then
   second:=jsonb_set(second,'{lines,2,evidence_location}',
     to_jsonb(''::text));
  elsif step='malformed' then second:='"no es un objeto"'::jsonb;
  elsif step='missing_kind' then second:=second-'kind';
  elsif step='missing_null_field' then
   second:=jsonb_set(second,'{lines,2}',
     (second->'lines'->2)-'unit_price');
  end if;
  result:=public.cotironda_piloto_compare_supplier_readings_mvp102(msg,second);
  if result->>'reason'<>expected
   or (expected='matched' and result->>'state'<>'model_readings_match')
   or (expected<>'matched' and result->>'state'<>'needs_source_review')
   or result->>'ranking_allowed'<>'false'
   or result->>'source_verified'<>'false'
   or (result->>'line_no')::integer is distinct from expected_line
  then raise exception 'mvp102_wrong_outcome scenario=% got=% expected=%',
   step,result,expected;end if;
  if (public.cotironda_piloto_compare_supplier_readings_mvp102(msg,second))
      ->>'state'<>'already_checked'
  then raise exception 'mvp102_duplicate_check %',step;end if;
  if (select source_sha256 from
     cotironda_piloto_privado.supplier_reading_checks_mvp102
     where message_hmac=msg)<>source_sha
  or (select source_media.proposal
     from cotironda_piloto_privado.media_archive_mvp095 source_media
     where source_media.message_hmac=msg)<>proposal
  or (select declared_total_literal from
     cotironda_piloto_privado.supplier_media_quotes_mvp098
     where message_hmac=msg)<>'$ 211.000,00'
  then raise exception 'mvp102_primary_or_source_modified %',step;end if;
 end loop;
 if (select count(*) from cotironda_piloto_privado.offer_versions
  where request_id=rid and supplier_key='corralon_nahuel')<>before_offers
 then raise exception 'mvp102_created_unverified_offer';end if;
 -- Immutability is enforced even for privileged callers.
 begin
  update cotironda_piloto_privado.supplier_reading_checks_mvp102
  set state='model_readings_match' where message_hmac=msg;
  raise exception 'mvp102_check_could_be_edited';
 exception when check_violation then null;
 end;
 if has_table_privilege('anon',
     'cotironda_piloto_privado.supplier_reading_checks_mvp102','SELECT')
 or has_table_privilege('authenticated',
     'cotironda_piloto_privado.supplier_reading_checks_mvp102','SELECT')
 or has_function_privilege('anon',
     'public.cotironda_piloto_compare_supplier_readings_mvp102(text,jsonb)',
       'EXECUTE')
 or has_function_privilege('authenticated',
     'public.cotironda_piloto_compare_supplier_readings_mvp102(text,jsonb)',
       'EXECUTE')
 then raise exception 'mvp102_public_access';end if;
 if (public.cotironda_piloto_compare_supplier_readings_mvp102(
    repeat('a',64),null))->>'state'<>'not_permitted'
 then raise exception 'mvp102_unauthenticated_source_accepted';end if;
end;$test$;
rollback;
