-- MVP-043 D074 — PG17 ephemeral CI ONLY; fixture and writes ROLLBACK.
begin;
-- Temporary CI-only grants vanish under ROLLBACK; gateway stays EXECUTE-only in actual SQL.
grant usage on schema ci_helpers to cotironda_whapi_gateway;
grant execute on function ci_helpers.assert_true(boolean,text) to cotironda_whapi_gateway;
create function pg_temp.d074_must_fail(cmd text,contains text) returns void
 language plpgsql as $$
declare failed boolean:=false; reason text;
begin
 begin execute cmd;
 exception when others then
  get stacked diagnostics reason=message_text;
  if position(contains in reason)=0 then
   raise exception 'wrong_d074_error_expected_%,_got_%',contains,reason;
  end if;
  failed:=true;
 end;
 if not failed then raise exception 'unexpected_d074_success:%',cmd;end if;
end;$$;

do $checks$ begin
 if not exists(select 1 from pg_roles
  where rolname='cotironda_whapi_inbox_writer'
    and not rolcanlogin and not rolbypassrls and not rolinherit)
 or not exists(select 1 from pg_roles
  where rolname='cotironda_whapi_gateway'
    and not rolcanlogin and not rolbypassrls and not rolinherit)
 or has_table_privilege('anon','cotironda_private.whapi_buyer_inbox_d074','SELECT')
 or has_table_privilege('authenticated','cotironda_private.whapi_buyer_contacts_d074','SELECT')
 or has_table_privilege('service_role','cotironda_private.whapi_buyer_inbox_d074','INSERT')
 or has_table_privilege('cotironda_whapi_gateway','cotironda_private.whapi_buyer_inbox_d074','SELECT')
 or has_table_privilege('cotironda_whapi_gateway','cotironda_private.whapi_buyer_contacts_d074','INSERT')
 or not has_function_privilege('cotironda_whapi_gateway',
  'cotironda_private.whapi_record_buyer_d074(text,text,text,text,text,bytea,bytea,bytea,bigint,text)','EXECUTE')
 or has_function_privilege('anon',
  'cotironda_private.whapi_record_buyer_d074(text,text,text,text,text,bytea,bytea,bytea,bigint,text)','EXECUTE')
 or has_function_privilege('service_role',
  'cotironda_private.whapi_resolve_buyer_d074(text,text)','EXECUTE')
 or has_function_privilege('authenticated',
  'cotironda_private.whapi_buyer_optout_d074(text,text,text,text,bigint)','EXECUTE')
 or (select pg_catalog.pg_get_userbyid(proowner) from pg_catalog.pg_proc
  where oid='cotironda_private.whapi_record_buyer_d074(text,text,text,text,text,bytea,bytea,bytea,bigint,text)'::regprocedure)
   <>'cotironda_whapi_inbox_writer'
 or (select count(*) from pg_catalog.pg_class where oid in
  ('cotironda_private.whapi_buyer_contacts_d074'::regclass,
   'cotironda_private.whapi_buyer_inbox_d074'::regclass) and relrowsecurity)<>2
 then raise exception 'd074_privilege_or_rls_failed';end if;
 if exists(select 1 from information_schema.columns where table_schema='cotironda_private'
  and table_name='whapi_buyer_inbox_d074'
  and column_name in('phone','chat_id','telefono','texto','message_body','wa_id'))
 then raise exception 'd074_plaintext_columns_present';end if;
end;$checks$;

insert into public.organizations(id,display_name,organization_type) values
 ('aaaaaaaa-0074-4074-8074-000000000741','Arquitecto ficticio','buyer'),
 ('aaaaaaaa-0074-4074-8074-000000000742','Arquitecto ajeno','buyer'),
 ('bbbbbbbb-0074-4074-8074-000000000743','Negocio proveedor','supplier');
insert into public.supplier_profiles(organization_id,trade_name,accepting_quotes) values
 ('bbbbbbbb-0074-4074-8074-000000000743','Corralon prueba',true);
