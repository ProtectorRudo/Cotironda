-- Etapa 01: quitar definer de RPC pública y exigir correo verificado por Auth Hook.
-- La cerradura cotironda_private.registration_settings.enabled permanece FALSE.
--
-- Hook custom access token: Supabase Auth (supabase_auth_admin) ejecutará
-- esta función SECURITY INVOKER antes de firmar el JWT. Se debe activar
-- explícitamente en Auth > Hooks; NO se activa por esta migración.
create function cotironda_private.email_verified_access_token(event jsonb)
returns jsonb language plpgsql stable security invoker set search_path = ''
as $hook$
declare
 v_verified boolean := false;
begin
 select (u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false))
  into v_verified
 from auth.users as u
 where u.id=(event->>'user_id')::uuid;
 return jsonb_set(event,'{claims,cotironda_email_verified}',
   to_jsonb(coalesce(v_verified,false)),true);
end;
$hook$;
revoke all on function cotironda_private.email_verified_access_token(jsonb)
 from public,anon,authenticated,service_role,cotironda_app;
grant usage on schema cotironda_private to supabase_auth_admin;
grant execute on function cotironda_private.email_verified_access_token(jsonb)
 to supabase_auth_admin;

-- La ejecución privilegiada sigue encerrada en un schema NO expuesto por PostgREST.
-- No acepta un parámetro user_id, sólo el sub del JWT firmado/verificado.
create function cotironda_private.register_company_with_verified_claim(
 p_request_id uuid,p_name text,p_type text,p_trade_name text default null
) returns table(organization_id uuid,replay boolean)
language plpgsql security definer set search_path = ''
as $private$
declare
 v_claims jsonb;
 v_user_id uuid;
begin
 if not coalesce((select enabled from cotironda_private.registration_settings
    where singleton=true),false) then
  raise exception 'registro_no_habilitado' using errcode='42501';
 end if;
 v_claims := coalesce(
   nullif(current_setting('request.jwt.claim',true),''),
   nullif(current_setting('request.jwt.claims',true),'')
 )::jsonb;
 if (v_claims->>'role') is distinct from 'authenticated'
    or (v_claims->>'is_anonymous') is distinct from 'false'
    or (v_claims->>'cotironda_email_verified') is distinct from 'true' then
  raise exception 'identidad_no_verificada' using errcode='42501';
 end if;
 v_user_id := coalesce(
   nullif(current_setting('request.jwt.claim.sub',true),''),
   v_claims->>'sub'
 )::uuid;
 if v_user_id is null or (v_claims->>'sub')::uuid is distinct from v_user_id then
  raise exception 'usuario_no_autorizado' using errcode='42501';
 end if;
 return query
  select result.organization_id,result.replay
  from cotironda_private.register_company(
   v_user_id,p_request_id,p_name,p_type,p_trade_name
  ) as result;
end;
$private$;
revoke all on function cotironda_private.register_company_with_verified_claim(uuid,text,text,text)
 from public,anon,authenticated,service_role,cotironda_app;
grant execute on function cotironda_private.register_company_with_verified_claim(uuid,text,text,text)
 to authenticated;
grant usage on schema cotironda_private to authenticated;

-- Propietario de función PRIVADA: NOLOGIN/NOBYPASSRLS/no dueño de tablas.
grant create on schema cotironda_private to cotironda_registrar;
grant cotironda_registrar to postgres with set true,inherit false;
alter function cotironda_private.register_company_with_verified_claim(uuid,text,text,text)
 owner to cotironda_registrar;

-- La envoltura pública pasa a SECURITY INVOKER: no eleva privilegios.
grant create on schema public to cotironda_registrar;
set role cotironda_registrar;
create or replace function public.register_company_for_current_user(
 p_request_id uuid,p_name text,p_type text,p_trade_name text default null
) returns table(organization_id uuid,replay boolean)
language sql security invoker set search_path = ''
as $public$
 select result.organization_id,result.replay
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
