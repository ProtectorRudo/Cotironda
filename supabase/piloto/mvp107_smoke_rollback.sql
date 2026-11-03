-- MVP-107: full anonymous TXT projection and private buyer tracking.
-- Synthetic data only. Requires 101..107 migrations in SAME rollback tx.
begin;
do $test$
declare sc text;bc text;rid uuid;msg text;sha text;buyer_source text;
 token text;proposal jsonb;out_ jsonb;content text;
 msg2 text;before_offers integer;
begin
 select chat_hmac into sc from cotironda_piloto_privado.participants
 where key='corralon_nahuel' and participant_role='supplier'
  and consent_at is not null and opted_out_at is null;
 select chat_hmac into bc from cotironda_piloto_privado.participants
 where key='arquitecto' and participant_role='buyer'
  and consent_at is not null and opted_out_at is null;
 if sc is null or bc is null then raise exception 'mvp107_fixture_missing';end if;
 select count(*) into before_offers
  from cotironda_piloto_privado.offer_versions;
 msg:=encode(extensions.gen_random_bytes(32),'hex');
 sha:=encode(extensions.gen_random_bytes(32),'hex');
 buyer_source:=encode(extensions.gen_random_bytes(32),'hex');
 token:=encode(extensions.gen_random_bytes(32),'hex');
 insert into cotironda_piloto_privado.requests(
  buyer_key,delivery_city,original_request,source_hmac,state)
 values('arquitecto','La Plata','pedido sintético 20 bolsas cemento',
  buyer_source,'prepared') returning id into rid;
 insert into cotironda_piloto_privado.request_lines(
  request_id,line_no,original_description,quantity,unit,family_code)
 values(rid,1,'Cemento CPC 50 kg',20,'bag','cemento_gris_obra');
 insert into cotironda_piloto_privado.invitations(request_id,supplier_key)
 values(rid,'corralon_nahuel');
 out_:=public.cotironda_piloto_issue_tracking_mvp091(bc,buyer_source,token);
 if out_->>'state'<>'issued' then
  raise exception 'mvp107_no_tracking %',out_;end if;
 proposal:=jsonb_build_object(
  'kind','supplier_quote','status','review_required','delivery_city',null,
  'requested_delivery_note', 'PRECIOS LISTA 7; PAGO CONTADO EFECTIVO; FLETE A CONVENIR; DEVOLUCION DE PALLETS', 'unanswered','[]'::jsonb,
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
 values(msg,sc,'corralon_nahuel',rid,'document','text/plain',sha,
  'stored',1024,sha,'media/'||msg,'suggested_only',proposal);
 out_:=public.cotironda_piloto_record_supplier_media_mvp098(msg);
 if out_->>'state'<>'stored_unverified' then
  raise exception 'mvp107_mirror_unavailable %',out_;end if;
 out_:=public.cotironda_piloto_compare_supplier_readings_mvp102(msg,proposal);
 if out_->>'state'<>'model_readings_match' then
  raise exception 'mvp107_dual_disagrees %',out_;end if;
 out_:=public.cotironda_piloto_audit_supplier_amounts_mvp103(msg);
 if out_->>'state'<>'balanced' then
  raise exception 'mvp107_amounts_disagree %',out_;end if;
 -- No source coverage => no automatic publication.
 if (public.cotironda_piloto_publish_source_text_mvp107(msg))
   ->>'state'<>'not_permitted'
 then raise exception 'mvp107_unverified_source_was_published';end if;
 out_:=public.cotironda_piloto_record_supplier_source_check_mvp106(
  msg,sha,'source_text_covered','covered',5);
 if out_->>'state'<>'source_text_covered' then
  raise exception 'mvp107_no_source_coverage %',out_;end if;
 out_:=public.cotironda_piloto_publish_source_text_mvp107(msg);
 if out_->>'state'<>'published_anonymous' or
    out_->>'ranking_allowed'<>'false' or
    out_->>'contact_revealed'<>'false' then
  raise exception 'mvp107_no_safe_publication %',out_;end if;
 if (public.cotironda_piloto_publish_source_text_mvp107(msg))
   ->>'state'<>'already_published'
 then raise exception 'mvp107_duplicate_publication';end if;
 select public_text into content
 from cotironda_piloto_privado.anonymous_supplier_docs_mvp107
 where message_hmac=msg;
 if content not like '%Cemento CPC 50 kg%'
 or content not like '%pallets vacíos%'
 or content not like '%bolsones vacíos%'
 or content not like '%Flete a obra%'
 or content not like '%Descuento comercial%'
 or content not like '%-$ 3.000,00%'
 or content not like '%TOTAL DECLARADO: $ 214.500,00%'\n or content not like '%ACLARACIONES DEL PROVEEDOR%'\n or content not like '%PRECIOS LISTA 7%'\n or content not like '%PAGO CONTADO EFECTIVO%'\n or content not like '%FLETE A CONVENIR%'\n or content not like '%DEVOLUCION DE PALLETS%'
 or content like '%corralon_nahuel%'
 then raise exception 'mvp107_original_concepts_not_preserved';end if;
 out_:=public.cotironda_piloto_tracking_status_mvp091(token);
 if out_->>'state'<>'waiting' or out_->>'can_open'<>'true'
  or jsonb_array_length(out_->'offers')<>1
  or position('Cemento CPC 50 kg' in out_::text)=0
  or position('corralon_nahuel' in out_::text)>0
 then raise exception 'mvp107_buyer_projection_not_visible %',out_;end if;

 -- A new later, unverified file hides previous prices and contact details.
 msg2:=encode(extensions.gen_random_bytes(32),'hex');
 insert into cotironda_piloto_privado.whapi_inbox(
  message_hmac,chat_hmac,participant_key,kind,nonce_b64,ciphertext_b64,
  plaintext_sha256,source_unix,processing_state)
 values(msg2,sc,'corralon_nahuel','document','AAAAAAAAAAAAAAAA',
  'AAAAAAAAAAAAAAAAAAAAAAAA',sha,
  extract(epoch from clock_timestamp())::bigint,'needs_review');
 insert into cotironda_piloto_privado.media_archive_mvp095(
  message_hmac,chat_hmac,participant_key,request_id,kind,mime,
  media_id_sha256,state,size_bytes,content_sha256,storage_path,
  review_state,proposal)
 values(msg2,sc,'corralon_nahuel',rid,'document','application/pdf',sha,
  'stored',2048,sha,'media/'||msg2,'suggested_only',proposal);
 out_:=public.cotironda_piloto_record_supplier_media_mvp098(msg2);
 if out_->>'state'<>'stored_unverified' then
  raise exception 'mvp107_second_quote_not_received';end if;
 out_:=public.cotironda_piloto_tracking_status_mvp091(token);
 if out_->>'can_open'<>'false'
  or jsonb_array_length(out_->'offers')<>0
 then raise exception 'mvp107_old_price_leaked_after_revision %',out_;end if;
 if (public.cotironda_piloto_tracking_status_mvp091(
   encode(extensions.gen_random_bytes(32),'hex')))->>'state'<>'not_found'
 then raise exception 'mvp107_token_not_required';end if;
 if (select count(*) from cotironda_piloto_privado.offer_versions)
   <>before_offers
 then raise exception 'mvp107_created_unranked_offer';end if;
 if has_table_privilege('anon',
   'cotironda_piloto_privado.anonymous_supplier_docs_mvp107','SELECT')
 or has_function_privilege('anon',
  'public.cotironda_piloto_publish_source_text_mvp107(text)','EXECUTE')
 then raise exception 'mvp107_public_access';end if;
end;$test$;
rollback;