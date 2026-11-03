-- MVP-103: all fabricated data in a single transaction and ROLLBACK.
-- Prerequisites MVP-101 + MVP-102 + MVP-103 schema, PILOTO PG17.
begin;
do $test$
declare
 sc text;rid uuid;msg text;sha text; proposal jsonb;result jsonb;
 row_ record;case_ text;expected text;state_ text;problem integer;
 old_offers bigint;
begin
 select chat_hmac into sc from cotironda_piloto_privado.participants
 where key='corralon_nahuel' and participant_role='supplier'
 and consent_at is not null and opted_out_at is null;
 select i.request_id into rid from cotironda_piloto_privado.invitations i
 join cotironda_piloto_privado.requests r on r.id=i.request_id
 where i.supplier_key='corralon_nahuel' and i.state='prepared'
 and r.state='prepared' and r.closes_at>clock_timestamp() limit 1;
 if sc is null or rid is null then raise exception 'mvp103_fixture_missing';end if;
 select count(*) into old_offers from cotironda_piloto_privado.offer_versions
  where request_id=rid and supplier_key='corralon_nahuel';
 -- Independent cent parsing: never guess thousand/decimal separator.
 if cotironda_piloto_privado.parse_amount_cents_mvp103('$ 9.500,00')<>950000
 or cotironda_piloto_privado.parse_amount_cents_mvp103('-$ 3.000,00')<>-300000
 or cotironda_piloto_privado.parse_amount_cents_mvp103('$ 1,250.50')<>125050
 or cotironda_piloto_privado.parse_amount_cents_mvp103('$ 7000')<>700000
 or cotironda_piloto_privado.parse_amount_cents_mvp103('$ 7.000') is not null
 or cotironda_piloto_privado.parse_amount_cents_mvp103('USD 100.00') is not null
 then raise exception 'mvp103_parser_failed';end if;

 for row_ in select * from (values
  ('balanced','balanced','balanced',null::integer),
  ('total_mismatch','total_mismatch','difference',null::integer),
  ('ambiguous_total','ambiguous_total','needs_review',null::integer),
  ('ambiguous_line','ambiguous_line_amount','needs_review',2),
  ('missing_line','missing_line_amount','needs_review',3),
  ('invalid_quantity','invalid_quantity','needs_review',1),
  ('wrong_multiplication','line_multiplication_mismatch','difference',1),
  ('wrong_discount','discount_sign_inconsistent','difference',5),
  ('no_second_read','not_permitted','not_permitted',null::integer)
 ) as cases(name,reason,state,line)
 loop
  case_:=row_.name;expected:=row_.reason;state_:=row_.state;
  problem:=row_.line;msg:=encode(extensions.gen_random_bytes(32),'hex');
  sha:=encode(extensions.gen_random_bytes(32),'hex');
  proposal:=jsonb_build_object(
    'status','review_required','kind','supplier_quote',
    'delivery_city',null,'requested_delivery_note',null,'unanswered','[]'::jsonb,
    'total_declared','$ 214.500,00',
    'lines',jsonb_build_array(
     jsonb_build_object('original_description','Cemento CPC 50 kg',
       'quantity','20','unit','bolsas','unit_price','$ 9.500,00',
       'line_total','$ 190.000,00','evidence_location','Página 1 fila 1',
       'ambiguity',null),
     jsonb_build_object('original_description','2 pallets vacíos',
       'quantity','2','unit','unidades','unit_price','$ 7.000,00',
       'line_total','$ 14.000,00','evidence_location','Página 1 fila 2',
       'ambiguity',null),
     jsonb_build_object('original_description','3 bolsones vacíos',
       'quantity','3','unit',null,'unit_price',null,
       'line_total','$ 1.500,00','evidence_location','Página 1 fila 3',
       'ambiguity',null),
     jsonb_build_object('original_description','Flete a obra',
       'quantity',null,'unit',null,'unit_price',null,
       'line_total','$ 12.000,00','evidence_location','Página 1 fila 4',
       'ambiguity',null),
     jsonb_build_object('original_description','Descuento comercial',
       'quantity',null,'unit',null,'unit_price',null,
       'line_total','-$ 3.000,00','evidence_location','Página 1 fila 5',
       'ambiguity',null)
   ));
  if case_='total_mismatch' then
   proposal:=jsonb_set(proposal,'{total_declared}',
     to_jsonb('$ 215.000,00'::text));
  elsif case_='ambiguous_total' then
   proposal:=jsonb_set(proposal,'{total_declared}',
     to_jsonb('$ 214.500'::text));
  elsif case_='ambiguous_line' then
   proposal:=jsonb_set(proposal,'{lines,1,unit_price}',
     to_jsonb('$ 7.000'::text));
  elsif case_='missing_line' then
   proposal:=jsonb_set(proposal,'{lines,2,line_total}','null'::jsonb);
  elsif case_='invalid_quantity' then
   proposal:=jsonb_set(proposal,'{lines,0,quantity}',
     to_jsonb('veinte'::text));
  elsif case_='wrong_multiplication' then
   proposal:=jsonb_set(proposal,'{lines,0,line_total}',
     to_jsonb('$ 189.000,00'::text));
  elsif case_='wrong_discount' then
   proposal:=jsonb_set(proposal,'{lines,4,line_total}',
     to_jsonb('$ 3.000,00'::text));
  end if;
  insert into cotironda_piloto_privado.whapi_inbox(
   message_hmac,chat_hmac,participant_key,kind,nonce_b64,ciphertext_b64,
   plaintext_sha256,source_unix,processing_state)
  values(msg,sc,'corralon_nahuel','document','AAAAAAAAAAAAAAAA',
   'AAAAAAAAAAAAAAAAAAAAAAAA',sha,
   extract(epoch from clock_timestamp())::bigint,'needs_review');
  insert into cotironda_piloto_privado.media_archive_mvp095(
   message_hmac,chat_hmac,participant_key,request_id,kind,mime,media_id_sha256,
   state,size_bytes,content_sha256,storage_path,review_state,proposal)
  values(msg,sc,'corralon_nahuel',rid,'document','application/pdf',sha,
   'stored',2048,sha,'media/'||msg,'suggested_only',proposal);
  result:=public.cotironda_piloto_record_supplier_media_mvp098(msg);
  if result->>'state'<>'stored_unverified'
   or (result->>'mirror_lines')::int<>5 then
   raise exception 'mvp103_receipt_failed % %',case_,result;end if;
  if case_<>'no_second_read' then
   result:=public.cotironda_piloto_compare_supplier_readings_mvp102(
    msg,proposal);
   if result->>'state'<>'model_readings_match' then
    raise exception 'mvp103_models_disagree_unexpectedly % %',case_,result;
   end if;
  end if;
  result:=public.cotironda_piloto_audit_supplier_amounts_mvp103(msg);
  if result->>'state'<>state_
   or (case_<>'no_second_read' and result->>'reason'<>expected)
   or (result->>'line_no')::integer is distinct from problem
   or (case_<>'no_second_read' and
       (result->>'source_verified'<>'false' or
        result->>'ranking_allowed'<>'false'))
  then raise exception 'mvp103_unexpected_result % got=% expecting=%/%',
    case_,result,state_,expected;end if;
  if case_<>'no_second_read' then
   if (public.cotironda_piloto_audit_supplier_amounts_mvp103(msg))
      ->>'state'<>'already_checked'
   then raise exception 'mvp103_not_idempotent %',case_;end if;
   if case_='balanced' and
     ((select observed_sum_cents from
       cotironda_piloto_privado.supplier_amount_checks_mvp103
       where message_hmac=msg)<>21450000
     or (select declared_total_cents from
       cotironda_piloto_privado.supplier_amount_checks_mvp103
       where message_hmac=msg)<>21450000)
   then raise exception 'mvp103_balanced_cents_wrong';end if;
   if (select source_sha256 from
     cotironda_piloto_privado.supplier_amount_checks_mvp103
     where message_hmac=msg)<>sha
   then raise exception 'mvp103_origin_changed';end if;
  end if;
  if (select m.proposal from cotironda_piloto_privado.media_archive_mvp095 m
    where m.message_hmac=msg)<>proposal
  then raise exception 'mvp103_original_modified';end if;
 end loop;
 if (select count(*) from cotironda_piloto_privado.offer_versions
  where request_id=rid and supplier_key='corralon_nahuel')<>old_offers
 then raise exception 'mvp103_created_economic_offer';end if;
 if has_table_privilege('anon',
  'cotironda_piloto_privado.supplier_amount_checks_mvp103','SELECT')
 or has_table_privilege('authenticated',
  'cotironda_piloto_privado.supplier_amount_checks_mvp103','SELECT')
 or has_function_privilege('anon',
  'public.cotironda_piloto_audit_supplier_amounts_mvp103(text)','EXECUTE')
 then raise exception 'mvp103_public_access';end if;
end;$test$;
rollback;