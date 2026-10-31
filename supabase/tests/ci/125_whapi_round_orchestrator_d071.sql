-- D071 PostgreSQL17 synthetic fixture: round D064 + matching D065
-- + encrypted contact D068 + commercial outbox D070, NO HTTP.
savepoint d071_orchestrator_ci;
insert into cotironda_private.item_display_d066(product_code,display_label)
 values('cemento_001','Cemento CPC 50 kg'),
       ('pintura_002','Pintura latex blanca');

do $permissions$
begin
 if has_function_privilege('anon',
   'cotironda_private.whapi_prepare_commercial_round_d071(uuid,text)','EXECUTE')
 or has_function_privilege('authenticated',
   'cotironda_private.whapi_prepare_commercial_round_d071(uuid,text)','EXECUTE')
 or has_function_privilege('service_role',
   'cotironda_private.whapi_prepare_commercial_round_d071(uuid,text)','EXECUTE')
 or has_function_privilege('cotironda_app',
   'cotironda_private.whapi_prepare_commercial_round_d071(uuid,text)','EXECUTE')
 or not has_function_privilege('cotironda_invite_gateway_d070',
   'cotironda_private.whapi_prepare_commercial_round_d071(uuid,text)','EXECUTE')
 or has_table_privilege('cotironda_invite_gateway_d070',
   'cotironda_private.whapi_invite_jobs_d070','SELECT')
 or has_column_privilege('cotironda_invite_owner_d070',
   'cotironda_private.whapi_recipient_vault_d068','cipher','SELECT')
 or not has_column_privilege('cotironda_invite_owner_d070',
   'cotironda_private.whapi_recipient_vault_d068','chat_key','SELECT')
 or not (select relrowsecurity from pg_class where oid=
   'cotironda_private.whapi_recipient_vault_d068'::regclass)
 then raise exception 'd071_leak_or_public_permission';end if;
end;$permissions$;

set local role cotironda_invite_gateway_d070;
do $without_enrolled_phones$
declare r jsonb;
begin
 r:=cotironda_private.whapi_prepare_commercial_round_d071(
 'dddddddd-0016-4016-8016-000000000661','d065_ci');
 if r->>'state'<>'queued_without_sending' or r->>'matchedSuppliers'<>'2'
  or r->>'pendingContact'<>'2' or r->>'prepared'<>'0'
  or r->>'messagesSent'<>'0' or r ? 'chatKey' or r ? 'phone'
 then raise exception 'd071_wrong_initial_pending_state: %',r;end if;
 r:=cotironda_private.whapi_prepare_commercial_round_d071(
 'dddddddd-0016-4016-8016-000000000662','d065_ci');
 if r->>'state'<>'needs_verified_location' or r->>'matchedSuppliers'<>'0'
 then raise exception 'd071_unverified_location_routed: %',r;end if;
 begin
  perform cotironda_private.whapi_prepare_commercial_round_d071(
   'dddddddd-0016-4016-8016-000000000661','another_chan');
  raise exception 'd071_channel_hijack';
 exception when insufficient_privilege then null;end;
 begin
  perform cotironda_private.whapi_prepare_commercial_round_d071(
   '11111111-4016-4016-8016-000000000999','d065_ci');
  raise exception 'd071_unowned_round_accepted';
 exception when insufficient_privilege then null;end;
end;$without_enrolled_phones$;
reset role;
select ci_helpers.assert_true(
 (select count(*)=0 from cotironda_private.whapi_invite_jobs_d070),
 'd071_missing_vault_no_queue');

set local role cotironda_recipient_gateway_d068;
do $one_enrolment$
begin
 if cotironda_private.whapi_store_recipient_d068(
  'd065_ci',repeat('a',64),'bbbbbbbb-0016-4016-8016-000000000662',
  'recipient_ci',decode(repeat('ab',12),'hex'),
  decode(repeat('cd',32),'hex'),decode(repeat('ef',16),'hex'))->>'state'<>'saved'
 then raise exception 'd071_fixture_enrolment_failed';end if;
