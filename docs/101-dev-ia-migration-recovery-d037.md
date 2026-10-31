# 101 — D037: recuperación exacta de cinco migraciones IA de Supabase DEV

**30/10/2026 · Issue #176 y bloqueo #175 · PR apilado sobre #174. SIN instalaciones en DEV.**

## Resultado de investigación

Se revisó `supabase_migrations.schema_migrations` del proyecto Supabase DEV en consultas **SELECT**. Cada una de las cinco migraciones adicionales conserva **una sentencia SQL completa** en `statements[1]`, con nombre y versión. Se revisaron longitudes, SHA-256 y patrones básicos de claves pegadas por error, sin hallar tokens reales evidentes.

Las migraciones archivadas son exactamente las aplicadas en DEV (no son aproximaciones):

| Versión | Migración | Bytes/caracteres del SQL archivado | SHA-256 (primeros 12) |
| --- | --- | --- | --- |
| `20261030182413` | `dev_quality_once_only` | 1231 caracteres | `617f6161fa5e` |
| `20261030190232` | `dev_quality_results_ledger` | 1840 caracteres | `2100ac622efd` |
| `20261030192011` | `dev_quality_auto_dispatch_d020` | 6445 caracteres | `fbe20929669d` |
| `20261030192221` | `dev_quality_pg_net_nonpublic_d020` | 172 caracteres | `7fcdbc2d0f98` |
| `20261030194856` | `dev_quality_numeric_diagnostics_d021` | 1507 caracteres | `62b36a7041c1` |

Los SHA-256 completos están en el `manifest.json`, medidos directamente desde las sentencias almacenadas en el historial de Supabase. La comparación **texto completo GitHub ↔ texto Supabase** dio igualdad para los **cinco archivos**.

Además se localizaron los SQL fuente históricos:
- `feat/02-dev-quality-once-only` contiene `dev_quality_once_only.sql`, coincidente **exactamente**;
- `feat/02-quality-audit-ledger` contiene `dev_quality_results_ledger.sql`, coincidente **exactamente**;
- `feat/02-dev-quality-supabase-auto` conserva `dev_quality_auto_dispatch.sql` y `dev_quality_pg_net_nonpublic.sql`, pero **no coinciden exactamente** con sus versiones aplicadas; usar las declaraciones del historial alojado;
- la quinta migración de diagnóstico D021 se recuperó directamente del historial alojado.

## Ubicación y reglas de protección

Los cinco textos exactos se archivaron en `supabase/recovery/dev_quality_20261030/` con `manifest.json`.

**IMPORTANTE:** no se colocaron bajo `supabase/migrations/` porque allí son archivos de despliegue automáticos que podrían ejecutarse indebidamente en proyectos existentes. Recuperar la fuente no equivale a autorizar o aplicar cambios. No editar SQL histórico para corregir defectos: redactar un nuevo cambio si se necesitara después, con migración formal y revisión.

El verificador `scripts/ci/verify-dev-ai-migration-sources-d037.mjs` calcula SHA-256 de cada texto y exige versión, nombre, cantidad y orden exactos; no contiene conexión a DEV ni ejecución SQL. Un hash diferente, archivo faltante, manifiesto adulterado o clave evidente provoca fallo. `tests/unit/dev-ai-migrations-d037.test.mjs` prueba alteraciones y archivos faltantes.

## Recuperación parcial ensayada en CI, sin red

En PostgreSQL17 efímero, tras reconstruir las 12 migraciones base, CI puede ejecutar **solo tres SQL tabulares**: `20261030182413` → `20261030190232` → `20261030194856`. No contienen lógica de envío de mensajes. El gate `supabase/tests/ci/107_recovered_quality_safe_subset.sql` valida:
- la existencia de claims y resultados de calidad sintética, con RLS habilitada;
- ausencia de SELECT para `anon` y `authenticated`;
- permisos limitados para `service_role`, seis columnas de diagnóstico y cero filas;
- ausencia de tablas del motor de automatización D020, que **no debe haberse ejecutado**.

**Esta reconstrucción es PARCIAL: 3 de 5 archivos.** No prueba backup/restore real de Supabase DEV alojado, ni recrea las 17 migraciones completas con pg_net/cron/vault, ni restituye registros de calidad ya consumidos. Tampoco debe interpretarse como autorización de despliegue.

## Bloqueador D020 que requiere revisión

- `20261030192011` incluye la instalación de `pg_net` / `pg_cron`, estructuras y funciones de despacho; aunque el scheduler inicia OFF, podría producir solicitudes externas si alguien lo habilitara.
- `20261030192221` contiene **`DROP EXTENSION IF EXISTS pg_net`** seguido de `CREATE EXTENSION pg_net WITH SCHEMA extensions`. Esto exige un entorno Supabase compatible y una revisión de dependencias; podría ser destructivo si se ejecutara indiscriminadamente.
- Por eso ambos están archivados para referencia y **prohibidos en un restore automático**. Se requiere un entorno aislado compatible con Supabase alojado para inspeccionar/restaurar esas dependencias sin llamadas de red y con credenciales sintéticas; probar también backups completos y recuperación de datos no sensibles.

## Estado y decisiones

El bloqueo #175 puede pasar de «SQL histórico desconocido» a «SQL exacto recuperado y protegido», pero sigue ABIERTO para la certificación de restauración completa, dependencias D020, pg_net, Vault y backup real alojado.

La etapa comercial D024–D035 permanece sin instalar. Ninguna migración D018–D021 se volvió a ejecutar en DEV; ningún cron se habilitó, no se hicieron llamadas IA, no se modificó el registro de 4/6 casos utilizados.

**Próximo gate:** prueba de recuperación completa en un entorno de ensayo Supabase aislado autorizado, conciliación de dependencias y respaldo real de DEV; recién después preparar la aplicación controlada de D024 en DEV. Mantener flags comerciales y IA OFF.

**UX-001:** la recuperación de infraestructura debe ser invisible para proveedores y compradores.
