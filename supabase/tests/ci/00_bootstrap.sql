-- Emulación controlada mínima de roles Supabase dentro de un PostgreSQL efímero.
-- SOLO CI. NUNCA ejecutar en un proyecto Supabase real.
create role anon nologin;
create role authenticated nologin;
create role supabase_auth_admin nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key,
 email_confirmed_at timestamptz, is_anonymous boolean not null default false,
 banned_until timestamptz, deleted_at timestamptz);
grant usage on schema auth to supabase_auth_admin;
grant select on auth.users to supabase_auth_admin;
create function auth.uid() returns uuid
language sql stable
as $
  -- Igual que el helper oficial: PostgREST moderno usa request.jwt.claims.
  -- Los tests SQL históricos también admiten request.jwt.claim.sub por compatibilidad.
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$;
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

-- Tabla mínima para probar revocación de sesiones en PostgreSQL efímero.
-- Solo CI: el proyecto Supabase gestiona su propia tabla auth.sessions.
create table auth.sessions (id uuid primary key,user_id uuid not null references auth.users(id),not_after timestamptz);

-- Emulación MÍNIMA de la API Supabase Storage, exclusivamente PostgreSQL de CI.
-- No copiar a la base remota; allí storage.* ya pertenece al servicio gestionado.
create schema storage;
create table storage.buckets (
 id text primary key, name text not null, public boolean not null default false,
 file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
 id uuid primary key default gen_random_uuid(),
 bucket_id text references storage.buckets(id), name text not null
);
alter table storage.objects enable row level security;
grant usage on schema storage to anon,authenticated;
grant select on storage.buckets to anon,authenticated;
-- Emular permisos amplios del servicio para probar que RLS restringe la acción.
grant select,insert,update,delete on storage.objects to anon,authenticated;
