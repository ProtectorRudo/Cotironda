-- Cotironda Etapa 01: separar invocación y escritura.
-- SECURITY DEFINER solo en esquema privado, con propietario dedicado SIN BYPASSRLS.
-- El rol que usará la API no puede INSERT/UPDATE/DELETE ni leer tablas de negocio.
create role cotironda_registrar nologin noinherit nobypassrls;
grant usage on schema public, cotironda_private to cotironda_registrar;
grant select, insert on public.organizations, public.organization_members,
 public.supplier_profiles, cotironda_private.organization_registration_requests
 to cotironda_registrar;

-- Políticas exclusivas para ejecutar el proceso de alta dentro de la función.
create policy registrar_organizations_read on public.organizations
 for select to cotironda_registrar using (true);
create policy registrar_organizations_insert on public.organizations
 for insert to cotironda_registrar with check (true);
create policy registrar_members_read on public.organization_members
 for select to cotironda_registrar using (true);
create policy registrar_members_insert on public.organization_members
 for insert to cotironda_registrar with check (true);
create policy registrar_profiles_read on public.supplier_profiles
 for select to cotironda_registrar using (true);
create policy registrar_profiles_insert on public.supplier_profiles
 for insert to cotironda_registrar with check (true);
create policy registrar_requests_read
 on cotironda_private.organization_registration_requests
 for select to cotironda_registrar using (true);
create policy registrar_requests_insert
 on cotironda_private.organization_registration_requests
 for insert to cotironda_registrar with check (true);

-- Configurar y cerrar ACL mientras postgres todavía es propietario.
-- Todas estas operaciones y la cesión ocurren en UNA migración transaccional.
alter function cotironda_private.register_company(uuid,uuid,text,text,text)
 security definer;
alter function cotironda_private.register_company(uuid,uuid,text,text,text)
 set search_path = '';
revoke all on function cotironda_private.register_company(uuid,uuid,text,text,text)
 from public, anon, authenticated, service_role;
grant execute on function cotironda_private.register_company(uuid,uuid,text,text,text)
 to cotironda_app;

-- Cambiar propietario al FINAL: Supabase no permite al propietario anterior
-- modificar la función después de la cesión.
grant create on schema cotironda_private to cotironda_registrar;
grant cotironda_registrar to postgres with set true, inherit false;
alter function cotironda_private.register_company(uuid,uuid,text,text,text)
 owner to cotironda_registrar;
revoke cotironda_registrar from postgres;
revoke create on schema cotironda_private from cotironda_registrar;

-- Cortar completamente la ruta de escrituras directas, incluso la lectura.
revoke select, insert on public.organizations, public.organization_members,
 public.supplier_profiles, cotironda_private.organization_registration_requests
 from cotironda_app;
drop policy backend_organizations_select on public.organizations;
drop policy backend_organizations_insert on public.organizations;
drop policy backend_members_select on public.organization_members;
drop policy backend_members_insert on public.organization_members;
drop policy backend_profiles_select on public.supplier_profiles;
drop policy backend_profiles_insert on public.supplier_profiles;
drop policy backend_requests_select
 on cotironda_private.organization_registration_requests;
drop policy backend_requests_insert
 on cotironda_private.organization_registration_requests;
