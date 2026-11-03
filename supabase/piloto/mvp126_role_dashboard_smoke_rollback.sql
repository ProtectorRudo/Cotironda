-- Run ONLY wrapped by BEGIN / ... / ROLLBACK on isolated PILOTO.
-- Uses temporary Auth rows and synthetic encrypted inbox messages; never sends WhatsApp.
do $mvp126_smoke$
declare
 buyer_user uuid:=gen_random_uuid();
 supplier_user uuid:=gen_random_uuid();
 buyer_session uuid:=gen_random_uuid();
 supplier_session uuid:=gen_random_uuid();
 buyer_chat text; supplier_chat text;
 buyer_msg text:=encode(extensions.gen_random_bytes(32),'hex');
 supplier_msg text:=encode(extensions.gen_random_bytes(32),'hex');
 challenge jsonb; code text; response jsonb; dashboard jsonb;
begin
 select chat_hmac into buyer_chat from cotironda_piloto_privado.participants
  where key='arquitecto' and participant_role='buyer';
 select chat_hmac into supplier_chat from cotironda_piloto_privado.participants
  where key='corralon_ailin' and participant_role='supplier';
 if buyer_chat is null or supplier_chat is null then
  raise exception 'mvp126_fixture_expected_pilot_roles_missing';end if;
 insert into auth.users(id,aud,role,email,email_confirmed_at,created_at,updated_at,
                        is_anonymous,is_sso_user)
 values(buyer_user,'authenticated','authenticated','mvp126-buyer-test@invalid.example',
        now(),now(),now(),false,false),
       (supplier_user,'authenticated','authenticated','mvp126-supplier-test@invalid.example',
        now(),now(),now(),false,false);
 insert into auth.sessions(id,user_id,created_at,not_after)
 values(buyer_session,buyer_user,now(),now()+interval '1 hour'),
       (supplier_session,supplier_user,now(),now()+interval '1 hour');

 -- No JWT and no live session yields no data.
 if public.cotironda_piloto_my_rounds_mvp126()->>'state' <> 'not_authenticated'
 then raise exception 'mvp126_missing_jwt_guard';end if;

 perform set_config('request.jwt.claims',jsonb_build_object(
   'sub',buyer_user,'session_id',buyer_session,'role','authenticated')::text,true);
 dashboard:=public.cotironda_piloto_my_rounds_mvp126();
 if dashboard->>'state'<>'not_linked' then
  raise exception 'mvp126_user_must_not_be_auto_linked';end if;
 challenge:=public.cotironda_piloto_new_web_link_mvp126('buyer');
 if challenge->>'state'<>'issued' or (challenge->>'code') !~ '^[A-F0-9]{24}$'
 then raise exception 'mvp126_challenge_not_issued';end if;
 code:=challenge->>'code';
 if public.cotironda_piloto_new_web_link_mvp126('buyer')->>'state'<>'rate_limited'
 then raise exception 'mvp126_challenge_rate_limit';end if;
 insert into cotironda_piloto_privado.whapi_inbox(
  message_hmac,chat_hmac,participant_key,kind,nonce_b64,ciphertext_b64,
  plaintext_sha256,source_unix,processing_state,received_at)
 values(buyer_msg,buyer_chat,'arquitecto','text','AAAAAAAAAAAAAAAA',
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  encode(extensions.digest('VINCULAR '||code,'sha256'),'hex'),
  floor(extract(epoch from now()))::bigint,'needs_review',
  clock_timestamp()+interval '1 millisecond');
 response:=public.cotironda_piloto_complete_web_link_mvp126(
  buyer_chat,buyer_msg,'AAAAAAAAAAAAAAAAAAAAAAAA');
 if response->>'state'='linked' then raise exception 'mvp126_wrong_code_linked';end if;
 response:=public.cotironda_piloto_complete_web_link_mvp126(
  buyer_chat,buyer_msg,code);
 if response->>'state'<>'linked' or response->>'role'<>'buyer'
 then raise exception 'mvp126_buyer_link_failed';end if;
 response:=public.cotironda_piloto_complete_web_link_mvp126(
  buyer_chat,buyer_msg,code);
 if response->>'state'='linked' then raise exception 'mvp126_replay_linked';end if;
 dashboard:=public.cotironda_piloto_my_rounds_mvp126();
 if dashboard->>'role'<>'buyer' or dashboard->>'state'<>'linked'
  or jsonb_array_length(dashboard->'rounds')<1
 then raise exception 'mvp126_buyer_round_listing_missing';end if;
 if (dashboard::text) ~ 'original_quote|whapi_message|contact|chat_hmac'
 then raise exception 'mvp126_buyer_private_field_leaked';end if;

 perform set_config('request.jwt.claims',jsonb_build_object(
   'sub',supplier_user,'session_id',supplier_session,'role','authenticated')::text,true);
 challenge:=public.cotironda_piloto_new_web_link_mvp126('supplier');
 if challenge->>'state'<>'issued' then raise exception 'mvp126_supplier_challenge';end if;
 code:=challenge->>'code';
 insert into cotironda_piloto_privado.whapi_inbox(
  message_hmac,chat_hmac,participant_key,kind,nonce_b64,ciphertext_b64,
  plaintext_sha256,source_unix,processing_state,received_at)
 values(supplier_msg,supplier_chat,'corralon_ailin','text','AAAAAAAAAAAAAAAA',
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  encode(extensions.digest('VINCULAR '||code,'sha256'),'hex'),
  floor(extract(epoch from now()))::bigint,'needs_review',
  clock_timestamp()+interval '1 millisecond');
 response:=public.cotironda_piloto_complete_web_link_mvp126(
   buyer_chat,supplier_msg,code);
 if response->>'state'='linked' then raise exception 'mvp126_wrong_chat_attached';end if;
 response:=public.cotironda_piloto_complete_web_link_mvp126(
   supplier_chat,supplier_msg,code);
 if response->>'state'<>'linked' then raise exception 'mvp126_supplier_link_failed';end if;
 dashboard:=public.cotironda_piloto_my_rounds_mvp126();
 if dashboard->>'state'<>'linked' or dashboard->>'role'<>'supplier'
 or jsonb_array_length(dashboard->'rounds')<1
 then raise exception 'mvp126_supplier_dashboard_failed';end if;
 if dashboard::text ~ 'original_request|original_quote|competitor|whapi_message|chat_hmac'
 then raise exception 'mvp126_supplier_private_field_leaked';end if;
 if (dashboard->'rounds'->0 ? 'quotes_received_unverified') then
  raise exception 'mvp126_supplier_competitor_count_leaked';end if;
 
 -- Live Auth session disappears after logout; old JWT loses access.
 delete from auth.sessions where id=supplier_session;
 if public.cotironda_piloto_my_rounds_mvp126()->>'state'<>'not_authenticated'
 then raise exception 'mvp126_logout_not_enforced';end if;
 perform set_config('request.jwt.claims','{}',true);
end $mvp126_smoke$;
