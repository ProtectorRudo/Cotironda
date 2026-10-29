-- Guard regresion tras migracion 12: solo CI / SQL sin escrituras.
-- Sin datos comerciales ni sesiones reales: se valida estructura y permisos.
select ci_helpers.assert_true(
 (select count(*) from pg_policies where schemaname='public'
   and tablename in ('organizations','organization_members','catalog_categories',
     'supplier_profiles','supplier_categories','supplier_products',
     'supplier_delivery_areas'))=23,
 'RLS comercial conserva exactamente 23 policies');
select ci_helpers.assert_true(
 (select count(*) from pg_policies where schemaname='public'
   and tablename in ('organizations','organization_members','catalog_categories',
     'supplier_profiles','supplier_categories','supplier_products',
     'supplier_delivery_areas')
   and roles=array['authenticated']::name[])=17,
 'RLS conserva exactamente 17 policies de clientes');
select ci_helpers.assert_true(
 not exists (
   select 1 from pg_policies where schemaname='public'
     and tablename in ('organizations','organization_members','catalog_categories',
       'supplier_profiles','supplier_categories','supplier_products',
       'supplier_delivery_areas')
     and roles=array['authenticated']::name[]
     and (
       (cmd in ('SELECT','DELETE','UPDATE')
         and position('storage_session_active' in coalesce(qual,''))=0)
       or (cmd in ('INSERT','UPDATE')
         and position('storage_session_active' in coalesce(with_check,''))=0)
     )
 ), 'ninguna policy authenticated sin guard de sesión vigente');
select ci_helpers.assert_true(
 (select count(*) from pg_policies where schemaname='public'
   and roles=array['cotironda_registrar']::name[]
   and policyname in ('registrar_members_insert','registrar_members_read',
     'registrar_organizations_insert','registrar_organizations_read',
     'registrar_profiles_insert','registrar_profiles_read'))=6,
 'seis políticas privadas del registrador conservadas');
select ci_helpers.assert_true(
 (select enabled=false from cotironda_private.registration_settings where singleton=true)
 and (select count(*) from public.organizations)=0
 and (select count(*) from auth.sessions)=0,
 'registro sigue cerrado, sin organizaciones ni sesiones reales');
select ci_helpers.assert_true(
 not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects'
    and cmd in ('INSERT','UPDATE','DELETE','ALL')),
 'migracion 12 no abre cargas de Storage');
select ci_helpers.assert_true(
 not has_function_privilege('anon','cotironda_private.storage_session_active()','EXECUTE')
 and has_function_privilege('authenticated','cotironda_private.storage_session_active()','EXECUTE'),
 'guard de sesion tiene privilegios limitados');
