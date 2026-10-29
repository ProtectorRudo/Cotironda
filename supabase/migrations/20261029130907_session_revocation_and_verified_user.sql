-- Etapa 01: sesión activa obligatoria al registrar empresas.
-- PostgreSQL de Auth es privado. Sólo esta función booleana lee Auth,
-- creada con owner postgres; NO puede invocarse por roles de usuario.
create function cotironda_private.is_session_verified(p_user uuid,p_session uuid)
returns boolean language sql stable security definer set search_path=''
as $$
 select exists(
   select 1
   from auth.sessions s
   join auth.users u on u.id=s.user_id
   where s.id=p_session and s.user_id=p_user
     and (s.not_after is null or s.not_after>now())
     and u.email_confirmed_at is not null
     and not u.is_anonymous
     and u.deleted_at is null
     and (u.banned_until is null or u.banned_until<=now())
 );
$$;
revoke all on function cotironda_private.is_session_verified(uuid,uuid)
 from public,anon,authenticated,service_role,cotironda_app;
grant execute on function cotironda_private.is_session_verified(uuid,uuid)
 to cotironda_registrar;

-- Unicamente el propietario restringido puede redefinir la función privada.
-- El privilegio CREATE y el SET ROLE son transitorios dentro de esta migración.
grant create on schema cotironda_private to cotironda_registrar;
grant cotironda_registrar to postgres with set true,inherit false;
set role cotironda_registrar;
create or replace function cotironda_private.register_company_with_verified_claim(
 p_request_id uuid,p_name text,p_type text,p_trade_name text default null
) returns table(organization_id uuid,replay boolean)
language plpgsql security definer set search_path = ''
as $private$
declare
 v_claims jsonb;
 v_user_id uuid;
 v_session_id uuid;
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
 -- Revalidación inmediata: aunque el JWT no haya expirado, la sesión debe
 -- existir en auth.sessions y pertenecer al mismo usuario autenticado.
 v_session_id := nullif(v_claims->>'session_id','')::uuid;
 if v_session_id is null or not coalesce(
   cotironda_private.is_session_verified(v_user_id,v_session_id),false
 ) then
   raise exception 'sesion_no_vigente' using errcode='42501';
 end if;
 return query
  select result.organization_id,result.replay
  from cotironda_private.register_company(
   v_user_id,p_request_id,p_name,p_type,p_trade_name
  ) as result;
end;
$private$;
reset role;
revoke cotironda_registrar from postgres;
revoke create on schema cotironda_private from cotironda_registrar;
