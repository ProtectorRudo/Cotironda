-- MVP-073e: suppliers' greetings must not be counted as quotations.
create or replace function public.cotironda_piloto_receive_whapi_v1(
 p_chat_hmac text,p_message_hmac text,p_plaintext_sha256 text,
 p_kind text,p_nonce_b64 text,p_ciphertext_b64 text,
 p_source_unix bigint,p_plaintext text,
 p_city text default null,p_items jsonb default null
) returns jsonb
language plpgsql security definer set search_path='' as $body$
declare
 v_key text;
 v_role text;
 v_request uuid;
 v_state text:='recorded';
 v_invites integer:=0;
 v_count integer;
 v_rec record;
 v_rev integer;
begin
 if not exists(select 1 from cotironda_piloto_privado.integration_flags
  where only_row=true and whatsapp_inbound_enabled=true) then
   raise exception 'pilot_inbound_disabled' using errcode='42501';
 end if;
 if p_chat_hmac !~ '^[a-f0-9]{64}$'
   or p_message_hmac !~ '^[a-f0-9]{64}$'
   or p_plaintext_sha256 !~ '^[a-f0-9]{64}$'
   or p_kind not in ('text','image','document','audio','voice')
   or p_nonce_b64 !~ '^[A-Za-z0-9+/]{16}$'
   or length(p_ciphertext_b64) not between 24 and 20000
   or p_ciphertext_b64 !~ '^[A-Za-z0-9+/=]+$'
   or p_source_unix < 1500000000
   or abs(extract(epoch from clock_timestamp())-p_source_unix)>172800
   or length(coalesce(p_plaintext,''))>4000 then
  raise exception 'whapi_payload_invalid' using errcode='22023';
 end if;
 select key,participant_role into v_key,v_role
 from cotironda_piloto_privado.participants
 where chat_hmac=p_chat_hmac and consent_at is not null
 for update;
 if v_key is null then
   return jsonb_build_object('state','unrecognized_contact');
 end if;
 if exists(select 1 from cotironda_piloto_privado.whapi_inbox
    where message_hmac=p_message_hmac) then
  return jsonb_build_object('state','duplicate');
 end if;
 if v_role='buyer' and p_kind='text' then
  if p_city is null or length(btrim(p_city))<3 then
   v_state:='needs_zone';
  elsif p_items is null or jsonb_typeof(p_items)<>'array'
    or jsonb_array_length(p_items)=0
    or jsonb_array_length(p_items)>8 then
   v_state:='needs_review';
  else
   -- Validate entire JSON before creating a request or invitation.
   v_count:=0;
   for v_rec in
    select description,quantity,unit,family
    from jsonb_to_recordset(p_items) as x(
      description text,quantity numeric,unit text,family text)
   loop
    if v_rec.description is null or
       length(v_rec.description) not between 3 and 500 or
       v_rec.quantity is null or v_rec.quantity<=0 or v_rec.quantity>1000000
       or v_rec.unit not in ('unit','bag','box','kg','g','l','ml','m','m2','m3','roll','pack')
       or v_rec.family !~ '^[a-z][a-z0-9_]{2,49}$' then
     raise exception 'invalid_request_line' using errcode='22023';
    end if;
    v_count:=v_count+1;
   end loop;
   insert into cotironda_piloto_privado.requests(
     buyer_key,delivery_city,original_request,source_hmac,state)
   values(v_key,btrim(p_city),p_plaintext,p_message_hmac,'prepared')
   returning id into v_request;
   insert into cotironda_piloto_privado.request_lines(
     request_id,line_no,original_description,quantity,unit,family_code)
   select v_request,idx,item->>'description',
     (item->>'quantity')::numeric,item->>'unit',item->>'family'
   from jsonb_array_elements(p_items) with ordinality as x(item,idx);
   -- Only two configured suppliers, same city and curated family. The
   -- invitation is still 'prepared': NO WhatsApp send is performed here.
   insert into cotironda_piloto_privado.invitations(request_id,supplier_key)
   select v_request,c.supplier_key
   from cotironda_piloto_privado.candidate_suppliers c
   where c.request_id=v_request
   on conflict do nothing;
   get diagnostics v_invites=row_count;
   v_state:='recorded';
  end if;
 elsif v_role='supplier' and p_kind='text' then
  -- A salutation or an unrelated text is not a supplier quote.
  -- Keep its encrypted source for review without a false delivered status.
  if p_plaintext !~* '(\$[[:space:]]*[0-9]|[0-9]+[.,][0-9]{3}|total[[:space:]]*[:=])' then
   v_state:='needs_review';
  else
  select count(*),min(i.request_id::text)::uuid into v_count,v_request
  from cotironda_piloto_privado.invitations i
  join cotironda_piloto_privado.requests r on r.id=i.request_id
  where i.supplier_key=v_key and i.state='prepared' and r.state='prepared'
   and r.created_at>clock_timestamp()-interval '7 days';
  if v_count=1 then
   select coalesce(max(revision_no),0)+1 into v_rev
   from cotironda_piloto_privado.offer_versions
   where request_id=v_request and supplier_key=v_key;
   if v_rev>100 then raise exception 'quote_revision_limit' using errcode='23514';end if;
   insert into cotironda_piloto_privado.offer_versions(
      request_id,supplier_key,revision_no,source_message_hmac,original_quote)
   values (v_request,v_key,v_rev,p_message_hmac,p_plaintext);
   v_state:='quote_recorded';
  else
   v_request:=null;
   v_state:='unmatched_quote';
  end if;
  end if;
 else
  v_state:='needs_review';
 end if;
 insert into cotironda_piloto_privado.whapi_inbox(
  chat_hmac,message_hmac,participant_key,kind,
  nonce_b64,ciphertext_b64,plaintext_sha256,source_unix,
  processing_state,request_id)
 values(p_chat_hmac,p_message_hmac,v_key,p_kind,
  p_nonce_b64,p_ciphertext_b64,p_plaintext_sha256,p_source_unix,
  v_state,v_request);
 return jsonb_build_object('state',v_state,'invitations_prepared',v_invites);
end;
$body$;
