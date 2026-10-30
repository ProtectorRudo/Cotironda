# 52 — Prueba auténtica de revocación JWT sin crear empresas (Etapa 01)

**Issue #78 · PR en borrador · 29/10/2026.**

## Hallazgo y diseño

La migración 12 `20261029234236_commercial_session_guard.sql` ya está instalada **solo** en `cotironda-dev`. La prueba de la RPC de registro no permite demostrar el efecto real del logout, porque `cotironda_private.registration_settings.enabled=false` bloquea todas las altas incluso con sesión vigente. Se necesita un **control positivo antes** y uno **negativo después**, sin levantar esa bandera.

Auditoría SQL read-only confirmó:
- `public.catalog_categories` tiene **cinco categorías activas**, sembradas en la primera migración.
- La política `categories_read_active` permite SELECT a `authenticated` y exige `cotironda_private.storage_session_active()`; `anon` no tiene privilegios SELECT.
- `auth.sessions`, `public.organizations` y Storage siguen sin registros; no hay clientes comerciales.

Las categorías activas son un **marcador de lectura segura**, sin crear una empresa ficticia ni permitir subidas.

## Cambios en el runner real

`apps/portal/scripts/auth-real-smoke.mjs` ya exigía dos cuentas exclusivas de ensayo en variables **locales y privadas**, el ref de `cotironda-dev`, un token publicable, y `COTIRONDA_E2E_ALLOW_AUTH_REQUESTS=true`. Se agregó:

1. El login verificado se contrasta con `auth.getUser()`, `auth.getClaims()`, la identidad y el claim `cotironda_email_verified`. Debe quedar **más de 120 segundos antes de `exp`**, para que la expiración natural no se confunda con logout.
2. Antes del logout se consulta exactamente `GET /rest/v1/catalog_categories?select=code&is_active=eq.true&order=code.asc`, con el access JWT obtenido **de Auth real**, sobre el origen fijo `https://qkercsoqhehbenbbncwk.supabase.co`.
3. Ese primer GET debe responder **HTTP 200 y al menos una categoría válida**. `[]`, 401, 403, timeout, error de red, JSON incorrecto o un catálogo vacío se consideran **FAIL**.
4. El script conserva el mismo access token en memoria (nunca escribe JWT a disco ni a logs), solicita `signOut({scope:'global'})` solo para la **cuenta dedicada de pruebas** y comprueba que el SDK limpió su sesión.
5. Con el **mismo JWT original, sin refresh**, se repite exactamente el GET. Se exige **HTTP 200 y `[]`**, una denegación de lectura por RLS. Se vuelve a confirmar que el JWT todavía tiene más de 120 segundos de vigencia; así no se acepta una negación causada por expiración o firma inválida.
6. Por seguridad, toda solicitud al catálogo usa método **GET**, `credentials:'omit'`, `cache:'no-store'`, `redirect:'error'`, apikey **publicable** y token original; no se consulta ninguna tabla privada, no se envían objetos comerciales y no se llama ninguna RPC como parte de este paso.
7. El cierre de sesión se realiza en `finally`, incluso si una comprobación falla. No usar cuentas personales: el **logout global** revoca también otras sesiones de la cuenta de ensayo.

## Tests automatizados y límites

`src/server/auth-e2e-catalog-revocation.ts` contiene el cliente HTTP delimitado y las comprobaciones deterministas. `tests/unit/auth-real-revoked-catalog.test.mjs` prueba casos positivos/adversariales **sin ninguna llamada remota**: baseline vacío, filas duplicadas, payload malformado, URL de otro proyecto, token vencido o a punto de vencer, 401/403 engañosos, respuestas de error, posibles fugas de datos y verificación de que el script conserva el token inicial hasta después del signOut.

**Evidencia que NO tenemos todavía:** ni CI ni el conector Supabase tienen las contraseñas privadas de las dos cuentas de ensayo, y no deben acceder a ellas. Por lo tanto, la ejecución real del runner **NO se afirma exitosa** hasta que se corra localmente con credenciales privadas del propietario y el resultado se corrobore con lectura SQL (registro false, 0 sesiones/empresas/objetos). Los tests offline y PostgreSQL/PostgREST de CI no sustituyen esta comprobación.

## Protocolo de ejecución privada (sin compartir secretos)

1. Usar únicamente una computadora de ensayo, con `apps/portal` y sus dependencias fijadas instaladas mediante `npm ci --ignore-scripts`.
2. Configurar **localmente**, en el propio proceso, las variables documentadas en `docs/24-auth-e2e-seguridad.md`, incluido el correo/password de las **dos cuentas dedicadas**, clave `sb_publishable_`, ref y URL exactos y bandera de consentimiento de prueba.
3. Ejecutar desde `apps/portal`: `node scripts/auth-real-smoke.mjs`. Nunca añadir los secretos a GitHub Actions, a `.env` versionados, ni a chats. Evitar comandos que expongan contraseñas en historial o en capturas.
4. El script imprime **solo nombres de controles PASS/FAIL**, sin volcar usuarios, JWT, passwords o refresh tokens.
5. Ante un FAIL, no activar banderas SQL ni abrir registro; inspeccionar de forma privada el motivo. Si Auth rechaza logout, cerrar sesiones de la cuenta dedicada desde el panel.
6. Al finalizar, verificar por SQL read-only que no hay sesiones, empresas ni archivos, sin copiar información personal.

**Las pruebas de cookies SSR reales en HTTPS y HTTP 429 del gateway Supabase siguen pendientes.** También permanece el WARN de protección de contraseñas filtradas (según plan de Supabase); no se alteraron políticas o costos para este ensayo.

## Fuente de verdad
- [Documentación Supabase sobre sesiones](https://supabase.com/docs/guides/auth/sessions).
- [Guía avanzada SSR](https://supabase.com/docs/guides/auth/server-side/advanced-guide).
- [Migración 12 aplicada en dev](51-commercial-session-migration.md).
- [Issue #78](https://github.com/ProtectorRudo/Cotironda/issues/78).


## Requisito adicional de seguridad de cuentas (PR #83)

El E2E auténtico **no debe ejecutarse con contraseñas compartidas o divulgadas**. Rotar ambas cuentas de ensayo con secretos **nuevos y diferentes**; longitud mínima 12. En lugar del comando `node scripts/auth-real-smoke.mjs` indicado arriba, usar **`npm run e2e:auth:dev`** desde `apps/portal` (Node 22, importaciones TypeScript). GitHub Actions/CI/Vercel deniegan ese comando de forma intencional. Para detalles de preflight y rotación, ver `docs/54-e2e-auth-secret-preflight.md`. La ejecución real sigue **pendiente**.
