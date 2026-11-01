-- MVP-054 / D086 — private round clock transition, PostgreSQL 17 CI ONLY.
-- No scheduler, no contact data, no WhatsApp and no commercial ranking in SQL.
-- This code is not installed in Supabase DEV or production.
--
-- A programada round which misses its scheduled opening may still be
-- atomically closed AFTER ends_at. In that case opened_at records the
-- scheduled effective opening (begins_at), not a fictional worker run.
create or replace function cotironda_private.guard_round_transition_v1()
returns trigger language plpgsql security invoker set search_path='' as $fn$
declare v_now timestamptz:=pg_catalog.clock_timestamp();
begin
 if tg_op='INSERT' then
   if new.status<>'programada' or new.opened_at is not null
      or new.closed_at is not null then
     raise exception 'round_must_begin_programmed'; end if;
   return new;
 end if;
 if new.id<>old.id or new.buyer_org_id<>old.buyer_org_id
    or new.begins_at<>old.begins_at or new.ends_at<>old.ends_at
    or new.created_at<>old.created_at then
   raise exception 'round_identity_immutable'; end if;
 if old.status='programada' and new.status='abierta'
    and v_now>=old.begins_at and v_now<old.ends_at then
    new.opened_at:=v_now;new.closed_at:=null;
 elsif old.status='programada' and new.status='cerrada'
    and v_now>=old.ends_at then
    new.opened_at:=old.begins_at;new.closed_at:=v_now;
 elsif old.status='abierta' and new.status='cerrada'
    and v_now>=old.ends_at then
    new.opened_at:=old.opened_at;new.closed_at:=v_now;
 elsif old.status in ('programada','abierta') and new.status='cancelada'
    and v_now<old.ends_at then
    new.opened_at:=old.opened_at;new.closed_at:=v_now;
 else
    raise exception 'round_transition_not_allowed';
 end if;
 return new;
end;$fn$;
-- Existing D024 trigger remains; all other transitions keep their guards.

create role cotironda_round_close_writer_d086 nologin noinherit nobypassrls;
create role cotironda_round_close_gateway_d086 nologin noinherit nobypassrls;
grant usage on schema cotironda_private to
 cotironda_round_close_writer_d086,cotironda_round_close_gateway_d086;
grant select,update(status) on cotironda_private.rounds_v1
 to cotironda_round_close_writer_d086;
create policy d086_closer_read on cotironda_private.rounds_v1
 for select to cotironda_round_close_writer_d086 using (true);
create policy d086_closer_update on cotironda_private.rounds_v1
 for update to cotironda_round_close_writer_d086 using (true) with check (true);

create function cotironda_private.advance_round_clock_d086(p_round uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $fn$
declare
 v_round cotironda_private.rounds_v1%rowtype;
 v_now timestamptz:=pg_catalog.clock_timestamp();
 v_state text;
begin
 if p_round is null then
  raise exception 'd086_invalid_round' using errcode='22023';
 end if;
 select * into v_round from cotironda_private.rounds_v1
 where id=p_round for update;
 if not found then return null;end if;
 if v_round.status='cancelada' then
  return pg_catalog.jsonb_build_object('state','cancelada','changed',false);
 end if;
 if v_round.status='cerrada' then
  return pg_catalog.jsonb_build_object('state','cerrada','changed',false);
 end if;
 if v_round.ends_at<=v_now then
  update cotironda_private.rounds_v1 set status='cerrada'
   where id=p_round;
  v_state:='cerrada';
 elsif v_round.status='programada' and v_round.begins_at<=v_now then
  update cotironda_private.rounds_v1 set status='abierta'
   where id=p_round;
  v_state:='abierta';
 else
  return pg_catalog.jsonb_build_object('state',v_round.status,'changed',false);
 end if;
 return pg_catalog.jsonb_build_object('state',v_state,'changed',true);
end;$fn$;

-- Owner has only the round ledger privileges above, not contact or supplier
-- tables. The gateway can EXECUTE only and does not inherit writer access.
grant create on schema cotironda_private to cotironda_round_close_writer_d086;
grant cotironda_round_close_writer_d086 to postgres with set true,inherit false;
alter function cotironda_private.advance_round_clock_d086(uuid)
 owner to cotironda_round_close_writer_d086;
revoke cotironda_round_close_writer_d086 from postgres;
revoke create on schema cotironda_private from cotironda_round_close_writer_d086;
revoke all on function cotironda_private.advance_round_clock_d086(uuid)
 from public,anon,authenticated,service_role,cotironda_app;
grant execute on function cotironda_private.advance_round_clock_d086(uuid)
 to cotironda_round_close_gateway_d086;
comment on function cotironda_private.advance_round_clock_d086(uuid) is
 'MVP054 private clock transition. No ranking, WhatsApp, contact disclosure or scheduler.';