insert into cotironda_private.whapi_buyer_contacts_d074(
 channel_id,chat_key,buyer_org_id,verified_at,consented_at) values
 ('whapi_piloto',repeat('a',64),'aaaaaaaa-0074-4074-8074-000000000741',
  now()-interval '1 day',now()-interval '1 day'),
 ('whapi_piloto',repeat('b',64),'aaaaaaaa-0074-4074-8074-000000000742',
  now()-interval '1 day',now()-interval '1 day');

-- Refuse supplier enrollment on a buyer's chat even for a different org.
select pg_temp.d074_must_fail(
 $$insert into cotironda_private.whapi_contacts_v1(
  channel_id,chat_key,supplier_org_id,verified_at,consented_at)
 values('whapi_piloto',repeat('a',64),
 'bbbbbbbb-0074-4074-8074-000000000743',now(),now())$$,
 'd074_dual_role_denied');
insert into cotironda_private.whapi_contacts_v1(
 channel_id,chat_key,supplier_org_id,verified_at,consented_at)
 values('whapi_piloto',repeat('f',64),
 'bbbbbbbb-0074-4074-8074-000000000743',now(),now());
-- Reverse direction: buyer enrollment on supplier chat must fail.
select pg_temp.d074_must_fail(
 $$insert into cotironda_private.whapi_buyer_contacts_d074(
  channel_id,chat_key,buyer_org_id,verified_at,consented_at)
 values('whapi_piloto',repeat('f',64),
 'aaaaaaaa-0074-4074-8074-000000000741',now(),now())$$,
 'd074_dual_role_denied');
select pg_temp.d074_must_fail(
 $$insert into cotironda_private.whapi_buyer_contacts_d074(
  channel_id,chat_key,buyer_org_id,verified_at,consented_at)
 values('whapi_piloto',repeat('d',64),
 'bbbbbbbb-0074-4074-8074-000000000743',now(),now())$$,
 'd074_buyer_org_invalid');

-- Permission is through strictly scoped EXECUTE-only gateway role.
set local role cotironda_whapi_gateway;
select ci_helpers.assert_true(
 cotironda_private.whapi_resolve_buyer_d074('whapi_piloto',repeat('a',64))=
 pg_catalog.jsonb_build_object('buyerOrgId',
   'aaaaaaaa-0074-4074-8074-000000000741',
   'consentimientoContactoVigente',true,'chatHabilitado',true),
 'd074_buyer_lookup');
select ci_helpers.assert_true(
 cotironda_private.whapi_resolve_buyer_d074('whapi_piloto',repeat('f',64)) is null,
 'd074_supplier_never_buyer');
select ci_helpers.assert_true(
 cotironda_private.whapi_record_buyer_d074(
  'whapi_piloto',repeat('a',64),repeat('1',64),repeat('2',64),
  'text',decode(repeat('44',45),'hex'),decode(repeat('33',12),'hex'),
  decode(repeat('22',16),'hex'),1800000000,'aes_2026_a')=
   '{"estado":"entrada_persistida","repetido":false}'::jsonb,
  'd074_first_insert');
select ci_helpers.assert_true(
 cotironda_private.whapi_record_buyer_d074(
  'whapi_piloto',repeat('a',64),repeat('1',64),repeat('2',64),
  'text',decode(repeat('45',45),'hex'),decode(repeat('66',12),'hex'),
  decode(repeat('77',16),'hex'),1800000000,'aes_2026_b')=
  '{"estado":"entrada_persistida","repetido":true}'::jsonb,
 'd074_dedupe_with_new_cipher');
reset role;

select ci_helpers.assert_true(
 (select count(*)=1 from cotironda_private.whapi_buyer_inbox_d074
 where channel_id='whapi_piloto' and kind='text'
  and pg_catalog.octet_length(payload_nonce)=12
  and pg_catalog.octet_length(payload_tag)=16
  and crypto_key_id='aes_2026_a'),'d074_durable_cipher_only');
