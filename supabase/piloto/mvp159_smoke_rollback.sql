-- MVP159. Execute with the new SQL function INSIDE an outer BEGIN / ROLLBACK.
-- Fully synthetic, no real outgoing messages, no real contact disclosure.
do $test$
declare scenario text;request_id_ uuid; cutoff timestamptz;
 supplier text; chat text;mid text; hash_ text;offer_text text;
 content_name text;quantity_ text;unit_ text;line_total_ text;
 result_ jsonb; expected text;expected_count integer;
 before_r integer;before_out integer;
begin
 select count(*) into before_r from cotironda_piloto_privado.requests;
 select count(*) into before_out from cotironda_piloto_privado.finalist_whapi_outbox_mvp110;
 if exists(select 1 from cotironda_piloto_privado.finalist_activation_mvp113
           where enabled=true) then raise exception 'finalist_feature_must_remain_off';end if;
 for scenario in select unnest(array['two_v9','latest_v10_review','generic_uncomparable']) loop
  cutoff:=clock_timestamp()-interval '5 seconds';
  insert into cotironda_piloto_privado.requests(
   buyer_key,delivery_city,original_request,source_hmac,state,
   created_at,closes_at,round_days,closed_at
  ) values(
   'arquitecto','La Plata','MVP159 test de cobertura exclusiva PDF: '||scenario,
   encode(extensions.gen_random_bytes(32),'hex'),
   'closed',cutoff-interval '4 days',cutoff,4,clock_timestamp()
  ) returning id into request_id_;
  insert into cotironda_piloto_privado.request_lines(
   request_id,line_no,original_description,quantity,unit,family_code
  ) values(
   request_id_,1,
   case when scenario='generic_uncomparable' then 'Arena fina'
        else 'Cemento CPC 50 kg' end,
   case when scenario='generic_uncomparable' then 1 else 20 end,
   case when scenario='generic_uncomparable' then 'm3' else 'bag' end,
   case when scenario='generic_uncomparable' then 'arena_fina' else 'cemento_gris_obra' end
  );
  for supplier in select key from cotironda_piloto_privado.participants
   where key in ('corralon_ailin','corralon_nahuel')
   and consent_at is not null and opted_out_at is null order by key
  loop
   select chat_hmac into chat from cotironda_piloto_privado.participants where key=supplier;
   if chat is null then raise exception 'consented_supplier_missing_chat';end if;
   insert into cotironda_piloto_privado.invitations(
    request_id,supplier_key
   ) values(request_id_,supplier);
   mid:=encode(extensions.gen_random_bytes(32),'hex');
   hash_:=encode(extensions.gen_random_bytes(32),'hex');
   content_name:=case when scenario='generic_uncomparable' then 'BIG BAG de Arena'
     else 'Cemento CPC 50 kg' end;
   quantity_:=case when scenario='generic_uncomparable' then '1,00' else '20' end;
   unit_:=case when scenario='generic_uncomparable' then null else 'bolsas' end;
   line_total_:='$ 190.000,00';
   insert into cotironda_piloto_privado.whapi_inbox(
    message_hmac,chat_hmac,participant_key,kind,nonce_b64,
    ciphertext_b64,plaintext_sha256,source_unix,processing_state,request_id
   ) values(
    mid,chat,supplier,'document','AAAAAAAAAAAAAAAA',
    'AAAAAAAAAAAAAAAAAAAAAAAA',hash_,
    extract(epoch from clock_timestamp())::bigint,'needs_review',request_id_
   );
   insert into cotironda_piloto_privado.media_archive_mvp095(
    message_hmac,chat_hmac,participant_key,request_id,kind,mime,
    media_id_sha256,state,size_bytes,content_sha256,storage_path,review_state
   ) values(
    mid,chat,supplier,request_id_,'document','application/pdf',
    hash_,'stored',1024,hash_,'media/'||mid,'suggested_only'
   );
   insert into cotironda_piloto_privado.supplier_media_quotes_mvp098(
    message_hmac,request_id,supplier_key,source_sha256,state,line_count,
    declared_total_literal,received_at
   ) values(
    mid,request_id_,supplier,hash_,'awaiting_fidelity_check',1,
    line_total_,cutoff-interval '1 day'
   );
   insert into cotironda_piloto_privado.supplier_quote_lines_mvp101(
    message_hmac,line_no,description_literal,quantity_literal,unit_literal,
    unit_price_literal,line_total_literal,evidence_literal
   ) values(
    mid,1,content_name,quantity_,unit_,'$ 9.500,00',
    line_total_,'ensayo documental sintético'
   );
   offer_text:='COTIRONDA · Presupuesto anónimo'||E'\n'||
    content_name||E'\nCantidad: '||quantity_||E'\nTotal: '||line_total_;
   insert into cotironda_piloto_privado.supplier_evidence_mvp138(
    message_hmac,verifier_version,request_id,supplier_key,
    source_sha256,line_count,state,reason,
    sum_line_cents,declared_total_cents,public_text,ranking_allowed
   ) values(mid,9,request_id_,supplier,
     hash_,1,'verified','covered',19000000,19000000,offer_text,false);
   if scenario='latest_v10_review' and supplier='corralon_nahuel' then
    insert into cotironda_piloto_privado.supplier_evidence_mvp138(
     message_hmac,verifier_version,request_id,supplier_key,
     source_sha256,line_count,state,reason,ranking_allowed
    ) values(mid,10,request_id_,supplier,hash_,1,
     'needs_source_review','missing_line',false);
   end if;
  end loop;
  result_:=public.cotironda_piloto_plan_coverage_finalists_mvp108(request_id_);
  expected:=case scenario
    when 'two_v9' then 'two_complete_alternatives'
    when 'latest_v10_review' then 'one_complete_alternative'
    else 'no_complete_alternatives' end;
  expected_count:=case scenario when 'two_v9' then 2
    when 'latest_v10_review' then 1 else 0 end;
  if result_->>'state' is distinct from expected
    or (result_->>'candidate_count')::integer<>expected_count
  then raise exception 'scenario % wrong: % expected %',scenario,result_,expected;end if;
  if result_->>'price_ranked'<>'false' or
     result_->>'contacts_revealed'<>'false' or
     result_->>'messages_sent'<>'false'
  then raise exception 'forbidden_reveal_or_ranking_%',scenario;end if;
  if (public.cotironda_piloto_plan_coverage_finalists_mvp108(request_id_))
     ->>'state'<>'already_planned'
  then raise exception 'duplicate_coverage_plan_%',scenario;end if;
 end loop;
 if (select count(*) from cotironda_piloto_privado.finalist_whapi_outbox_mvp110)<>before_out
 then raise exception 'outbound_messages_were_queued';end if;
 if exists(select 1 from cotironda_piloto_privado.finalist_activation_mvp113
           where enabled=true or activated_at is not null)
 then raise exception 'activation_changed';end if;
 if has_function_privilege('anon','public.cotironda_piloto_plan_coverage_finalists_mvp108(uuid)','EXECUTE')
 or has_function_privilege('authenticated','public.cotironda_piloto_plan_coverage_finalists_mvp108(uuid)','EXECUTE')
 or not has_function_privilege('service_role','public.cotironda_piloto_plan_coverage_finalists_mvp108(uuid)','EXECUTE')
 then raise exception 'public_rpc_leak';end if;
 if (select count(*) from cotironda_piloto_privado.requests)<>before_r+3
 then raise exception 'scenario_missing_or_duplicate';end if;
end;$test$;
