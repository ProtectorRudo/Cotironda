-- MVP-076: SOLO Supabase cotironda-piloto, nunca DEV historica ni produccion.
-- 4 dias corridos (96 horas UTC) por defecto, plazo configurable 3..7 al crear.
-- Cierre idempotente SIN ranking, sin informacion personal y SIN envios.
alter table cotironda_piloto_privado.requests
 add column round_days smallint not null default 4
 constraint requests_round_days_check check(round_days between 3 and 7);

alter table cotironda_piloto_privado.requests
 add column closes_at timestamptz;
-- La ronda real previa conserva su instante de creación: no reiniciar reloj.
update cotironda_piloto_privado.requests
 set closes_at=created_at + interval '96 hours';
alter table cotironda_piloto_privado.requests
 alter column closes_at set default (now() + interval '96 hours'),
 alter column closes_at set not null;
alter table cotironda_piloto_privado.requests
 add constraint requests_exact_duration_check
 check (extract(epoch from (closes_at-created_at))=round_days*86400);
alter table cotironda_piloto_privado.requests
 add column closed_at timestamptz;
alter table cotironda_piloto_privado.requests
 drop constraint requests_state_check;
alter table cotironda_piloto_privado.requests
 add constraint requests_state_check
 check (state in ('draft','prepared','closed','cancelled'));
alter table cotironda_piloto_privado.requests
 add constraint requests_closed_at_check
 check((state='closed' and closed_at is not null and closed_at>=closes_at)
   or (state<>'closed' and closed_at is null));

create function cotironda_piloto_privado.guard_round_deadline_mvp076()
returns trigger language plpgsql security invoker set search_path='' as $fn$
begin
 if new.round_days is distinct from old.round_days
  or new.closes_at is distinct from old.closes_at
  or new.created_at is distinct from old.created_at
  or new.id is distinct from old.id
  or new.buyer_key is distinct from old.buyer_key then
  raise exception 'pilot_round_deadline_immutable' using errcode='42501';
 end if;
 if old.state='closed' and (new.state<>'closed' or new.closed_at is distinct from old.closed_at) then
  raise exception 'pilot_round_closed_immutable' using errcode='42501';
 end if;
 if new.state='closed' and old.state<>'closed' then
  if old.state<>'prepared' or pg_catalog.clock_timestamp()<old.closes_at
     or new.closed_at is null
     or new.closed_at<old.closes_at
     or new.closed_at>pg_catalog.clock_timestamp() then
   raise exception 'pilot_round_not_due' using errcode='42501';
  end if;
 elsif new.closed_at is distinct from old.closed_at then
  raise exception 'pilot_closed_at_immutable' using errcode='42501';
 end if;
 return new;
end;
$fn$;
revoke all on function cotironda_piloto_privado.guard_round_deadline_mvp076()
 from public,anon,authenticated,service_role;
create trigger guard_round_deadline_mvp076
 before update on cotironda_piloto_privado.requests
 for each row execute function cotironda_piloto_privado.guard_round_deadline_mvp076();

-- Se ejecuta solo desde el backend autorizado / servicio, nunca desde el cliente.
-- NO ejecuta WhatsApp, NO elige finalistas, NO descubre datos privados.
create function public.cotironda_piloto_close_due_v1(p_limit integer default 25)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare v_count integer;
begin
 if p_limit is null or p_limit<1 or p_limit>25 then
  raise exception 'pilot_close_limit_invalid' using errcode='22023';
 end if;
 with due as (
  select r.id from cotironda_piloto_privado.requests r
   where r.state='prepared' and r.closes_at<=pg_catalog.clock_timestamp()
   order by r.closes_at,r.id
   for update skip locked limit p_limit
 ),
 closed as (
  update cotironda_piloto_privado.requests r
     set state='closed',closed_at=pg_catalog.clock_timestamp()
    from due where r.id=due.id
   returning r.id
 ), cancelled as (
  update cotironda_piloto_privado.whapi_outbox o set state='cancelled'
   where o.state='pending' and exists(select 1 from closed c where c.id=o.request_id)
   returning o.request_id
 )
 select count(*) into v_count from closed;
 return pg_catalog.jsonb_build_object('closed',v_count,'reveal_performed',false,
  'outbound_messages',0,'winners_chosen',false);
end;
$fn$;
revoke all on function public.cotironda_piloto_close_due_v1(integer)
 from public,anon,authenticated,service_role;
grant execute on function public.cotironda_piloto_close_due_v1(integer) to service_role;
comment on function public.cotironda_piloto_close_due_v1(integer) is
 'Pilot safe 4-day deadline closer. No scheduler, rankings, contacts or WhatsApp.';
