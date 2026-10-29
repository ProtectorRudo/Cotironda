-- Etapa 01, migracion 12: evitar acceso a datos comerciales con JWT firmado
-- cuya sesion haya sido revocada. No abre registros, tablas, grants ni Storage.
-- Generada por Supabase CLI 2.122.0; validacion CI antes de cotironda-dev.
-- Seguridad: las seis policies del registrador interno no se modifican.
do $guard$
declare
 v_tables text[] := array[
  'organizations','organization_members','catalog_categories',
  'supplier_profiles','supplier_categories','supplier_products','supplier_delivery_areas'
 ];
 v_expected_client text[] := array[
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
 v_expected_registrar text[] := array[
  'registrar_members_insert','registrar_members_read',
  'registrar_organizations_insert','registrar_organizations_read',
  'registrar_profiles_insert','registrar_profiles_read'
 ];
 v_actual text[];
 v_registrar_before text;
 v_registrar_after text;
 v_applied integer := 0;
 p record;
begin
 -- No aplicar silenciosamente en otro estado o con controles de identidad ajenos.
 if (select count(*) from cotironda_private.registration_settings
     where singleton=true and enabled=false) <> 1
    or not exists (
      select 1 from pg_proc f join pg_namespace n on n.oid=f.pronamespace
       where n.nspname='cotironda_private'
         and f.proname='storage_session_active'
         and pg_get_function_identity_arguments(f.oid)=''
         and f.prosecdef=true
    )
    or not has_function_privilege('authenticated',
      'cotironda_private.storage_session_active()','EXECUTE')
    or has_function_privilege('anon',
      'cotironda_private.storage_session_active()','EXECUTE')
 then raise exception 'session_guard_preconditions_invalid'; end if;

 -- No dejar pasar tablas sin RLS ni reemplazar policies desconocidas.
 if (select count(*) from pg_class c
       join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=any(v_tables)
        and c.relrowsecurity=true) <> 7
    or (select count(*) from pg_policies
        where schemaname='public' and tablename=any(v_tables)) <> 23
    or exists(
      select 1 from pg_policies
      where schemaname='public' and tablename=any(v_tables)
        and (permissive <> 'PERMISSIVE'
             or roles not in (array['authenticated']::name[],
                              array['cotironda_registrar']::name[]))
    )
 then raise exception 'session_guard_policy_inventory_invalid'; end if;

 select array_agg(policyname::text order by policyname) into v_actual
   from pg_policies where schemaname='public'
     and tablename=any(v_tables)
     and roles=array['authenticated']::name[];
 if v_actual is distinct from v_expected_client
 then raise exception 'session_guard_client_policies_changed'; end if;

 select array_agg(policyname::text order by policyname) into v_actual
   from pg_policies where schemaname='public'
     and tablename=any(v_tables)
     and roles=array['cotironda_registrar']::name[];
 if v_actual is distinct from v_expected_registrar
 then raise exception 'session_guard_registrar_policies_changed'; end if;

 select md5(coalesce(string_agg(
   concat_ws('|',tablename,policyname,cmd,qual,with_check),E'\n'
   order by tablename,policyname),''))
 into v_registrar_before
 from pg_policies where schemaname='public'
   and tablename=any(v_tables)
   and roles=array['cotironda_registrar']::name[];

 -- Las políticas de cliente ya deben exigir pertenencia/rol según el caso.
 -- Se preservan esos predicados por completo, agregando una condición AND.
 for p in
  select tablename,policyname,cmd,qual,with_check
    from pg_policies where schemaname='public'
      and tablename=any(v_tables)
      and roles=array['authenticated']::name[]
    order by tablename,policyname
 loop
  if coalesce(p.qual,'') like '%storage_session_active%'
    or coalesce(p.with_check,'') like '%storage_session_active%'
  then raise exception 'session_guard_policy_already_changed'; end if;
  if p.cmd in ('SELECT','DELETE','UPDATE') then
    if p.qual is null then raise exception 'session_guard_missing_using'; end if;
    execute format(
      'alter policy %I on public.%I using ((%s) and (select cotironda_private.storage_session_active()))',
      p.policyname,p.tablename,p.qual
    );
  end if;
  if p.cmd in ('INSERT','UPDATE') then
    if p.with_check is null then raise exception 'session_guard_missing_check'; end if;
    execute format(
      'alter policy %I on public.%I with check ((%s) and (select cotironda_private.storage_session_active()))',
      p.policyname,p.tablename,p.with_check
    );
  end if;
  if p.cmd not in ('SELECT','INSERT','UPDATE','DELETE')
  then raise exception 'session_guard_unexpected_command'; end if;
  v_applied := v_applied+1;
 end loop;

 if v_applied <> 17 or exists(
  select 1 from pg_policies
  where schemaname='public' and tablename=any(v_tables)
    and roles=array['authenticated']::name[]
    and (
      (cmd in ('SELECT','DELETE','UPDATE')
         and position('storage_session_active' in coalesce(qual,''))=0)
      or (cmd in ('INSERT','UPDATE')
         and position('storage_session_active' in coalesce(with_check,''))=0)
    )
 ) then raise exception 'session_guard_incomplete'; end if;

 select md5(coalesce(string_agg(
   concat_ws('|',tablename,policyname,cmd,qual,with_check),E'\n'
   order by tablename,policyname),''))
 into v_registrar_after
 from pg_policies where schemaname='public'
   and tablename=any(v_tables)
   and roles=array['cotironda_registrar']::name[];
 if v_registrar_before is distinct from v_registrar_after
 then raise exception 'session_guard_registrar_mutated'; end if;

 -- No se activa registro ni se modifica la politica Storage fail-closed.
 if (select count(*) from cotironda_private.registration_settings
     where singleton=true and enabled=false)<>1
    or exists(
      select 1 from pg_policies
       where schemaname='storage' and tablename='objects'
         and cmd in ('INSERT','UPDATE','DELETE','ALL')
    )
 then raise exception 'session_guard_upload_or_register_open'; end if;
end;
$guard$;
