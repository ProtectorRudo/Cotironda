# 36 — Revocación de sesiones contra la RPC actual (migración 7)

**29/10/2026 · Etapa 01 · PR #46 draft sobre #43 · Sin publicaciones ni migraciones nuevas.**

## Hallazgo auditado
La prueba histórica `supabase/tests/ci/80_session_revocation.sql` se ejecuta **después de la migración 6**: en ese momento la RPC se niega con excepciones `42501`. La migración 7 sustituye ese contrato por un resultado estructurado `registration_status`, con `session_invalid` para la sesión ausente/revocada y contador de intentos persistido dentro de la transacción.

Actualizar directamente el test 80 introdujo una falla real en la CI: en el punto donde se ejecuta todavía no existe la columna `registration_status`. Se restauró el test histórico y se creó `93_revoked_session_status.sql` para ejecutarlo **después de la migración 7** en **ambos jobs de PostgreSQL**, incluido el que reconstruye las siete migraciones desde cero.

## Siete escenarios del contrato moderno
Todas las peticiones usan claims artificiales de JWT mediante `set_config`, rol `authenticated` y UUID ficticios. La bandera de registro se habilita **sólo dentro de la transacción SQL de CI** y se revierte con `ROLLBACK`:

1. JWT sin `session_id` → `session_invalid`.
2. JWT con sesión eliminada de `auth.sessions` → `session_invalid`.
3. Mismo usuario inicia sesión NUEVA, con nuevo `session_id` válido → `ok`, empresa de prueba y `replay=false`.
4. Mismo request con sesión nueva → `ok`, `replay=true` (idempotencia).
5. Presentar nuevamente el `session_id` revocado **después de iniciar sesión nueva** → `session_invalid`.
6. Usar `session_id` perteneciente a otro usuario → `session_invalid`.
7. JWT con sesión de `auth.sessions.not_after` vencida → `session_invalid`.

En todos los rechazos, `organization_id` y `replay` deben ser nulos. La prueba además verifica cuota consumida por denegaciones (usuario A, 6; usuario C, 1) y que sólo la nueva sesión válida generó una empresa **dentro del fixture reversible**.

## Problema de aserción encontrado y solucionado
El primer test postmigración exigía que **toda** la base de CI tuviera a lo sumo una empresa, pero el job histórico preserva otras empresas ficticias creadas en pasos anteriores. Se corrigió para comprobar **sólo membresías y organización del fixture específico**. Ambos recorridos PostgreSQL aprobaron tras ese ajuste. No se relajó ningún chequeo de sesión o cuota.

## Evidencia
Commit de código probado `9f629f15303c94ddc07d5f8d20752b4123579deb`:
- [Pruebas unitarias 115/115](https://github.com/ProtectorRudo/Cotironda/actions/runs/40925290154)
- [PostgreSQL 17: test histórico, migraciones reconstruidas y test 93 en ambos jobs](https://github.com/ProtectorRudo/Cotironda/actions/runs/40925290163)
- [Portal Next.js: SSR, SDK, TypeScript y dos builds](https://github.com/ProtectorRudo/Cotironda/actions/runs/40925290121)
- [Sitio](https://github.com/ProtectorRudo/Cotironda/actions/runs/40925290178)

Todos los workflows concluyeron `SUCCESS`. Se verificarán nuevamente sobre el último commit documental.

## Límites: qué NO se ha demostrado
Este test **no firma JWT ni revoca sesiones en Supabase real**. Demuestra que el contrato SQL actual rechaza un claim antiguo cuando su `session_id` ya no existe, aun cuando el mismo usuario tenga otro `session_id` vigente. La protección de firma la aplica el gateway de Supabase, previamente probada desde Chrome con un token adulterado. Para una afirmación completa de E2E de revocación aún falta probar un JWT auténtico previamente emitido que se presenta tras `signOut`, **sin que el interruptor SQL false enmascare el rechazo**; deberá diseñarse una prueba controlada que no abra altas comerciales.

No se modificaron esquemas, roles, flags, Auth, planes ni Vercel. `main` no se fusionó; PR #46 sigue draft y producción continúa siendo demo.

## Seguimiento
[Issue #45](https://github.com/ProtectorRudo/Cotironda/issues/45) · [PR #46](https://github.com/ProtectorRudo/Cotironda/pull/46) · [Revocación inicial](26-sesiones-vigentes.md).
