# 43 — Revocación inmediata de sesiones en Storage privado de Cotironda

**29 de octubre de 2026 · Etapa 01 · Issue #57 / PR #58 (draft).** Sólo `cotironda-dev`, sin abrir registro ni publicar.

## Hallazgo y amenaza
Hasta la migración 8, las políticas `cotironda_buyer_drafts_read_member` y `cotironda_buyer_drafts_insert_manager` confirmaban la membresía activa, el rubro de la organización y la ruta, pero **no** la vigencia del `session_id` en `auth.sessions`. Un access token JWT firmado puede seguir siendo válido hasta su expiración después de cerrar sesión. Esto permitía potencialmente acceder a un borrador privado incluso cuando esa sesión había terminado, si la membresía persistía.

## Solución instalada (migración 9)
`supabase/migrations/20261029202610_storage_session_revocation.sql` — **versión sincronizada con el historial real de Supabase dev**.

1. Crea `cotironda_private.storage_session_active()`: función **sin parámetros**, `SECURITY DEFINER`, dueña `postgres`, `search_path=''`, en esquema privado no expuesto por Data API.
2. Extrae identidad únicamente de `auth.jwt()` / `auth.uid()`: exige `role=authenticated`, `is_anonymous=false`, `cotironda_email_verified=true`, `sub` coherente con `auth.uid()` y `session_id` con UUID válido. Un UUID malformado devuelve `false` sin filtrar datos de Auth.
3. Consulta `cotironda_private.is_session_verified(user_id,session_id)` ya existente y auditada: verifica que la fila `auth.sessions` exista y corresponda al mismo usuario, que `not_after` no esté vencido, correo realmente confirmado, usuario no anónimo, no eliminado ni suspendido.
4. **EXECUTE sólo para `authenticated`**. No permite invocar la función interna con usuario/sesión arbitrarios; `anon`, `PUBLIC` y `service_role` no reciben EXECUTE. No se amplió acceso directo a `auth.sessions`.
5. Reemplaza atómicamente únicamente las dos políticas RLS del bucket `cotironda-buyer-drafts`. Tanto `SELECT` como `INSERT` exigen ahora `(select cotironda_private.storage_session_active())` **además** de los filtros de membresía, organización, ruta y rol existentes. No agrega UPDATE, DELETE, políticas anónimas ni acceso a otros buckets.

El primer test de la expresión regular UUID incluía por error un grupo extra, por lo que el guard bloqueaba incluso sesiones vigentes. La CI detectó el fallo; se corrigió a **UUID 8-4-4-4-12**, y se reejecutaron ambos recorridos de PostgreSQL antes de aplicar a desarrollo. Se retiró el diagnóstico temporal de la CI.

## Evidencia de ejecución PostgreSQL 17
`supabase/tests/ci/95_storage_session_revocation.sql` usa datos y claims emulados dentro de `BEGIN/ROLLBACK`, y verifica:
- A con sesión confirmada vigente: puede leer y crear su objeto de borrador.
- Se elimina su sesión de Auth: el **JWT sintético anterior** no puede leer ni cargar.
- Se crea una nueva sesión del mismo usuario: el token anterior sigue rechazado, el nuevo funciona.
- Sesión ajena, correo no confirmado aunque el claim simulado diga true, claim falso, sesión vencida, identificador malformado y rol incorrecto: rechazados.
- Un usuario B activo no ve los objetos de A.
- Los permisos del helper, propiedad, ubicación y políticas se examinan en CI.
- `94_storage_private_tenant.sql` sigue probando aislamiento por empresa, con sesiones sintéticas añadidas para funcionar tanto antes como después de la migración 9.

## Evidencia independiente sobre Supabase real
Se aplicó **únicamente** en el proyecto `cotironda-dev`. Supabase asignó oficialmente la versión `20261029202610_storage_session_revocation`. Verificación posterior de sólo lectura:
- Función en esquema privado, `SECURITY DEFINER` con owner `postgres`, invocable por `authenticated` y **no** por `anon` ni `service_role`.
- Dos políticas Storage, una SELECT y otra INSERT, incluyen el guard de sesión.
- Se ejecutó `supabase/tests/manual/11_storage_revoked_session_rollback.sql` con **una cuenta real confirmada y otra pendiente** como identidades, pero claims de JWT emulados en SQL. Se crearon exclusivamente en la transacción dos empresas/membresías, dos sesiones Auth de prueba iniciales y filas de metadatos Storage. Resultado: acceso activo permitido, cuenta sin confirmar bloqueada, sesión eliminada denegada, nuevo login ficticio permitido sin revivir el viejo, y `not_after` vencido denegado. Todo terminado con `ROLLBACK`.
- Salida verificada al finalizar: **0 sesiones, 0 empresas, 0 miembros, 0 objetos**, `registration_settings.enabled=false`.
- Security Advisor después de instalar: **1 WARN** conocido por protección de contraseñas filtradas deshabilitada (Issue #44) y **1 INFO** de RLS de tabla privada deliberadamente sin policy; ninguna advertencia nueva.

## Límites que NO se deben confundir
- La verificación real anterior es **PostgreSQL** con claims emulados, no un JWT auténtico firmado y presentado al gateway de Storage por HTTP. La firma la valida Supabase al procesar una solicitud real. Falta E2E con credenciales privadas de ensayo para comprobar el recorrido Auth→Storage HTTP y formato/tamaño.
- Las URL firmadas de descarga emitidas antes de una revocación pueden continuar funcionando **hasta su vencimiento**, fuera de esta política; no emitir URLs en el MVP sin guard servidor y TTL corto.
- No hay malware scanning, cuarentena, control de versiones/retención, backups verificados ni manejo de cargas del comprador en UI. Se exige completar estas piezas antes de abrir archivos comerciales.
- El helper revisa `auth.sessions` en cada operación SQL relevante (por sentencia, sujeto a snapshot/condiciones transaccionales). No garantiza bloquear una descarga física ya iniciada ni contenido previamente descargado.
- No usar `service_role` desde el navegador: podría evadir estas políticas. No se modificó el Auth Hook ni el registro de empresas.

## Referencias
- [Supabase — Storage Access Control](https://supabase.com/docs/guides/storage/security/access-control)
- [Supabase — Auth sessions](https://supabase.com/docs/guides/auth/sessions)
- [Issue #57](https://github.com/ProtectorRudo/Cotironda/issues/57)
- [PR #58](https://github.com/ProtectorRudo/Cotironda/pull/58)

## Actualización de seguridad (PR #60, posterior a este informe)
La política INSERT abierta a owner/manager en esta migración 9 se reemplaza en la migración 10 por **denegación de cargas directas de todos los usuarios**, mientras no exista control antimalware en backend. Se mantiene SELECT con sesión vigente. Ver `docs/44-storage-upload-fail-closed.md`.
