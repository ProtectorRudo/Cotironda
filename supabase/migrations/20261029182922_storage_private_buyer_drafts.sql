-- ETAPA 01 / migration 8: documentos borrador del COMPRADOR.
-- SOLO se aplica en cotironda-dev tras CI; registro SQL continúa deshabilitado.
-- Sin acceso a ofertas de proveedores: se habilitarán por reglas de licitación futuras.
-- UUID/requests/UUID/UUID.ext (evita path traversal, filenames arbitrarios y sobreescritura).
-- MIME/tamaño son restricciones del servicio Supabase Storage, no validaciones por SQL.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cotironda-buyer-drafts','cotironda-buyer-drafts',false,10485760,
        array['application/pdf',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'image/jpeg','image/png','image/webp']::text[])
on conflict(id) do nothing;

-- No aceptar bucket preexistente con permisos/limits diferentes.
do $bucket$
begin
 if not exists (
  select 1 from storage.buckets b
   where b.id='cotironda-buyer-drafts'
     and b.name=b.id and b.public is false
     and b.file_size_limit=10485760
     and b.allowed_mime_types @> array[
       'application/pdf',
       'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
       'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
       'image/jpeg','image/png','image/webp']::text[]
     and cardinality(b.allowed_mime_types)=6
 ) then
   raise exception 'cotironda_storage_bucket_inseguro';
 end if;
end;
$bucket$;

alter table storage.objects enable row level security;

-- Ninguna política a anon. SELECT sólo miembro activo de empresa COMPRADORA.
-- No usar owner_id ni metadata controlable por usuario; siempre consultar membresías RLS.
create policy cotironda_buyer_drafts_read_member
 on storage.objects
 for select to authenticated
 using (
  bucket_id='cotironda-buyer-drafts'
  and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/requests/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|docx|xlsx|png|jpg|jpeg|webp)$'
  and exists (
    select 1
      from public.organization_members m
      join public.organizations o on o.id=m.organization_id
     where m.organization_id::text = split_part(name, '/', 1)
       and m.user_id = (select auth.uid())
       and m.status = 'active'
       and o.organization_type in ('buyer', 'both')
  )
 );

-- Escritura sólo owner/manager de empresa compradora, sin UPDATE, DELETE ni UPSERT.
-- No hay oferta de proveedor, archivo público ni creación de empresas desde Storage.
create policy cotironda_buyer_drafts_insert_manager
 on storage.objects
 for insert to authenticated
 with check (
  bucket_id='cotironda-buyer-drafts'
  and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/requests/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|docx|xlsx|png|jpg|jpeg|webp)$'
  and exists (
    select 1
      from public.organization_members m
      join public.organizations o on o.id=m.organization_id
     where m.organization_id::text = split_part(name, '/', 1)
       and m.user_id = (select auth.uid())
       and m.status = 'active'
       and o.organization_type in ('buyer', 'both')
       and m.membership_role in ('owner', 'manager')
  )
 );
