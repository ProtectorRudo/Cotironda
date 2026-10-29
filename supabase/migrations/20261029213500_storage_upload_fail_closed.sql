-- Etapa 01: fail-closed, bloquear INSERT directo a borradores hasta contar con
-- validacion y antimalware del LADO DEL SERVIDOR antes de promover al bucket.
-- El preflight en navegador no es control de seguridad: se puede omitir.
-- Sólo altera nuestra politica INSERT; SELECT por membresia y sesion sigue igual.
drop policy if exists cotironda_buyer_drafts_insert_manager on storage.objects;

-- Rechazar aplicar si alguien dejó acceso de escritura por otra politica del bucket.
-- Postgres combina politicas permisivas con OR; verificar antes de habilitar usuarios.
do $assert$
begin
 if (select count(*) from pg_policies
     where schemaname='storage' and tablename='objects'
       and policyname like 'cotironda_buyer_drafts_%') <> 1
 or not exists(
    select 1 from pg_policies where schemaname='storage'
    and tablename='objects'
    and policyname='cotironda_buyer_drafts_read_member'
    and cmd='SELECT' and roles::text like '%authenticated%'
    and position('storage_session_active' in coalesce(qual,''))>0
   )
 then
   raise exception 'storage_fail_closed_contract_invalido';
 end if;
end;
$assert$;
