-- D036 / Issue #173. SOLO LECTURA. No BEGIN/DDL/GRANT/DML, no PII.
-- Ejecutar desde conexion explícitamente seleccionada a Supabase DEV.
-- JSON de catalogo y switches, NUNCA tokens, emails, teléfonos o filas comerciales.
-- El reporte no demuestra backup, permiso de despliegue ni E2E Auth real.
select jsonb_build_object(
  'pgVersionNum',current_setting('server_version_num')::integer,
  'migrations',(
    select coalesce(jsonb_agg(jsonb_build_object(
      'version',m.version,'name',m.name) order by m.version),'[]'::jsonb)
    from supabase_migrations.schema_migrations m
  ),
  'newRolesCount',(
    select count(*)::integer from pg_roles
    where rolname in ('cotironda_rounds_reader','cotironda_whapi_gateway',
      'cotironda_whapi_inbox_writer','cotironda_whapi_ci_login')
  ),
  'newTablesCount',(
    select count(*)::integer from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='cotironda_private' and c.relkind in ('r','p')
      and c.relname in ('rounds_v1','round_items_v1','round_invites_v1',
        'offer_drafts_v1','offer_events_v1','offer_versions_v1',
        'whapi_contacts_v1','whapi_inbox_v1')
  ),
  'newFunctionsCount',(
    select count(*)::integer from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where (n.nspname='cotironda_private' and p.proname in (
        'request_user_id_v035','buyer_round_overview_v1',
        'whapi_resolve_active_contact_v1','whapi_inbox_record_v1',
        'whapi_inbox_record_keyed_v1','whapi_record_optout_v1'))
      or (n.nspname='public' and p.proname='buyer_round_overview_v1')
  ),
  'sessionCheckerOwner',(
    select pg_get_userbyid(p.proowner) from pg_proc p
    where p.oid=to_regprocedure(
      'cotironda_private.is_session_verified(uuid,uuid)')
  ),
  'sessionCheckerDefiner',(
    select p.prosecdef from pg_proc p where p.oid=to_regprocedure(
      'cotironda_private.is_session_verified(uuid,uuid)')
  ),
  'registrationEnabled',(
    select r.enabled from cotironda_private.registration_settings r
    where r.singleton=true
  ),
  'iaAutoEnabled',(
    select a.enabled from cotironda_private.dev_quality_auto_control a
    where a.singleton=true
  ),
  'iaCronCount',(
    select count(*)::integer from cron.job where jobname='cotironda-ia-dev-quality-auto'
  ),
  'publicBaselineMissingRls',(
    select count(*)::integer from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r'
      and c.relname in ('organizations','organization_members','supplier_profiles')
      and not c.relrowsecurity
  )
) as inventory;