select pg_temp.d074_must_fail(
 $$select cotironda_private.whapi_record_buyer_d074(
  'whapi_piloto',repeat('a',64),repeat('1',64),repeat('9',64),
  'text',decode(repeat('44',45),'hex'),decode(repeat('33',12),'hex'),
  decode(repeat('22',16),'hex'),1800000000,'aes_2026_a')$$,
 'd074_event_collision');
select pg_temp.d074_must_fail(
 $$select cotironda_private.whapi_record_buyer_d074(
  'whapi_piloto',repeat('b',64),repeat('1',64),repeat('2',64),
  'text',decode(repeat('44',45),'hex'),decode(repeat('33',12),'hex'),
  decode(repeat('22',16),'hex'),1800000000,'aes_2026_a')$$,
 'd074_event_collision');
select pg_temp.d074_must_fail(
 $$select cotironda_private.whapi_record_buyer_d074(
  'whapi_piloto',repeat('f',64),repeat('4',64),repeat('5',64),
  'text',decode(repeat('44',45),'hex'),decode(repeat('33',12),'hex'),
  decode(repeat('22',16),'hex'),1800000000,'aes_2026_a')$$,
 'd074_contact_not_verified');
select pg_temp.d074_must_fail(
 $$select cotironda_private.whapi_record_buyer_d074(
  'whapi_piloto',repeat('a',64),repeat('4',64),repeat('5',64),
  'text',decode(repeat('44',45),'hex'),decode(repeat('33',11),'hex'),
  decode(repeat('22',16),'hex'),1800000000,'aes_2026_a')$$,
 'd074_payload_invalid');
select pg_temp.d074_must_fail(
 $$update cotironda_private.whapi_buyer_contacts_d074
  set buyer_org_id='aaaaaaaa-0074-4074-8074-000000000742'
  where chat_key=repeat('a',64)$$,'d074_contact_immutable_or_optout_reset');

-- BAJA is durable, idempotent, and no plaintext/ciphertext saved for opt-out.
set local role cotironda_whapi_gateway;
select ci_helpers.assert_true(
 cotironda_private.whapi_buyer_optout_d074(
  'whapi_piloto',repeat('a',64),repeat('3',64),repeat('6',64),1800000001)=
 '{"estado":"baja_registrada","repetido":false}'::jsonb,'d074_optout_committed');
select ci_helpers.assert_true(
 cotironda_private.whapi_buyer_optout_d074(
  'whapi_piloto',repeat('a',64),repeat('3',64),repeat('6',64),1800000001)=
 '{"estado":"baja_registrada","repetido":true}'::jsonb,'d074_optout_duplicate');
select ci_helpers.assert_true(
 cotironda_private.whapi_resolve_buyer_d074('whapi_piloto',repeat('a',64)) is null,
 'd074_revoked_lookup');
reset role;
select ci_helpers.assert_true(
 (select count(*)=1 from cotironda_private.whapi_buyer_inbox_d074
  where kind='opt_out' and payload_ciphertext is null and payload_nonce is null
   and payload_tag is null and status='opt_out_registrado'),
 'd074_optout_cipher_absent');
select pg_temp.d074_must_fail(
 $$select cotironda_private.whapi_record_buyer_d074(
  'whapi_piloto',repeat('a',64),repeat('7',64),repeat('8',64),
  'text',decode(repeat('44',45),'hex'),decode(repeat('33',12),'hex'),
  decode(repeat('22',16),'hex'),1800000002,'aes_2026_a')$$,
 'd074_contact_revoked');
select pg_temp.d074_must_fail(
 $$update cotironda_private.whapi_buyer_contacts_d074
  set opted_out_at=null where chat_key=repeat('a',64)$$,
 'd074_contact_immutable_or_optout_reset');
select pg_temp.d074_must_fail(
 $$delete from cotironda_private.whapi_buyer_inbox_d074
  where message_key=repeat('1',64)$$,
 'whapi_inbox_immutable');
-- No public or user role may directly read encrypted/identity tables.
set local role authenticated;
select pg_temp.d074_must_fail(
 $$select count(*) from cotironda_private.whapi_buyer_contacts_d074$$,
 'permission denied');
reset role;
rollback;
