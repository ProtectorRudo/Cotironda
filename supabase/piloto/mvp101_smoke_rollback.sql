-- MVP-101. Synthetic supplier quote, reversible. Run AFTER MVP-101 schema.
begin;
do $test$
declare
 sc text; msg text; sha text; rid uuid; result jsonb; src jsonb;
 baseline bigint;
begin
 select p.chat_hmac into sc from cotironda_piloto_privado.participants p
  where p.key='corralon_nahuel' and p.participant_role='supplier'
    and p.consent_at is not null and p.opted_out_at is null;
 select i.request_id into rid from cotironda_piloto_privado.invitations i
 join cotironda_piloto_privado.requests r on r.id=i.request_id
 where i.supplier_key='corralon_nahuel' and i.state='prepared'
  and r.state='prepared' and r.closes_at>clock_timestamp() limit 1;
 if sc is null or rid is null then
  raise exception 'mvp101_test_requires_active_pilot_supplier';end if;
 msg:=encode(extensions.gen_random_bytes(32),'hex');
 sha:=encode(extensions.gen_random_bytes(32),'hex');
 select count(*) into baseline from cotironda_piloto_privado.offer_versions
  where request_id=rid and supplier_key='corralon_nahuel';
 src:=jsonb_build_object('status','review_required','kind','supplier_quote',
  'total_declared','$ 216.500,00', -- deliberately does NOT match the lines
  'lines',jsonb_build_array(
   jsonb_build_object('original_description','20 bolsas cemento CPC 50kg',
    'quantity','20','unit','bolsas','unit_price','$ 9.500,00',
    'line_total','$ 190.000,00','evidence_location','Página 1, fila 1',
    'ambiguity',null),
   jsonb_build_object('original_description','2 pallets vacíos',
    'quantity','2','unit','unidad','unit_price','$ 7.000,00',
    'line_total',null,'evidence_location','Página 1, fila 2',
    'ambiguity','No indica si es precio unitario o total'),
   jsonb_build_object('original_description','3 bolsones vacíos',
    'quantity','3','unit',null,'unit_price',null,
    'line_total','$ 1.500,00','evidence_location','Página 1, fila 3',
    'ambiguity',null),
   jsonb_build_object('original_description','Flete a obra',
    'quantity',null,'unit',null,'unit_price',null,
    'line_total','$ 12.000,00','evidence_location','Página 1, fila 4',
    'ambiguity',null),
   jsonb_build_object('original_description','Descuento comercial',
    'quantity',null,'unit',null,'unit_price',null,
    'line_total','-$ 3.000,00','evidence_location','Página 1, fila 5',
    'ambiguity',null)
  ));
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
  'stored',2048,sha,'media/'||msg,'suggested_only',src);
 result:=public.cotironda_piloto_record_supplier_media_mvp098(msg);
 if result->>'state'<>'stored_unverified'
  or (result->>'mirror_lines')::int<>5
  or result->>'ranking_allowed'<>'false'
 then raise exception 'mvp101_not_mirrored %',result;end if;
 if (select count(*) from cotironda_piloto_privado.supplier_quote_lines_mvp101
     where message_hmac=msg)<>5
 then raise exception 'mvp101_lost_or_added_lines';end if;
 if (select string_agg(description_literal,'|' order by line_no)
     from cotironda_piloto_privado.supplier_quote_lines_mvp101
     where message_hmac=msg)
    <>'20 bolsas cemento CPC 50kg|2 pallets vacíos|3 bolsones vacíos|Flete a obra|Descuento comercial'
 then raise exception 'mvp101_line_order_lost';end if;
 if (select unit_price_literal from cotironda_piloto_privado.supplier_quote_lines_mvp101
     where message_hmac=msg and line_no=2)<>'$ 7.000,00'
 or (select ambiguity_literal from cotironda_piloto_privado.supplier_quote_lines_mvp101
     where message_hmac=msg and line_no=2)
    <>'No indica si es precio unitario o total'
 or (select line_total_literal from cotironda_piloto_privado.supplier_quote_lines_mvp101
     where message_hmac=msg and line_no=5)<>'-$ 3.000,00'
 then raise exception 'mvp101_extra_or_discount_modified';end if;
 if (select declared_total_literal from cotironda_piloto_privado.supplier_media_quotes_mvp098
  where message_hmac=msg)<>'$ 216.500,00'
 or (select source_sha256 from cotironda_piloto_privado.supplier_media_quotes_mvp098
  where message_hmac=msg)<>sha
 or (select proposal from cotironda_piloto_privado.media_archive_mvp095
  where message_hmac=msg)<>src
 then raise exception 'mvp101_original_or_total_modified';end if;
 result:=public.cotironda_piloto_record_supplier_media_mvp098(msg);
 if result->>'state'<>'duplicate'
  or result->>'line_mirror_complete'<>'true'
 then raise exception 'mvp101_duplicate_changed %',result;end if;
 if (select count(*) from cotironda_piloto_privado.offer_versions
  where request_id=rid and supplier_key='corralon_nahuel')<>baseline
 then raise exception 'mvp101_promoted_unverified_prices';end if;
 if has_table_privilege('anon',
   'cotironda_piloto_privado.supplier_quote_lines_mvp101','SELECT')
 or has_table_privilege('authenticated',
   'cotironda_piloto_privado.supplier_quote_lines_mvp101','SELECT')
 or has_table_privilege('service_role',
   'cotironda_piloto_privado.supplier_quote_lines_mvp101','SELECT')
 or has_function_privilege('anon',
   'public.cotironda_piloto_record_supplier_media_mvp098(text)','EXECUTE')
 then raise exception 'mvp101_private_data_exposed';end if;
 -- Adversarial: invalid numeric type in a supposed literal must not
 -- make a second receipt or even one mirrored row.
 update cotironda_piloto_privado.media_archive_mvp095
 set proposal=jsonb_set(src,'{lines,0,unit_price}','9500'::jsonb)
 where message_hmac=msg;
 result:=public.cotironda_piloto_record_supplier_media_mvp098(msg);
 if result->>'state'<>'invalid_source_line'
 then raise exception 'mvp101_numeric_literal_was_accepted %',result;end if;
 -- Immutable snapshot: changing the proposal does not overwrite the receipt.
 if (select unit_price_literal from cotironda_piloto_privado.supplier_quote_lines_mvp101
    where message_hmac=msg and line_no=1)<>'$ 9.500,00'
 then raise exception 'mvp101_snapshot_mutated';end if;
end;$test$;
rollback;
