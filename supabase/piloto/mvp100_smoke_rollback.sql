-- MVP-100: entire E2E synthetic clarification, all in rollback.
begin;
do $test$
declare chat text;source text;reply text;sha text;proposal jsonb;res jsonb;
 round_id uuid; baseline integer; msg text;f text;
begin
 select chat_hmac into chat from cotironda_piloto_privado.participants
 where key='arquitecto' and consent_at is not null and opted_out_at is null;
 if chat is null then raise exception 'mvp100_missing_test_buyer';end if;
 source:=encode(extensions.gen_random_bytes(32),'hex');
 reply:=encode(extensions.gen_random_bytes(32),'hex');
 sha:=encode(extensions.gen_random_bytes(32),'hex');
 select count(*) into baseline from cotironda_piloto_privado.requests;
 insert into cotironda_piloto_privado.whapi_inbox(
  message_hmac,chat_hmac,participant_key,kind,nonce_b64,ciphertext_b64,
  plaintext_sha256,source_unix,processing_state)
 values(source,chat,'arquitecto','image','AAAAAAAAAAAAAAAA',
  'AAAAAAAAAAAAAAAAAAAAAAAA',sha,
  extract(epoch from clock_timestamp())::bigint,'needs_review');
 proposal:=jsonb_build_object('kind','buyer_request','status','review_required',
  'delivery_city',null,'lines',jsonb_build_array(
   jsonb_build_object('original_description','Cemento','quantity','10',
     'unit',null,'evidence_location','Página 1: 10 Cemento'),
   jsonb_build_object('original_description','Arena','quantity','2',
     'unit',null,'evidence_location','Página 1: 2 Arena'),
   jsonb_build_object('original_description','Huecos del 12','quantity','288',
     'unit',null,'evidence_location','Página 1: 288 Huecos del 12')));
 insert into cotironda_piloto_privado.media_archive_mvp095(
  message_hmac,chat_hmac,participant_key,kind,mime,media_id_sha256,
  state,size_bytes,content_sha256,storage_path,review_state,proposal)
 values(source,chat,'arquitecto','image','image/jpeg',sha,
 'stored',6500,sha,'media/'||source,'suggested_only',proposal);
 res:=public.cotironda_piloto_plan_document_mvp098(source);
 if res->>'state'<>'planned_private' then raise exception 'plan_failed';end if;
 res:=public.cotironda_piloto_record_agreement_mvp099(source,proposal);
 if res->>'state'<>'agreed_private' then raise exception 'agreement_failed %',res;end if;
 res:=public.cotironda_piloto_clarification_preview_mvp100(source);
 if res->>'state'<>'needs_details' then raise exception 'preview_failed';end if;
 msg:=res->>'body';
 if position('1. Cemento' in msg)=0 or position('2. Arena' in msg)=0
  or position('3. Huecos del 12' in msg)=0
  or position('Localidad de entrega' in msg)=0
 then raise exception 'lost_line_in_prompt';end if;
 if not public.cotironda_piloto_reserve_clarification_mvp100(chat,source)
 or public.cotironda_piloto_reserve_clarification_mvp100(chat,source)
 then raise exception 'duplicate_prompt';end if;
 if not public.cotironda_piloto_finish_reply_mvp094(source,'api_accepted')
 then raise exception 'outbound_prompt_not_registered';end if;
 insert into cotironda_piloto_privado.whapi_inbox(
  message_hmac,chat_hmac,participant_key,kind,nonce_b64,ciphertext_b64,
  plaintext_sha256,source_unix,processing_state)
 values(reply,chat,'arquitecto','text','AAAAAAAAAAAAAAAA',
  'AAAAAAAAAAAAAAAAAAAAAAAA',sha,
  extract(epoch from clock_timestamp())::bigint,'needs_review');
 res:=public.cotironda_piloto_apply_clarification_mvp100(chat,reply,'La Plata',
  '[{"line_no":1,"unit":"bag","family_hint":null},
    {"line_no":2,"unit":"m3","family_hint":"arena_gruesa"},
    {"line_no":3,"unit":"unit","family_hint":null}]'::jsonb);
 if res->>'state'<>'applied' or (res->>'lines')::int<>3
 or res->>'source_message_hmac'<>source then
 raise exception 'clarification_not_linked %',res;end if;
 if (select count(*) from cotironda_piloto_privado.document_lines_mvp098
  where message_hmac=source and unit_literal is not null)<>3
 or (select classified_family from cotironda_piloto_privado.document_lines_mvp098
    where message_hmac=source and line_no=2)<>'arena_gruesa'
 then raise exception 'missing_or_invented_specifications';end if;
 if (select a.proposal from cotironda_piloto_privado.media_archive_mvp095 a
   where a.message_hmac=source)<>proposal
 then raise exception 'original_model_proposal_was_overwritten';end if;
 res:=public.cotironda_piloto_apply_clarification_mvp100(chat,reply,'La Plata',
 '[{"line_no":1,"unit":"unit","family_hint":null}]'::jsonb);
 if res->>'state' not in ('unit_not_missing','already_clarified')
 then raise exception 'unit_override_allowed %',res;end if;
 res:=public.cotironda_piloto_prepare_document_mvp099(source);
 if res->>'state'<>'prepared' or (res->>'all_lines')::int<>3
 then raise exception 'document_not_prepared %',res;end if;
 round_id:=(res->>'request_id')::uuid;
 if (select count(*) from cotironda_piloto_privado.request_lines
    where request_id=round_id)<>3 then raise exception 'items_lost';end if;
 if (select count(*) from cotironda_piloto_privado.requests)<>baseline+1
 then raise exception 'round_count_wrong';end if;
 if (public.cotironda_piloto_prepare_document_mvp099(source))->>'state'
 <>'not_agreed_or_already_created'
 then raise exception 'duplicated_round';end if;
 if has_function_privilege('anon',
  'public.cotironda_piloto_apply_clarification_mvp100(text,text,text,jsonb)','EXECUTE')
 or has_table_privilege('authenticated',
  'cotironda_piloto_privado.clarified_lines_mvp100','SELECT')
 then raise exception 'client_can_access_private_clarifications';end if;
end;$test$;
rollback;
