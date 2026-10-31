-- ETAPA 01: auditoría no destructiva de cotironda-dev.
-- Ejecutar exclusivamente con project_id=qkercsoqhehbenbbncwk.
-- Esta consulta no modifica Auth, RLS, políticas, archivos, cuotas ni datos.
-- PASS indica sólo que el control SQL está conforme en ese instante;
-- no demuestra E2E HTTP, JWT revocado, antivirus, ni aprobación comercial.
with controles as (
 select 'registro SQL deshabilitado' as control,
  (select enabled is false from cotironda_private.registration_settings where singleton=true) is true as cumple
 union all select 'sin empresas reales', (select count(*)=0 from public.organizations)
 union all select 'sin membresias', (select count(*)=0 from public.organization_members)
 union all select 'sin cuotas', (select count(*)=0 from cotironda_private.registration_attempt_quotas)
 union all select 'sin sesiones', (select count(*)=0 from auth.sessions)
 union all select 'sin objetos Storage', (select count(*)=0 from storage.objects)
 union all select 'sin trabajos de documentos', (select count(*)=0 from cotironda_private.document_intake_jobs)
 union all select 'bucket borradores privado',
  exists(select 1 from storage.buckets where id='cotironda-buyer-drafts'
    and public=false and file_size_limit=10485760)
 union all select 'bucket cuarentena privado',
  exists(select 1 from storage.buckets where id='cotironda-upload-quarantine'
    and public=false and file_size_limit=10485760)
 union all select 'Storage sin policies escritura',
  not exists(select 1 from pg_policies where schemaname='storage'
    and tablename='objects' and cmd in ('INSERT','UPDATE','DELETE','ALL'))
 union all select 'Storage solo lectura por sesion',
  (select count(*)=1 from pg_policies where schemaname='storage'
    and tablename='objects' and cmd='SELECT'
    and policyname='cotironda_buyer_drafts_read_member'
    and position('storage_session_active' in coalesce(qual,''))>0)
 union all select 'cuarentena RLS activa',
  exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='cotironda_private' and c.relname='document_intake_jobs'
    and c.relrowsecurity)
 union all select 'ledger sin policies usuario',
  not exists(select 1 from pg_policies where schemaname='cotironda_private'
    and tablename='document_intake_jobs')
 union all select 'anon sin RPC alta',
  not has_function_privilege('anon',
    'public.register_company_for_current_user(uuid,text,text,text)','EXECUTE')
 union all select 'RPC alta SECURITY INVOKER',
  exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='register_company_for_current_user'
    and not p.prosecdef)
 union all select 'helper sesion no publico',
  not has_function_privilege('authenticated',
    'cotironda_private.is_session_verified(uuid,uuid)','EXECUTE')
 union all select 'Auth Hook solo rol de Auth',
  has_function_privilege('supabase_auth_admin',
    'cotironda_private.email_verified_access_token(jsonb)','EXECUTE')
  and not has_function_privilege('authenticated',
    'cotironda_private.email_verified_access_token(jsonb)','EXECUTE')
)
select control,case when cumple then 'PASS' else 'FAIL' end as resultado
from controles order by control;
