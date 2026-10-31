# 32 — Reconstrucción de Etapa 01 usando únicamente las migraciones

**29/10/2026. Rama de desarrollo/PR #39 en borrador. No aplicar a producción.**

## Hallazgo
La CI original de PostgreSQL inicia desde `supabase/schema.sql` y aplica las migraciones 2 a 7. Comparación de código: `schema.sql` y la primera migración histórica de Cotironda contienen **la misma SQL efectiva** (las líneas de comentarios son diferentes). Sin embargo, para una instalación verificablemente reproducible, hace falta ejecutar la cadena versionada de principio a fin y no depender de otro archivo inicial.

## Solución
- Tests unitarios `tests/unit/migration-chain.test.mjs`: los siete archivos/versiones históricos exactos, orden estricto sin duplicados, y comparación de SQL efectiva (ignorando comentarios de línea y blancos) entre esquema declarativo y migración 1.
- Job CI nuevo e independiente `migrations-from-zero` en `.github/workflows/postgres-rls.yml`, PostgreSQL 17 efímero; genera sólo los roles `auth` emulados mediante `supabase/tests/ci/00_bootstrap.sql`. **No usa schema.sql**; aplica las 7 migraciones secuencialmente desde `supabase/migrations/*.sql` con `ON_ERROR_STOP=1`.
- Chequeo final de flag de registro deshabilitado, denegación de acceso a tabla privada, denegación RPC anon y función pública con `SECURITY INVOKER`.
- Ejecución de la suite SQL `91_rate_limit.sql` (alta, replay, idempotencia, errores, cuotas y sesión revocada), las 40 conexiones concurrentes de `92_rate_limit_concurrency.sh`, y comprobación de limpieza (0 usuarios, 0 sesiones, 0 empresas, 0 filas de cuota y flag SQL apagado).

## Defecto detectado por el nuevo ensayo y corregido
En la primera ejecución con todas las migraciones, las siete migraciones, la suite y las 40 solicitudes **sí pasaron**, pero el último control de limpieza detectó filas sobrantes. El `trap cleanup` del script `92_rate_limit_concurrency.sh` intentaba eliminar `auth.users` antes de eliminar su sesión hija. El PostgreSQL de CI define `auth.sessions.user_id` con FK no cascading; el DELETE del usuario fallaba y el bloque `|| true` ocultaba ese defecto.

Se corrigió **solo el orden de limpieza del fixture sintético**: primero borrar `auth.sessions` por ID conocido, luego `auth.users`; después, la FK `ON DELETE CASCADE` de `registration_attempt_quotas` remueve el contador. El check de la CI detectaría futuras regresiones. No cambian tablas ni scripts SQL aplicados a Supabase real.

## Alcance y límites
Esta CI es PostgreSQL efímero con emulación de `auth.users` y `auth.sessions`, **no** Supabase Auth real ni JWT firmado por el servicio. No sustituye el Custom Access Token Hook, las pruebas SSR/cookies o el 429 de PostgREST remoto. El historial remoto de `cotironda-dev` permanece con siete migraciones, registro cerrado; no se tocan bases existentes.

## Despliegue
- Trabajo sobre rama hija de #36, PR #39 borrador, sin integrar a `main`.
- `main` continúa sin protección obligatoria, y Vercel público despliega desde `main`: issue bloqueante #37.
- Nunca pasar las credenciales reales de Supabase a runners de CI para esta prueba; emulación local con password descartable.

## Evidencias
- [Issue #38](https://github.com/ProtectorRudo/Cotironda/issues/38)
- [PR #39](https://github.com/ProtectorRudo/Cotironda/pull/39)
- [Issue de protección de main #37](https://github.com/ProtectorRudo/Cotironda/issues/37)
