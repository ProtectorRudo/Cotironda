# 40 — Storage privado de borradores documentales del comprador (Etapa 01)

**29/10/2026 · PR #52 draft hijo de #51.** Migración aplicada y verificada **sólo en `cotironda-dev`** después de aprobar CI. El registro comercial y producción permanecen cerrados.

## Necesidad y decisión acotada
La Etapa 02 interpretará PDFs, Excel, Word e imágenes. Antes de aceptar material real, hay que aislar cada documento por empresa compradora. Se crea **un bucket privado exclusivo para borradores de solicitudes del comprador**, no un bucket compartido para ofertas de proveedores. Las ofertas, adjuntos de WhatsApp, adjudicaciones y documentos públicos requerirán políticas separadas con permisos por ronda, plazos y anonimato.

## Bucket
- ID y nombre: `cotironda-buyer-drafts`.
- `public=false`, tamaño máximo por objeto **10 MiB (10.485.760 bytes)**.
- MIME permitidos exactamente: `application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (DOCX), `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (XLSX), `image/jpeg`, `image/png`, `image/webp`.
- Sin ZIP, ejecutables, `.doc`/`.xls` heredados, DOCM/XLSM con macros; convertirlos o analizar con antimalware y reglas de extracción antes de aceptarlos.
- Path canónico único: `<uuid-empresa>/requests/<uuid-solicitud>/<uuid-archivo>.<pdf|docx|xlsx|png|jpg|jpeg|webp>`. No nombre libre del usuario; esto evita path traversal y reemplazos por nombre. Al cargar se requiere `upsert:false` y UUID nuevo por archivo.

## RLS
Dos políticas **sobre `storage.objects`**, con `TO authenticated` y `bucket_id` fijo:
- `SELECT` sólo para miembros de una organización **buyer** o **both** con membresía `active`. La empresa se obtiene del primer segmento del path canónico, se coteja contra `organization_members.organization_id` y `auth.uid()` y se verifica tipo en `organizations`.
- `INSERT` solo para `owner` o `manager` activos de la **misma** empresa compradora.
- **Ninguna política** de `UPDATE`, `DELETE`, `ALL`, `anon` ni operaciones sobre otros buckets. No se tocan otras políticas de Storage; inicialmente no hay políticas existentes en desarrollo.

No autorizar por `owner_id`, `metadata` ni `user_metadata` de JWT: esos campos podrían ser establecidos por el cliente. No hay uploads por `service_role` en el navegador.

## Resultado de instalación real en desarrollo
La primera tentativa con `ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY` falló con `42501: must be owner of table objects`. El servicio Supabase Storage ya tiene RLS activada y es propietario `supabase_storage_admin`; el rol `postgres` no debe adquirir ese ownership. Se quitó **solo** ese `ALTER TABLE` y la migración oficial se aplicó correctamente mediante la herramienta de migraciones. Supabase asignó la versión definitiva **`20261029183835_storage_private_buyer_drafts`**. La consulta posterior confirma `public=false`, `file_size_limit=10485760`, 6 MIME y políticas `SELECT`/`INSERT` limitadas a authenticated; 0 objetos, 0 empresas y registro SQL `false`. La creación de políticas sí funcionó sin cambiar propietario ni permisos administrativos. La prueba HTTP real del Storage API sigue pendiente.

## Pruebas automatizadas
`supabase/tests/ci/00_bootstrap.sql` simula únicamente la estructura mínima de `storage.buckets` y `storage.objects` en PostgreSQL 17 efímero. **Este archivo nunca se aplica al Supabase real.**
`94_storage_private_tenant.sql`, dentro de `BEGIN/ROLLBACK`, prueba:
- Bucket privado y límites MIME/tamaño, exactamente dos políticas con acciones SELECT/INSERT.
- Buyer A carga PDF, buyer B carga XLSX; A no ve ni crea en B, ni viceversa.
- Miembro activo puede leer pero no cargar; gerente de A puede cargar; suspendido, sin empresa, anónimo y proveedor no pueden acceder.
- Rechazo de rutas manipuladas, directorios extra, nombres arbitrarios, extensiones JS/DOCM.
- Ni propietario puede sobrescribir mediante UPDATE ni borrar mediante DELETE; ninguna política cambia a otros buckets.
- Suite en ambos caminos de CI: historial incremental y reconstrucción ordenada de **8 migraciones** en base limpia. Registro de empresas apagado y tests siempre revertidos.

## Riesgos y requisitos NO cubiertos por este cambio
1. La verificación del MIME real y tamaño se ejecuta en **Storage API**, no como `CHECK` sobre tabla: una inserción manual SQL no prueba ese límite. Falta ensayo upload HTTP en entorno protegido con usuarios legítimos.
2. Un archivo válido por MIME y extensión puede contener malware o bombas de descompresión. Antes del motor de IA: **cuarentena y análisis antimalware**, detección real del formato, límites de procesamiento, OCR y parsing seguro, no confiar en encabezado.
3. Los enlaces firmados permiten descargar durante su vigencia incluso si luego se suspende membresía; la aplicación debe limitar la duración (objetivo inicial **60 segundos**), no emitirlos a terceros ni guardarlos en logs, y controlar permisos al crearlos. No se implementó aquí un endpoint que emita URLs.
4. Los access tokens de Supabase pueden seguir siendo válidos hasta `exp` aun después de `signOut`. La política `auth.uid()` no consulta `auth.sessions` por cada lectura Storage. Para revocación estricta de acceso a documentos sensibles, usar un endpoint servidor que verifique sesión activa antes de cada descarga o configurar expiración muy corta, y evaluar impacto de tokens firmados ya emitidos. **No afirmar revocación inmediata de Storage por esta RLS.**
5. No hay todavía interfaz de upload, archivos reales, antivirus, tabla de auditoría/retención, limpieza de objetos huérfanos ni recuperación de backups; no avanzar a piloto documental hasta completar esas piezas.
6. El bucket es **privado** pero la lista de objetos puede ser visible para miembros activos de la misma empresa si su permiso SELECT lo permite. Los borradores más delicados podrían requerir acceso sólo al autor, decidido en Etapa 02.
7. No permitir acceso a oferentes de otras empresas mediante este bucket ni compartir ofertas fuera de las reglas de la ronda.

## Política de operación propuesta
Archivos de prueba únicamente, nunca comerciales; retención y cuota por empresa a definir antes de abrir acceso. En el futuro, almacenar hash criptográfico (SHA-256), identificación de responsable, versionado lógico y resultado de análisis en tabla privada, y definir borrado irreversible con respaldo/restauración verificables.

## Documentación oficial
- [Supabase — Access Control](https://supabase.com/docs/guides/storage/security/access-control)
- [Supabase — Storage buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals)
- [Supabase — Storage helper functions](https://supabase.com/docs/guides/storage/schema/helper-functions)
- [Issue #50](https://github.com/ProtectorRudo/Cotironda/issues/50)
- [PR #52](https://github.com/ProtectorRudo/Cotironda/pull/52)

## Etapa posterior — preflight implementado, no habilitado
La rama del [PR #54](https://github.com/ProtectorRudo/Cotironda/pull/54) prepara inspección conservadora de firmas/ZIP, validación de nombres de objeto y SDK `upload/download` contra Auth/Storage simulados. **No representa un upload HTTP real**, análisis malware, control de sesiones revocadas ni UI de archivos. Ver `docs/41-storage-preflight-http-contract.md`.
