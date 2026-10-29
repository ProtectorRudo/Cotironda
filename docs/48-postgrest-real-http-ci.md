# 48 — E2E HTTP de PostgREST auténtico con JWT firmado en CI efímera

**29/10/2026 · Etapa 01 · Issue #70.** Este ensayo ejecuta PostgreSQL y PostgREST auténticos en GitHub Actions. **No usa Supabase Auth real y no autoriza habilitar el portal.**

## Motivación

Hasta ahora los tests de la migración 7 probaban cuota y revocación mediante SQL con roles/claims emulados, mientras que el SDK de Next verificaba 429 mediante un transporte simulado. Faltaba comprobar el **HTTP real** cuando PostgREST valida criptográficamente el JWT, adopta el rol autenticado, invoca la RPC y convierte response.status en el código HTTP devuelto.

## Implementación

- .github/workflows/postgrest-http-real.yml: runner efímero con PostgreSQL 17, las 11 migraciones de Cotironda y PostgREST Docker v12.2.12 fijado por digest. Sin credenciales de Supabase ni datos comerciales.
- supabase/tests/ci/98_postgrest_http_fixture.sql: exige estar en la BD temporal cotironda_ci_http, vacía y con registro deshabilitado. Activa el registro **solo en esa BD de CI**, con dos usuarios y sesiones sintéticos.
- tests/integration/postgrest-http-real.mjs: firma HS256 mediante una clave aleatoria del runner; envía peticiones HTTP reales con nombre de empresa intencionalmente inválido, por lo que no se crean organizaciones.
- Comprueba: rechazo anónimo, firma de JWT adulterada, expiración de JWT, 20 rechazos durables y HTTP 429 en el intento 21, revocación de sesión con antiguo token todavía firmado, nueva sesión no rehabilita token anterior y cuota por usuario.
- El runner solo arranca si GITHUB_ACTIONS=true, PGDATABASE=cotironda_ci_http, PGHOST=127.0.0.1 y la bandera de pruebas está activa. El bloque finally cierra el registro, borra los fixtures y verifica ausencia de organizaciones y cuotas; el runner y contenedores son descartables.
- tests/unit/postgrest-http-ci.test.mjs protege las barreras contra introducir claves de Supabase o permitir scripts sin aislamiento.

## Límite de evidencia

**Es HTTP auténtico de PostgREST y SQL; la identidad se emula con JWT HS256 de CI.** NO demuestra la firma real de Supabase Auth, el efecto del logout real sobre tokens antiguos ni HTTP 429 en el gateway remoto. Ninguna cuenta real de cotironda-dev participa.

Si falla la descarga de la imagen Docker fijada, el job debe fallar: no se sustituirá por latest ni mocks. El test consume minutos limitados de GitHub Actions pero no crea servicios persistentes.

## Bloqueantes que quedan en Etapa 01

1. JWT genuino de Supabase Auth luego de revocación por HTTP, sin abrir registro comercial.
2. HTTP 429 remoto en PostgREST Supabase y cookies SSR en navegador HTTPS real.
3. Security Advisor: protección de contraseñas filtradas deshabilitada.
4. Revisión y consolidación de PRs apilados, sin integración a main ni autodespliegue Vercel.

**No modificar Supabase dev, Auth, Storage, Vercel, DNS, Hostinger, main ni producción.**

## Referencias

- https://docs.postgrest.org/en/v12/references/configuration.html
- https://docs.postgrest.org/en/v12/references/auth.html
- https://hub.docker.com/layers/postgrest/postgrest/v12.2.12/images/sha256-be3b6ab31a94e3e89f08edad40be0234ae0951e3297f2043d797c219165f5afa
- https://github.com/ProtectorRudo/Cotironda/issues/70
