-- MVP-077 — SQL de ensayo en Cotironda PILOTO después de aplicar migración.
-- TODA la simulación en tablas comerciales se revierte.
begin;
do $verify$
declare existing uuid;st text;oneid uuid;early timestamptz:=clock_timestamp()-interval '120 hours'; r jsonb;first_state text;counter integer; 
begin
 if (select count(*) from cron.job where jobname='cotironda_piloto_close_due_5min')<>1
 then raise exception 'mvp077_cron_missing_or_duplicate';end if;
 if not exists(select 1 from cron.job where jobname='cotironda_piloto_close_due_5min'
  and active and schedule='*/5 * * * *'
  and command='select public.cotironda_piloto_close_due_v1(25);')
 then raise exception 'mvp077_cron_unsafe';end if;
 if (select whatsapp_outbound_enabled from cotironda_piloto_privado.integration_flags where only_row) then
 raise exception 'mvp077_outbound_on';end if;
 if (select count(*) from cotironda_piloto_privado.requests where state='prepared' and closes_at>clock_timestamp())<>1
 then raise exception 'mvp077_expected_single_pilot_round';end if;
 select id,state into existing,st from cotironda_piloto_privado.requests order by created_at desc limit 1;
 -- Create a synthetic old round, close once and make sure original stays as it was.
 insert into cotironda_piloto_privado.requests(buyer_key,delivery_city,original_request,
 source_hmac,state,created_at,closes_at,round_days)
 values('arquitecto','La Plata','Caso sintético vencido para scheduler',
 encode(sha256(convert_to('mvp077_smoke_expired','UTF8')),'hex'),'prepared',
 early,early+interval '96 hours',4) returning id into oneid;
 r:=public.cotironda_piloto_close_due_v1(25);
 if r->>'closed'<>'1' or r->>'outbound_messages'<>'0'
 or r->>'reveal_performed'<>'false' or r->>'winners_chosen'<>'false' then
 raise exception 'mvp077_closed_wrong: %',r;end if;
 r:=public.cotironda_piloto_close_due_v1(25);
 if r->>'closed'<>'0' then raise exception 'mvp077_double_close';end if;
 if (select state from cotironda_piloto_privado.requests where id=existing)<>st
 then raise exception 'mvp077_original_changed';end if;
 if (select count(*) from cotironda_piloto_privado.offer_versions)<>1
 then raise exception 'mvp077_quotes_changed';end if;
 if has_function_privilege('anon','public.cotironda_piloto_close_due_v1(integer)','EXECUTE')
 or has_function_privilege('authenticated','public.cotironda_piloto_close_due_v1(integer)','EXECUTE') then
 raise exception 'mvp077_insecure_rpc_privilege';end if;
end;$verify$;
select 'PASS: pg_cron unique, schedule, close once, original unchanged, no disclosure' as result;
rollback;
