# 122 — MVP-003: ensayo real de exportación/restauración PostgreSQL 17 en CI

**31/10/2026 · Vinculado a #175 y #219 · no es un backup de Supabase DEV.**

## Por qué

Cotironda necesita una recuperación **demostrable** antes de instalar SQL comercial en DEV. GitHub reproduce migraciones y pruebas sintéticas, pero no hemos extraído una copia integral del Supabase DEV actual. Los conectores de esta sesión permiten consultar tablas y recuperar el SQL de migraciones, **no** exportar el banco completo por `pg_dump` con credenciales seguras.

La documentación oficial de Supabase establece que la edición Free no garantiza copias automáticas diarias y recomienda `supabase db dump` para exportación manual. Además, la base SQL contiene metadatos de Storage, pero **no los objetos** del almacenamiento; Auth, Vault, credenciales, configuración y funciones Edge requieren un inventario/plan de recuperación separado. Fuentes: https://supabase.com/docs/guides/platform/backups y https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore.

## Lo que efectivamente hace la prueba

Archivo `scripts/ci/restore-mvp003.sh` ejecutado **al final** de `.github/workflows/postgres-rls.yml` después de la suite PostgreSQL 17, Node/pg y D056. Rechaza ejecuciones si no encuentra `COTIRONDA_RESTORE_CI=true`, `PGHOST=127.0.0.1`, `PGUSER=postgres`, `PGDATABASE=cotironda_ci` y la contraseña fija de CI; exige un único contenedor del servicio `postgres:17-alpine`.

Usa `pg_dump` y `pg_restore` **versión 17 del propio contenedor**, no el cliente 16 del runner, para no introducir incompatibilidad de versión. Exporta una copia lógica `--format=custom` a un archivo temporal **dentro del contenedor descartable**, crea una segunda base `cotironda_ci_restore_mvp003` desde `template0` y restaura sin sobrescribir ninguna existente. **No ejecuta DROP DATABASE**, no descarga artefactos, no toca Supabase alojado y no utiliza ninguna credencial real.

Los scripts `restore-mvp003-fingerprint.sql` y `restore-mvp003-assertions.sql` comparan origen versus destino (y origen antes versus después) respecto a filas sintéticas, estados D047/D053, reservas de cupos D056, recuentos RLS, código de `begin_send`, existencia del trigger de cupo y permisos de clientes `anon/authenticated`. Una restauración que devuelve un `RLS` incorrecto o pierde el ledger falla.

## Límites que hay que mantener

**Esto es una restauración de base de datos ficticia dentro del MISMO CLÚSTER PostgreSQL 17 del CI**. Los roles son objetos globales del clúster y se comparten entre las dos bases; la prueba no verifica la recuperación de roles en un clúster nuevo. Tampoco valida el SQL real de los cinco laboratorios D019–D021, las extensiones `pg_net/pg_cron` alojadas, conexiones de Supabase, Vault, Auth o Storage físico. El SQL original de las cinco migraciones está archivado **solo para auditoría** en `docs/recovery-dev-20261030`; una contiene `DROP EXTENSION pg_net` y nunca se ejecuta ciegamente.

**El Issue #175 sigue abierto** hasta: exportar un dump lógico auténtico de Supabase DEV a un destino cifrado fuera de GitHub; separar roles/esquema/datos y verificar el inventario de Auth/Storage/Vault, extensiones y Edge; restaurar en una instancia separada (sin activar jobs/red); comparar el esquema/datos con origen y evidencias RLS; documentar plan de reversión; verificar que el backup puede reproducir DEV y conservar su custodia.

No significa que el cliente ya pueda comprar o cotizar por WhatsApp. No se fusiona, publica ni activa ninguna integración.

## Hallazgo durante la primera ejecución y corrección segura

La primera restauración real del CI falló en `COPY cotironda_private.offer_drafts_v1`: violación de `offer_drafts_v1_check`. La definición D024 incluye un `CHECK (check_quote_lines_v1(lines_snapshot,round_id))` y su función consulta otra tabla (`round_items_v1`). **Los CHECK que consultan filas de otra tabla no son seguros para dump/restore** porque el orden de carga puede ejecutar la validación antes de cargar las líneas referenciadas. La misma definición se había usado en `offer_versions_v1`.

La corrección **únicamente dentro del entorno CI**, en `supabase/sql/round_offer_restore_safe_mvp003.sql`, reemplaza esos dos CHECK cruzados por dos triggers `BEFORE INSERT OR UPDATE` que invocan **la misma función de validación**. No relaja la verificación comercial: `supabase/tests/ci/113_restore_safe_offer_guards_mvp003.sql` intenta modificar un borrador y una versión con líneas vacías y exige que ambos sean rechazados; también valida todas las ofertas persistidas. PostgreSQL realiza `COPY` de datos antes de volver a instalar triggers en la restauración y la prueba posterior valida cada relación con las líneas de su ronda.

**Importante:** la corrección **no está instalada en Supabase DEV/producción** y requiere revisión de migración antes del piloto; la diferencia y prueba aquí son un candidato de solución. No equivale a activar el circuito comercial ni a restaurar DEV real.
