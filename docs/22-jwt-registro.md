# 22 — Registro ligado al JWT y doble bloqueo de seguridad

**Actualización:** este documento describe también riesgos detectados en la cuarta migración. La quinta migración resuelve la advertencia de función pública SECURITY DEFINER y añade confirmación de correo mediante hook firmado. Ver [`23 — auditoría actual`](23-hook-correo-auditoria.md). Los límites de E2E y el interruptor DB deshabilitado se mantienen.

**Estado:** implementación en rama de desarrollo; migración aplicada en `cotironda-dev` con registro deshabilitado.

## Vulnerabilidad previa
El backend podía llamar PostgreSQL con un `p_user_id` elegido por la aplicación. Si se comprometía la conexión SQL, un atacante podía solicitar el alta a nombre de otro usuario.

## Flujo propuesto
1. Next.js valida la sesión vía `supabase.auth.getUser()` con el cliente SSR y exige correo confirmado y usuario no anónimo.
2. El servidor llama `supabase.rpc('register_company_for_current_user', ...)` con ese **mismo cliente**, sin enviar `user_id`.
3. PostgREST verifica el JWT y establece el contexto de los claims antes de ejecutar PostgreSQL.
4. La función `public.register_company_for_current_user` extrae `sub`, `role` e `is_anonymous` del contexto `request.jwt.claims` / `request.jwt.claim`. Se verificó el código de `auth.uid()` y `auth.jwt()` en Supabase: leen los mismos ajustes. Se evitó usar el esquema interno `auth` desde el propietario restringido.
5. La RPC rechaza rol distinto de `authenticated`, JWT sin `sub` y `is_anonymous` distinto de `false`. La función privada de alta crea organización, propietario y perfil en una transacción, con idempotencia y cuota diaria.
6. El rol heredado `cotironda_app` ya no tiene acceso a la función con `p_user_id` ni al esquema privado. No existe conexión SQL en el backend del portal.

## Doble interruptor
- El portal exige `COTIRONDA_REGISTRATION_ENABLED=true` y referencia exacta de Supabase. En Vercel continúa `false`.
- Independientemente de Vercel, la tabla privada `cotironda_private.registration_settings` contiene `enabled=false`. Solo administración SQL puede activarla; los usuarios no pueden modificarla. Con `false` incluso un JWT válido queda bloqueado.

## Auditoría real y evidencia
- Migración oficial aplicada en `cotironda-dev`: `20261029120021_jwt_bound_registration_locked`, con SQL idéntico al archivo versionado en `supabase/migrations/`.
- Pruebas PostgreSQL 17, además de ejecución sobre Supabase real, con dos usuarios ficticios, JWT simulado, rol erróneo, usuario anónimo, repetición de solicitud y doble bloqueo. Se ejecutaron dentro de `BEGIN/ROLLBACK`; cero organizaciones y membresías de prueba persistentes.
- Compilación de Next.js y tests unitarios automatizados. Se eliminó `pg`, `@types/pg` y el adaptador SQL directo. Lockfile actualizado por GitHub Actions.
- **Supabase Security Advisor tiene una advertencia WARN: `authenticated_security_definer_function_executable`**, además de observaciones INFO. Es una advertencia deliberadamente no descartada: la RPC de `public` usa `SECURITY DEFINER`, si bien su propietario `cotironda_registrar` no tiene LOGIN/BYPASSRLS ni es propietario de las tablas, y tiene `search_path` vacío.
- Referencia JWT: https://supabase.com/docs/guides/auth/jwt-fields
- Referencia funciones: https://supabase.com/docs/guides/database/functions

## Riesgos todavía abiertos — bloqueantes
1. **No hay prueba E2E con un JWT real firmado**, entregado por Supabase Auth y validado por PostgREST; los tests SQL emulan el contexto de los claims y no la criptografía.
2. Un usuario autenticado puede invocar la RPC sin pasar por Next. La verificación de correo existe en el servidor, pero **todavía no está garantizada en la RPC**; no habilitar `registration_settings.enabled` hasta resolver esto y verificar el comportamiento de correo confirmado.
3. Cualquier conexión SQL directa con capacidad de establecer variables de sesión puede falsificar el contexto de claims. Ninguna credencial directa se entrega a Vercel; mantener el acceso solo mediante PostgREST.
4. Falta rate limiting por IP/sesión, sesiones revocadas, prueba de cookies en navegador, monitoreo y registro de auditoría.
5. Revaluar la advertencia `SECURITY DEFINER` antes de habilitar la RPC: considerar reducir superficie, API específica o funciones con invocador restringido sin pérdida del vínculo de identidad.

**No integrar PRs apilados ni publicar o habilitar altas comerciales.** La demo pública de Cotironda no se modificó.
