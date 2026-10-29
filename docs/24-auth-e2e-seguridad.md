# 24 — E2E real de Supabase Auth: plan seguro y auditoría

**Estado:** preparado, NO ejecutado con JWT real. Requiere habilitar el Custom Access Token Hook en `cotironda-dev` y dos cuentas de prueba controladas. La cerradura SQL sigue apagada.

## Objetivo de aceptación
Comprobar de verdad que Supabase Auth emite un JWT firmado con `cotironda_email_verified`, que el sujeto de `getUser()` coincide con el JWT y que PostgREST rechaza las llamadas de registro mientras `cotironda_private.registration_settings.enabled=false`. Diferenciar el test SQL (claims simulados) de un test HTTP real de Auth.

## Runner preparado
Archivo: `apps/portal/scripts/auth-real-smoke.mjs`.

- `validarEntornoE2E` solo admite `https://qkercsoqhehbenbbncwk.supabase.co` y la referencia exacta del proyecto `cotironda-dev`.
- Se requiere una bandera específica `COTIRONDA_E2E_ALLOW_AUTH_REQUESTS=true`, dos usuarios de prueba distintos y contraseñas en variables locales de entorno. **Nunca escribir claves o contraseñas en GitHub, conversaciones, documentos o comandos compartidos.**
- Se usa exclusivamente una clave `sb_publishable_`, NO `service_role` ni clave SQL.
- El script no crea cuentas, no modifica correos ni activa registros.
- Toda llamada RPC utiliza un nombre deliberadamente **inválido de un carácter**; incluso si se hubiese activado la cerradura SQL por error, la validación del dominio impediría crear una organización.
- Comprueba acceso anónimo rechazado; sesión confirmada y claim firmado verdadero; RPC bloqueada por el flag SQL; una cuenta sin confirmar rechazada por Auth o con claim falso; cierra las sesiones de prueba.
- La API de Supabase debe devolver `registro_no_habilitado` para el usuario confirmado. Un error distinto indica falla o configuración inesperada: NO aceptar como prueba positiva.

## Variables obligatorias
En la terminal del entorno de pruebas, cargar sin compartir su contenido:

```text
COTIRONDA_E2E_PROJECT_REF=qkercsoqhehbenbbncwk
COTIRONDA_E2E_SUPABASE_URL=https://qkercsoqhehbenbbncwk.supabase.co
COTIRONDA_E2E_PUBLISHABLE_KEY=<clave pública del proyecto Cotironda>
COTIRONDA_E2E_ALLOW_AUTH_REQUESTS=true
COTIRONDA_E2E_VERIFIED_EMAIL=<cuenta de prueba confirmada>
COTIRONDA_E2E_VERIFIED_PASSWORD=<contraseña local>
COTIRONDA_E2E_UNVERIFIED_EMAIL=<cuenta de prueba sin confirmar>
COTIRONDA_E2E_UNVERIFIED_PASSWORD=<contraseña local>
```

Con el proyecto portal instalado, ejecutar `node scripts/auth-real-smoke.mjs` desde `apps/portal`. El runner presenta solo PASS/FAIL y nombres de chequeos, no imprime credenciales ni tokens.

## Activación controlada del hook (pendiente)
1. Confirmar estado de `cotironda-dev`, de ambas cerraduras y de la migración 5.
2. Acceder a Supabase → proyecto `cotironda-dev` → **Authentication → Hooks → Custom Access Token**. Elegir la función `cotironda_private.email_verified_access_token` si está disponible; comprobar en el panel si se admiten funciones del esquema privado antes de hacer cambios.
3. Si el panel exige una función del esquema público, NO mover ni exponer la función privilegiada. Preparar y probar aparte una envoltura `SECURITY INVOKER` de uso exclusivo de `supabase_auth_admin`.
4. Activar el hook **solo para Auth del proyecto de desarrollo**; verificar emisión de tokens para las cuentas de prueba y ejecutar el runner.
5. Si Auth/refresh falla o no aparece el claim, desactivar el hook para restaurar emisión de tokens y abrir Issue con el error acotado (no subir JWT ni credenciales).
6. Comprobar resultados de logs, seguridad y RLS. No activar la bandera SQL ni el registro en Vercel por completar el E2E.

## Límites y protección presupuestaria
- No existe en los conectores de Supabase habilitados una operación para **configurar** Auth Hooks; la migración SQL por sí sola **no activa** el hook.
- La cuenta SQL `postgres` administrada no permite asumir `supabase_auth_admin` para emularlo: Supabase reserva esa membresía. No afirmar que el hook corrió realmente como ese rol hasta verificarlo mediante Auth.
- Vercel WAF permite rate limit por IP, pero su configuración puede generar cargos. Debe consultarse presupuesto y definir ventana/límite/rollback antes de activar una regla. Además, el WAF del portal **no protege directamente la RPC de Supabase**; el riesgo de abuso directo sigue pendiente de medidas en la capa Supabase.
- El límite SQL actual de 5 altas por usuario en 24 horas afecta **altas efectivas**, no necesariamente intentos rechazados. No confundirlo con un rate limiter de intentos o una barrera anti-bot.
- No hay prueba de expiración/revocación de tokens ni E2E de cookies del navegador; requieren un flujo adicional con sesiones reales.
- Mantener `COTIRONDA_REGISTRATION_ENABLED=false` en Vercel y `registration_settings.enabled=false` en PostgreSQL.

## Fuentes
- https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook
- https://supabase.com/docs/guides/auth/auth-hooks
- https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting

## PR #22 — Auditoría adversarial de firma (no ejecutada contra Auth todavía)
- `src/server/auth-e2e-adversarial.ts`: toma un JWT legítimo recién emitido durante el test, altera únicamente su `sub` sin recalcular la firma y hace POST directo a `/rest/v1/rpc/register_company_for_current_user`.
- Exige respuesta HTTP 401/403 **con evidencia de rechazo por token, JWT o firma**. Un error de SQL (`registro_no_habilitado`), un rechazo por datos inválidos o un HTTP 200 **no cuentan como prueba aprobada**.
- Todo POST usa nombre `X` (longitud 1), inválido en la función SQL de registro. No se imprimen ni almacenan JWT, contraseñas o respuestas de usuario. Se exige endpoint exacto de `cotironda-dev`.
- Nueve pruebas unitarias nuevas prueban mutación de sujeto, integridad de la firma original y distinción entre fallos. La CI ejecuta además `node --check` sobre el script E2E sin enviar solicitudes.
- **Esta prueba adversarial real sigue pendiente** porque el Auth Hook no está activado y no existen cuentas de test en el proyecto. No afirmar que se probó criptografía a nivel red hasta ejecutar el script completo.
- Expiración y revocación auténticas continúan pendientes: no se presenta un token artificialmente alterado como equivalente a uno vencido pero correctamente firmado.
