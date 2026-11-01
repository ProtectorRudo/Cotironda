-- MVP-045 / D077 — PostgreSQL17 ephemeral CI, ROLLBACK ALL fixtures.
begin;
grant usage on schema ci_helpers to
 cotironda_buyer_gateway_d076,cotironda_buyer_zone_gateway_d077;
grant execute on function ci_helpers.assert_true(boolean,text) to
 cotironda_buyer_gateway_d076,cotironda_buyer_zone_gateway_d077;
create function pg_temp.must_fail_d077(command text, expected text)
returns void language plpgsql as $$
declare failed boolean:=false;message text;
begin
 begin execute command;
 exception when others then
  get stacked diagnostics message=message_text;
  if position(expected in message)=0
   then raise exception 'd077_wrong_failure';end if;
  failed:=true;
 end;
 if not failed then raise exception 'd077_unexpected_success';end if;
end;$$;

do $priv$ begin
 if not exists(select 1 from pg_roles
  where rolname='cotironda_buyer_zone_writer_d077'
   and not rolcanlogin and not rolinherit and not rolbypassrls)
 or not exists(select 1 from pg_roles
  where rolname='cotironda_buyer_zone_gateway_d077'
   and not rolcanlogin and not rolinherit and not rolbypassrls)
 or has_table_privilege('anon','cotironda_private.buyer_zone_pending_d077','SELECT')
 or has_table_privilege('authenticated','cotironda_private.buyer_zone_question_d077','INSERT')
 or has_table_privilege('service_role','cotironda_private.buyer_zone_pending_d077','UPDATE')
 or has_table_privilege('cotironda_buyer_zone_gateway_d077',
   'cotironda_private.buyer_zone_pending_d077','SELECT')
 or has_table_privilege('cotironda_buyer_gateway_d076',
   'cotironda_private.buyer_zone_pending_d077','SELECT')
 or has_function_privilege('anon',
  'cotironda_private.whapi_zone_enqueue_d077(text,text,text,uuid)','EXECUTE')
 or has_function_privilege('authenticated',
  'cotironda_private.whapi_zone_context_d077(text,text)','EXECUTE')
 or has_function_privilege('service_role',
  'cotironda_private.whapi_zone_enqueue_d077(text,text,text,uuid)','EXECUTE')
 or not has_function_privilege('cotironda_buyer_zone_gateway_d077',
  'cotironda_private.whapi_zone_enqueue_d077(text,text,text,uuid)','EXECUTE')
 or not has_function_privilege('cotironda_buyer_gateway_d076',
  'cotironda_private.whapi_zone_context_d077(text,text)','EXECUTE')
 or (select pg_catalog.pg_get_userbyid(proowner) from pg_catalog.pg_proc
  where oid='cotironda_private.whapi_zone_enqueue_d077(text,text,text,uuid)'::regprocedure)
   <>'cotironda_buyer_zone_writer_d077'
 or (select pg_catalog.pg_get_userbyid(proowner) from pg_catalog.pg_proc
  where oid='cotironda_private.whapi_zone_context_d077(text,text)'::regprocedure)
   <>'cotironda_buyer_reader_d076'
 then raise exception 'd077_acl_failed';end if;
end;$priv$;

insert into public.organizations(id,display_name,organization_type) values
 ('aaaaaaaa-0077-4077-8077-000000000771','Buyer de prueba D077','buyer'),
 ('aaaaaaaa-0077-4077-8077-000000000772','Buyer ajeno D077','buyer');
insert into cotironda_private.whapi_buyer_contacts_d074(
 channel_id,chat_key,buyer_org_id,verified_at,consented_at) values
 ('d077_ci',repeat('a',64),'aaaaaaaa-0077-4077-8077-000000000771',
  now()-interval '1 day',now()-interval '1 day'),
 ('d077_ci',repeat('b',64),'aaaaaaaa-0077-4077-8077-000000000772',
  now()-interval '1 day',now()-interval '1 day');
insert into cotironda_private.whapi_buyer_inbox_d074(
 channel_id,message_key,chat_key,buyer_org_id,payload_fingerprint,kind,
 crypto_key_id,payload_ciphertext,payload_nonce,payload_tag,source_unix,status)
values
 ('d077_ci',repeat('1',64),repeat('a',64),
  'aaaaaaaa-0077-4077-8077-000000000771',repeat('4',64),
  'text','aes_2026_a',decode(repeat('44',45),'hex'),
  decode(repeat('11',12),'hex'),decode(repeat('22',16),'hex'),
  1800000000,'pendiente_interpretacion'),
 ('d077_ci',repeat('2',64),repeat('a',64),
  'aaaaaaaa-0077-4077-8077-000000000771',repeat('5',64),
  'text','aes_2026_a',decode(repeat('55',45),'hex'),
  decode(repeat('33',12),'hex'),decode(repeat('66',16),'hex'),
  1800000020,'pendiente_interpretacion'),
 ('d077_ci',repeat('3',64),repeat('a',64),
  'aaaaaaaa-0077-4077-8077-000000000771',repeat('6',64),
  'text','aes_2026_a',decode(repeat('66',45),'hex'),
  decode(repeat('44',12),'hex'),decode(repeat('77',16),'hex'),
  1800000030,'pendiente_interpretacion'),
 ('d077_ci',repeat('9',64),repeat('b',64),
  'aaaaaaaa-0077-4077-8077-000000000772',repeat('8',64),
  'text','aes_2026_a',decode(repeat('88',45),'hex'),
  decode(repeat('99',12),'hex'),decode(repeat('aa',16),'hex'),
  1800000035,'pendiente_interpretacion');

