-- MVP-015 D064. PostgreSQL17 ephemeral CI, fictitious buyer identities;
-- cannot write DEV. Rollback all test data. No real suppliers/Whapi.
begin;
insert into auth.users(id,email_confirmed_at,is_anonymous) values
 ('11111111-0015-4015-8015-000000000651',now(),false),
 ('11111111-0015-4015-8015-000000000652',now(),false);
insert into auth.sessions(id,user_id,not_after) values
 ('33333333-0015-4015-8015-000000000653',
 '11111111-0015-4015-8015-000000000651',now()+interval '1 day'),
 ('33333333-0015-4015-8015-000000000654',
 '11111111-0015-4015-8015-000000000652',now()+interval '1 day');
insert into public.organizations(id,display_name,organization_type) values
 ('aaaaaaaa-0015-4015-8015-000000000655','Buyer D064 fictitious','buyer'),
 ('aaaaaaaa-0015-4015-8015-000000000656','Other D064 fictitious buyer','buyer');
insert into public.organization_members
 (organization_id,user_id,membership_role,status) values
 ('aaaaaaaa-0015-4015-8015-000000000655',
 '11111111-0015-4015-8015-000000000651','owner','active'),
 ('aaaaaaaa-0015-4015-8015-000000000656',
 '11111111-0015-4015-8015-000000000652','owner','active');
do $priv$
begin
 if not exists(select 1 from pg_roles where rolname='cotironda_buyer_writer_d064'
   and not rolcanlogin and not rolinherit and not rolbypassrls)
  or has_function_privilege('anon','public.create_buyer_round_d064(uuid,uuid,text,text,jsonb)','EXECUTE')
  or has_function_privilege('service_role','public.create_buyer_round_d064(uuid,uuid,text,text,jsonb)','EXECUTE')
  or not has_function_privilege('authenticated','public.create_buyer_round_d064(uuid,uuid,text,text,jsonb)','EXECUTE')
  or (select prosecdef from pg_proc where oid='public.create_buyer_round_d064(uuid,uuid,text,text,jsonb)'::regprocedure)
  or has_table_privilege('authenticated','cotironda_private.rounds_v1','INSERT')
  or has_table_privilege('authenticated','cotironda_private.round_requests_d064','SELECT')
  or has_table_privilege('cotironda_buyer_writer_d064','cotironda_private.round_invites_v1','INSERT')
  or has_table_privilege('cotironda_buyer_writer_d064','cotironda_private.whapi_inbox_v1','SELECT')
 then raise exception 'd064_acl_failed';end if;
end;$priv$;
set local role authenticated;
set local request.jwt.claims =
 '{"role":"authenticated","sub":"11111111-0015-4015-8015-000000000651",
 "session_id":"33333333-0015-4015-8015-000000000653",
 "is_anonymous":false,"cotironda_email_verified":true}';
do $case$
declare
 v_input jsonb:='[{"line_no":1,"product_code":"cemento_001","quantity":"10","unit":"bag","source_description":"Cemento CPC 50 kg"},
 {"line_no":2,"product_code":"pintura_002","quantity":"5.5","unit":"l"}]'::jsonb;
 v_result jsonb;v_replay jsonb;v_round uuid;v_bad boolean;
begin
 v_result:=public.create_buyer_round_d064(
 'aaaaaaaa-0015-4015-8015-000000000655'::uuid,
 'cccccccc-0015-4015-8015-000000000657'::uuid,
 'La Plata','con_iva',v_input);
 v_round:=(v_result->>'roundId')::uuid;
 if v_result->>'status'<>'programada' or v_result->>'repeated'<>'false'
 then raise exception 'd064_create_failed';end if;
 v_replay:=public.create_buyer_round_d064(
 'aaaaaaaa-0015-4015-8015-000000000655'::uuid,
 'cccccccc-0015-4015-8015-000000000657'::uuid,
 'La Plata','con_iva',v_input);
 if (v_replay->>'roundId')::uuid<>v_round
   or v_replay->>'repeated'<>'true'
 then raise exception 'd064_replay_created_second_round';end if;
 if (select count(*) from cotironda_private.buyer_round_overview_v1(v_round))<>1
 then raise exception 'd064_not_visible_to_owner';end if;
 -- Body changes under same request key must NOT manufacture another round.
 v_bad:=false;
 begin
  perform public.create_buyer_round_d064(
   'aaaaaaaa-0015-4015-8015-000000000655'::uuid,
   'cccccccc-0015-4015-8015-000000000657'::uuid,
   'Rosario','con_iva',v_input);
 exception when unique_violation then v_bad:=true;end;
 if not v_bad then raise exception 'd064_changed_replay_accepted';end if;
 -- Buyer cannot SELECT the private invitation/outbox tables:
 -- a privileged CI assertion after RESET ROLE proves no invitation exists.
end;$case$;
reset role;
select ci_helpers.assert_true(
 (select count(*)=1 from cotironda_private.round_requests_d064
  where buyer_org_id='aaaaaaaa-0015-4015-8015-000000000655'
    and delivery_zone='La Plata' and buyer_iva_request='con_iva'),
 'd064_preserves_delivery_zone_and_iva');
select ci_helpers.assert_true(
 (select count(*)=2 from cotironda_private.round_items_v1
  where round_id=(select round_id from cotironda_private.round_requests_d064
    where request_key='cccccccc-0015-4015-8015-000000000657')),
 'd064_two_ordered_items');
