-- Etapa 01: alta vinculada al usuario del JWT validado por PostgREST.
-- La única función accesible desde authenticated NO recibe user_id.
-- auth.uid()/auth.jwt() se obtienen del contexto PostgreSQL del JWT de Supabase.
grant usage on schema auth to cotironda_registrar;
grant execute on function auth.uid() to cotironda_registrar;
grant execute on function auth.jwt() to cotironda_registrar;

create function public.register_company_for_current_user(
 p_request_id uuid, p_name text, p_type text, p_trade_name text default null
) returns table(organization_id uuid, replay boolean)
language plpgsql security definer
set search_path = ''
as $$
declare
 v_user_id uuid;
begin
 -- PostgREST verifica la firma y fija el rol y los claims del JWT.
 -- La API de Cotironda invoca esta función con su sesión autenticada.
 if (auth.jwt()->>'role') is distinct from 'authenticated' then
   raise exception 'usuario_no_autorizado' using errcode='42501';
 end if;
 v_user_id := auth.uid();
 if v_user_id is null then
   raise exception 'usuario_no_autorizado' using errcode='42501';
 end if;
 -- Los usuarios anónimos de Supabase también tienen rol authenticated.
 if (auth.jwt()->>'is_anonymous') is distinct from 'false' then
   raise exception 'usuario_no_autorizado' using errcode='42501';
 end if;
 return query
   select result.organization_id, result.replay
   from cotironda_private.register_company(
      v_user_id,p_request_id,p_name,p_type,p_trade_name
   ) as result;
end;
$$;

-- Una SECURITY DEFINER es peligrosa si el propietario bypass RLS:
-- transferir a cotironda_registrar (NOLOGIN, NOBYPASSRLS) al finalizar.
revoke all on function public.register_company_for_current_user(uuid,text,text,text)
 from public, anon, authenticated, service_role, cotironda_app;
grant execute on function public.register_company_for_current_user(uuid,text,text,text)
 to authenticated;
grant create on schema public to cotironda_registrar;
grant cotironda_registrar to postgres with set true, inherit false;
alter function public.register_company_for_current_user(uuid,text,text,text)
 owner to cotironda_registrar;
revoke cotironda_registrar from postgres;
revoke create on schema public from cotironda_registrar;

-- El camino SQL con p_user_id queda inaccesible para cuentas de la API.
revoke execute on function cotironda_private.register_company(uuid,uuid,text,text,text)
 from cotironda_app;
revoke usage on schema cotironda_private from cotironda_app;
