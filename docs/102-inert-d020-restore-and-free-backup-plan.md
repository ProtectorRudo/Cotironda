# 102 — D038: ensayo inerte de recuperación D020 y plan de respaldo real

**31/10/2026 · Issue #178 · PR draft sobre D037/#177. Estado: sin backup real descargado, sin restore alojado.**

## Información comprobada en Supabase DEV (solo lectura)

Proyecto `cotironda-dev` (`qkercsoqhehbenbbncwk`), PostgreSQL 17.11, organización en **plan Free**. No se puede suponer que exista un backup diario automático: Supabase especifica que los planes Free deben hacer exportaciones lógicas manuales, mientras las copias diarias automáticas corresponden a Pro/Team/Enterprise.

Las extensiones `pg_net` (esquema `extensions`), `pg_cron` (esquema `pg_catalog`) y `supabase_vault` (esquema `vault`) están instaladas. Hay una entrada con nombre `cotironda_quality_dev_invoker` en Vault, pero **no se leyó el secreto ni su valor**. Ningún job en `cron.job` (cero activos o totales) y `cotironda_private.dev_quality_auto_control.enabled=false`. Cuatro de seis reservas sintéticas de IA ya estaban consumidas. Todas las consultas fueron SELECT.

La asesoría de seguridad en Supabase señaló aviso **`auth_leaked_password_protection` deshabilitada** y seis tablas con RLS habilitado sin políticas, que deben revisarse según acceso previsto. No se alteró Auth/RLS: las tablas privadas de laboratorio son deliberadamente cerradas y no deben abrirse para resolver un aviso informativo.

**Fuente oficial:** [Database Backups](https://supabase.com/docs/guides/platform/backups), [Free Plan Backups](https://supabase.com/kb/faqs/platform/free-plan-backups) y [Backup and Restore using the CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).

## Ensayo seguro que implementamos

En el PG17 efímero de GitHub Actions, después de las doce migraciones base y del ensayo parcial D037:

1. `scripts/ci/prepare-inert-quality-d038.mjs` valida la huella SHA-256 contra `manifest.json` del archivo histórico exacto `20261030192011_dev_quality_auto_dispatch_d020.sql`.
2. El generador **omite exclusivamente dos sentencias** de instalación `CREATE EXTENSION pg_net/pg_cron` y deja intacto el resto del código SQL de D020: las tablas privadas, el seed de cinco casos y la función de despacho original. Falla si encuentra otras operaciones de extensiones, un `cron.schedule` activo o un cambio en el guard `enabled=false`.
3. Genera solo `/tmp/cotironda_d038_inert.sql` con flag CI, PGHOST=127.0.0.1 y nombre exacto de base de CI. No abre conexión, no instala extensiones, no lee Vault, no ejecuta SQL; el job `psql` separado aplica el archivo transformado **solo a PostgreSQL17 descartable**.
4. `supabase/tests/ci/108_inert_d020_restore.sql` comprueba ausencia física de `pg_net`/`pg_cron`, RLS y ausencia de acceso al cliente, flag apagado, cinco filas sintéticas de control, y llamada al despachador que debe devolver **`disabled` antes de buscar el secreto o usar `net.http_post`**. Se insertan cuatro reservas SINTÉTICAS (no registros de DEV) para comprobar integridad; se revisa cero solicitudes y cero resultados IA.
5. `tests/unit/dev-quality-inert-restore-d038.test.mjs` comprueba rechazo por alteración de hash, instalación de una extensión adicional, cron programado, guard apagado quitado, path no autorizado y host remoto.

**Límite explícito:** es un ensayo del **esquema y rama deshabilitada de D020 con las extensiones omitidas**. NO equivale a restaurar D020 literalmente, no prueba compatibilidad real de `pg_net`/Vault/`pg_cron`, ni revalida las cuatro reservas reales consumidas. La quinta migración `20261030192221_dev_quality_pg_net_nonpublic_d020.sql` contiene `DROP EXTENSION IF EXISTS pg_net` seguido de `CREATE EXTENSION ...`; se mantiene exclusivamente archivada, no se ejecuta.

## Plan de respaldo genuino, aún NO realizado

**Gate A — Obtener respaldo lógico de DEV sin costo de nuevo proyecto.** Preparar un ambiente seguro fuera del repositorio GitHub y obtener acceso de backup a DB con credenciales de servidor gestionadas, TLS y permisos revisados. Según la documentación Supabase, usar su CLI con comandos `supabase db dump` para roles, esquema y datos en **archivos separados**; descubrir flags y versión actuales con `supabase db dump --help` antes. No pegar contraseñas en consola compartida, tickets, ChatGPT, CI logs o variables públicas. Los dumps pueden incluir hashes de contraseña, tokens u otros datos sensibles y deben quedar cifrados y fuera del repositorio.

**Gate B — Cobertura.** El dump estándar de Supabase **excluye esquemas gestionados**, incluyendo Auth y Storage. Para restauración completa hay que verificar su cobertura y seguir instrucciones oficiales para datos Auth, objetos reales de Storage, claves Vault, extensiones, Edge Functions y Auth settings. Una exportación de tablas comerciales NO certifica recuperación de todo Supabase. La copia SQL D037 en GitHub contiene únicamente definiciones, no datos.

**Gate C — Restaurar en entorno aislado real con extensiones equivalentes.** Revisar efectos antes de aplicar: los clones físicos de Supabase incluyen trabajos de `pg_cron` y esos trabajos **pueden empezar apenas se restaura**. Como el plan Free no ofrece restauración física automática y no se autorizó un proyecto pago, no crear clones de Supabase ni activar scheduler. Un restore lógico controlado con red saliente bloqueada y credenciales ficticias evita activar WhatsApp/IA.

**Gate D — Certificar.** Comparar **17/17 versiones y hashes**, esquema completo, roles/RLS, cuatro reservas IA preservadas, acceso/denegación de usuarios, objetos de Storage, cron 0 y control OFF. Probar recuperación de un caso real en un entorno aislado sin tocar DEV original. Registrar timestamp, SHA-256 del backup cifrado, responsable y procedimiento de reversión. Solo ahí cerrar Issue #175.

## Alcance y bloqueo

Sin acceso a la exportación lógica ni al sistema de backups desde los conectores actuales, **no se creó ni verificó un archivo de backup de DEV**. El ensayo D038 no debe utilizarse como sustituto de esa copia.

No se instalaron migraciones ni modificaron datos, esquemas o usuarios en DEV o producción; no se conectó Whapi ni se ejecutó OpenAI. No existe permiso para publicar ni crear recursos pagos. Las rondas D024 siguen bloqueadas por el requisito de respaldo y, separadamente, la verificación alojada de permisos D025/Issue #167.

La filosofía UX-001 se mantiene: toda esta preparación técnica debe ser invisible para compradores y corralones.