select ci_helpers.assert_true(
 (select source_description='Cemento CPC 50 kg'
  from cotironda_private.round_items_v1
  where round_id=(select round_id from cotironda_private.round_requests_d064
   where request_key='cccccccc-0015-4015-8015-000000000657')
  and line_no=1),
 'd076_buyer_source_specs_preserved');
select ci_helpers.assert_true(
 (select count(*)=1 from cotironda_private.rounds_v1
  where buyer_org_id='aaaaaaaa-0015-4015-8015-000000000655'),
 'd064_no_duplicate_round');
select ci_helpers.assert_true(
 (select count(*)=0 from cotironda_private.round_invites_v1
  where round_id=(select round_id from cotironda_private.round_requests_d064
    where request_key='cccccccc-0015-4015-8015-000000000657')),
 'd064_no_supplier_invites_sent');
select ci_helpers.assert_true(
 (select count(*)=0 from cotironda_private.whapi_reply_jobs_d047
  where round_id=(select round_id from cotironda_private.round_requests_d064
    where request_key='cccccccc-0015-4015-8015-000000000657')),
 'd064_no_whatsapp_side_effects');
set local role authenticated;
-- invalid and forged values do not create rounds and return SQLSTATEs.
create function pg_temp.fail_d064(cmd text,expected text)
returns void language plpgsql as $fn$
declare err text;failed boolean:=false;
begin
 begin execute cmd;exception when others then
  get stacked diagnostics err=returned_sqlstate;
  if err<>expected then
   raise exception 'd064_wrong_error_expected_%_got_%',expected,err;end if;
  failed:=true;
 end;
 if not failed then raise exception 'd064_rejected_input_accepted';end if;
end;$fn$;
select pg_temp.fail_d064(
 $$select public.create_buyer_round_d064(
 'aaaaaaaa-0015-4015-8015-000000000656',
 'cccccccc-0015-4015-8015-000000000659','La Plata','no_especificado',
 '[{"line_no":1,"product_code":"cemento_001","quantity":"10","unit":"bag"}]')$$,
 '42501');
select pg_temp.fail_d064(
 $$select public.create_buyer_round_d064(
 'aaaaaaaa-0015-4015-8015-000000000655',
 'cccccccc-0015-4015-8015-000000000659','',
 'no_especificado',
 '[{"line_no":1,"product_code":"cemento_001","quantity":"10","unit":"bag"}]')$$,
 '22023');
select pg_temp.fail_d064(
 $$select public.create_buyer_round_d064(
 'aaaaaaaa-0015-4015-8015-000000000655',
 'cccccccc-0015-4015-8015-000000000659','La Plata','no_especificado',
 '[{"line_no":1,"product_code":"cemento_001","quantity":"-10","unit":"bag"}]')$$,
 '22023');
select pg_temp.fail_d064(
 $$select public.create_buyer_round_d064(
 'aaaaaaaa-0015-4015-8015-000000000655',
 'cccccccc-0015-4015-8015-000000000659','La Plata','no_especificado',
 '[{"line_no":1,"product_code":"cemento_001","quantity":"10","unit":"unknown"}]')$$,
 '22023');
select pg_temp.fail_d064(
 $$select public.create_buyer_round_d064(
 'aaaaaaaa-0015-4015-8015-000000000655',
 'cccccccc-0015-4015-8015-000000000659','La Plata','no_especificado',
 '[{"line_no":1,"product_code":"cemento_001","quantity":"10","unit":"bag","supplier_org_id":"forged"}]')$$,
 '22023');
select pg_temp.fail_d064(
 $$select public.create_buyer_round_d064(
 'aaaaaaaa-0015-4015-8015-000000000655',
 'cccccccc-0015-4015-8015-000000000659','La Plata','no_especificado',
 '[{"line_no":1,"product_code":"cemento_001","quantity":"10","unit":"bag"},
 {"line_no":2,"product_code":"cemento_001","quantity":"10","unit":"bag"}]')$$,
 '22023');
reset role;
update public.organization_members set status='suspended'
 where organization_id='aaaaaaaa-0015-4015-8015-000000000655';
set local role authenticated;
select pg_temp.fail_d064(
 $$select public.create_buyer_round_d064(
 'aaaaaaaa-0015-4015-8015-000000000655',
 'cccccccc-0015-4015-8015-000000000659','La Plata','no_especificado',
 '[{"line_no":1,"product_code":"cemento_001","quantity":"10","unit":"bag"}]')$$,
 '42501');
reset role;
update public.organization_members set status='active'
 where organization_id='aaaaaaaa-0015-4015-8015-000000000655';
delete from auth.sessions where id='33333333-0015-4015-8015-000000000653';
set local role authenticated;
select pg_temp.fail_d064(
 $$select public.create_buyer_round_d064(
 'aaaaaaaa-0015-4015-8015-000000000655',
 'cccccccc-0015-4015-8015-000000000659','La Plata','no_especificado',
 '[{"line_no":1,"product_code":"cemento_001","quantity":"10","unit":"bag"}]')$$,
 '42501');
reset role;
select ci_helpers.assert_true(
 (select count(*)=1 from cotironda_private.round_requests_d064
  where buyer_org_id='aaaaaaaa-0015-4015-8015-000000000655'),
 'd064_no_side_effects_after_denied_requests');
rollback;
