-- BORRADOR DE HARDENING RLS PARA EVALUACIÓN EN CI, NO ES MIGRACIÓN OFICIAL.
-- Ejecutar SOLO en PostgreSQL efímero cotironda_ci_http tras las 11 migraciones.
-- TODO: generar una migración versionada con Supabase CLI y reauditar antes de aplicar a dev.
-- Se conservan los predicados previos y los grants: solo agrega sesión actual válida
-- a las 17 políticas para authenticated en las 7 tablas comerciales.
do $guard$
declare
  v_tables text[] := array[
    'organizations','organization_members','catalog_categories',
    'supplier_profiles','supplier_categories','supplier_products','supplier_delivery_areas'
  ];
  v_expected text[] := array[
    'categories_read_active',
    'members_read_self',
    'organizations_read_member',
    'supplier_areas_delete_manager',
    'supplier_areas_insert_manager',
    'supplier_areas_read_own',
    'supplier_areas_update_manager',
    'supplier_categories_delete_manager',
    'supplier_categories_insert_manager',
    'supplier_categories_read_own',
    'supplier_categories_update_manager',
    'supplier_products_delete_manager',
    'supplier_products_insert_manager',
    'supplier_products_read_own',
    'supplier_products_update_manager',
    'supplier_profiles_read_own',
    'supplier_profiles_update_managers'
  ];
  v_actual text[];
  p record;
begin
  if current_database() <> 'cotironda_ci_http'
     or (select enabled from cotironda_private.registration_settings
         where singleton=true) is distinct from false
     or (select count(*) from public.organizations) <> 0
     or (select count(*) from auth.sessions) <> 0
     or (select count(*) from public.organization_members) <> 0
  then raise exception 'rls_hardening_only_empty_ephemeral_ci'; end if;

  -- Fail-closed: ninguna regla desconocida, OR permissive adicional o cambio de roles.
  if (select count(*) from pg_policies
      where schemaname='public' and tablename=any(v_tables)) <> 23
     or exists(
       select 1 from pg_policies
       where schemaname='public' and tablename=any(v_tables)
         and (permissive <> 'PERMISSIVE'
              or roles not in (array['authenticated']::name[],
                               array['cotironda_registrar']::name[]))
     )
  then raise exception 'rls_existing_policies_unexpected'; end if;

  select array_agg(policyname::text order by policyname)
    into v_actual
  from pg_policies
  where schemaname='public' and tablename=any(v_tables)
    and roles=array['authenticated']::name[];

  if v_actual is distinct from v_expected
  then raise exception 'rls_authenticated_policies_unexpected'; end if;

  for p in select tablename,policyname,cmd,qual,with_check
      from pg_policies
      where schemaname='public' and tablename=any(v_tables)
        and roles=array['authenticated']::name[]
      order by tablename,policyname
  loop
    if coalesce(p.qual,'') like '%storage_session_active%'
       or coalesce(p.with_check,'') like '%storage_session_active%'
    then raise exception 'rls_guard_already_present'; end if;
    if p.cmd in ('SELECT','DELETE','UPDATE') then
      if p.qual is null then raise exception 'rls_missing_using'; end if;
      execute format(
        'alter policy %I on public.%I using ((%s) and (select cotironda_private.storage_session_active()))',
        p.policyname,p.tablename,p.qual
      );
    end if;
    if p.cmd in ('INSERT','UPDATE') then
      if p.with_check is null then raise exception 'rls_missing_with_check'; end if;
      execute format(
        'alter policy %I on public.%I with check ((%s) and (select cotironda_private.storage_session_active()))',
        p.policyname,p.tablename,p.with_check
      );
    end if;
    if p.cmd not in ('SELECT','DELETE','INSERT','UPDATE')
    then raise exception 'rls_unsupported_policy_command'; end if;
  end loop;

  if (select count(*) from pg_policies
      where schemaname='public' and tablename=any(v_tables)
        and roles=array['authenticated']::name[]
        and (
          (cmd in ('SELECT','DELETE','UPDATE') and
           position('storage_session_active' in coalesce(qual,''))=0)
          or
          (cmd in ('INSERT','UPDATE') and
           position('storage_session_active' in coalesce(with_check,''))=0)
        )
     ) <> 0
  then raise exception 'rls_session_guard_incomplete'; end if;
end;
$guard$;
