-- MVP122/PILOTO: Complete a previously encrypted buyer TEXT request after a
-- separate authenticated city reply. No automatic backfill or outbound SQL.
-- Public entry points are service_role only; no plaintext/PII returned.
create function public.cotironda_piloto_text_zone_candidate_mvp122(
 p_chat_hmac text,p_reply_hmac text
) returns jsonb language plpgsql stable security definer set search_path='' as $fn$
declare v_reply record; v_src record; v_n integer;
begin
 if p_chat_hmac is null or p_chat_hmac !~ '^[a-f0-9]{64}$'
  or p_reply_hmac is null or p_reply_hmac !~ '^[a-f0-9]{64}$'
 then return jsonb_build_object('state','invalid');end if;
 if not exists(select 1 from cotironda_piloto_privado.integration_flags
  where only_row and whatsapp_inbound_enabled) then
  return jsonb_build_object('state','disabled');end if;
 select i.participant_key,i.received_at into v_reply
 from cotironda_piloto_privado.whapi_inbox i
 join cotironda_piloto_privado.participants p on p.key=i.participant_key
  and p.chat_hmac=i.chat_hmac
 where i.message_hmac=p_reply_hmac and i.chat_hmac=p_chat_hmac
  and i.kind='text' and i.request_id is null
  and i.processing_state in ('needs_zone','needs_review')
  and i.received_at > clock_timestamp()-interval '20 minutes'
  and p.participant_role='buyer' and p.consent_at is not null
  and p.opted_out_at is null;
 if not found then return jsonb_build_object('state','not_permitted');end if;
 select count(*) into v_n from cotironda_piloto_privado.whapi_inbox src
 join cotironda_piloto_privado.ai_replies_mvp094 reply
  on reply.message_hmac=src.message_hmac and reply.chat_hmac=src.chat_hmac
 where src.chat_hmac=p_chat_hmac and src.participant_key=v_reply.participant_key
  and src.kind='text' and src.request_id is null
  and src.processing_state in ('needs_zone','needs_review')
  and src.received_at<v_reply.received_at
  and src.received_at>=v_reply.received_at-interval '7 days'
  and reply.reply_code='zone' and reply.state='api_accepted'
  and reply.created_at<=v_reply.received_at
  and not exists(select 1 from cotironda_piloto_privado.requests r
   where r.source_hmac=src.message_hmac);
 if v_n<>1 then return jsonb_build_object('state',
  case when v_n=0 then 'no_pending_text' else 'ambiguous_pending_text' end);end if;
 select src.message_hmac,src.nonce_b64,src.ciphertext_b64,src.plaintext_sha256
 into v_src from cotironda_piloto_privado.whapi_inbox src
 join cotironda_piloto_privado.ai_replies_mvp094 reply
  on reply.message_hmac=src.message_hmac and reply.chat_hmac=src.chat_hmac
 where src.chat_hmac=p_chat_hmac and src.participant_key=v_reply.participant_key
  and src.kind='text' and src.request_id is null
  and src.processing_state in ('needs_zone','needs_review')
  and src.received_at<v_reply.received_at
  and src.received_at>=v_reply.received_at-interval '7 days'
  and reply.reply_code='zone' and reply.state='api_accepted'
  and reply.created_at<=v_reply.received_at
  and not exists(select 1 from cotironda_piloto_privado.requests r
   where r.source_hmac=src.message_hmac);
 return jsonb_build_object('state','pending','source_hmac',v_src.message_hmac,
  'nonce',v_src.nonce_b64,'ciphertext',v_src.ciphertext_b64,
  'sha256',v_src.plaintext_sha256);
end;$fn$;
revoke all on function public.cotironda_piloto_text_zone_candidate_mvp122(text,text)
 from public,anon,authenticated;
grant execute on function public.cotironda_piloto_text_zone_candidate_mvp122(text,text)
 to service_role;

create function public.cotironda_piloto_complete_text_zone_mvp122(
 p_chat_hmac text,p_reply_hmac text,p_source_hmac text,
 p_original_text text,p_city text,p_items jsonb
) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v_candidate jsonb;v_key text;v_request uuid;v_item record;v_count int:=0;
 v_invites int:=0;
