-- MVP117. Entire pilot SQL test is synthetic and ROLLBACK ONLY.
-- SQL validates every verified request line and the supplier-specific
-- snapshot; Node tests prove actual multi-page PDF bytes, pagination and XREF.
begin;
do $test$
declare
 buyer_chat text;h text;sha text;doc jsonb;result jsonb;
 rid uuid;item_count integer; sup record; snap jsonb; lease uuid;
begin
 select chat_hmac into buyer_chat from cotironda_piloto_privado.participants
 where key='arquitecto' and participant_role='buyer'
   and consent_at is not null and opted_out_at is null;
 if buyer_chat is null then raise exception 'mvp117_buyer_missing';end if;
 for item_count in select * from (values(9),(25)) as n(count) loop
  h:=encode(extensions.gen_random_bytes(32),'hex');
  sha:=encode(extensions.gen_random_bytes(32),'hex');
  doc:=jsonb_build_object('kind','buyer_request','status','review_required',
   'delivery_city','La Plata','requested_delivery_note',null,
   'lines',(
    select jsonb_agg(jsonb_build_object(
      'original_description','Cemento CPC 50 kg tanda '||lpad(i::text,2,'0'),
      'quantity','10','unit','bolsas',
      'evidence_location','Página 1: 10 bolsas Cemento CPC 50 kg tanda '||
       lpad(i::text,2,'0')) order by i)
    from generate_series(1,item_count) as i
   ));
  insert into cotironda_piloto_privado.whapi_inbox(
   message_hmac,chat_hmac,participant_key,kind,nonce_b64,ciphertext_b64,
   plaintext_sha256,source_unix,processing_state)
  values(h,buyer_chat,'arquitecto','image','AAAAAAAAAAAAAAAA',
   'AAAAAAAAAAAAAAAAAAAAAAAA',sha,
   extract(epoch from clock_timestamp())::bigint,'needs_review');
  insert into cotironda_piloto_privado.media_archive_mvp095(
   message_hmac,chat_hmac,participant_key,kind,mime,media_id_sha256,
   state,size_bytes,content_sha256,storage_path,review_state,proposal)
  values(h,buyer_chat,'arquitecto','image','image/jpeg',sha,
   'stored',5000,sha,'media/'||h,'suggested_only',doc);
  result:=public.cotironda_piloto_plan_document_mvp098(h);
  if result->>'state'<>'planned_private'
     or (select count(*) from cotironda_piloto_privado.document_lines_mvp098
          where message_hmac=h)<>item_count
  then raise exception 'mvp117_original_lines_missing %',result;end if;
  result:=public.cotironda_piloto_record_agreement_mvp099(h,doc);
  if result->>'state'<>'agreed_private'
  then raise exception 'mvp117_second_reading_failed %',result;end if;
  result:=public.cotironda_piloto_prepare_document_mvp099(h);
  if result->>'state'<>'prepared' or
    (result->>'all_lines')::integer<>item_count or
    (result->>'supplier_invites')::integer<>2
  then raise exception 'mvp117_document_not_prepared %',result;end if;
  rid:=(result->>'request_id')::uuid;
  if (select count(*) from cotironda_piloto_privado.request_lines
    where request_id=rid)<>item_count
  then raise exception 'mvp117_lost_original_articles';end if;
  for sup in select i.supplier_key from cotironda_piloto_privado.invitations i
   where i.request_id=rid
  loop
   if (select count(*) from cotironda_piloto_privado.invitation_lines_mvp099
     where request_id=rid and supplier_key=sup.supplier_key)<>item_count
   then raise exception 'mvp117_supplier_subset_lost_articles %',sup.supplier_key;end if;
   if not cotironda_piloto_privado.allow_document_send_mvp099(rid,sup.supplier_key)
   then raise exception 'mvp117_dispatched_source_rejected %',sup.supplier_key;end if;
   -- Lease only inside this rollback, never a network send or real worker.
   lease:=gen_random_uuid();
   update cotironda_piloto_privado.whapi_outbox
    set state='leased',lease_token=lease,leased_at=clock_timestamp()
    where request_id=rid and supplier_key=sup.supplier_key and state='pending';
   snap:=public.cotironda_piloto_pdf_snapshot_mvp091(rid,sup.supplier_key,lease);
   if snap is null or jsonb_array_length(snap->'items')<>item_count
   then raise exception 'mvp117_pdf_snapshot_truncated %',sup.supplier_key;end if;
   if not public.cotironda_piloto_authorize_whapi_v1(rid,sup.supplier_key,lease)
   then raise exception 'mvp117_authorization_lost %',sup.supplier_key;end if;
  end loop;
  if has_table_privilege('anon',
    'cotironda_piloto_privado.invitation_lines_mvp099','SELECT')
   or has_table_privilege('authenticated',
    'cotironda_piloto_privado.document_sources_mvp099','SELECT')
  then raise exception 'mvp117_public_leak';end if;
 end loop;
end;$test$;
rollback;
