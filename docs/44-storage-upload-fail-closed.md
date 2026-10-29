# 44 — Cierre preventivo de uploads directos hasta contar con antivirus backend

**29/10/2026 · Etapa 01 · Issue #59 / PR #60 draft, hijo de #58.**

## Hallazgo (seguridad de la cadena documental)
El bucket `cotironda-buyer-drafts` estaba privado y segmentado por empresa y sesión, pero autorizaba INSERT de `owner`/`manager` directamente desde clientes autenticados. El `prepararBorrador` comprueba firma PDF/imagen/Office y tamaño **en el navegador**. Este chequeo no se puede considerar barrera de seguridad: quien use directamente la API de Supabase Storage puede omitir el JavaScript del navegador. El bucket comprueba límites de tamaño/MIME configurados, **no garantiza escaneo antimalware ni autenticidad del contenido**. La apertura comercial sin pipeline de inspección sería prematura.

## Mitigación implementada en código
La 10ª migración `supabase/migrations/20261029213500_storage_upload_fail_closed.sql` ejecuta únicamente `DROP POLICY IF EXISTS cotironda_buyer_drafts_insert_manager ON storage.objects`, y una aserción que confirma que permanece la política SELECT de Cotironda con el guard privado `storage_session_active()`. No modifica bucket público/privado, tamaño, MIME, ownership, usuarios, sesiones, roles ni otras políticas.

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

## Verificación pendiente al preparar este documento
- Se esperan 4 workflows de CI verdes; luego aplicar migración solo a `cotironda-dev` y verificar 0 políticas de escritura, SELECT con guard vigente, 0 empresas/objetos y registro false.
- No se utiliza URL pública, no hay cambios en Hostinger/Vercel, no se hizo merge a `main`.

## Fuentes técnicas
- [Supabase: Storage access control](https://supabase.com/docs/guides/storage/security/access-control)
- [Supabase: buckets y límites](https://supabase.com/docs/guides/storage/buckets/fundamentals)
- [OWASP: File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)
- [Issue #59](https://github.com/ProtectorRudo/Cotironda/issues/59)
- [PR #60](https://github.com/ProtectorRudo/Cotironda/pull/60)
