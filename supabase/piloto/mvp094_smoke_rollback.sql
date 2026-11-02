-- MVP-094 / Supabase PILOTO only. Exercises role, daily spend gate,
-- idempotency, reply ledger and RLS; ROLLBACK leaves zero test records.
begin;
do $smoke$
declare buyer_h text; supplier_h text; id text; k integer; t boolean;
begin
 if not exists(select 1 from cotironda_piloto_privado.integration_flags
   where only_row and whatsapp_inbound_enabled)
 then raise exception 'mvp094_wrong_environment';end if;
 select chat_hmac into buyer_h from cotironda_piloto_privado.participants
 where key='arquitecto' and participant_role='buyer' and consent_at is not null
 and opted_out_at is null;
 select chat_hmac into supplier_h from cotironda_piloto_privado.participants
 where key='corralon_ailin' and participant_role='supplier' and consent_at is not null
 and opted_out_at is null;
 if buyer_h is null or supplier_h is null then
  raise exception 'mvp094_missing_consent';end if;
 id:=encode(extensions.gen_random_bytes(32),'hex');
 if public.cotironda_piloto_reserve_ai_mvp094(supplier_h,id)
 then raise exception 'mvp094_supplier_cost_leak';end if;
 if not public.cotironda_piloto_reserve_ai_mvp094(buyer_h,id)
 then raise exception 'mvp094_authorized_buyer_rejected';end if;
 if public.cotironda_piloto_reserve_ai_mvp094(buyer_h,id)
 then raise exception 'mvp094_same_message_charged_twice';end if;
 for k in 2..12 loop
   if not public.cotironda_piloto_reserve_ai_mvp094(
       buyer_h,encode(extensions.gen_random_bytes(32),'hex'))
   then raise exception 'mvp094_normal_request_rejected';end if;
 end loop;
 if public.cotironda_piloto_reserve_ai_mvp094(
      buyer_h,encode(extensions.gen_random_bytes(32),'hex'))
 then raise exception 'mvp094_daily_quota_unlimited';end if;
 -- No reply to an unknown/unauthenticated/noncommitted message.
 if public.cotironda_piloto_reserve_reply_mvp094(id,buyer_h,'zone')
 then raise exception 'mvp094_reply_without_inbox';end if;
 -- Synthetic WhatsApp inbox record, inside transaction only.
 insert into cotironda_piloto_privado.whapi_inbox(
  message_hmac,chat_hmac,participant_key,kind,
  nonce_b64,ciphertext_b64,plaintext_sha256,source_unix,processing_state)
 values(id,buyer_h,'arquitecto','text',
   'AAAAAAAAAAAAAAAA','AAAAAAAAAAAAAAAAAAAAAAAA',
   encode(extensions.gen_random_bytes(32),'hex'),
   extract(epoch from clock_timestamp())::bigint,'needs_zone');
 if public.cotironda_piloto_reserve_ai_mvp094(buyer_h,id)
 then raise exception 'mvp094_inbox_message_recharged';end if;
 if not public.cotironda_piloto_reserve_reply_mvp094(id,buyer_h,'zone')
 then raise exception 'mvp094_cannot_reply_once';end if;
 if public.cotironda_piloto_reserve_reply_mvp094(id,buyer_h,'zone')
 then raise exception 'mvp094_duplicate_reply';end if;
 if not public.cotironda_piloto_finish_reply_mvp094(id,'api_accepted')
 then raise exception 'mvp094_finish_failed';end if;
 if public.cotironda_piloto_finish_reply_mvp094(id,'api_accepted')
 then raise exception 'mvp094_duplicate_finish';end if;
 if has_table_privilege('anon',
    'cotironda_piloto_privado.ai_attempts_mvp094','SELECT')
 or has_table_privilege('authenticated',
    'cotironda_piloto_privado.ai_replies_mvp094','SELECT')
 or has_function_privilege('anon',
    'public.cotironda_piloto_reserve_ai_mvp094(text,text)','EXECUTE')
 or has_function_privilege('authenticated',
    'public.cotironda_piloto_reserve_reply_mvp094(text,text,text)','EXECUTE')
 then raise exception 'mvp094_privilege_leak';end if;
end;$smoke$;
rollback;
