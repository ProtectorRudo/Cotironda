-- Etapa 01: rol exclusivo para registrar empresas, SIN LOGIN y SIN BYPASSRLS.
-- NO activa ningún acceso externo. Requiere una credencial separada más adelante.
create role cotironda_app noinherit nologin nobypassrls;

grant usage on schema public, cotironda_private to cotironda_app;
grant select, insert on public.organizations, public.organization_members,
 public.supplier_profiles to cotironda_app;
grant select, insert on cotironda_private.organization_registration_requests
 to cotironda_app;

-- Las políticas del rol de servidor sólo permiten lectura y alta de los
-- recursos necesarios para la transacción; NO permiten update ni delete.
-- Este rol no debe usarse para consultar catálogos ni contactos privados.
create policy backend_organizations_select on public.organizations
 for select to cotironda_app using (true);
create policy backend_organizations_insert on public.organizations
 for insert to cotironda_app with check (true);
create policy backend_members_select on public.organization_members
 for select to cotironda_app using (true);
create policy backend_members_insert on public.organization_members
 for insert to cotironda_app with check (true);
create policy backend_profiles_select on public.supplier_profiles
 for select to cotironda_app using (true);
create policy backend_profiles_insert on public.supplier_profiles
 for insert to cotironda_app with check (true);
create policy backend_requests_select
 on cotironda_private.organization_registration_requests
 for select to cotironda_app using (true);
create policy backend_requests_insert
 on cotironda_private.organization_registration_requests
 for insert to cotironda_app with check (true);

grant execute on function
 cotironda_private.register_company(uuid,uuid,text,text,text)
 to cotironda_app;
-- Backend deja de depender del rol general service_role para el registro.
revoke execute on function
 cotironda_private.register_company(uuid,uuid,text,text,text)
 from service_role;

-- Dos índices sugeridos por el asesor de rendimiento.
create index supplier_categories_category_code_idx
 on public.supplier_categories(category_code);
create index supplier_products_org_category_idx
 on public.supplier_products(organization_id,category_code);