-- Before question, a reply has no assumed original.
set local role cotironda_buyer_gateway_d076;
select ci_helpers.assert_true(
 cotironda_private.whapi_zone_context_d077('d077_ci',repeat('2',64))->'original'
 ='null'::jsonb,'d077_no_guessed_original');
reset role;

set local role cotironda_buyer_zone_gateway_d077;
select ci_helpers.assert_true(
 cotironda_private.whapi_zone_enqueue_d077('d077_ci',repeat('a',64),
  repeat('1',64),'aaaaaaaa-0077-4077-8077-000000000771')=
 '{"estado":"zona_solicitada_en_cola","repetido":false}'::jsonb,
 'd077_one_question');
select ci_helpers.assert_true(
 cotironda_private.whapi_zone_enqueue_d077('d077_ci',repeat('a',64),
  repeat('1',64),'aaaaaaaa-0077-4077-8077-000000000771')=
 '{"estado":"zona_solicitada_en_cola","repetido":true}'::jsonb,
 'd077_duplicate_one_question');
reset role;
select ci_helpers.assert_true(
 (select count(*)=1 from cotironda_private.buyer_zone_question_d077
  where channel_id='d077_ci') and
 (select count(*)=1 from cotironda_private.buyer_zone_pending_d077
  where channel_id='d077_ci' and chat_key=repeat('a',64)) ,
 'd077_one_pending_one_outbox');

set local role cotironda_buyer_gateway_d076;
select ci_helpers.assert_true(
 cotironda_private.whapi_zone_context_d077('d077_ci',repeat('1',64))->'original'
 ='null'::jsonb,'d077_original_not_own_reply');
select ci_helpers.assert_true(
 cotironda_private.whapi_zone_context_d077('d077_ci',repeat('2',64))->'original'->>'messageKey'
 = repeat('1',64),'d077_reply_recovers_original_cipher');
select ci_helpers.assert_true(
 cotironda_private.whapi_zone_context_d077('d077_ci',repeat('9',64))->'original'
 ='null'::jsonb,'d077_other_buyer_no_original');
reset role;

select pg_temp.must_fail_d077(
 $$select cotironda_private.whapi_zone_enqueue_d077(
 'd077_ci',repeat('a',64),repeat('3',64),
 'aaaaaaaa-0077-4077-8077-000000000771')$$,
 'd077_pending_other_request');
select pg_temp.must_fail_d077(
 $$select cotironda_private.whapi_zone_enqueue_d077(
 'd077_ci',repeat('a',64),repeat('9',64),
 'aaaaaaaa-0077-4077-8077-000000000772')$$,
 'd077_source_not_verified');

-- After expiration a NEW pedido may replace the pending reference but not
-- overwrite historical outbox or the original encrypted message.
update cotironda_private.buyer_zone_pending_d077
 set expires_at=now()-interval '1 minute'
 where channel_id='d077_ci' and chat_key=repeat('a',64);
set local role cotironda_buyer_gateway_d076;
select ci_helpers.assert_true(
 cotironda_private.whapi_zone_context_d077('d077_ci',repeat('2',64))->'original'
 ='null'::jsonb,'d077_expired_not_reused');
reset role;
set local role cotironda_buyer_zone_gateway_d077;
select ci_helpers.assert_true(
 cotironda_private.whapi_zone_enqueue_d077('d077_ci',repeat('a',64),
  repeat('3',64),'aaaaaaaa-0077-4077-8077-000000000771')=
 '{"estado":"zona_solicitada_en_cola","repetido":false}'::jsonb,
 'd077_new_request_after_expiry');
reset role;
select ci_helpers.assert_true(
 (select count(*)=2 from cotironda_private.buyer_zone_question_d077
 where channel_id='d077_ci'),'d077_history_preserved_without_text');

update cotironda_private.whapi_buyer_contacts_d074
 set opted_out_at=pg_catalog.clock_timestamp()
 where channel_id='d077_ci' and chat_key=repeat('a',64);
set local role cotironda_buyer_gateway_d076;
select ci_helpers.assert_true(
 cotironda_private.whapi_zone_context_d077('d077_ci',repeat('2',64)) is null,
 'd077_optout_hides_all_read');
reset role;
select pg_temp.must_fail_d077(
 $$select cotironda_private.whapi_zone_enqueue_d077(
 'd077_ci',repeat('a',64),repeat('3',64),
 'aaaaaaaa-0077-4077-8077-000000000771')$$,
 'd077_contact_not_authorized');
select pg_temp.must_fail_d077(
 $$delete from cotironda_private.buyer_zone_question_d077
  where channel_id='d077_ci'$$,'whapi_inbox_immutable');
rollback;
