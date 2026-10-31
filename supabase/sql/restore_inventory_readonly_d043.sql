-- D043 / Issue #188. SOLO SELECT. Almacenar el JSON exclusivamente en equipo seguro.
-- NO recupera bytes de Storage, Auth settings, Edge, Vault plaintext, credenciales ni políticas externas.
-- No leer emails, phones, passwords, tokens ni filas individuales.
select jsonb_build_object(
 'pgVersionNum',current_setting('server_version_num')::integer,
 'migrations',(
   select coalesce(jsonb_agg(jsonb_build_object('version',version,'name',name) order by version),'[]'::jsonb)
   from supabase_migrations.schema_migrations
 ),
 'authUsers',(select count(*)::integer from auth.users),
 'authIdentities',(select count(*)::integer from auth.identities),
 'authSessions',(select count(*)::integer from auth.sessions),
 'storageBuckets',(select count(*)::integer from storage.buckets),
 'storagePublicBuckets',(select count(*)::integer from storage.buckets where public),
 'storageObjects',(select count(*)::integer from storage.objects),
 'vaultRecords',(select count(*)::integer from vault.secrets),
 'cronJobs',(select count(*)::integer from cron.job),
 'iaEnabled',(select enabled from cotironda_private.dev_quality_auto_control where singleton=true),
 'registrationEnabled',(select enabled from cotironda_private.registration_settings where singleton=true),
 'publicMissingRls',(
  select count(*)::integer from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and not c.relrowsecurity
 ),
 'privateMissingRls',(
  select count(*)::integer from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='cotironda_private' and c.relkind='r' and not c.relrowsecurity
 ),
 'extensions',(
  select coalesce(jsonb_agg(extname order by extname),'[]'::jsonb)
  from pg_extension where extname in ('pg_net','pg_cron','supabase_vault')
 ),
 'qualityClaims',(select count(*)::integer from public.dev_ia_quality_claims)
) as inventory;
