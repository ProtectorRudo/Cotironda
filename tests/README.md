# Pruebas de Etapa 01

## Lógica TypeScript
Node ≥22.16: `node --experimental-strip-types --test tests/unit/*.test.mjs`.
El proyecto tiene 50 pruebas unitarias y estáticas en GitHub Actions.

## PostgreSQL real y aislado
`.github/workflows/postgres-rls.yml` levanta PostgreSQL 17 efímero en GitHub Actions, sin configurar Supabase ni modificar servicios existentes:
1. `supabase/tests/ci/00_bootstrap.sql` crea los roles mínimos y un stub de `auth.uid()` **solo para pruebas**.
2. `supabase/schema.sql` crea el esquema de aplicación, seguridad RLS y registro transaccional.
3. `supabase/tests/ci/10_tenant_rls.sql` prueba aislamiento A/B, anon, membresías y permisos.
4. `supabase/tests/ci/20_onboarding.sql` prueba alta SQL, proveedor inactivo, idempotencia y rollback.
5. `supabase/tests/ci/30_concurrency.sh` prueba dos altas simultáneas: una creación y un replay.

**Ejecutado y aprobado en CI:** https://github.com/ProtectorRudo/Cotironda/actions/runs/40856168116.

## Límites de estas pruebas
- Se emula `auth.uid()`; **no es Supabase Auth real**.
- No hay pruebas de cookies, sesión, CSRF, rate limiting, Storage privado, mensajes ni API HTTP.
- Los scripts pgTAP originales de `supabase/tests/01...` y `02...` siguen pendientes de ejecución en Supabase local.
- `supabase/schema.sql` sigue siendo **declarativo**, no una migración aplicada a un proyecto real.
- Antes de migraciones para Supabase, generar una migración con CLI compatible, revisarla, probarla en ambiente aislado y ejecutar advisors.
