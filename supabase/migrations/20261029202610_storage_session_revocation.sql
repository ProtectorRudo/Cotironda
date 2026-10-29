-- Etapa 01 / migracion 9: impedir acceso a borradores con JWT de sesión revocada.
-- No habilitar registro ni Storage comercial. No altera ownership ni RLS del servicio.
-- Sólo toma identidad del request autenticado por gateway; no admite IDs suministrados como argumentos.
create function cotironda_private.storage_session_active()
returns boolean
language plpgsql stable security definer set search_path = ''
as $fn$
declare
 v_jwt jsonb;
 v_sub text;
 v_session text;
 v_uid uuid;
begin
 v_jwt := auth.jwt();
 if v_jwt is null
    or (v_jwt->>'role') is distinct from 'authenticated'
    or (v_jwt->>'is_anonymous') is distinct from 'false'
    or (v_jwt->>'cotironda_email_verified') is distinct from 'true' then
  return false;
 end if;
 v_sub := v_jwt->>'sub';
 v_session := v_jwt->>'session_id';
 if v_sub is null or v_session is null
    or v_sub !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or v_session !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
  return false;
 end if;
 v_uid := auth.uid();
 if v_uid is null or v_sub::uuid is distinct from v_uid then
  return false;
 end if;
 return coalesce(cotironda_private.is_session_verified(v_uid,v_session::uuid),false);
exception when invalid_text_representation then
 return false;
end;
$fn$;
-- Privileged helper in unexposed schema with no user-supplied arguments.
revoke all on function cotironda_private.storage_session_active()
 from public,anon,authenticated,service_role,cotironda_app,cotironda_registrar;
grant execute on function cotironda_private.storage_session_active() to authenticated;

-- Reemplazo atomico de SOLO las dos políticas de nuestro bucket.
-- No usar ALTER TABLE sobre storage.objects: propietario Supabase Storage.
drop policy cotironda_buyer_drafts_read_member on storage.objects;
drop policy cotironda_buyer_drafts_insert_manager on storage.objects;
-- Ninguna política a anon. SELECT sólo miembro activo de empresa COMPRADORA.
-- No usar owner_id ni metadata controlable por usuario; siempre consultar membresías RLS.
create policy cotironda_buyer_drafts_read_member
 on storage.objects
 for select to authenticated
 using (
  bucket_id='cotironda-buyer-drafts'
  and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/requests/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|docx|xlsx|png|jpg|jpeg|webp)$'
  and (select cotironda_private.storage_session_active())
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
  and (select cotironda_private.storage_session_active())
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

