-- MVP-099: synthetic buyer image -> dual agreement -> round (ALL lines)
-- -> per-supplier subsets -> guard -> PDF snapshot; ZERO HTTP, ROLLBACK.
begin;
do $test$
declare buyer_chat text; hash text; h text; doc jsonb; a jsonb;
 rec jsonb; v_req uuid; n integer; other text; supa text:='corralon_ailin';
 supb text:='corralon_nahuel'; claim jsonb; snap jsonb; second_claim jsonb;
begin
 select chat_hmac into buyer_chat
 from cotironda_piloto_privado.participants
 where key='arquitecto' and consent_at is not null and opted_out_at is null;
 if buyer_chat is null then raise exception 'mvp099_buyer_missing';end if;
 hash:=encode(extensions.gen_random_bytes(32),'hex');
 h:=encode(extensions.gen_random_bytes(32),'hex');
 -- Business B temporarily does not handle hollow bricks, for true partial test.
 delete from cotironda_piloto_privado.catalogue_lines c
 where c.participant_key=supb and c.family_code='ladrillo_hueco';
 if not exists(select 1 from cotironda_piloto_privado.catalogue_lines
   where participant_key=supa and family_code='ladrillo_hueco')
 then raise exception 'mvp099_test_catalogue_missing';end if;
 insert into cotironda_piloto_privado.whapi_inbox(
  message_hmac,chat_hmac,participant_key,kind,nonce_b64,ciphertext_b64,
  plaintext_sha256,source_unix,processing_state)
 values(h,buyer_chat,'arquitecto','image','AAAAAAAAAAAAAAAA',
  'AAAAAAAAAAAAAAAAAAAAAAAA',hash,
  extract(epoch from clock_timestamp())::bigint,'needs_review');
 doc:=jsonb_build_object('kind','buyer_request','status','review_required',
  'delivery_city','La Plata','requested_delivery_note',null,
  'lines',jsonb_build_array(
   jsonb_build_object('original_description','Cemento','quantity','10',
    'unit','bolsas','evidence_location','Página 1: «10 bolsas Cemento»'),
   jsonb_build_object('original_description','Huecos del 12','quantity','288',
    'unit','unidades','evidence_location','Página 1: «288 unidades Huecos del 12»')));
 insert into cotironda_piloto_privado.media_archive_mvp095(
  message_hmac,chat_hmac,participant_key,kind,mime,media_id_sha256,state,
  size_bytes,content_sha256,storage_path,review_state,proposal)
 values(h,buyer_chat,'arquitecto','image','image/jpeg',hash,
  'stored',5000,hash,'media/'||h,'suggested_only',doc);
 rec:=public.cotironda_piloto_plan_document_mvp098(h);
 if rec->>'state'<>'planned_private' then
  raise exception 'mvp099_plan_failed %',rec;end if;
 rec:=public.cotironda_piloto_record_agreement_mvp099(h,doc);
 if rec->>'state'<>'agreed_private' then
  raise exception 'mvp099_agreement_failed %',rec;end if;
 rec:=public.cotironda_piloto_prepare_document_mvp099(h);
 if rec->>'state'<>'prepared' or (rec->>'all_lines')::int<>2
  or (rec->>'supplier_invites')::int<>2 then
  raise exception 'mvp099_not_prepared %',rec;end if;
 v_req:=(rec->>'request_id')::uuid;
 if (select count(*) from cotironda_piloto_privado.request_lines
    where request_id=v_req)<>2
 or (select count(*) from cotironda_piloto_privado.invitation_lines_mvp099
    where request_id=v_req and supplier_key=supa)<>2
 or (select count(*) from cotironda_piloto_privado.invitation_lines_mvp099
    where request_id=v_req and supplier_key=supb)<>1
 then raise exception 'mvp099_subset_counts_wrong';end if;
 if (select count(*) from cotironda_piloto_privado.whapi_outbox
   where request_id=v_req and message_body like '%Huecos del 12%')<>1
 then raise exception 'mvp099_wrong_seller_received_brick';end if;
 if not cotironda_piloto_privado.allow_document_send_mvp099(v_req,supa)
 or not cotironda_piloto_privado.allow_document_send_mvp099(v_req,supb)
 then raise exception 'mvp099_authorization_wrong';end if;
 -- Same HMAC cannot create a duplicate round, even if user forwards image.
 rec:=public.cotironda_piloto_prepare_document_mvp099(h);
 if rec->>'state'<>'not_agreed_or_already_created'
 then raise exception 'mvp099_replay_not_idempotent %',rec;end if;
 -- Claims are INTERNAL SQL only. No Whapi call or external request here.
 claim:=public.cotironda_piloto_claim_whapi_v1();
 if claim->>'state'<>'leased' or claim->>'request_id'<>v_req::text then
  raise exception 'mvp099_claim_wrong %',claim;end if;
 snap:=public.cotironda_piloto_pdf_snapshot_mvp091(v_req,
  claim->>'supplier_key',(claim->>'lease_token')::uuid);
 if snap is null then raise exception 'mvp099_pdf_snapshot_null';end if;
 if jsonb_array_length(snap->'items')<>(case when claim->>'supplier_key'=supa
  then 2 else 1 end) then raise exception 'mvp099_pdf_leaked_unmatched_lines';end if;
 if not public.cotironda_piloto_authorize_whapi_v1(v_req,
  claim->>'supplier_key',(claim->>'lease_token')::uuid)
 then raise exception 'mvp099_authorization_lost';end if;
 -- Deliberately simulate consent withdrawal: lease is no longer valid.
 update cotironda_piloto_privado.participants set opted_out_at=clock_timestamp()
 where key=claim->>'supplier_key';
 if public.cotironda_piloto_authorize_whapi_v1(v_req,
  claim->>'supplier_key',(claim->>'lease_token')::uuid)
 then raise exception 'mvp099_consent_revocation_ignored';end if;
 if has_table_privilege('anon','cotironda_piloto_privado.invitation_lines_mvp099','SELECT')
 or has_table_privilege('authenticated','cotironda_piloto_privado.document_sources_mvp099','SELECT')
 then raise exception 'mvp099_leak';end if;
end;$test$;
rollback;
