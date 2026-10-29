-- Etapa 01 / migracion 11: cuarentena NO accesible y metadata de ingestión privada.
-- No endpoints, signed upload links, cargas, antivirus ni promoción habilitados.
-- Requiere migration10, que conserva buyer-drafts sin INSERT.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('cotironda-upload-quarantine','cotironda-upload-quarantine',false,10485760,
  array['application/pdf',
   'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
   'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
   'image/jpeg','image/png','image/webp']::text[])
on conflict (id) do nothing;

do $bucket$
begin
 if not exists(select 1 from storage.buckets
     where id='cotironda-upload-quarantine'
       and name=id and public=false and file_size_limit=10485760
       and allowed_mime_types @> array[
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'image/jpeg','image/png','image/webp']::text[]
       and cardinality(allowed_mime_types)=6)
 then raise exception 'cotironda_quarantine_bucket_inseguro'; end if;

 -- Seguridad global: si existe otra policy permisiva, aun de otro bucket, detener.
 -- No autorizar nueva tabla sin confirmar que la cuarentena no hereda ACL amplias.
 if (select count(*) from pg_policies
     where schemaname='storage' and tablename='objects') <> 1
 or not exists(select 1 from pg_policies
     where schemaname='storage' and tablename='objects'
      and policyname='cotironda_buyer_drafts_read_member'
      and cmd='SELECT' and coalesce(qual,'') like '%storage_session_active%')
 then raise exception 'cotironda_quarantine_rls_no_aislada'; end if;
end;
$bucket$;

-- SOLO proceso interno con credenciales gestionadas server-only; nunca exposicion Data API.
create table cotironda_private.document_intake_jobs (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete restrict,
 requested_by uuid references auth.users(id) on delete set null,
 request_id uuid not null,
 file_id uuid not null,
 idempotency_key uuid not null,
 declared_mime text not null check(declared_mime in (
   'application/pdf',
   'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
   'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
   'image/jpeg','image/png','image/webp'
 )),
 declared_size bigint not null check(declared_size between 1 and 10485760),
 status text not null default 'pending' check(status in (
    'pending','quarantined','scanning','approved','rejected','failed','expired'
 )),
 scan_verdict text check(scan_verdict in ('clean','malicious','invalid','error')),
 scanner_version text check (scanner_version is null or char_length(scanner_version) between 1 and 100),
 sha256_hex text check (sha256_hex is null or sha256_hex ~ '^[0-9a-f]{64}$'),
 scan_completed_at timestamptz,
 expires_at timestamptz not null default (now()+interval '24 hours'),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint document_intake_unique_request unique(organization_id,idempotency_key),
 constraint document_intake_unique_file unique(organization_id,file_id),
 constraint document_intake_approved_scanned check (
   status <> 'approved' or (
     scan_verdict='clean' and scanner_version is not null
     and scan_completed_at is not null and sha256_hex is not null
   )
 ),
 constraint document_intake_verdict_complete check (
   scan_verdict is null or scan_completed_at is not null
 ),
 constraint document_intake_expiration_valid check (expires_at>created_at)
);

create index document_intake_cleanup_idx
 on cotironda_private.document_intake_jobs(expires_at,id)
 where status in ('pending','quarantined','failed','rejected','expired');
create index document_intake_tenant_status_idx
 on cotironda_private.document_intake_jobs(organization_id,status,created_at);

-- Evitar modificación del tenant/archivo/idempotencia después de crear la solicitud,
-- y aprobar sólo después de un scan. No ejecuta escaneo por sí mismo.
create function cotironda_private.guard_document_intake_transition()
returns trigger language plpgsql security invoker set search_path=''
as $guard$
begin
 if row(old.organization_id,old.request_id,old.file_id,
        old.idempotency_key,old.declared_mime,old.declared_size,old.created_at)
    is distinct from
    row(new.organization_id,new.request_id,new.file_id,
        new.idempotency_key,new.declared_mime,new.declared_size,new.created_at)
 then
    raise exception 'document_identity_immutable';
 end if;
 -- Permitimos quitar el identificador del usuario al eliminar su cuenta Auth.
 -- No permitir reemplazarlo por otra persona sin crear un trabajo nuevo.
 if old.requested_by is distinct from new.requested_by
    and not (old.requested_by is not null and new.requested_by is null)
 then
    raise exception 'document_author_immutable';
 end if;
 if old.status is distinct from new.status and not (
    (old.status='pending' and new.status in ('quarantined','rejected','expired','failed'))
    or (old.status='quarantined' and new.status in ('scanning','rejected','expired','failed'))
    or (old.status='scanning' and new.status in ('approved','rejected','failed'))
    or (old.status='failed' and new.status in ('quarantined','expired'))
 ) then
    raise exception 'document_transition_invalid';
 end if;
 if old.status in ('approved','rejected','expired') and (
   old.status is distinct from new.status or
   old.scan_verdict is distinct from new.scan_verdict or
   old.sha256_hex is distinct from new.sha256_hex or
   old.scanner_version is distinct from new.scanner_version or
   old.scan_completed_at is distinct from new.scan_completed_at
 ) then
    raise exception 'document_terminal_immutable';
 end if;
 new.updated_at=now();
 return new;
end;
$guard$;
revoke all on function cotironda_private.guard_document_intake_transition()
 from PUBLIC,anon,authenticated;
grant execute on function cotironda_private.guard_document_intake_transition()
 to service_role;

create trigger document_intake_guard
 before update on cotironda_private.document_intake_jobs
 for each row execute function cotironda_private.guard_document_intake_transition();

alter table cotironda_private.document_intake_jobs enable row level security;
revoke all on cotironda_private.document_intake_jobs from PUBLIC,anon,authenticated;
grant select,insert,update on cotironda_private.document_intake_jobs to service_role;
-- No DELETE ni INSERT/SELECT para usuario final. No policies para esta tabla privada.
-- Ninguna política Storage otorgada a la cuarentena: deny-by-default.
