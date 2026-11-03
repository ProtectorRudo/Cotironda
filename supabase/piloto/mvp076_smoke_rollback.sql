-- MVP-076: smoke transaccional, solo después de instalar ambas migraciones
-- y SOLO en Cotironda Piloto. No requiere cron ni emite WhatsApp.
begin;
do $audit$
declare
 real_request uuid;real_state text;demo uuid;
 test_created timestamptz:=clock_timestamp()-interval '120 hours';
 customizable timestamptz:=clock_timestamp();
 result jsonb;blocked boolean:=false;
begin
 select id,state into real_request,real_state
 from cotironda_piloto_privado.requests order by created_at desc limit 1;
 if real_request is null then raise exception 'pilot_request_missing';end if;
 if (select extract(epoch from closes_at-created_at)
     from cotironda_piloto_privado.requests where id=real_request)<>345600 then
  raise exception 'not_four_days';end if;
 if (select whatsapp_outbound_enabled from cotironda_piloto_privado.integration_flags where only_row) then
  raise exception 'pilot_outbound_must_be_off';end if;
 -- No adelantar cierre ni manipular plazo de una solicitud ya existente.
 begin
  update cotironda_piloto_privado.requests set state='closed',
    closed_at=clock_timestamp() where id=real_request;
 exception when sqlstate '42501' then blocked:=true;
 end;
 if not blocked then raise exception 'premature_close_was_allowed';end if;
 insert into cotironda_piloto_privado.requests(
  buyer_key,delivery_city,original_request,source_hmac,state,
  created_at,closes_at,round_days)
 values('arquitecto','La Plata','Ronda de ensayo 076, pasada',
  encode(sha256(convert_to('mvp076-smoke-close','UTF8')),'hex'),
  'prepared',test_created,test_created+interval '96 hours',4)
 returning id into demo;
 result:=public.cotironda_piloto_close_due_v1();
 if result->>'closed'<>'1' or result->>'reveal_performed'<>'false'
    or result->>'winners_chosen'<>'false'
    or result->>'outbound_messages'<>'0' then
  raise exception 'unsafe_close: %',result;end if;
 result:=public.cotironda_piloto_close_due_v1();
 if result->>'closed'<>'0' then raise exception 'non_idempotent';end if;
 if (select state from cotironda_piloto_privado.requests where id=demo)<>'closed'
 then raise exception 'still_open';end if;
 if (select state from cotironda_piloto_privado.requests where id=real_request)<>real_state
 then raise exception 'real_request_modified';end if;
 insert into cotironda_piloto_privado.requests(
  buyer_key,delivery_city,original_request,source_hmac,state,
  created_at,closes_at,round_days)
 values('arquitecto','La Plata','Plazo explícito de tres días',
  encode(sha256(convert_to('mvp076-smoke-custom','UTF8')),'hex'),
  'prepared',customizable,customizable+interval '72 hours',3);
 if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in (
    'cotironda_piloto_receive_whapi_v1',
    'cotironda_piloto_claim_whapi_v1',
    'cotironda_piloto_authorize_whapi_v1')
    and pg_get_functiondef(p.oid) like '%closes_at>clock_timestamp()%')<>3 then
  raise exception 'missing_deadline_guards';end if;
 if has_function_privilege('anon','public.cotironda_piloto_close_due_v1(integer)','execute')
 or has_function_privilege('authenticated','public.cotironda_piloto_close_due_v1(integer)','execute') then
  raise exception 'public_can_close';end if;
end;
$audit$;
select 'PASS: 96h, plazo configurable, early-block, replay, privacidad y 0 envios' as result;
rollback;
