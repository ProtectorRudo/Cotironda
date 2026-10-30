-- D030 / Issue #161 - PostgreSQL17 REAL; fixtures synthetic / ROLLBACK.
begin;
do $check$ begin
 if not exists(select 1 from pg_roles
   where rolname='cotironda_whapi_gateway' and not rolcanlogin
   and not rolbypassrls and not rolinherit)
 then raise exception 'whapi_gateway_must_be_nologin'; end if;
 if has_table_privilege('cotironda_whapi_gateway',
    'cotironda_private.whapi_inbox_v1','SELECT')
 or has_table_privilege('cotironda_whapi_gateway',
    'cotironda_private.whapi_contacts_v1','INSERT')
 or has_table_privilege('cotironda_whapi_gateway',
    'cotironda_private.rounds_v1','SELECT')
 or has_function_privilege('anon',
    'cotironda_private.whapi_resolve_active_contact_v1(text,text)','EXECUTE')
 or has_function_privilege('authenticated',
    'cotironda_private.whapi_resolve_active_contact_v1(text,text)','EXECUTE')
 or has_function_privilege('service_role',
    'cotironda_private.whapi_resolve_active_contact_v1(text,text)','EXECUTE')
 or has_function_privilege('service_role',
    'cotironda_private.whapi_record_optout_v1(text,text,text,text,bigint)','EXECUTE')
 or not has_function_privilege('cotironda_whapi_gateway',
    'cotironda_private.whapi_inbox_record_v1(text,text,text,text,text,bytea,bytea,bytea,bigint)','EXECUTE')
 or (select pg_get_userbyid(proowner) from pg_proc
   where oid='cotironda_private.whapi_resolve_active_contact_v1(text,text)'::regprocedure)
   <>'cotironda_whapi_inbox_writer'
 then raise exception 'whapi_gateway_privileges_insecure'; end if;
end;$check$;
insert into public.organizations(id,display_name,organization_type) values
 ('aaaaaaaa-0000-4000-8000-000000000401','Comprador Sintetico','buyer'),
 ('bbbbbbbb-0000-4000-8000-000000000402','Corralon Sintetico','supplier'),
 ('cccccccc-0000-4000-8000-000000000403','Pintureria Sintetica','supplier');
insert into public.supplier_profiles(organization_id,trade_name,accepting_quotes) values
 ('bbbbbbbb-0000-4000-8000-000000000402','Proveedor B',true),
 ('cccccccc-0000-4000-8000-000000000403','Proveedor C',true);
insert into cotironda_private.rounds_v1(id,buyer_org_id,begins_at,ends_at) values
 ('dddddddd-0000-4000-8000-000000000404',
  'aaaaaaaa-0000-4000-8000-000000000401',now()-interval '2 minutes',now()+interval '2 hours'),
 ('dddddddd-0000-4000-8000-000000000405',
  'aaaaaaaa-0000-4000-8000-000000000401',now()-interval '2 minutes',now()+interval '2 hours');
insert into cotironda_private.round_items_v1(round_id,line_no,product_code,quantity,unit)
 values ('dddddddd-0000-4000-8000-000000000404',1,'cemento_001',10,'bag'),
 ('dddddddd-0000-4000-8000-000000000405',1,'cable_001',5,'m');
insert into cotironda_private.round_invites_v1(round_id,supplier_org_id,anon_id,invite_position)
 values ('dddddddd-0000-4000-8000-000000000404',
  'bbbbbbbb-0000-4000-8000-000000000402','anon_test_b',1);
insert into cotironda_private.whapi_contacts_v1
(channel_id,chat_key,supplier_org_id,verified_at,consented_at) values
('whapi_dev',repeat('a',64),'bbbbbbbb-0000-4000-8000-000000000402',
 now()-interval '1 day',now()-interval '1 day'),
('whapi_dev',repeat('f',64),'cccccccc-0000-4000-8000-000000000403',
 now()-interval '1 day',now()-interval '1 day');
-- Consulta antes de abrir retorna null; jamás inventa estado.
set local role cotironda_whapi_gateway;
select ci_helpers.assert_true(
 cotironda_private.whapi_resolve_active_contact_v1('whapi_dev',repeat('a',64)) is null,
 'not_open_must_not_resolve');
select ci_helpers.assert_true(
 cotironda_private.whapi_resolve_active_contact_v1('whapi_dev',repeat('f',64)) is null,
 'not_invited_must_not_resolve');
select ci_helpers.assert_true(
 cotironda_private.whapi_resolve_active_contact_v1('other_chan',repeat('a',64)) is null,
 'wrong_channel_must_not_resolve');
