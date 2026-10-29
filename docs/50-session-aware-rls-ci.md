# 50 — Sesión revocada en RLS comercial: hallazgo y ensayo de corrección en CI

**Etapa 01 · 29/10/2026 · Issue #74 · PR #75 en borrador, hijo de PR #73.**

## Hallazgo real en cotironda-dev (consulta read-only)

Siete tablas comerciales tienen **23 políticas RLS**, de las cuales **17 son para el rol `authenticated`** y seis pertenecen exclusivamente a `cotironda_registrar`. Las 17 de clientes no comprobaban la existencia de `session_id` en `auth.sessions`. Eso deja una ventana posible en la que un JWT todavía firmado puede leer datos comerciales después de cerrar sesión, hasta la expiración del token. Las seis del rol `cotironda_registrar` siguen protegidas por la función privada de registro, que exige sesión vigente.

Este riesgo **no significa filtración demostrada de datos reales**: el entorno Supabase `cotironda-dev` tenía registro apagado y cero empresas/sesiones comerciales/archivos durante la auditoría. Es una ausencia de control que debe cerrarse antes de abrir el portal.

## Enfoque de seguridad

1. Conservar reglas existentes de empresa, membresía y rol. Agregar una condición **AND** de `cotironda_private.storage_session_active()` en `USING` y `WITH CHECK` según el comando (SELECT, INSERT, UPDATE, DELETE).
2. Reutilizar el helper que ya valida el JWT actual, `auth.uid()`, identidad no anónima/correo confirmado, sesión existente/no vencida y usuario activo, sin pasar IDs controlados por el cliente. El nombre actual del helper es histórico de Storage, pero su lógica aplica también a las tablas comerciales.
3. Mantener sin modificar las seis policies internas de `cotironda_registrar`, que solo se alcanzan mediante RPC autenticada y guarda de sesión propia.
4. Rechazar cambios si el inventario de políticas difiere: exactamente 23, exactamente 17 `authenticated`, nombres esperados y permisos vigentes.
5. No otorgar nuevos privilegios ni quitar RLS, ni abrir registro. Evitar dependencia directa de `user_metadata` editable.

## Implementación **SOLO de prueba**

`supabase/tests/ci/100_session_rls_hardening_draft.sql` es una propuesta ejecutada exclusivamente en `cotironda_ci_http`, base efímera de GitHub Actions. **NO ES una migración oficial**, no se registró en `supabase/migrations/` y **NO se aplicó a cotironda-dev**. La conversión a migración debe realizarse con el CLI de Supabase y revisión independiente de políticas y rendimiento.

El runner HTTP de PostgREST ahora prueba una lectura/edición legítima por el dueño de empresa, la posterior desaparición de su fila en `auth.sessions`, y el rechazo de lectura y escritura con el **mismo JWT firmado**. Al crear otra sesión, vuelve el acceso legítimo pero el token anterior no revive.

**Corrección al banco de pruebas:** el fixture PostgreSQL CI `auth.uid()` leía solo el GUC legado `request.jwt.claim.sub`; PostgREST moderno suministra principalmente `request.jwt.claims` JSON. El helper sintético se actualizó para utilizar el `coalesce` oficial, sin alterar el `auth.uid()` gestionado por Supabase real. Fuente: https://github.com/supabase/auth/blob/master/migrations/20220224000811_update_auth_functions.up.sql.

## Evidencia CI verificada (antes de registrar este documento)

Commit `5197d44c8bdf48557c9c9632ebeefa0164283868`:

- **PostgREST real + RLS sesión vigente/revocada: SUCCESS**, https://github.com/ProtectorRudo/Cotironda/actions/runs/40972772366
- **149/149 unitarias: SUCCESS**, https://github.com/ProtectorRudo/Cotironda/actions/runs/40972772382
- PostgreSQL 17 y pruebas históricas: https://github.com/ProtectorRudo/Cotironda/actions/runs/40972772314
- Portal Next.js, SSR y HTTP Preview ficticio: https://github.com/ProtectorRudo/Cotironda/actions/runs/40972772427
- Sitio: https://github.com/ProtectorRudo/Cotironda/actions/runs/40972772197

**5/5 workflows SUCCESS.** Los logs de PostgREST prueban explícitamente que un JWT revocado ya no puede leer o escribir y que una nueva sesión no rehabilita el token anterior; la limpieza dejó cero empresas y sesiones sintéticas.

## Pendientes / puerta de publicación

- Generar **migración formal número 12** con Supabase CLI (no inventar timestamp), incorporar tests de reconstrucción 12 migraciones y revisión de performance y de los predicados resultantes, aplicar exclusivamente a dev solo tras validación; el SQL `100` NO debe aplicarse manualmente fuera de CI.
- Validar **Auth real de Supabase** y las cookies SSR HTTPS tras logout en ambiente controlado; la firma HS256 del runner es simulada, aunque PostgREST y SQL sean reales.
- Probar HTTP 429 remoto sin habilitar altas reales, revisar advertencia de protección de contraseñas filtradas, y auditar la integración de PRs antes de tocar main.
- Permanecen prohibidos la carga comercial de documentos, los mensajes a proveedores y el despliegue sin `Publicalo`.

**Producción, `main`, Vercel, DNS/Hostinger y Supabase remoto sin cambios por este PR.**
