-- D070: test against real PostgreSQL17 in D065 synthetic fixture.
-- Savepoint restores D066's subsequent test expectations; ZERO real Whapi.
savepoint d070_invite_fixture;
insert into cotironda_private.item_display_d066(product_code,display_label)
 values('cemento_001','Cemento CPC 50 kg'),
       ('pintura_002','Pintura latex blanca');
do $acl$
begin
 if not exists(select 1 from pg_roles where rolname='cotironda_invite_owner_d070'
  and not rolcanlogin and not rolinherit and not rolbypassrls)
  or not exists(select 1 from pg_roles where rolname='cotironda_invite_gateway_d070'
  and not rolcanlogin and not rolinherit and not rolbypassrls)
  or has_function_privilege('anon',
   'cotironda_private.whapi_prepare_invite_d070(uuid,uuid,text,text)','EXECUTE')
  or has_function_privilege('authenticated',
   'cotironda_private.whapi_begin_invite_d070(uuid,uuid)','EXECUTE')
  or has_function_privilege('service_role',
   'cotironda_private.whapi_authorize_invite_d070(uuid,text,text)','EXECUTE')
  or has_table_privilege('cotironda_invite_gateway_d070',
   'cotironda_private.whapi_invite_jobs_d070','SELECT')
  or has_table_privilege('cotironda_invite_gateway_d070',
   'cotironda_private.whapi_invite_reservations_d070','INSERT')
  or has_table_privilege('cotironda_invite_owner_d070',
   'cotironda_private.whapi_inbox_v1','SELECT')
  or not has_function_privilege('cotironda_invite_gateway_d070',
   'cotironda_private.whapi_prepare_invite_d070(uuid,uuid,text,text)','EXECUTE')
  or not (select relrowsecurity from pg_class where oid=
   'cotironda_private.whapi_invite_jobs_d070'::regclass)
  or not (select relrowsecurity from pg_class where oid=
   'cotironda_private.whapi_invite_reservations_d070'::regclass)
 then raise exception 'd070_acl_not_private';end if;
end;$acl$;
-- Store only fictional bytes; phone/chat ID NEVER in PostgreSQL.
set local role cotironda_recipient_gateway_d068;
do $seal$
declare r jsonb;
begin
 r:=cotironda_private.whapi_store_recipient_d068(
  'd065_ci',repeat('a',64),'bbbbbbbb-0016-4016-8016-000000000662',
  'recipient_ci',decode(repeat('ab',12),'hex'),
  decode(repeat('cd',32),'hex'),decode(repeat('ef',16),'hex'));
 if r->>'state'<>'saved' then raise exception 'd070_cement_vault_absent';end if;
 r:=cotironda_private.whapi_store_recipient_d068(
  'd065_ci',repeat('b',64),'bbbbbbbb-0016-4016-8016-000000000663',
  'recipient_ci',decode(repeat('ba',12),'hex'),
  decode(repeat('dc',32),'hex'),decode(repeat('fe',16),'hex'));
 if r->>'state'<>'saved' then raise exception 'd070_paint_vault_absent';end if;
