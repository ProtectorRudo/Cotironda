-- MVP-108: two completed source-covered offers vs one partial;
-- simulate 4-day closure under PostgreSQL 17, then ROLLBACK.
begin;
do $test$
declare
 buyer_chat text;supplier_chat text;rid uuid;msg text;sha text;
 scenario text;sup text;qty text;line_amount text;total_text text;
 proposal jsonb;out_ jsonb;n integer;expected text;cutoff timestamptz;
 before_offers integer; row_ record;
begin
 select chat_hmac into buyer_chat from cotironda_piloto_privado.participants
 where key='arquitecto' and consent_at is not null and opted_out_at is null;
 if buyer_chat is null then raise exception 'mvp108_buyer_missing';end if;
 select count(*) into before_offers from cotironda_piloto_privado.offer_versions;
 for row_ in select * from (values
  ('both_full','two_complete_alternatives',2),
  ('supplier_partial','one_complete_alternative',1)
 ) t(scenario,wanted,wanted_count)
 loop
  scenario:=row_.scenario;expected:=row_.wanted;
  -- Create with a short, immutable deadline (created_at exactly 4 days prior).
  -- Never modify an existing deadline to simulate closure.
  cutoff:=clock_timestamp()+interval '3 seconds';
  insert into cotironda_piloto_privado.requests(
    buyer_key,delivery_city,original_request,source_hmac,state,
    created_at,closes_at)
  values('arquitecto','La Plata',
   'Cemento CPC 50 kg, cantidad 20 bolsas, ensayo '||scenario,
   encode(extensions.gen_random_bytes(32),'hex'),'prepared',
   cutoff-interval '4 days',cutoff)
  returning id into rid;
  insert into cotironda_piloto_privado.request_lines(
   request_id,line_no,original_description,quantity,unit,family_code)
  values(rid,1,'Cemento CPC 50 kg',20,'bag','cemento_gris_obra');
  for sup in select s.key from cotironda_piloto_privado.participants s
    where s.key in ('corralon_ailin','corralon_nahuel')
    and s.consent_at is not null and s.opted_out_at is null
    and s.chat_hmac is not null order by s.key
  loop
   select chat_hmac into supplier_chat from
     cotironda_piloto_privado.participants where key=sup;
   insert into cotironda_piloto_privado.invitations(
    request_id,supplier_key) values(rid,sup);
   msg:=encode(extensions.gen_random_bytes(32),'hex');
   sha:=encode(extensions.gen_random_bytes(32),'hex');
   qty:=case when scenario='supplier_partial'
       and sup='corralon_nahuel' then '10' else '20' end;
   line_amount:=case when qty='10' then '$ 95.000,00'
     else '$ 190.000,00' end;
   total_text:=case when qty='10' then '$ 107.000,00'
     else '$ 202.000,00' end;
   proposal:=jsonb_build_object(
    'status','review_required','kind','supplier_quote',
    'delivery_city',null,'requested_delivery_note',null,
    'unanswered','[]'::jsonb,'total_declared',total_text,
    'lines',jsonb_build_array(
      jsonb_build_object('original_description','Cemento CPC 50 kg',
       'quantity',qty,'unit','bolsas','unit_price','$ 9.500,00',
       'line_total',line_amount,'evidence_location','renglón 1',
       'ambiguity',null),
      jsonb_build_object('original_description','Flete a obra',
       'quantity',null,'unit',null,'unit_price',null,
       'line_total','$ 12.000,00','evidence_location','renglón 2',
       'ambiguity',null)));
   insert into cotironda_piloto_privado.whapi_inbox(
    message_hmac,chat_hmac,participant_key,kind,nonce_b64,ciphertext_b64,
    plaintext_sha256,source_unix,processing_state)
   values(msg,supplier_chat,sup,'document','AAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAA',sha,
    extract(epoch from clock_timestamp())::bigint,'needs_review');
   insert into cotironda_piloto_privado.media_archive_mvp095(
    message_hmac,chat_hmac,participant_key,request_id,kind,mime,
    media_id_sha256,state,size_bytes,content_sha256,storage_path,
    review_state,proposal)
   values(msg,supplier_chat,sup,rid,'document','text/plain',sha,
    'stored',1024,sha,'media/'||msg,'suggested_only',proposal);
   out_:=public.cotironda_piloto_record_supplier_media_mvp098(msg);
   if out_->>'state'<>'stored_unverified' then
    raise exception 'mvp108_receipt_failed %',out_;end if;
   out_:=public.cotironda_piloto_compare_supplier_readings_mvp102(
    msg,proposal);
   if out_->>'state'<>'model_readings_match' then
    raise exception 'mvp108_double_read_failed %',out_;end if;
   out_:=public.cotironda_piloto_audit_supplier_amounts_mvp103(msg);
   if out_->>'state'<>'balanced' then
    raise exception 'mvp108_amounts_failed %',out_;end if;
   out_:=public.cotironda_piloto_record_supplier_source_check_mvp106(
    msg,sha,'source_text_covered','covered',2);
   if out_->>'state'<>'source_text_covered' then
    raise exception 'mvp108_source_failed %',out_;end if;
   out_:=public.cotironda_piloto_publish_source_text_mvp107(msg);
   if out_->>'state'<>'published_anonymous' then
    raise exception 'mvp108_projection_failed %',out_;end if;
  end loop;
  out_:=public.cotironda_piloto_plan_coverage_finalists_mvp108(rid);
  if out_->>'state'<>'deadline_pending'
  then raise exception 'mvp108_premature_plan %',out_;end if;
  -- Let the immutable deadline pass using PostgreSQL server time.
  perform pg_sleep(greatest(0,
    extract(epoch from (cutoff-clock_timestamp()))+0.05));
  update cotironda_piloto_privado.requests
  set closed_at=clock_timestamp(),state='closed' where id=rid;
  out_:=public.cotironda_piloto_plan_coverage_finalists_mvp108(rid);
  if out_->>'state'<>expected
   or (out_->>'candidate_count')::integer<>row_.wanted_count
   or out_->>'price_ranked'<>'false'
   or out_->>'contacts_revealed'<>'false'
   or out_->>'messages_sent'<>'false'
  then raise exception 'mvp108_wrong_finalists scenario=% got=%',
     scenario,out_;end if;
  if (public.cotironda_piloto_plan_coverage_finalists_mvp108(rid))
   ->>'state'<>'already_planned'
  then raise exception 'mvp108_rerun_created_duplicate';end if;
  if (select candidate_count from
   cotironda_piloto_privado.finalist_coverage_plans_mvp108
   where request_id=rid)<>row_.wanted_count
  then raise exception 'mvp108_private_count_incorrect';end if;
 end loop;
 if (select count(*) from cotironda_piloto_privado.offer_versions)
  <>before_offers then raise exception 'mvp108_unverified_offer_created';end if;
 if has_table_privilege('anon',
   'cotironda_piloto_privado.finalist_coverage_plans_mvp108','SELECT')
 or has_table_privilege('authenticated',
   'cotironda_piloto_privado.finalist_coverage_plans_mvp108','SELECT')
 or has_function_privilege('anon',
   'public.cotironda_piloto_plan_coverage_finalists_mvp108(uuid)','EXECUTE')
 then raise exception 'mvp108_public_exposure';end if;
end;$test$;
rollback;