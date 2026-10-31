-- D056 Postgres17 real (BEGIN/ROLLBACK). All fake orgs, no Whapi/IA.
begin;
create function pg_temp.d056_reject(p_sql text,p_expected text)
returns void language plpgsql as $fn$
declare got text;failed boolean:=false;
begin
 begin execute p_sql;
 exception when others then
   get stacked diagnostics got=message_text;
   if pg_catalog.strpos(got,p_expected)=0
   then raise exception 'd056_unexpected_failure expected=% actual=%',p_expected,got;end if;
   failed:=true;
 end;
 if not failed then raise exception 'd056_unexpected_success expected=%',p_expected;end if;
end;$fn$;
do $audit$
begin
 if not exists(select 1 from pg_roles
   where rolname='cotironda_limits_writer_d056'
   and not rolcanlogin and not rolinherit and not rolbypassrls)
 or not has_function_privilege('cotironda_reply_sender_d054',
   'cotironda_private.whapi_check_send_authorized_d056(uuid,text,text)','EXECUTE')
 or has_function_privilege('anon',
   'cotironda_private.whapi_check_send_authorized_d056(uuid,text,text)','EXECUTE')
 or has_function_privilege('service_role',
   'cotironda_private.whapi_check_send_authorized_d056(uuid,text,text)','EXECUTE')
 or has_function_privilege('cotironda_reply_sender_d054',
   'cotironda_private.whapi_guard_begin_send_d056()','EXECUTE')
 or has_table_privilege('cotironda_reply_sender_d054',
   'cotironda_private.whapi_send_reservations_d056','SELECT')
 or has_table_privilege('authenticated',
   'cotironda_private.whapi_buyer_send_policies_d056','SELECT')
 or (select count(*) from pg_class
   where oid in ('cotironda_private.whapi_buyer_send_policies_d056'::regclass,
     'cotironda_private.whapi_send_reservations_d056'::regclass)
   and relrowsecurity)<>2
 or (select pg_get_userbyid(proowner) from pg_proc where oid=
    'cotironda_private.whapi_guard_begin_send_d056()'::regprocedure)
    <>'cotironda_limits_writer_d056'
 then raise exception 'd056_security_role_or_rls_fail';end if;
end;$audit$;

insert into public.organizations(id,display_name,organization_type) values
 ('aaaaaaaa-0000-4000-8000-000000000561','Buyer 1 synthetic','buyer'),
 ('aaaaaaaa-0000-4000-8000-000000000566','Buyer 2 synthetic','buyer'),
 ('bbbbbbbb-0000-4000-8000-000000000562','Supplier synthetic','supplier');
insert into public.supplier_profiles(organization_id,trade_name,accepting_quotes)
 values('bbbbbbbb-0000-4000-8000-000000000562','Corralon mock',true);
insert into cotironda_private.whapi_contacts_v1
 (channel_id,chat_key,supplier_org_id,verified_at,consented_at)
 values('d056_ci',repeat('a',64),'bbbbbbbb-0000-4000-8000-000000000562',
 now()-interval '1 day',now()-interval '1 day');
insert into cotironda_private.rounds_v1(id,buyer_org_id,begins_at,ends_at)
select ('dddddddd-0000-4000-8000-00000000056'||n)::uuid,
 case when n='4' then 'aaaaaaaa-0000-4000-8000-000000000566'::uuid
      else 'aaaaaaaa-0000-4000-8000-000000000561'::uuid end,
 now()-interval '2 minutes',now()+interval '3 hours'
 from (values('1'),('2'),('3'),('4')) as t(n);
insert into cotironda_private.round_items_v1(round_id,line_no,product_code,quantity,unit)
select ('dddddddd-0000-4000-8000-00000000056'||n)::uuid,1,'cemento_001',10,'bag'
 from (values('1'),('2'),('3'),('4')) as t(n);
insert into cotironda_private.round_invites_v1
 (round_id,supplier_org_id,anon_id,invite_position)
select ('dddddddd-0000-4000-8000-00000000056'||n)::uuid,
 'bbbbbbbb-0000-4000-8000-000000000562'::uuid,'anon_d056_'||n,1
 from (values('1'),('2'),('3'),('4')) as t(n);
update cotironda_private.rounds_v1 set status='abierta'
 where id::text like 'dddddddd-0000-4000-8000-00000000056%';