begin
 if p_chat_hmac is null or p_chat_hmac !~ '^[a-f0-9]{64}$'
  or p_reply_hmac is null or p_reply_hmac !~ '^[a-f0-9]{64}$'
  or p_source_hmac is null or p_source_hmac !~ '^[a-f0-9]{64}$'
  or p_original_text is null or length(p_original_text) not between 10 and 3000
  or p_city is null or length(btrim(p_city)) not between 3 and 80
  or p_city !~ '^[[:alpha:][:space:]()'',.-]+$'
  or p_items is null or jsonb_typeof(p_items)<>'array'
  or jsonb_array_length(p_items) not between 1 and 8
 then return jsonb_build_object('state','invalid');end if;
 -- Serialize all buyer requests from the same authenticated chat.
 select p.key into v_key from cotironda_piloto_privado.participants p
 join cotironda_piloto_privado.whapi_inbox i
  on i.chat_hmac=p.chat_hmac and i.participant_key=p.key
 where p.chat_hmac=p_chat_hmac and p.participant_role='buyer'
  and p.consent_at is not null and p.opted_out_at is null
  and i.message_hmac=p_reply_hmac and i.kind='text'
  and i.processing_state in ('needs_review','needs_zone')
  and i.request_id is null
 for update of p;
 if v_key is null then return jsonb_build_object('state','not_permitted');end if;
 v_candidate:=public.cotironda_piloto_text_zone_candidate_mvp122(
  p_chat_hmac,p_reply_hmac);
 if v_candidate->>'state'<>'pending' or
  v_candidate->>'source_hmac'<>p_source_hmac
 then return jsonb_build_object('state','no_unique_pending_source');end if;
 if v_candidate->>'sha256'<>
    encode(extensions.digest(p_original_text,'sha256'),'hex')
 then return jsonb_build_object('state','original_digest_mismatch');end if;
 for v_item in select description,quantity,unit,family from jsonb_to_recordset(p_items)
  as x(description text,quantity numeric,unit text,family text)
 loop
  if v_item.description is null or length(v_item.description) not between 3 and 500
   or v_item.quantity is null or v_item.quantity<=0 or v_item.quantity>1000000
   or v_item.unit not in ('unit','bag','box','kg','g','l','ml','m','m2','m3','roll','pack')
   or v_item.family is null or v_item.family !~ '^[a-z][a-z0-9_]{2,49}$'
  then return jsonb_build_object('state','invalid_line');end if;
  v_count:=v_count+1;
 end loop;
 if v_count<>jsonb_array_length(p_items)
 then return jsonb_build_object('state','invalid_line_count');end if;
 -- Source is immutable; uniqueness on requests.source_hmac blocks replays.
 insert into cotironda_piloto_privado.requests(
  buyer_key,delivery_city,original_request,source_hmac,state)
 values(v_key,btrim(p_city),p_original_text,p_source_hmac,'prepared')
 on conflict(source_hmac) do nothing returning id into v_request;
 if v_request is null then return jsonb_build_object('state','already_prepared');end if;
 insert into cotironda_piloto_privado.request_lines(
  request_id,line_no,original_description,quantity,unit,family_code)
 select v_request,x.idx,(x.item->>'description'),
  (x.item->>'quantity')::numeric,(x.item->>'unit'),(x.item->>'family')
 from jsonb_array_elements(p_items) with ordinality as x(item,idx);
 insert into cotironda_piloto_privado.invitations(request_id,supplier_key)
 select v_request,c.supplier_key
 from cotironda_piloto_privado.candidate_suppliers c
 where c.request_id=v_request on conflict do nothing;
 get diagnostics v_invites=row_count;
 update cotironda_piloto_privado.whapi_inbox
  set request_id=v_request,processing_state='recorded'
 where message_hmac in (p_source_hmac,p_reply_hmac) and chat_hmac=p_chat_hmac
  and participant_key=v_key and request_id is null;
 return jsonb_build_object('state','prepared','invitations_prepared',v_invites,
  'source_message_hmac',p_source_hmac);
end;$fn$;
revoke all on function public.cotironda_piloto_complete_text_zone_mvp122(
 text,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.cotironda_piloto_complete_text_zone_mvp122(
 text,text,text,text,text,jsonb) to service_role;
