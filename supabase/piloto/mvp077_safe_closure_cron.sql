-- MVP-077 — cron SQL seguro SOLO para Supabase proyecto cotironda-piloto.
-- NUNCA aplicar a DEV historico ni produccion. No usa pg_net.
-- El job SOLO ejecuta el cierre autorizado MVP-076, sin ranking ni WhatsApp.
do $guard$
begin
 if to_regclass('cotironda_piloto_privado.requests') is null
  or to_regclass('cotironda_piloto_privado.integration_flags') is null
  or to_regprocedure('public.cotironda_piloto_close_due_v1(integer)') is null then
   raise exception 'mvp077_wrong_database' using errcode='42501';
 end if;
 if not exists (
  select 1 from cotironda_piloto_privado.integration_flags
  where only_row=true and whatsapp_inbound_enabled=true
    and whatsapp_outbound_enabled=false
 ) then raise exception 'mvp077_pilot_must_keep_outbound_off' using errcode='42501';
 end if;
end;$guard$;

-- Supabase Cron extension, no external HTTP and no keys.
create extension if not exists pg_cron with schema pg_catalog;

-- Name is stable: reapplying never creates a second scheduled job.
select cron.schedule(
 'cotironda_piloto_close_due_5min',
 '*/5 * * * *',
 $$select public.cotironda_piloto_close_due_v1(25);$$
) as job_id;

comment on function public.cotironda_piloto_close_due_v1(integer) is
 'MVP077: safe SQL-only pilot cron calls this every 5 min. No ranking, contact release or Whapi.';

-- Operational check (read-only):
-- select jobid,jobname,schedule,active,command from cron.job
-- where jobname='cotironda_piloto_close_due_5min';
-- select runid,status,start_time,end_time from cron.job_run_details
-- where jobid=(select jobid from cron.job where jobname='cotironda_piloto_close_due_5min')
-- order by start_time desc limit 5;
-- Disable immediately if needed: select cron.unschedule('cotironda_piloto_close_due_5min');
