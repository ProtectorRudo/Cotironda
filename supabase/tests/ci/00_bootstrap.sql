-- Emulación controlada mínima de roles Supabase dentro de un PostgreSQL efímero.
-- SOLO CI. NUNCA ejecutar en un proyecto Supabase real.
create role anon nologin;
create role authenticated nologin;
create role supabase_auth_admin nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key,
 email_confirmed_at timestamptz, is_anonymous boolean not null default false);
grant usage on schema auth to supabase_auth_admin;
grant select on auth.users to supabase_auth_admin;
create function auth.uid() returns uuid
language sql stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
grant usage on schema public to anon, authenticated, service_role;
create schema ci_helpers;
create function ci_helpers.assert_true(value boolean, message text) returns void
language plpgsql security invoker as $$
begin
  if value is distinct from true then
    raise exception 'TEST FAILED: %', message;
  end if;
end
$$;
grant usage on schema ci_helpers to authenticated, anon, service_role;
grant execute on function ci_helpers.assert_true(boolean,text) to authenticated, anon, service_role;

-- El JWT se emula sólo en CI; Supabase/PostgREST validará firma en producción.
create function auth.jwt() returns jsonb
language sql stable
as $$ select nullif(current_setting('request.jwt.claims',true),'')::jsonb $$;
grant execute on function auth.jwt() to authenticated;