insert into cotironda_private.whapi_inbox_v1(
 channel_id,message_key,chat_key,supplier_org_id,round_id,
 payload_fingerprint,kind,payload_ciphertext,payload_nonce,payload_tag,
 source_unix,crypto_key_id)
select 'd056_ci',repeat(n,64),repeat('a',64),
 'bbbbbbbb-0000-4000-8000-000000000562'::uuid,
 ('dddddddd-0000-4000-8000-00000000056'||n)::uuid,
 repeat(n,64),'text',decode(repeat('44',32),'hex'),
 decode(repeat('55',12),'hex'),decode(repeat('66',16),'hex'),1800000000,'aes_d056_ci'
 from (values('1'),('2'),('3'),('4')) as t(n);

do $cases$
declare
 offer jsonb:='{"currency":"ARS","payment_method":"transferencia",
 "lead_days":3,"freight_gross":"100.00","min_goods_gross":"0.00",
 "lines_snapshot":[{"line_no":1,"unit":"bag","available_qty":"10",
 "net_unit_price":"2500.00","vat_rate":"21"}]}'::jsonb;
 n integer; j jsonb;l jsonb; v jsonb;
 ids uuid[]:=array[]::uuid[];
 tokens uuid[]:=array[]::uuid[];
 buyer1 constant uuid:='aaaaaaaa-0000-4000-8000-000000000561';
 buyer2 constant uuid:='aaaaaaaa-0000-4000-8000-000000000566';
