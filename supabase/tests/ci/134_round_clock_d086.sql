-- MVP-054 / D086. Runs in PostgreSQL 17 CI with synthetic IDs, ROLLBACK.
begin;
create function pg_temp.expect_denied_d086(sql_stmt text, token text) returns void
 language plpgsql as $fn$
declare error_text text; did_fail boolean:=false;
begin
 begin execute sql_stmt;
 exception when others then
  get stacked diagnostics error_text=message_text;
  if pg_catalog.strpos(error_text,token)=0
   then raise exception 'd086_wrong_error_%',error_text;end if;
  did_fail:=true;
 end;
 if not did_fail then raise exception 'd086_expected_failure';end if;
end;$fn$;
do $acl$begin
 if has_function_privilege('anon','cotironda_private.advance_round_clock_d086(uuid)','EXECUTE')
 or has_function_privilege('authenticated','cotironda_private.advance_round_clock_d086(uuid)','EXECUTE')
 or has_function_privilege('service_role','cotironda_private.advance_round_clock_d086(uuid)','EXECUTE')
 or not has_function_privilege('cotironda_round_close_gateway_d086',
  'cotironda_private.advance_round_clock_d086(uuid)','EXECUTE')
 or has_table_privilege('cotironda_round_close_gateway_d086',
  'cotironda_private.rounds_v1','SELECT')
 or has_table_privilege('cotironda_round_close_gateway_d086',
  'cotironda_private.rounds_v1','UPDATE')
 or has_table_privilege('cotironda_round_close_writer_d086',
  'cotironda_private.offer_versions_v1','SELECT')
 or not has_column_privilege('cotironda_round_close_writer_d086',
  'cotironda_private.rounds_v1','status','UPDATE')
 or (select pg_catalog.pg_get_userbyid(proowner)
     from pg_catalog.pg_proc
     where oid='cotironda_private.advance_round_clock_d086(uuid)'::regprocedure)
   <>'cotironda_round_close_writer_d086'
 then raise exception 'd086_least_privilege_violation';end if;
end;$acl$;
insert into public.organizations(id,display_name,organization_type) values
 ('aaaaaaaa-0086-4086-8086-000000000861','Comprador synthetic 086','buyer');
insert into cotironda_private.rounds_v1(id,buyer_org_id,begins_at,ends_at) values
 ('bbbbbbbb-0086-4086-8086-000000000861','aaaaaaaa-0086-4086-8086-000000000861',
  now()+interval '1 hour',now()+interval '5 days'),
 ('bbbbbbbb-0086-4086-8086-000000000862','aaaaaaaa-0086-4086-8086-000000000861',
  now()-interval '1 hour',now()+interval '5 days'),
 ('bbbbbbbb-0086-4086-8086-000000000863','aaaaaaaa-0086-4086-8086-000000000861',
  now()-interval '8 days',now()-interval '1 day'),
 ('bbbbbbbb-0086-4086-8086-000000000864','aaaaaaaa-0086-4086-8086-000000000861',
  now()-interval '1 hour',now()+interval '5 days');
update cotironda_private.rounds_v1 set status='cancelada'
where id='bbbbbbbb-0086-4086-8086-000000000864';
-- The gateway may execute a single RPC, but has no SELECT on the table.
set local role cotironda_round_close_gateway_d086;
do $check$declare r jsonb;begin
 r:=cotironda_private.advance_round_clock_d086('bbbbbbbb-0086-4086-8086-000000000861');
 if r<> '{"state":"programada","changed":false}'::jsonb
  then raise exception 'd086_future_round_opened';end if;
 r:=cotironda_private.advance_round_clock_d086('bbbbbbbb-0086-4086-8086-000000000862');
 if r<> '{"state":"abierta","changed":true}'::jsonb
  then raise exception 'd086_current_round_not_opened';end if;
 r:=cotironda_private.advance_round_clock_d086('bbbbbbbb-0086-4086-8086-000000000862');
 if r<> '{"state":"abierta","changed":false}'::jsonb
  then raise exception 'd086_open_replay_not_idempotent';end if;
 r:=cotironda_private.advance_round_clock_d086('bbbbbbbb-0086-4086-8086-000000000863');
 if r<> '{"state":"cerrada","changed":true}'::jsonb
  then raise exception 'd086_expired_programmed_not_closed';end if;
 r:=cotironda_private.advance_round_clock_d086('bbbbbbbb-0086-4086-8086-000000000863');
 if r<> '{"state":"cerrada","changed":false}'::jsonb
  then raise exception 'd086_close_replay_not_idempotent';end if;
 r:=cotironda_private.advance_round_clock_d086('bbbbbbbb-0086-4086-8086-000000000864');
 if r<> '{"state":"cancelada","changed":false}'::jsonb
  then raise exception 'd086_cancelled_round_not_preserved';end if;
 r:=cotironda_private.advance_round_clock_d086('bbbbbbbb-0086-4086-8086-000000000865');
 if r is not null then raise exception 'd086_missing_round_leaked';end if;
end;$check$;
reset role;
select pg_temp.expect_denied_d086(
 $cmd$select cotironda_private.advance_round_clock_d086(null)$cmd$,
 'd086_invalid_round');
select pg_temp.expect_denied_d086(
 $cmd$update cotironda_private.rounds_v1 set status='cerrada'
 where id='bbbbbbbb-0086-4086-8086-000000000862'$cmd$,
 'round_transition_not_allowed');
do $audit$declare count_ok integer;begin
 select count(*) into count_ok from cotironda_private.rounds_v1
 where buyer_org_id='aaaaaaaa-0086-4086-8086-000000000861'
 and ((id='bbbbbbbb-0086-4086-8086-000000000861' and
    status='programada' and opened_at is null and closed_at is null)
  or (id='bbbbbbbb-0086-4086-8086-000000000862' and
    status='abierta' and opened_at is not null and closed_at is null)
  or (id='bbbbbbbb-0086-4086-8086-000000000863' and
    status='cerrada' and opened_at=begins_at and closed_at>=ends_at)
  or (id='bbbbbbbb-0086-4086-8086-000000000864' and
    status='cancelada' and closed_at<ends_at));
 if count_ok<>4 then raise exception 'd086_round_audit_invalid_%',count_ok;end if;
end;$audit$;
rollback;
