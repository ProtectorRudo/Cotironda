-- D032 PG17 real: nuevos y antiguos registros, colisiones de clave.
begin;
grant usage on schema ci_helpers to cotironda_whapi_gateway;
grant execute on function ci_helpers.assert_true(boolean,text) to cotironda_whapi_gateway;

do $test$ begin
 if not has_function_privilege('cotironda_whapi_gateway',
    'cotironda_private.whapi_inbox_record_keyed_v1(text,text,text,text,text,bytea,bytea,bytea,bigint,text)','EXECUTE')
 or has_function_privilege('anon',
    'cotironda_private.whapi_inbox_record_keyed_v1(text,text,text,text,text,bytea,bytea,bytea,bigint,text)','EXECUTE')
 or has_function_privilege('service_role',
    'cotironda_private.whapi_inbox_record_keyed_v1(text,text,text,text,text,bytea,bytea,bytea,bigint,text)','EXECUTE')
 or (select pg_get_userbyid(proowner) from pg_proc where oid=
    'cotironda_private.whapi_inbox_record_keyed_v1(text,text,text,text,text,bytea,bytea,bytea,bigint,text)'::regprocedure)
    <>'cotironda_whapi_inbox_writer'
 then raise exception 'D032_keyed_privileges_insecure';end if;
end;$test$;

insert into public.organizations(id,display_name,organization_type) values
 ('aaaaaaaa-0000-4000-8000-000000000601','Buyer synthetic','buyer'),
 ('bbbbbbbb-0000-4000-8000-000000000602','Supplier synthetic','supplier');
insert into public.supplier_profiles(organization_id,trade_name,accepting_quotes)
 values ('bbbbbbbb-0000-4000-8000-000000000602','CI commerce',true);
insert into cotironda_private.rounds_v1(id,buyer_org_id,begins_at,ends_at)
 values ('dddddddd-0000-4000-8000-000000000604',
 'aaaaaaaa-0000-4000-8000-000000000601',
 now()-interval '1 minute',now()+interval '1 hour');
insert into cotironda_private.round_items_v1(round_id,line_no,product_code,quantity,unit)
 values ('dddddddd-0000-4000-8000-000000000604',1,'cemento_001',10,'bag');
insert into cotironda_private.round_invites_v1(round_id,supplier_org_id,anon_id,invite_position)
 values ('dddddddd-0000-4000-8000-000000000604',
 'bbbbbbbb-0000-4000-8000-000000000602','anon_test',1);
insert into cotironda_private.whapi_contacts_v1
 (channel_id,chat_key,supplier_org_id,verified_at,consented_at)
 values ('whapi_ci',repeat('a',64),
 'bbbbbbbb-0000-4000-8000-000000000602',now()-interval '1 day',now()-interval '1 day');
update cotironda_private.rounds_v1 set status='abierta'
 where id='dddddddd-0000-4000-8000-000000000604';

set local role cotironda_whapi_gateway;
select ci_helpers.assert_true(
 cotironda_private.whapi_inbox_record_v1(
 'whapi_ci',repeat('a',64),repeat('b',64),repeat('c',64),'text',
 decode(repeat('44',30),'hex'),decode(repeat('11',12),'hex'),
 decode(repeat('22',16),'hex'),1800000000)
 = '{"estado":"entrada_persistida","repetido":false}'::jsonb,
 'legacy_insert_still_working');

select ci_helpers.assert_true(
 cotironda_private.whapi_inbox_record_keyed_v1(
 'whapi_ci',repeat('a',64),repeat('d',64),repeat('e',64),'text',
 decode(repeat('44',32),'hex'),decode(repeat('11',12),'hex'),
 decode(repeat('22',16),'hex'),1800000000,'aes_2026_a')
 = '{"estado":"entrada_persistida","repetido":false}'::jsonb,
 'keyed_insert_ok');
select ci_helpers.assert_true(
 cotironda_private.whapi_inbox_record_keyed_v1(
 'whapi_ci',repeat('a',64),repeat('d',64),repeat('e',64),'text',
 decode(repeat('44',32),'hex'),decode(repeat('55',12),'hex'),
 decode(repeat('66',16),'hex'),1800000000,'aes_2026_a')
 = '{"estado":"entrada_persistida","repetido":true}'::jsonb,
 'replay_keyed_idempotent');
-- ID de clave incorrecta debe fallar, nunca mutar key-id historico.
do $fail$
declare denied bool:=false;msg text;
begin
 begin
 perform cotironda_private.whapi_inbox_record_keyed_v1(
 'whapi_ci',repeat('a',64),repeat('d',64),repeat('e',64),'text',
 decode(repeat('44',32),'hex'),decode(repeat('11',12),'hex'),
 decode(repeat('22',16),'hex'),1800000000,'aes_2026_b');
 exception when unique_violation then
   get stacked diagnostics msg=message_text;
   denied:=(msg='keyed_inbox_event_collision');
 end;
 if not denied then raise exception 'D032_keyid_collision_not_blocked';end if;
 denied:=false;
 begin
 perform cotironda_private.whapi_inbox_record_keyed_v1(
 'whapi_ci',repeat('a',64),repeat('f',64),repeat('e',64),'text',
 decode(repeat('44',32),'hex'),decode(repeat('11',12),'hex'),
 decode(repeat('22',16),'hex'),1800000000,'legacy_d029');
 exception when invalid_parameter_value then denied:=true;end;
 if not denied then raise exception 'D032_forbidden_legacy_keyed';end if;
end;$fail$;
reset role;

select ci_helpers.assert_true(
 (select count(*)=2 from cotironda_private.whapi_inbox_v1 where channel_id='whapi_ci'),
 'both_records_are_durable');
select ci_helpers.assert_true(
 (select count(*)=1 from cotironda_private.whapi_inbox_v1
 where message_key=repeat('b',64) and crypto_key_id='legacy_d029'),
 'legacy_row_tagged');
select ci_helpers.assert_true(
 (select count(*)=1 from cotironda_private.whapi_inbox_v1
 where message_key=repeat('d',64) and crypto_key_id='aes_2026_a'),
 'new_row_tagged');
rollback;
do $check$ begin
 if exists(select 1 from cotironda_private.whapi_inbox_v1
 where channel_id='whapi_ci' and message_key=repeat('d',64))
 then raise exception 'D032_rollback_failed';end if;
end;$check$;
