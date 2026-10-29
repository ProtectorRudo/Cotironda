# 44 — Cierre preventivo de uploads directos hasta contar con antivirus backend

**29/10/2026 · Etapa 01 · Issue #59 / PR #60 draft, hijo de #58.**

## Hallazgo (seguridad de la cadena documental)
El bucket `cotironda-buyer-drafts` estaba privado y segmentado por empresa y sesión, pero autorizaba INSERT de `owner`/`manager` directamente desde clientes autenticados. El `prepararBorrador` comprueba firma PDF/imagen/Office y tamaño **en el navegador**. Este chequeo no se puede considerar barrera de seguridad: quien use directamente la API de Supabase Storage puede omitir el JavaScript del navegador. El bucket comprueba límites de tamaño/MIME configurados, **no garantiza escaneo antimalware ni autenticidad del contenido**. La apertura comercial sin pipeline de inspección sería prematura.

## Mitigación implementada en código
La 10ª migración `supabase/migrations/20261029211609_storage_upload_fail_closed.sql` ejecuta únicamente `DROP POLICY IF EXISTS cotironda_buyer_drafts_insert_manager ON storage.objects`, y una aserción que confirma que permanece la política SELECT de Cotironda con el guard privado `storage_session_active()`. No modifica bucket público/privado, tamaño, MIME, ownership, usuarios, sesiones, roles ni otras políticas.

El adaptador `subirBorrador()` de Next.js falla localmente con `carga_pendiente_revision_servidor`, **antes** de crear solicitudes HTTP. No reemplazar esto por un simple botón deshabilitado: el bloqueo efectivo está en la RLS de la base. `descargarBorrador()` sigue en el SDK de Supabase, sujeto a SELECT por membresía y sesión vigente.

## Compatibilidad de tests
- `94_storage_private_tenant.sql` y `95_storage_session_revocation.sql` describen el comportamiento válido **histórico** hasta la migración 9; se ejecutan antes de aplicar la 10.
- `96_storage_direct_upload_disabled.sql` describe el contrato nuevo: A con sesión activa puede leer un objeto de ensayo creado por la fixture, pero su intento de cargar otro PDF bien formado y en su propia empresa es rechazado. Un JWT antiguo tampoco puede leer. Todo en ROLLBACK.
- En reconstrucción de diez migraciones desde cero, correr tests históricos 94/95 inmediatamente antes de instalar la 10 y comprobar 96 después. No declarar que la suite 94 debe aprobar después del cierre de la carga: sería una expectativa obsoleta.
- El test HTTP del adaptador debe confirmar que `subirBorrador` no envía solicitudes, aun si el archivo tiene extensión/formato correcto. Las descargas autenticadas simuladas mantienen contratos previos.

## Flujo obligatorio futuro (no implementado)
1. Comprador con sesión auténtica presenta archivo ante una ruta de servidor, autenticada y protegida por cuotas, límite de tamaño y validación de origen; el comprador no recibe service_role.
2. Backend recibe contenido en espacio de cuarentena privado y transitorio, sin URL pública ni acceso a terceros; no publicar el borrador antes de inspección.
3. Comprobar firma/contenido real mediante parser aislado con límites de memoria, tiempo y descompresión; detectar macros, cifrado, bombas ZIP, malware, PDF activo y tipos no admitidos. Escáner a seleccionar y validar con pruebas conocidas (EICAR únicamente en entorno controlado).
4. Con aprobación positiva explícita del escaneo y un hash SHA-256 auditado, un worker con credenciales de servicio **solo del lado servidor** promociona el objeto a bucket privado de borradores y crea registro documental asociado a comprador/ronda.
5. Registro auditable de quién cargó, veredicto del scanner, nombre original sanitizado solo como metadata, consentimiento, fecha, expiración, tamaño, hash y consumo por empresa. Errores y reintentos idempotentes; limpieza de temporales/huérfanos.
6. Descarga con control de membresía y sesión vigente, sin URLs firmadas prolongadas. Retención/borrado definitivo, backups y restore testeado antes de piloto.

No se implementaron ni el antivirus ni el worker ni el endpoint. **Por diseño, los uploads permanecen temporalmente deshabilitados.**

## Verificación en Supabase dev real (29/10/2026)
- La décima migración está aplicada **únicamente en `cotironda-dev`**, con versión definitiva asignada por Supabase **`20261029211609_storage_upload_fail_closed`**. Archivo y manifiesto GitHub reconciliados.
- Consultas posteriores en la base administrada: `pg_policies` ahora contiene exactamente **una política de Cotironda SELECT**, `cotironda_buyer_drafts_read_member`, `TO authenticated` y `storage_session_active()` presente. **No hay política INSERT/UPDATE/DELETE/ALL** en `storage.objects`. El bucket sigue `public=false`, 0 empresas, 0 sesiones, 0 archivos y `registration_settings.enabled=false`.
- Se ejecutó el script `supabase/tests/manual/12_storage_direct_upload_disabled_rollback.sql` contra la **base administrada real**: crea temporalmente una empresa y una sesión del usuario de ensayo confirmado, además de un registro de metadata de objeto, sin cargar bytes. Con `ROLE authenticated` y claims sintéticos, verifica SELECT positivo, INSERT directo denegado aun siendo owner y SELECT denegado tras revocar la sesión. Resultado final de `ROLLBACK`: `organizations_after=0`, `memberships_after=0`, `objects_after=0`, `sessions_after=0`, `registration_enabled=false`.
- La prueba real mencionada verifica **RLS SQL** con claims emulados; no valida HTTP firmado, ni debe contarse como escaneo antivirus o subida/descarga de archivos físicos.
- No se utiliza URL pública, no hay cambios en Hostinger/Vercel, no se hizo merge a `main`.

## Fuentes técnicas
- [Supabase: Storage access control](https://supabase.com/docs/guides/storage/security/access-control)
- [Supabase: buckets y límites](https://supabase.com/docs/guides/storage/buckets/fundamentals)
- [OWASP: File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)
- [Issue #59](https://github.com/ProtectorRudo/Cotironda/issues/59)
- [PR #60](https://github.com/ProtectorRudo/Cotironda/pull/60)
