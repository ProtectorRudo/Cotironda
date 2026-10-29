-- Emulación controlada mínima de roles Supabase dentro de un PostgreSQL efímero.
-- SOLO CI. NUNCA ejecutar en un proyecto Supabase real.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key);
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
grant usage on schema ci_helpers to authenticated, anon;
grant execute on function ci_helpers.assert_true(boolean,text) to authenticated, anon;