end;$one_enrolment$;
reset role;

set local role cotironda_invite_gateway_d070;
do $first_queue_and_replay$
declare a jsonb;b jsonb;
begin
 a:=cotironda_private.whapi_prepare_commercial_round_d071(
  'dddddddd-0016-4016-8016-000000000661','d065_ci');
 b:=cotironda_private.whapi_prepare_commercial_round_d071(
  'dddddddd-0016-4016-8016-000000000661','d065_ci');
 if a->>'matchedSuppliers'<>'2' or a->>'prepared'<>'1'
  or a->>'alreadyPrepared'<>'0' or a->>'pendingContact'<>'1'
  or b->>'prepared'<>'0' or b->>'alreadyPrepared'<>'1'
  or b->>'pendingContact'<>'1'
 then raise exception 'd071_replay_did_not_preserve_job: % %',a,b;end if;
end;$first_queue_and_replay$;
reset role;
select ci_helpers.assert_true(
 (select count(*)=1 from cotironda_private.whapi_invite_jobs_d070
  where supplier_org_id='bbbbbbbb-0016-4016-8016-000000000662'
  and chat_key=repeat('a',64) and send_phase='not_started'),
 'd071_only_cement_provider_prepared');

set local role cotironda_recipient_gateway_d068;
do $second_enrolment$
begin
 if cotironda_private.whapi_store_recipient_d068(
  'd065_ci',repeat('b',64),'bbbbbbbb-0016-4016-8016-000000000663',
  'recipient_ci',decode(repeat('ba',12),'hex'),
  decode(repeat('dc',32),'hex'),decode(repeat('fe',16),'hex'))->>'state'<>'saved'
 then raise exception 'd071_second_enrolment_failed';end if;
end;$second_enrolment$;
reset role;

set local role cotironda_invite_gateway_d070;
do $second_supplier$
declare r jsonb;
begin
 r:=cotironda_private.whapi_prepare_commercial_round_d071(
  'dddddddd-0016-4016-8016-000000000661','d065_ci');
 if r->>'matchedSuppliers'<>'2' or r->>'prepared'<>'1'
 or r->>'alreadyPrepared'<>'1' or r->>'pendingContact'<>'0'
 or r->>'messagesSent'<>'0'
 then raise exception 'd071_two_rubros_not_prepared: %',r;end if;
end;$second_supplier$;
reset role;
select ci_helpers.assert_true(
 (select count(*)=2 from cotironda_private.whapi_invite_jobs_d070
  where round_id='dddddddd-0016-4016-8016-000000000661'),
 'd071_two_supplier_jobs_once_only');
select ci_helpers.assert_true(
 (select count(*)=0 from cotironda_private.whapi_reply_jobs_d047
  where round_id='dddddddd-0016-4016-8016-000000000661'),
 'd071_does_not_send_reply');
select ci_helpers.assert_true(
 (select count(*)=0 from cotironda_private.whapi_invite_reservations_d070),
 'd071_does_not_reserve_quota_or_start_http');

-- A vendor can revoke consent after it was prepared; don't count it as
-- ready again. D070 claim independently cancels any queued invite on BAJA.
update cotironda_private.whapi_contacts_v1
 set opted_out_at=pg_catalog.clock_timestamp()
 where channel_id='d065_ci' and chat_key=repeat('b',64);
set local role cotironda_invite_gateway_d070;
do $late_baja$
declare r jsonb;
begin
 r:=cotironda_private.whapi_prepare_commercial_round_d071(
  'dddddddd-0016-4016-8016-000000000661','d065_ci');
 if r->>'matchedSuppliers'<>'2' or r->>'alreadyPrepared'<>'1'
 or r->>'pendingContact'<>'1' or r->>'prepared'<>'0'
 then raise exception 'd071_late_baja_ignored: %',r;end if;
end;$late_baja$;
reset role;
rollback to savepoint d071_orchestrator_ci;
release savepoint d071_orchestrator_ci;
-- D066 tests re-use original fixture with no additional labels or jobs.
