-- MVP-044/D076 PostgreSQL17 isolated CI, rollback all fixtures.
begin;
grant usage on schema ci_helpers to cotironda_buyer_gateway_d076;
grant execute on function ci_helpers.assert_true(boolean,text)
 to cotironda_buyer_gateway_d076;
create function pg_temp.d076_must_fail(command text,fragment text)
returns void language plpgsql as $$
declare reason text;failed boolean:=false;
begin
 begin execute command;
 exception when others then
  get stacked diagnostics reason=message_text;
  if position(fragment in reason)=0 then
   raise exception 'd076_wrong_error_expected:% got:%',fragment,reason;
  end if;
  failed:=true;
 end;
 if not failed then raise exception 'd076_unexpected_success';end if;
end;$$;

do $acl$ begin
 if not exists(select 1 from pg_roles
  where rolname='cotironda_buyer_reader_d076'
   and not rolcanlogin and not rolinherit and not rolbypassrls)
 or not exists(select 1 from pg_roles
  where rolname='cotironda_buyer_gateway_d076'
   and not rolcanlogin and not rolinherit and not rolbypassrls)
 or has_function_privilege('anon',
  'cotironda_private.whapi_buyer_read_d076(text,text)','EXECUTE')
 or has_function_privilege('authenticated',
  'cotironda_private.whapi_buyer_read_d076(text,text)','EXECUTE')
 or has_function_privilege('service_role',
  'cotironda_private.whapi_buyer_read_d076(text,text)','EXECUTE')
 or not has_function_privilege('cotironda_buyer_gateway_d076',
  'cotironda_private.whapi_buyer_read_d076(text,text)','EXECUTE')
 or has_table_privilege('cotironda_buyer_gateway_d076',
  'cotironda_private.whapi_buyer_inbox_d074','SELECT')
 or has_table_privilege('cotironda_buyer_gateway_d076',
  'cotironda_private.whapi_buyer_contacts_d074','SELECT')
 or (select pg_catalog.pg_get_userbyid(proowner) from pg_catalog.pg_proc
    where oid='cotironda_private.whapi_buyer_read_d076(text,text)'::regprocedure)
    <>'cotironda_buyer_reader_d076'
 then raise exception 'd076_acl_failed';end if;
end;$acl$;

insert into public.organizations(id,display_name,organization_type) values
 ('aaaaaaaa-0076-4076-8076-000000000761','Comprador D076 CI','buyer'),
 ('bbbbbbbb-0076-4076-8076-000000000762','Proveedor D076 CI','supplier');
insert into public.supplier_profiles(organization_id,trade_name,accepting_quotes)
 values ('bbbbbbbb-0076-4076-8076-000000000762','Corralon D076',true);
insert into cotironda_private.whapi_buyer_contacts_d074(
 channel_id,chat_key,buyer_org_id,verified_at,consented_at) values
 ('d076_ci',repeat('a',64),'aaaaaaaa-0076-4076-8076-000000000761',
  now()-interval '1 day',now()-interval '1 day'),
 ('d076_ci',repeat('b',64),'aaaaaaaa-0076-4076-8076-000000000761',
  now()-interval '1 day',now()-interval '1 day');
insert into cotironda_private.whapi_contacts_v1(
 channel_id,chat_key,supplier_org_id,verified_at,consented_at) values
 ('d076_ci',repeat('f',64),'bbbbbbbb-0076-4076-8076-000000000762',
  now()-interval '1 day',now()-interval '1 day');
insert into cotironda_private.whapi_buyer_inbox_d074(
 channel_id,message_key,chat_key,buyer_org_id,payload_fingerprint,kind,
 crypto_key_id,payload_ciphertext,payload_nonce,payload_tag,source_unix,status)
values
 ('d076_ci',repeat('1',64),repeat('a',64),
  'aaaaaaaa-0076-4076-8076-000000000761',
  repeat('3',64),'text','aes_2026_a',
  decode(repeat('44',48),'hex'),decode(repeat('11',12),'hex'),
  decode(repeat('22',16),'hex'),1800000000,'pendiente_interpretacion'),
 ('d076_ci',repeat('2',64),repeat('b',64),
  'aaaaaaaa-0076-4076-8076-000000000761',
  repeat('4',64),'document','aes_2026_a',
  decode(repeat('55',48),'hex'),decode(repeat('33',12),'hex'),
  decode(repeat('66',16),'hex'),1800000001,'pendiente_interpretacion');

set local role cotironda_buyer_gateway_d076;
select ci_helpers.assert_true(
 cotironda_private.whapi_buyer_read_d076('d076_ci',repeat('1',64))=
 pg_catalog.jsonb_build_object(
  'channel','d076_ci','messageKey',repeat('1',64),'chatKey',repeat('a',64),
  'buyerOrgId','aaaaaaaa-0076-4076-8076-000000000761',
  'kind','text','sourceUnix',1800000000,'cryptoKeyId','aes_2026_a',
  'fingerprint',repeat('3',64),
  'cipherHex',repeat('44',48),'nonceHex',repeat('11',12),
  'tagHex',repeat('22',16)
 ),'d076_get_exact_buyer_cipher_not_plaintext');
select ci_helpers.assert_true(
 cotironda_private.whapi_buyer_read_d076('d076_ci',repeat('2',64))->>'kind'
 ='document','d076_document_stays_encrypted');
select ci_helpers.assert_true(
 cotironda_private.whapi_buyer_read_d076('d076_ci',repeat('9',64)) is null,
 'd076_no_unknown');
select ci_helpers.assert_true(
 cotironda_private.whapi_buyer_read_d076('another_channel',repeat('1',64))
 is null,'d076_no_cross_channel');
reset role;

-- Revocation must hide even an OLD stored event before AES is ever used.
update cotironda_private.whapi_buyer_contacts_d074
 set opted_out_at=pg_catalog.clock_timestamp()
 where channel_id='d076_ci' and chat_key=repeat('a',64);
set local role cotironda_buyer_gateway_d076;
select ci_helpers.assert_true(
 cotironda_private.whapi_buyer_read_d076('d076_ci',repeat('1',64)) is null,
 'd076_revoked_old_messages_invisible');
select ci_helpers.assert_true(
 cotironda_private.whapi_buyer_read_d076('d076_ci',repeat('2',64))
 is not null,'d076_different_verified_buyer_contact_works');
reset role;
select pg_temp.d076_must_fail(
 $$select cotironda_private.whapi_buyer_read_d076(
  'd076_ci','not_a_valid_hmac')$$,'d076_read_identity_invalid');
select pg_temp.d076_must_fail(
 $$delete from cotironda_private.whapi_buyer_inbox_d074
  where channel_id='d076_ci'$$,'whapi_inbox_immutable');
-- Gateway cannot directly SELECT private rows, even though function works.
set local role cotironda_buyer_gateway_d076;
select pg_temp.d076_must_fail(
 $$select count(*) from cotironda_private.whapi_buyer_inbox_d074$$,
 'permission denied');
reset role;
rollback;
