# 23 — Auditoría de Auth Hook y RPC sin elevación pública

**Fecha:** 29/10/2026. **Estado:** mejora aplicada y probada en desarrollo; no hay habilitación comercial.

## Hallazgos originales
1. El Security Advisor emitía `authenticated_security_definer_function_executable`: una RPC de `public` estaba habilitada para usuarios autenticados y ejecutaba con privilegios del propietario.
2. Una persona con JWT válido podía llamar la RPC directamente, sin pasar por la verificación `email_confirmed_at` del servidor Next.js.

## Correcciones realizadas
- Migración oficial `supabase/migrations/20261029122708_invoker_verified_email_hook.sql` aplicada a `cotironda-dev`.
- RPC pública ahora `SECURITY INVOKER`: el rol `authenticated` no hereda privilegios para escribir tablas.
- La operación con privilegios está en `cotironda_private.register_company_with_verified_claim`, cuyo propietario `cotironda_registrar` no puede LOGIN, no es dueño de las tablas y no tiene BYPASSRLS; `search_path=''`.
- La función privada no acepta un parámetro de usuario. Obtiene el sujeto del JWT asignado por PostgREST; exige rol `authenticated`, `is_anonymous=false` y un **claim firmado de confirmación** `cotironda_email_verified=true`. Valor falso o ausente deniega.
- Hook `cotironda_private.email_verified_access_token(event jsonb)`, `SECURITY INVOKER`, destinado a Supabase Auth. Calcula el claim usando exclusivamente `auth.users.email_confirmed_at` y `auth.users.is_anonymous`, no `raw_user_meta_data` editable.
- `authenticated` no puede ejecutar el hook ni leer `auth.users`. `supabase_auth_admin` tiene los permisos necesarios; comprobado en la instancia real.
- Dos interruptores de registro siguen apagados: `COTIRONDA_REGISTRATION_ENABLED=false` en Vercel de desarrollo y `cotironda_private.registration_settings.enabled=false` en PostgreSQL.

## Verificación en Supabase real
- SQL aplicado y registrado con versión `20261029122708`.
- Suite funcional ejecutada en transacción reversible **después de migrar**: bloqueo por flag BD, JWT sin claim, correo no verificado, usuario anónimo, metadatos manipulados, creación autorizada solo de prueba e idempotencia. Finalizó con ROLLBACK.
- Verificación posterior: `public.prosecdef=false`, función privada `prosecdef=true`, permisos Auth correctos, **0 empresas/membresías/altas persistidas**.
- **Security Advisor: sin alertas WARN/ERROR**; observaciones INFO por RLS deliberadamente cerrada e índices recién creados.
- CI en PR #18 ejecuta PostgreSQL 17, unit tests, Next build/smoke HTTP y pruebas de sitio.

## Puesta en marcha del hook — pendiente, NO ejecutar aún en público
1. Desde Supabase **solo en el proyecto `cotironda-dev`**, revisar Authentication → Hooks → Custom Access Token.
2. Seleccionar `cotironda_private.email_verified_access_token` (si la interfaz admite el esquema privado) y activar la integración. Esto cambia la emisión de JWT, por eso hay que tener un plan de rollback desactivando ese hook.
3. Verificar con usuario de prueba correo sin confirmar y correo confirmado. Comprobar el JWT realmente firmado usando la API de Auth y llamadas reales a PostgREST, incluso reenvío de JWT vencido/anon y bypass del servidor Next.
4. Comprobar que no hubo errores de emisión de JWT/refresh; desactivar el hook ante errores.
5. Validar consentimiento, antifraude y rate limits antes de habilitar cualquier interruptor de registro. **No activar `registration_settings.enabled` ni el flag de Vercel aún**.

## Riesgos pendientes
- La prueba SQL emula claims: no verifica la firma JWT ni el disparo efectivo del hook. Falta E2E con Supabase Auth real.
- Un claim firmado puede quedar desactualizado durante la vida de un token si cambia el estado del correo. Definir TTL/refresh y revocación de sesiones; documentar riesgos.
- La función privada es invocable dentro de PostgreSQL por `authenticated` porque la envoltura `SECURITY INVOKER` la llama. Se mantiene en esquema **no expuesto** por Data API; auditar la configuración de exposición y errores.
- Falta control de frecuencia por IP y sesión además de la cuota SQL, monitoreo y alarmas.
- Quedan PRs de Etapa 01 apilados; `main` y producción comercial siguen intactos.

## Referencias
- https://supabase.com/docs/guides/observability/advisors?lint=0029_authenticated_security_definer_function_executable
- https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook
- https://supabase.com/docs/guides/auth/users
