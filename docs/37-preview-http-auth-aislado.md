# 37 — Next.js real por HTTP en Preview aislado, Auth completamente ficticio

**29/10/2026 · Etapa 01 · PR #48 draft hijo de #46.** Sin fusionar ni publicar.

## Objetivo
Antes había pruebas independientes del SDK y Proxy SSR con `fetch` simulado, además de smokes HTTP del portal cerrado y de `VERCEL_ENV=production`. Ninguna prueba enviaba una cookie de usuario al **servidor Next compilado realmente habilitado en Preview** y comprobaba a la vez renderizado, validación de sesión y rechazo de altas en la API.

## Contrato agregado
En `.github/workflows/portal-ci.yml` se agrega un **tercer build desde cero** con:
- `VERCEL_ENV=preview`, `COTIRONDA_REGISTRATION_ENABLED=true`, referencia fija `qkercsoqhehbenbbncwk` y origen HTTPS reservado ficticio.
- Publicable de Supabase **inventada** `sb_publishable_ci_dummy_never_valid`; **ningún** secret, contraseña comercial, conexión SQL ni usuario real.
- Las variables sólo existen en el proceso temporal de GitHub Actions. **No** se modifica Vercel, `main`, Supabase Auth ni `registration_settings`.

El smoke `apps/portal/scripts/smoke-preview-auth.mjs` usa `@supabase/ssr` real para iniciar una sesión **ficticia** mediante `fetch` simulado, y obtiene una cookie construida por la biblioteca. Luego levanta `next start` en `127.0.0.1:4175`.

El proceso servidor carga el interceptor `ci-auth-fetch-preload.cjs` mediante `NODE_OPTIONS`, y exige una bandera CI exclusiva. Intercepta toda llamada `fetch` hacia `https://qkercsoqhehbenbbncwk.supabase.co` y sólo responde ficticiamente a `/auth/v1/user`, `/auth/v1/token` y JWKS. Toda RPC/SQL, dominio remoto distinto o endpoint no permitido arroja error. El acceso HTTP de la prueba al loopback se permite. No se usan secretos de JWT: el token de prueba tiene una **firma obviamente inválida** y sólo el Auth falso lo acepta.

## Aserciones HTTP reales (servidor Next compilado)
1. `GET /ingresar` en Preview muestra el formulario y envía `Cache-Control` no-store.
2. `GET /alta` sin cookies no da acceso al formulario; redirige a `/ingresar`.
3. `GET /alta` con cookie SSR generada por SDK y admitida por Auth **simulado** devuelve el formulario de empresa.
4. Se adultera la firma dentro de la cookie SSR real y se espera rechazo de POST por el Auth simulado, sin confiar en la cookie.
5. `POST /api/organizaciones` sin sesión devuelve HTTP 401 `sesion_no_valida`.
6. `POST` con origen incorrecto devuelve HTTP 403 `origen_no_permitido`.
7. `POST` con la cookie admitida por Auth falso debe devolver HTTP 503 `limite_no_disponible`: **el guard de altas sigue cerrado incluso cuando la verificación de sesión resulta positiva**.
8. Se exige `no-store` en todas las respuestas examinadas y `GET` al endpoint sigue 405.

La prueba falló inicialmente por un error del propio generador de cookie adulterada: intentaba buscar la firma como texto visible, pero estaba dentro del contenido base64 serializado del SDK. Se corrigió decodificando la cookie, alterando sólo la firma, codificando nuevamente, y luego se aprobó en GitHub Actions.

## Evidencia
**Commit de código aprobado:** `5d0a2c6766c0a5c862c3f1d07ccb88c4244e2790`.
- [115/115 unitarias](https://github.com/ProtectorRudo/Cotironda/actions/runs/40927442418) — SUCCESS.
- [PostgreSQL 17, dos jobs y 7 migraciones](https://github.com/ProtectorRudo/Cotironda/actions/runs/40927442477) — SUCCESS.
- [Next.js con **tres builds** y smoke HTTP Preview](https://github.com/ProtectorRudo/Cotironda/actions/runs/40927442611) — SUCCESS. Log: `PASS: HTTP Next Preview real: cookies SSR, usuario ficticio, anonimato/rechazo, origen y alta 503 sin SQL/red.`
- [Sitio](https://github.com/ProtectorRudo/Cotironda/actions/runs/40927442458) — SUCCESS.

Comprobación independiente de la base de desarrollo **después** de CI: `registration_settings.enabled=false`, 2 usuarios de ensayo, 0 sesiones, 0 organizaciones, 0 miembros y 0 cuotas. Security Advisor conserva **1 WARN** de protección de contraseñas filtradas deshabilitada (Issue #44) y **1 INFO** sobre tabla privada RLS sin policy. No declarar 0 alertas.

## Límites de seguridad
- La sesión de Preview en este ensayo **no** fue firmada por Supabase Auth auténtico: no se probó JWT genuino revocado, renovación con cookies en navegador HTTPS real, ni el estado de sesión en `auth.sessions` remoto durante el POST. No comparar la validación ficticia con una firma criptográfica real.
- La aplicación de registro comercial continúa fallando cerrado en `src/server/limite-intentos.ts`; el SQL del proyecto permanece apagado. La ruta directa PostgREST aún requerirá ensayo remoto de cuota y 429 sin crear empresas ni exponer usuarios reales.
- El interceptor no sustituye aislamiento de red a nivel del sistema operativo. Para estos scripts, todo acceso a Supabase está interceptado y el flujo aprobado no realiza conexiones reales a Auth/PostgREST, pero no se afirma que se bloqueó cada posible transporte de red de Next.
- `main` está protegida; Vercel público sigue vinculado a `main`. El PR no puede fusionarse/publicarse sin autorización específica.

**Seguimiento:** [Issue #47](https://github.com/ProtectorRudo/Cotironda/issues/47) y [PR #48](https://github.com/ProtectorRudo/Cotironda/pull/48).