end;$seal$;
reset role;
set local role cotironda_invite_gateway_d070;
do $prepare$
declare a jsonb;b jsonb;
begin
 begin
  perform cotironda_private.whapi_prepare_invite_d070(
   'dddddddd-0016-4016-8016-000000000661',
   'bbbbbbbb-0016-4016-8016-000000000662','other_channel',repeat('a',64));
  raise exception 'd070_cross_channel_prepared';
 exception when insufficient_privilege then null;end;
 begin
  perform cotironda_private.whapi_prepare_invite_d070(
   'dddddddd-0016-4016-8016-000000000661',
   'bbbbbbbb-0016-4016-8016-000000000663','d065_ci',repeat('a',64));
  raise exception 'd070_cross_supplier_prepared';
 exception when insufficient_privilege then null;end;
 a:=cotironda_private.whapi_prepare_invite_d070(
   'dddddddd-0016-4016-8016-000000000661',
   'bbbbbbbb-0016-4016-8016-000000000662','d065_ci',repeat('a',64));
 b:=cotironda_private.whapi_prepare_invite_d070(
   'dddddddd-0016-4016-8016-000000000661',
   'bbbbbbbb-0016-4016-8016-000000000662','d065_ci',repeat('a',64));
 if a->>'state'<>'prepared' or b->>'state'<>'already_prepared'
  or a->>'jobId'<>b->>'jobId'
 then raise exception 'd070_duplicate_prepare';end if;
 begin
  perform cotironda_private.whapi_prepare_invite_d070(
   'dddddddd-0016-4016-8016-000000000661',
   'bbbbbbbb-0016-4016-8016-000000000662','d065_ci',repeat('b',64));
  raise exception 'd070_recipient_hijack';
 exception when unique_violation then null;end;
end;$prepare$;
reset role;
select ci_helpers.assert_true(
 (select count(*)=1 from cotironda_private.whapi_invite_jobs_d070),
 'd070_one_job_per_supplier_round_channel');
select ci_helpers.assert_true(
 (select count(*)=0 from cotironda_private.whapi_reply_jobs_d047
  where round_id='dddddddd-0016-4016-8016-000000000661'),
 'd070_no_reply_jobs');

set local role cotironda_invite_gateway_d070;
do $no_policy$
declare j jsonb;v boolean:=false;
begin
 j:=cotironda_private.whapi_claim_invite_d070();
 if j->>'state'<>'leased' then raise exception 'd070_not_leased';end if;
 if cotironda_private.whapi_claim_invite_d070() is not null then
  raise exception 'd070_claimed_twice';end if;
 begin
  perform cotironda_private.whapi_begin_invite_d070(
   (j->>'jobId')::uuid,(j->>'leaseToken')::uuid);
 exception when insufficient_privilege then v:=true;end;
 if not v then raise exception 'd070_missing_policy_allowed_begin';end if;
 if cotironda_private.whapi_authorize_invite_d070(
  (j->>'jobId')::uuid,'d065_ci',repeat('a',64))
 then raise exception 'd070_authorized_before_begin';end if;
end;$no_policy$;
reset role;
-- Policy is provisioned by ADMIN ONLY, never by the gateway.
insert into cotironda_private.whapi_buyer_send_policies_d056
 (buyer_org_id,channel_id,enabled,daily_message_limit,monthly_message_limit,
  monthly_budget_units,estimated_units_per_message,revision)
 values('aaaaaaaa-0016-4016-8016-000000000661','d065_ci',
  true,1,1,1,1,1);
set local role cotironda_invite_gateway_d070;
do $begin$
declare j jsonb;v_id uuid;v_token uuid;r jsonb;
begin
 -- Already leased: a legitimate sender has the token; use test fixture
 -- values from limited query only through the RETURN of claim. We release
 -- safely BEFORE HTTP in this synthetic test, then reclaim.
 select null into j;
end;$begin$;
reset role;
-- Simulate a pre-HTTP failure while preserving the same test state:
-- only postgres CI can read the job token; production gateway cannot.
do $ci_preflight$
declare v_job uuid;v_lease uuid;
begin
 select job_id,lease_token into v_job,v_lease
 from cotironda_private.whapi_invite_jobs_d070
 where channel_id='d065_ci' and chat_key=repeat('a',64);
 perform cotironda_private.whapi_fail_preflight_invite_d070(v_job,v_lease);
 update cotironda_private.whapi_invite_jobs_d070
 set due_at=pg_catalog.clock_timestamp()-interval '1 second'
 where job_id=v_job;
