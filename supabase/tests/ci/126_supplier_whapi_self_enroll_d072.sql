-- MVP-024 / D072; ephemeral PostgreSQL17 only; rollback to original D065.
savepoint d072_onboarding_ci;
insert into auth.users(id,email_confirmed_at,is_anonymous)
 values('11111111-0024-4024-8024-000000000661',
  pg_catalog.clock_timestamp(),false);
insert into auth.sessions(id,user_id,not_after)
 values('33333333-0024-4024-8024-000000000661',
 '11111111-0024-4024-8024-000000000661',
 pg_catalog.clock_timestamp()+interval '1 day');
insert into public.organizations(id,display_name,organization_type)
 values('bbbbbbbb-0024-4024-8024-000000000661',
 'Proveedor nuevo voluntario','supplier');
insert into public.supplier_profiles(organization_id,trade_name,accepting_quotes)
 values('bbbbbbbb-0024-4024-8024-000000000661','Negocio voluntario',true);
insert into public.organization_members
 (organization_id,user_id,membership_role,status)
 values('bbbbbbbb-0024-4024-8024-000000000661',
 '11111111-0024-4024-8024-000000000661','owner','active');

do $acl$
begin
 if has_function_privilege('anon',
 'public.whapi_issue_supplier_code_d072(uuid,text)','EXECUTE')
 or has_function_privilege('service_role',
 'public.whapi_issue_supplier_code_d072(uuid,text)','EXECUTE')
 or not has_function_privilege('authenticated',
 'public.whapi_issue_supplier_code_d072(uuid,text)','EXECUTE')
 or has_function_privilege('authenticated',
 'cotironda_private.whapi_consume_supplier_code_d072(text,text,text,text)','EXECUTE')
 or has_function_privilege('cotironda_app',
 'cotironda_private.whapi_consume_supplier_code_d072(text,text,text,text)','EXECUTE')
 or not has_function_privilege('cotironda_onboard_gateway_d072',
 'cotironda_private.whapi_consume_supplier_code_d072(text,text,text,text)','EXECUTE')
 or has_table_privilege('authenticated',
 'cotironda_private.whapi_onboard_codes_d072','SELECT')
 or has_table_privilege('cotironda_onboard_gateway_d072',
 'cotironda_private.whapi_contacts_v1','INSERT')
 or not (select relrowsecurity from pg_class
 where oid='cotironda_private.whapi_onboard_codes_d072'::regclass)
 or (select rolcanlogin or rolbypassrls
 from pg_roles where rolname='cotironda_onboard_owner_d072')
 then raise exception 'd072_public_or_owner_acl';end if;
end;$acl$;

set local role authenticated;
set local request.jwt.claims =
 '{"role":"authenticated","sub":"11111111-0024-4024-8024-000000000661",
 "session_id":"33333333-0024-4024-8024-000000000661",
 "is_anonymous":false,"cotironda_email_verified":true}';
do $issue$
declare r jsonb;
begin
 r:=public.whapi_issue_supplier_code_d072(
  'bbbbbbbb-0024-4024-8024-000000000661','d065_ci');
 if r->>'state'<>'issued' or pg_catalog.length(r->>'code')<>32
 or r->>'expiresSeconds'<>'900'
 then raise exception 'd072_cannot_issue_to_real_manager';end if;
 perform pg_catalog.set_config('cotironda.d072_ci_code',r->>'code',true);
 begin
  perform public.whapi_issue_supplier_code_d072(
   'bbbbbbbb-0016-4016-8016-000000000662','d065_ci');
  raise exception 'd072_cross_supplier_issued';
 exception when insufficient_privilege then null;end;
end;$issue$;
reset role;

select ci_helpers.assert_true(
 (select count(*)=1 from cotironda_private.whapi_onboard_codes_d072
  where supplier_org_id='bbbbbbbb-0024-4024-8024-000000000661'
   and consumed_at is null and expires_at>pg_catalog.clock_timestamp()),
 'd072_token_hash_stored_only');
select ci_helpers.assert_true(
 (select count(*)=0 from cotironda_private.whapi_contacts_v1
  where supplier_org_id='bbbbbbbb-0024-4024-8024-000000000661'),
 'd072_code_issued_no_consent_yet');

set local role cotironda_onboard_gateway_d072;
do $redeem$
declare a jsonb;b jsonb;token text;
begin
 token:=pg_catalog.current_setting('cotironda.d072_ci_code');
 begin
  perform cotironda_private.whapi_consume_supplier_code_d072(
   'wrong_channel',token,repeat('f',64),repeat('a',64));
  raise exception 'd072_wrong_channel_redeemed';
 exception when insufficient_privilege then null;end;
 a:=cotironda_private.whapi_consume_supplier_code_d072(
  'd065_ci',token,repeat('f',64),repeat('a',64));
 b:=cotironda_private.whapi_consume_supplier_code_d072(
  'd065_ci',token,repeat('f',64),repeat('a',64));
 if a->>'state'<>'registered' or b->>'state'<>'already_registered'
 or a->>'supplierOrgId'<>'bbbbbbbb-0024-4024-8024-000000000661'
 then raise exception 'd072_first_contact_and_retry_failed';end if;
 begin
  perform cotironda_private.whapi_consume_supplier_code_d072(
   'd065_ci',token,repeat('e',64),repeat('a',64));
  raise exception 'd072_reused_from_other_phone';
 exception when insufficient_privilege then null;end;
 begin
  perform cotironda_private.whapi_consume_supplier_code_d072(
   'd065_ci',token,repeat('f',64),repeat('b',64));
  raise exception 'd072_reused_other_message';
 exception when insufficient_privilege then null;end;
end;$redeem$;
reset role;

select ci_helpers.assert_true(
 (select count(*)=1 from cotironda_private.whapi_contacts_v1
  where channel_id='d065_ci' and chat_key=repeat('f',64)
  and supplier_org_id='bbbbbbbb-0024-4024-8024-000000000661'
  and consented_at is not null and opted_out_at is null),
 'd072_voluntary_contact_bound');
select ci_helpers.assert_true(
 (select count(*)=0 from cotironda_private.whapi_recipient_vault_d068
  where supplier_org_id='bbbbbbbb-0024-4024-8024-000000000661'),
 'd072_does_not_store_unciphered_phone');

-- Simulate subsequent BAJA: not even replay re-enables consent.
update cotironda_private.whapi_contacts_v1
 set opted_out_at=pg_catalog.clock_timestamp()
 where channel_id='d065_ci' and chat_key=repeat('f',64);
set local role cotironda_onboard_gateway_d072;
do $optout$
begin
 begin
  perform cotironda_private.whapi_consume_supplier_code_d072(
  'd065_ci',pg_catalog.current_setting('cotironda.d072_ci_code'),
  repeat('f',64),repeat('a',64));
  raise exception 'd072_baja_reactivated';
 exception when insufficient_privilege then null;end;
end;$optout$;
reset role;

-- Auth session revoked must prevent issuing fresh codes.
delete from auth.sessions
 where id='33333333-0024-4024-8024-000000000661';
set local role authenticated;
do $revoked$
begin
 begin
  perform public.whapi_issue_supplier_code_d072(
   'bbbbbbbb-0024-4024-8024-000000000661','d065_ci');
  raise exception 'd072_revoked_session_issued_code';
 exception when insufficient_privilege then null;end;
end;$revoked$;
reset role;
rollback to savepoint d072_onboarding_ci;
release savepoint d072_onboarding_ci;
