-- PROPUESTA PARA CI: no aplicar a producción. SQL de la séptima migración.
-- El corte comercial registration_settings.enabled=false permanece inalterado.
-- Cuota fija de 20 peticiones firmadas por usuario cada 60 minutos,
-- incluido rechazo de negocio: la función NO arroja tras consumir.
create table cotironda_private.registration_attempt_quotas (
 user_id uuid primary key references auth.users(id) on delete cascade,
 window_started_at timestamptz not null default now(),
 request_count integer not null check (request_count between 1 and 21)
);
alter table cotironda_private.registration_attempt_quotas enable row level security;
revoke all on cotironda_private.registration_attempt_quotas
 from public, anon, authenticated, service_role, cotironda_app;
grant select, insert, update on cotironda_private.registration_attempt_quotas
 to cotironda_registrar;
create policy registrar_attempts_select
 on cotironda_private.registration_attempt_quotas
 for select to cotironda_registrar using (true);
create policy registrar_attempts_insert
 on cotironda_private.registration_attempt_quotas
 for insert to cotironda_registrar with check (true);
create policy registrar_attempts_update
 on cotironda_private.registration_attempt_quotas
 for update to cotironda_registrar
 using (true) with check (true);

-- La recreación de las funciones conserva los propietarios y los permisos.
-- No hace falta servicio privilegiado accesible desde navegador.
grant create on schema cotironda_private to cotironda_registrar;
grant create on schema public to cotironda_registrar;
grant cotironda_registrar to postgres with set true, inherit false;
set role cotironda_registrar;

create function cotironda_private.consume_registration_attempt(p_user uuid)
returns boolean language plpgsql volatile security invoker set search_path=''
as $consume$
declare
 v_allowed boolean := false;
begin
 if p_user is null then
  return false;
 end if;
 -- UPSERT toma el lock por PK; no puede sobrepasar el límite con concurrencia.
 -- Satura en 21 para que llamadas ilimitadas no creen filas ni enteros enormes.
 insert into cotironda_private.registration_attempt_quotas
  (user_id,window_started_at,request_count)
 values (p_user,now(),1)
 on conflict (user_id) do update set
  window_started_at=case when
    cotironda_private.registration_attempt_quotas.window_started_at <= now()-interval '60 minutes'
    then now() else cotironda_private.registration_attempt_quotas.window_started_at end,
  request_count=case when
    cotironda_private.registration_attempt_quotas.window_started_at <= now()-interval '60 minutes'
    then 1 else least(cotironda_private.registration_attempt_quotas.request_count+1,21) end
 returning request_count <= 20 into v_allowed;
 return coalesce(v_allowed,false);
end;
$consume$;
revoke all on function cotironda_private.consume_registration_attempt(uuid)
 from public,anon,authenticated,service_role,cotironda_app;
grant execute on function cotironda_private.consume_registration_attempt(uuid)
 to cotironda_registrar;

-- La firma SQL original cambia a un estado estructurado. Primero se elimina
-- la envoltura dependiente para recrear ambas en la misma transacción.
drop function public.register_company_for_current_user(uuid,text,text,text);
drop function cotironda_private.register_company_with_verified_claim(uuid,text,text,text);

create function cotironda_private.register_company_with_verified_claim(
 p_request_id uuid,p_name text,p_type text,p_trade_name text default null
) returns table(organization_id uuid,replay boolean,registration_status text)
language plpgsql volatile security definer set search_path=''
as $private$
declare
 v_claims jsonb;
 v_user_id uuid;
 v_session_id uuid;
begin
 -- El interruptor SQL conserva precedencia: cerrado no consume cuotas.
 if not coalesce((select enabled from cotironda_private.registration_settings
    where singleton=true),false) then
  raise exception 'registro_no_habilitado' using errcode='42501';
 end if;
 v_claims := coalesce(
   nullif(current_setting('request.jwt.claim',true),''),
   nullif(current_setting('request.jwt.claims',true),'')
 )::jsonb;
 if (v_claims->>'role') is distinct from 'authenticated' then
  raise exception 'usuario_no_autorizado' using errcode='42501';
 end if;
 v_user_id := coalesce(
   nullif(current_setting('request.jwt.claim.sub',true),''),
   v_claims->>'sub'
 )::uuid;
 if v_user_id is null or (v_claims->>'sub')::uuid is distinct from v_user_id then
  raise exception 'usuario_no_autorizado' using errcode='42501';
 end if;
 -- Desde aquí ninguna denegación debe escapar con RAISE: cancelaría el contador.
 if not cotironda_private.consume_registration_attempt(v_user_id) then
  perform set_config('response.status','429',true);
  return query select null::uuid,null::boolean,'rate_limited'::text;
  return;
 end if;

 -- Subtransacción: cualquier fallo del alta revierte datos comerciales,
 -- pero conserva la cuota incrementada ANTES de entrar a este bloque.
 begin
  if (v_claims->>'is_anonymous') is distinct from 'false'
     or (v_claims->>'cotironda_email_verified') is distinct from 'true' then
   perform set_config('response.status','403',true);
   return query select null::uuid,null::boolean,'identity_invalid'::text;
   return;
  end if;
  v_session_id := nullif(v_claims->>'session_id','')::uuid;
  if v_session_id is null or not coalesce(
    cotironda_private.is_session_verified(v_user_id,v_session_id),false
  ) then
   perform set_config('response.status','403',true);
   return query select null::uuid,null::boolean,'session_invalid'::text;
   return;
  end if;
  return query
   select result.organization_id,result.replay,'ok'::text
   from cotironda_private.register_company(
    v_user_id,p_request_id,p_name,p_type,p_trade_name
   ) as result;
 exception
  when unique_violation then
   perform set_config('response.status','400',true);
   return query select null::uuid,null::boolean,'idempotency_conflict'::text;
  when invalid_parameter_value or check_violation or invalid_text_representation then
   perform set_config('response.status','400',true);
   return query select null::uuid,null::boolean,'invalid_request'::text;
  when sqlstate 'P0001' then
   perform set_config('response.status','429',true);
   return query select null::uuid,null::boolean,'organization_quota'::text;
  when others then
   perform set_config('response.status','500',true);
   return query select null::uuid,null::boolean,'internal_error'::text;
 end;
end;
$private$;
revoke all on function cotironda_private.register_company_with_verified_claim(uuid,text,text,text)
 from public,anon,authenticated,service_role,cotironda_app;
grant execute on function cotironda_private.register_company_with_verified_claim(uuid,text,text,text)
 to authenticated;

create function public.register_company_for_current_user(
 p_request_id uuid,p_name text,p_type text,p_trade_name text default null
) returns table(organization_id uuid,replay boolean,registration_status text)
language sql volatile security invoker set search_path=''
as $public$
 select result.organization_id,result.replay,result.registration_status
 from cotironda_private.register_company_with_verified_claim(
  p_request_id,p_name,p_type,p_trade_name
 ) as result;
$public$;
revoke all on function public.register_company_for_current_user(uuid,text,text,text)
 from public,anon,service_role,cotironda_app;
grant execute on function public.register_company_for_current_user(uuid,text,text,text)
 to authenticated;
reset role;
revoke cotironda_registrar from postgres;
revoke create on schema public from cotironda_registrar;
revoke create on schema cotironda_private from cotironda_registrar;