begin
 -- Keep the prior D054 queued retry out of this isolated scenario.
 update cotironda_private.whapi_reply_jobs_d047
  set due_at=clock_timestamp()+interval '1 day'
  where channel_id='whapi_d054_ci' and status='queued';

 for n in 1..4 loop
   perform cotironda_private.whapi_save_draft_from_inbox_d048(
    'd056_ci',repeat(n::text,64),
    ('eeeeeeee-0000-4000-8000-00000000056'||n)::uuid,0,offer);
   j:=cotironda_private.whapi_enqueue_reply_d047(
    'd056_ci',repeat(n::text,64),1);
   ids:=array_append(ids,(j->>'jobId')::uuid);
 end loop;

 l:=cotironda_private.whapi_lease_reply_d047();
 if (l->>'jobId')::uuid<>ids[1] then raise exception 'd056_first_lease_wrong';end if;
 tokens:=array_append(tokens,(l->>'leaseToken')::uuid);

 -- No company policy = fully DENIED, not silently unlimited.
 perform pg_temp.d056_reject(format(
   'select cotironda_private.whapi_begin_send_d053(%L,%L)',
   ids[1],tokens[1]),'d056_policy_disabled_or_missing');
 if (select count(*) from cotironda_private.whapi_send_reservations_d056)<>0
 then raise exception 'd056_no_policy_reserved';end if;

 insert into cotironda_private.whapi_buyer_send_policies_d056
  (buyer_org_id,channel_id,enabled,daily_message_limit,
    monthly_message_limit,monthly_budget_units,estimated_units_per_message)
 values(buyer1,'d056_ci',false,2,3,200,100),
       (buyer2,'d056_ci',true,1,1,100,100);

 perform pg_temp.d056_reject(format(
   'select cotironda_private.whapi_begin_send_d053(%L,%L)',
   ids[1],tokens[1]),'d056_policy_disabled_or_missing');
 update cotironda_private.whapi_buyer_send_policies_d056
 set enabled=true where buyer_org_id=buyer1 and channel_id='d056_ci';

 v:=cotironda_private.whapi_begin_send_d053(ids[1],tokens[1]);
 if v->>'state'<>'in_flight' then raise exception 'd056_first_begin_failed';end if;
 if not cotironda_private.whapi_check_send_authorized_d056(
   ids[1],'d056_ci',repeat('a',64))
 or cotironda_private.whapi_check_send_authorized_d056(
   ids[1],'d056_ci',repeat('b',64))
 or cotironda_private.whapi_check_send_authorized_d056(
   ids[1],'other_channel',repeat('a',64))
 then raise exception 'd056_sender_eligibility_wrong';end if;
 perform pg_temp.d056_reject(format(
   'select cotironda_private.whapi_begin_send_d053(%L,%L)',
   ids[1],tokens[1]),'d053_begin_lease_invalid');
 -- Timeout/uncertain still counts toward conservative quota.
 perform cotironda_private.whapi_record_send_outcome_d053(
   ids[1],tokens[1],'uncertain',null);
 if cotironda_private.whapi_check_send_authorized_d056(
   ids[1],'d056_ci',repeat('a',64))
 then raise exception 'd056_uncertain_could_send_again';end if;

 l:=cotironda_private.whapi_lease_reply_d047();
 if (l->>'jobId')::uuid<>ids[2] then raise exception 'd056_second_lease_wrong';end if;
 tokens:=array_append(tokens,(l->>'leaseToken')::uuid);
 perform cotironda_private.whapi_begin_send_d053(ids[2],tokens[2]);
 if not cotironda_private.whapi_check_send_authorized_d056(
   ids[2],'d056_ci',repeat('a',64))
 then raise exception 'd056_second_send_not_authorized';end if;
 perform cotironda_private.whapi_record_send_outcome_d053(
  ids[2],tokens[2],'accepted_by_transport',repeat('f',64));

 l:=cotironda_private.whapi_lease_reply_d047();
 if (l->>'jobId')::uuid<>ids[3] then raise exception 'd056_third_lease_wrong';end if;
 tokens:=array_append(tokens,(l->>'leaseToken')::uuid);

 -- Three independent caps. Each must block even with other caps expanded.
 update cotironda_private.whapi_buyer_send_policies_d056
 set daily_message_limit=2,monthly_message_limit=10,monthly_budget_units=1000
 where buyer_org_id=buyer1;
 perform pg_temp.d056_reject(format(
  'select cotironda_private.whapi_begin_send_d053(%L,%L)',
    ids[3],tokens[3]),'d056_send_quota_exhausted');
 update cotironda_private.whapi_buyer_send_policies_d056
 set daily_message_limit=2,monthly_message_limit=2,monthly_budget_units=1000
 where buyer_org_id=buyer1;
 perform pg_temp.d056_reject(format(
  'select cotironda_private.whapi_begin_send_d053(%L,%L)',
    ids[3],tokens[3]),'d056_send_quota_exhausted');
 update cotironda_private.whapi_buyer_send_policies_d056
 set daily_message_limit=10,monthly_message_limit=10,monthly_budget_units=200
 where buyer_org_id=buyer1;
 perform pg_temp.d056_reject(format(
  'select cotironda_private.whapi_begin_send_d053(%L,%L)',
    ids[3],tokens[3]),'d056_send_quota_exhausted');

 if (select count(*) from cotironda_private.whapi_send_reservations_d056
     where buyer_org_id=buyer1)<>2
 or (select sum(reserved_units) from cotironda_private.whapi_send_reservations_d056
     where buyer_org_id=buyer1)<>200
 or (select count(*) from cotironda_private.whapi_send_reservations_d056
     where buyer_org_id=buyer1 and local_month=
       date_trunc('month',(clock_timestamp() at time zone 'America/Argentina/Buenos_Aires'))::date)<>2
 then raise exception 'd056_quota_math_incorrect';end if;

 -- Other buyer, SAME channel/supplier, is isolated by buyer_org_id.
 l:=cotironda_private.whapi_lease_reply_d047();
 if (l->>'jobId')::uuid<>ids[4] then raise exception 'd056_other_buyer_lease_wrong';end if;
 v:=cotironda_private.whapi_begin_send_d053(
  ids[4],(l->>'leaseToken')::uuid);
 if v->>'state'<>'in_flight' or not
  cotironda_private.whapi_check_send_authorized_d056(
   ids[4],'d056_ci',repeat('a',64))
 then raise exception 'd056_other_buyer_blocked_cross_tenant';end if;

 -- BAJA after begin immediately blocks new HTTP even if already reserved.
 update cotironda_private.whapi_contacts_v1
  set opted_out_at=clock_timestamp()
  where channel_id='d056_ci' and chat_key=repeat('a',64);
 if cotironda_private.whapi_check_send_authorized_d056(
   ids[4],'d056_ci',repeat('a',64))
 then raise exception 'd056_optout_after_begin_not_enforced';end if;

 if (select count(*) from cotironda_private.whapi_send_reservations_d056)<>3
 or (select count(distinct job_id) from
   cotironda_private.whapi_send_reservations_d056)<>3
 then raise exception 'd056_ledger_not_exactly_once';end if;
end;$cases$;
rollback;