reset role;

update cotironda_private.rounds_v1 set status='abierta'
 where id='dddddddd-0000-4000-8000-000000000404';

set local role cotironda_whapi_gateway;
select ci_helpers.assert_true(
 (cotironda_private.whapi_resolve_active_contact_v1('whapi_dev',repeat('a',64))
  ->>'supplierOrgId')='bbbbbbbb-0000-4000-8000-000000000402'
 and
 (cotironda_private.whapi_resolve_active_contact_v1('whapi_dev',repeat('a',64))
  ->>'roundId')='dddddddd-0000-4000-8000-000000000404',
 'active_binding_should_resolve');
select ci_helpers.assert_true(
 (cotironda_private.whapi_resolve_active_contact_v1('whapi_dev',repeat('a',64))
  ->>'consentimientoVigente')='true',
 'consent_must_be_current');
select ci_helpers.assert_true(
 (select count(*)=4 from jsonb_object_keys(
   cotironda_private.whapi_resolve_active_contact_v1('whapi_dev',repeat('a',64)))),
 'no_extra_fields_in_resolver');
-- Gateway solo ejecuta sus 3 funciones, sin SELECT directo de mensajes ni ronda.
do $test$
declare denied bool:=false;
begin
 begin
  perform * from cotironda_private.whapi_contacts_v1;
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'gateway_direct_select_allowed';end if;
end;$test$;

select ci_helpers.assert_true(
 cotironda_private.whapi_inbox_record_v1(
 'whapi_dev',repeat('a',64),repeat('b',64),repeat('c',64),'text',
 decode(repeat('44',60),'hex'),decode(repeat('11',12),'hex'),
 decode(repeat('22',16),'hex'),1800000000)
 = '{"estado":"entrada_persistida","repetido":false}'::jsonb,
 'gateway_inbox_first_write');
select ci_helpers.assert_true(
 cotironda_private.whapi_inbox_record_v1(
 'whapi_dev',repeat('a',64),repeat('b',64),repeat('c',64),'text',
 decode(repeat('44',60),'hex'),decode(repeat('11',12),'hex'),
 decode(repeat('22',16),'hex'),1800000000)
 = '{"estado":"entrada_persistida","repetido":true}'::jsonb,
 'gateway_replay_idempotent');
reset role;

-- Dos rondas: no se asume la ultima ni se inventa correspondencia.
insert into cotironda_private.round_invites_v1(round_id,supplier_org_id,anon_id,invite_position)
values ('dddddddd-0000-4000-8000-000000000405',
 'bbbbbbbb-0000-4000-8000-000000000402','anon_second',1);
update cotironda_private.rounds_v1 set status='abierta'
where id='dddddddd-0000-4000-8000-000000000405';
set local role cotironda_whapi_gateway;
select ci_helpers.assert_true(
 cotironda_private.whapi_resolve_active_contact_v1('whapi_dev',repeat('a',64)) is null,
 'ambiguous_two_rounds_must_not_resolve');
reset role;
update cotironda_private.rounds_v1 set status='cancelada'
where id='dddddddd-0000-4000-8000-000000000405';

-- BAJA no necesita ronda activa, ni permite reconsentimiento tacito.
update cotironda_private.rounds_v1 set status='cancelada'
where id='dddddddd-0000-4000-8000-000000000404';
set local role cotironda_whapi_gateway;
select ci_helpers.assert_true(
 cotironda_private.whapi_record_optout_v1(
 'whapi_dev',repeat('a',64),repeat('e',64),repeat('f',64),1800000001)
 = '{"estado":"baja_registrada","repetido":false}'::jsonb,
 'optout_without_round');
select ci_helpers.assert_true(
 cotironda_private.whapi_record_optout_v1(
 'whapi_dev',repeat('a',64),repeat('e',64),repeat('f',64),1800000001)
 = '{"estado":"baja_registrada","repetido":true}'::jsonb,
 'optout_replay');
select ci_helpers.assert_true(
 cotironda_private.whapi_resolve_active_contact_v1('whapi_dev',repeat('a',64)) is null,
 'optedout_contact_cannot_resolve');
reset role;

rollback;
do $check$ begin
 if exists(select 1 from cotironda_private.whapi_contacts_v1
    where channel_id='whapi_dev' and chat_key=repeat('a',64))
 or exists(select 1 from public.organizations
    where id='aaaaaaaa-0000-4000-8000-000000000401')
 then raise exception 'D030_rollback_failed';end if;
end;$check$;
