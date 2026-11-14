# Cotironda V2 — Publicación real de suspensión de cron de cierre V1

**Fecha:** 14/11/2026. **Destino:** exclusivo Supabase `cotironda-piloto` (id `ilggkalaafhtiysyzlmg`), PostgreSQL 17. **No producción.**

## Motivo real

El job `cron.job` 1, `cotironda_piloto_close_due_5min`, ejecutaba `select public.cotironda_piloto_close_due_v1(25);` cada cinco minutos, con un plazo heredado de V1 en vez de los dos días hábiles de V2. El 14/11/2026 a las 06:25 ART cerró la única ronda histórica preparada. Se verificó que no quedan rondas preparadas: 7 totales = 5 cerradas + 2 borradores. Hasta este cambio, las políticas negocio, originales, cierre V2 y términos de proveedor estaban OFF pero el job legado continuaba activo; podría interferir con un pedido nuevo al cerrar según reglas V1.

## Cambio mínimo y fuente de verdad

[PR #852](https://github.com/ProtectorRudo/Cotironda/pull/852) incorpora `supabase/piloto/v2_pause_legacy_close_cron_OFF_PILOT_20261114.sql`. Se instala **exclusivamente** `cron.alter_job(job_id=>1,active=>false)`. No elimina ni renombra job ni toca los otros cron de recuperación documental (3) y conciliación IA (4), ni modifica estados de las rondas.

**Preflight automático estricto:** DB `postgres`, PG17, 7 rondas exactamente (5 closed, 2 draft, 0 prepared); business/originals/auto_release/terms OFF; job1 activo con nombre, calendario `*/5 * * * *` y comando SQL idénticos; jobs3/4 activos. Ante deriva aborta en transacción.

**Rollback:** `supabase/piloto/v2_rollback_pause_legacy_close_cron_REVIEW_ONLY.sql`, disponible solo para ejecución explícitamente autorizada. Mantiene verificación de mismo job, sin rondas `prepared`, y vuelve a `active=true`. NO ejecutar por rutina: reanudaría V1.

## Pruebas proporcionales al riesgo

1. Se ejecutó el SQL candidato de GitHub literalmente en `BEGIN;` ... `ROLLBACK;` en la base piloto real sin error.
2. Verificación inmediata del rollback: **job1 continuaba `active=true`**, job3 y 4 también activos.
3. **Publicación autorizada** mediante `apply_migration`: éxito real `20261114093622`, `cotironda_v2_pause_legacy_close_cron_only_pilot_20261114`.
4. **Poscontrol real:** job1 `active=false`; jobs3 y 4 `active=true`, todos existentes. Rondas 7 (5 closed, 2 draft, 0 prepared). Consentimientos 0. Negocio, originales, cierre V2, términos: **OFF/OFF/OFF/OFF**. No mensajes nuevos, no Whapi desplegado, no cambio de Vercel ni producción.

**No equivale a piloto 100%.** Sigue bloqueada la publicación Preview SHA `f98527c...` por HTTP 402 de Vercel, único reintento existente 17:07 ART; sigue ausente `COTIRONDA_PILOT_SUPABASE_SECRET_KEY` server-only para acceso privado. Los catálogos tienen 106 líneas (86 curadas, 20 por revisar) y ninguno tiene fecha de confirmación: no inventar validación comercial.

[Estado](docs/PILOTO-100-ESTADO.md) · [Plan](docs/PILOTO-100-PLAN-MAESTRO.md) · [Issue #794](https://github.com/ProtectorRudo/Cotironda/issues/794).