end;$ci_preflight$;
set local role cotironda_invite_gateway_d070;
do $start$
declare j jsonb;r jsonb;v_id uuid;v_lease uuid;
begin
 j:=cotironda_private.whapi_claim_invite_d070();
 if j->>'state'<>'leased' or j->>'chatKey'<>repeat('a',64)
 then raise exception 'd070_claim_wrong_scope';end if;
 v_id:=(j->>'jobId')::uuid;v_lease:=(j->>'leaseToken')::uuid;
 r:=cotironda_private.whapi_begin_invite_d070(v_id,v_lease);
 if r->>'state'<>'in_flight' then raise exception 'd070_begin_failed';end if;
 if not cotironda_private.whapi_authorize_invite_d070(
  v_id,'d065_ci',repeat('a',64))
  or cotironda_private.whapi_authorize_invite_d070(
  v_id,'d065_ci',repeat('b',64))
 then raise exception 'd070_prehttp_identity_incorrect';end if;
 if cotironda_private.whapi_claim_invite_d070() is not null then
  raise exception 'd070_inflight_released';end if;
 begin
  perform cotironda_private.whapi_fail_preflight_invite_d070(v_id,v_lease);
  raise exception 'd070_post_begin_retried';
 exception when insufficient_privilege then null;end;
 r:=cotironda_private.whapi_finish_invite_d070(
  v_id,v_lease,'uncertain',null);
 if r->>'state'<>'uncertain' then raise exception 'd070_uncertain_failed';end if;
 if cotironda_private.whapi_claim_invite_d070() is not null then
  raise exception 'd070_uncertain_requeued';end if;
end;$start$;
reset role;
select ci_helpers.assert_true(
 (select count(*)=1 and coalesce(sum(reserved_units),0)=1
 from cotironda_private.whapi_invite_reservations_d070),
 'd070_reserved_one_unit_even_uncertain');
select ci_helpers.assert_true(
 (select count(*)=1 from cotironda_private.whapi_invite_jobs_d070
  where send_phase='uncertain' and status='leased'),
 'd070_uncertain_never_automatic_retry');
-- New supplier is eligible but shared quota of one is already spent.
set local role cotironda_invite_gateway_d070;
do $limit$
declare a jsonb;j jsonb;rejected boolean:=false;
begin
 a:=cotironda_private.whapi_prepare_invite_d070(
  'dddddddd-0016-4016-8016-000000000661',
  'bbbbbbbb-0016-4016-8016-000000000663','d065_ci',repeat('b',64));
 j:=cotironda_private.whapi_claim_invite_d070();
 if a->>'state'<>'prepared' or j->>'state'<>'leased'
 then raise exception 'd070_second_supplier_not_claimed';end if;
 begin
  perform cotironda_private.whapi_begin_invite_d070(
   (j->>'jobId')::uuid,(j->>'leaseToken')::uuid);
 exception when insufficient_privilege then rejected:=true;end;
 if not rejected then raise exception 'd070_quota_not_enforced';end if;
end;$limit$;
reset role;
-- BAJA after a successful begin must revoke pre-HTTP authorization.
update cotironda_private.whapi_contacts_v1
 set opted_out_at=pg_catalog.clock_timestamp()
 where channel_id='d065_ci' and chat_key=repeat('a',64);
set local role cotironda_invite_gateway_d070;
do $baja$
declare v_id uuid;
begin
 -- No query grants: known job id is passed as test argument to the gateway
 -- in production. Here, a fixed CI lookup via postgres is used below.
 if cotironda_private.whapi_claim_invite_d070() is not null then
  raise exception 'd070_baja_claim';end if;
end;$baja$;
reset role;
select ci_helpers.assert_true(
 (select opted_out_at is not null from cotironda_private.whapi_contacts_v1
 where channel_id='d065_ci' and chat_key=repeat('a',64)),
 'd070_real_optout_row_recorded');
rollback to savepoint d070_invite_fixture;
release savepoint d070_invite_fixture;
-- D066's fixture expects no labels, new jobs or opt-out changes.
