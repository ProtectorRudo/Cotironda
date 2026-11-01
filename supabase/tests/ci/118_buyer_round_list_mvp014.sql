-- MVP-014 / only disposable PostgreSQL 17 CI.
-- Buyer lists OWN rounds only; no direct tables, no PII, revoked sessions fail.
begin;
do $acl$
begin
 if has_function_privilege('anon','public.buyer_round_list_mvp014()','EXECUTE')
 or has_function_privilege('service_role','public.buyer_round_list_mvp014()','EXECUTE')
 or has_function_privilege('cotironda_app','public.buyer_round_list_mvp014()','EXECUTE')
 or not has_function_privilege('authenticated','public.buyer_round_list_mvp014()','EXECUTE')
 or (select prosecdef from pg_proc
     where oid='public.buyer_round_list_mvp014()'::regprocedure)
 or (select pg_get_userbyid(proowner) from pg_proc
     where oid='cotironda_private.buyer_round_list_mvp014()'::regprocedure)
     <>'cotironda_rounds_reader'
 then raise exception 'mvp014_list_privileges_insecure';end if;
end;$acl$;
insert into auth.users(id,email_confirmed_at,is_anonymous) values
 ('11111111-0014-4014-8014-000000000641',now(),false),
 ('11111111-0014-4014-8014-000000000642',now(),false);
insert into auth.sessions(id,user_id,not_after) values
 ('33333333-0014-4014-8014-000000000643',
  '11111111-0014-4014-8014-000000000641',now()+interval '1 day'),
 ('33333333-0014-4014-8014-000000000644',
  '11111111-0014-4014-8014-000000000642',now()+interval '1 day');
insert into public.organizations(id,display_name,organization_type) values
 ('aaaaaaaa-0014-4014-8014-000000000645','Buyer A fake','buyer'),
 ('aaaaaaaa-0014-4014-8014-000000000646','Buyer B fake','buyer');
insert into public.organization_members(organization_id,user_id,membership_role,status)
 values
 ('aaaaaaaa-0014-4014-8014-000000000645',
  '11111111-0014-4014-8014-000000000641','owner','active'),
 ('aaaaaaaa-0014-4014-8014-000000000646',
  '11111111-0014-4014-8014-000000000642','owner','active');
insert into cotironda_private.rounds_v1(id,buyer_org_id,begins_at,ends_at) values
 ('dddddddd-0014-4014-8014-000000000647',
  'aaaaaaaa-0014-4014-8014-000000000645',
  now()+interval '1 hour',now()+interval '1 day'),
 ('dddddddd-0014-4014-8014-000000000648',
  'aaaaaaaa-0014-4014-8014-000000000645',
  now()+interval '2 hours',now()+interval '2 days'),
 ('dddddddd-0014-4014-8014-000000000649',
  'aaaaaaaa-0014-4014-8014-000000000646',
  now()+interval '3 hours',now()+interval '3 days');
insert into cotironda_private.round_items_v1
 (round_id,line_no,product_code,quantity,unit)
 values
 ('dddddddd-0014-4014-8014-000000000647',1,'cemento_001',10,'bag'),
 ('dddddddd-0014-4014-8014-000000000647',2,'pintura_002',5,'l'),
 ('dddddddd-0014-4014-8014-000000000648',1,'arena_001',10,'m3'),
 ('dddddddd-0014-4014-8014-000000000649',1,'cables_001',10,'m');
set local role authenticated;
set local request.jwt.claims =
 '{"role":"authenticated","sub":"11111111-0014-4014-8014-000000000641",
 "session_id":"33333333-0014-4014-8014-000000000643",
 "is_anonymous":false,"cotironda_email_verified":true}';
select ci_helpers.assert_true(
 (select count(*)=2 from public.buyer_round_list_mvp014()),
 'mvp014_own_two_rounds');
select ci_helpers.assert_true(
 (select count(*)=1 from public.buyer_round_list_mvp014()
    where item_count=2 and round_id='dddddddd-0014-4014-8014-000000000647'),
 'mvp014_item_counts_from_real_round');
select ci_helpers.assert_true(
 (select count(*)=0 from public.buyer_round_list_mvp014()
    where round_id='dddddddd-0014-4014-8014-000000000649'),
 'mvp014_cross_tenant_no_listing');
reset role;
update public.organization_members set status='suspended'
 where organization_id='aaaaaaaa-0014-4014-8014-000000000645';
set local role authenticated;
select ci_helpers.assert_true(
 (select count(*)=0 from public.buyer_round_list_mvp014()),
 'mvp014_no_access_after_membership_revoked');
reset role;
update public.organization_members set status='active'
 where organization_id='aaaaaaaa-0014-4014-8014-000000000645';
delete from auth.sessions where id='33333333-0014-4014-8014-000000000643';
set local role authenticated;
do $session$
declare blocked boolean:=false;
begin
 begin
  perform * from public.buyer_round_list_mvp014();
 exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'mvp014_revoked_session_visible';end if;
end;$session$;
reset role;
rollback;
