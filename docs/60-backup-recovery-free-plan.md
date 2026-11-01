# 60 — Continuidad, respaldos y recuperación de Cotironda

**Etapa 01 · 30/10/2026 · Issue #90 / PR #91 en borrador.**

## 1. Hallazgo verificado y decisión

La organización que contiene **`cotironda-dev`** fue consultada mediante el conector de Supabase: **`plan=free` y `tier=tier_free`**. La guía oficial de Supabase [Database Backups](https://supabase.com/docs/guides/platform/backups) indica que las copias automáticas **diarias** están incluidas en proyectos de los planes Pro, Team y Enterprise; a los proyectos Free recomienda realizar exportaciones periódicas y guardarlas fuera de la plataforma.

**No hay evidencia de un backup externo de los datos reales de Cotironda y no se realizó ninguno desde esta conversación.** Tampoco se ha probado una restauración de un proyecto Supabase gestionado con sus servicios completos. GitHub contiene las migraciones y la lógica, pero **no recupera por sí solo usuarios, empresas, conversaciones o archivos** si se pierde la base.

El estado read-only de `cotironda-dev` al realizar la auditoría fue: PostgreSQL 17.11, **2 usuarios Auth, 0 sesiones, 0 empresas, 0 archivos Storage y 5 categorías**; registro `false`. No se exportaron ni modificaron datos del proyecto.

**Decisión para el piloto comercial:** no habilitar registros, solicitudes ni cargas documentales con datos de clientes hasta contar con **una política de respaldos aprobada, copia externa real y prueba de restauración en un destino separado**. Una opción simple es usar un plan Supabase con respaldo gestionado diario más un respaldo independiente de los archivos de Storage; otra es diseñar un proceso offsite completo y auditado si se continúa en Free. Cualquier cambio de plan o compra requiere autorización y validación del costo actual.

## 2. Qué se puede recuperar y qué NO

| Recurso | Fuente/versionado | Recuperación exigida |
|---|---|---|
| Código, reglas, esquema propio y 12 migraciones | GitHub | Revisión de versiones, restauración CI desde cero y PRs aprobados |
| Datos comerciales, catálogos propios, cuotas, permisos, consentimientos | PostgreSQL | Copia consistente, externa y cifrada; restore a base aislada |
| Usuarios, identidades, sesiones y configuración de Supabase Auth | Servicio gestionado Auth + DB | Validar alcance **específico** del método de backup; no asumir que un `supabase db dump` común respalda `auth.users` |
| Metadatos de Storage (`storage.buckets`, `storage.objects`) | PostgreSQL | Inventario consistente y asociación por clave y bucket |
| **Contenido de los archivos** (PDF, imágenes, Excel y otros documentos) | Storage de objetos | **Respaldo separado de bytes**, cifrado, manifiesto de hashes, verificación contra metadatos |
| Edge Functions, Auth Hook, OAuth, credenciales, SMS/SMTP, dominios | Configuración/secret manager del proveedor | Configuración versionada sin secretos; recuperación de claves y proveedores mediante procedimiento autorizado |
| API keys, contraseñas y secretos | Gestor de secretos | Generar/rotar después de desastre; nunca copiar al repositorio o a un reporte |

**Advertencias de documentación oficial:**
- Supabase [Database Backups](https://supabase.com/docs/guides/platform/backups): las copias de PostgreSQL **NO contienen los bytes de Storage**, solamente metadatos; una restauración de DB no recupera archivos eliminados.
- La referencia [Supabase CLI `db dump`](https://supabase.com/docs/reference/cli/supabase-db-dump) indica que el dump estándar **excluye los esquemas gestionados `auth` y `storage`**. No considerar una exportación normal de `public` como copia completa del proyecto.
- Las credenciales de roles personalizados, Auth y proveedores externos requieren una recuperación **independiente**.
- Para exportar objetos privados de forma administrada: [Download Storage Objects](https://supabase.com/docs/guides/storage/management/download-objects), que documenta CLI y cliente S3-compatible. Las claves S3 nunca deben estar en GitHub, en mensajes ni en logs.

## 3. Ensayo técnico CI ejecutado (sin datos reales)

Se incorporó `scripts/ci/pg17-backup-restore-drill.sh`, ejecutado **solo en GitHub Actions** dentro del job `migrations-from-zero` de `.github/workflows/postgres-rls.yml`.

**El control falla cerrado** salvo `GITHUB_ACTIONS=true`, `COTIRONDA_CI_BACKUP_RESTORE=true`, `PGHOST=127.0.0.1`, `PGDATABASE=cotironda_ci_fresh`, `PGUSER=postgres`, `PGPORT=5432` y la contraseña fija **ficticia** de CI. Verifica PostgreSQL 17, cero usuarios/empresas/sesiones/objetos y registro false antes de comenzar.

Secuencia realmente probada:
1. Reconstruir las **12 migraciones históricas** en el PostgreSQL 17 efímero y verificar la limpieza de las pruebas existentes.
2. Crear una única categoría sintética `ci_recuperacion` dentro de la base efímera.
3. Ejecutar **`pg_dump` 17** en contenedor Docker local contra la base CI, formato `custom`, con `public`, `cotironda_private`, `auth` y `storage`. **Esto NO equivale a ejecutar `supabase db dump` contra el servicio gestionado**.
4. Guardar el dump solo en el directorio efímero `RUNNER_TEMP`, con permisos restringidos y hash SHA-256. Crear una copia adulterada que debe fallar al comparar hash.
5. Validar el inventario de `pg_restore --list` antes de restaurar: tablas comerciales, privadas, sesiones/Auth, Storage, datos, guard RLS y política de catálogo. Si falta cualquier componente, falla la prueba.
6. **Eliminar la categoría sintética de la base fuente CI** para simular pérdida.
7. Crear la base de destino independiente `cotironda_ci_restored` en el mismo servidor CI y ejecutar `pg_restore` 17 con `--single-transaction`, `--exit-on-error` y checksum verificado.
8. Verificar que la categoría **reaparezca en el destino** pero no en la fuente y que se hayan restaurado **23 políticas comerciales, 17 guards de sesión, 6 políticas del registrador, privilegios, buckets privados** y el registro **apagado**.
9. **Eliminar la base restaurada y todos los archivos temporales** con un trap al salir; ninguna copia se adjunta como GitHub Artifact ni se publica en los logs.

Archivo de guardia: `src/server/backup-restore-integrity.ts`; test de inventario adversarial: `tests/unit/backup-restore-integrity.test.mjs`.

**Resultado observado:** PASS de origen CI, fixture, hash, inventario, restore transaccional y políticas RLS. Workflow [PG17](https://github.com/ProtectorRudo/Cotironda/actions/runs/41042927793) **SUCCESS**. [199 pruebas unitarias](https://github.com/ProtectorRudo/Cotironda/actions/runs/41042927919), y 5/5 workflows de la misma revisión exitosos.

## 4. Procedimiento propuesto para un respaldo REAL (todavía NO realizado)

**Se prohíbe usar la CI para exportar o subir datos auténticos.** La conexión real deberá ejecutarse desde un equipo o agente privado autorizado, con respaldo cifrado en un destino independiente de Supabase y Vercel.

1. **Definir alcance:** Postgres de aplicación, Auth, configuración de Auth Hook, usuarios, catálogos, tablas privadas, Storage metadatos/bytes, edge functions y secretos. Registrar método concreto para cada componente y límites de la herramienta.
2. **Seleccionar tecnología y costos:** plan gestionado Pro/Team/Enterprise con backups y retención conocida, o proceso offsite explícito con Supabase CLI y mecanismo adicional para esquemas gestionados. Si el plan Free se mantiene, el backup lógico habitual por CLI **no cubre Auth/Storage gestionados**; se exige diseñar y probar su recuperación antes de abrir usuarios comerciales.
3. **Generar respaldo con privilegios mínimos** y ventana controlada. Consultar `supabase db dump --help` en la versión instalada antes de ejecutar. La guía oficial de respaldo lógico separa roles, esquema y datos, pero esta exportación **no debe calificarse de completa** hasta corroborar cobertura real. No usar `pg_dump` raw con esquemas gestionados como sustituto de un restore probado de Supabase.
4. **Cifrar antes de almacenar offsite**, limitar accesos, retener versiones verificadas y evitar que rutas, nombres o logs incluyan correos, JWT, contraseñas o archivos comerciales. Usar cifrado autenticado (no un ZIP sin contraseña).
5. **Respaldar los bytes de Storage por separado**, con control de acceso privado, lista consistente de objetos, SHA-256 individual y período de retención definido. Guardar también la correspondencia con los metadatos de base.
6. **Comprobar checksum e inventario**, luego restaurar **solo en un entorno independiente** creado y autorizado, nunca encima de `cotironda-dev` ni producción durante un ensayo.
7. **Probar una operación de punta a punta**: roles y tablas, Auth, políticas RLS, restricciones de sesión, buckets no públicos, objetos descargables solo por el usuario autorizado, cero escalamiento de permisos y confidencialidad de contactos.
8. Documentar fecha, tamaño/alcance, destino cifrado, restauración verificada, pasos de activación y responsable, **sin anotar secretos**. Antes de habilitar clientes, establecer RPO (pérdida máxima tolerada) y RTO (tiempo de recuperación) **medidos**, no inventados.

**Ningún restore real se realiza sobre un proyecto Supabase existente sin autorización explícita y un plan de rollback.** Si en el futuro se activa PITR o un plan pago, comprobar fecha/retención/condiciones actuales antes de activar cargos.

## 5. Puertas de calidad y trabajo pendiente

- [x] Plan Free y ausencia de cobertura automática diaria garantizada por ese plan: **auditados**, conforme documentación del proveedor.
- [x] Restauración PostgreSQL 17 con datos ficticios: **probada**, inclusive RLS, fixture, checksum y fallo de inventario incompleto.
- [x] Sin tocar datos del proyecto, settings Auth, Supabase SQL, Storage, DNS o producción.
- [ ] **Crear primera copia REAL offsite cifrada** del entorno dev con cobertura acordada, sin compartir secretos.
- [ ] **Demostrar restauración REAL** en un proyecto/instancia separada, con alcance explícito de Auth y Storage. No crear proyecto pago ni nuevos servicios sin autorización.
- [ ] Verificar planes, retención, costos, RPO y RTO para el piloto.
- [ ] Actualizar procedimiento después de incorporar documentos reales o WhatsApp.

**Decisión final:** la mecánica de backup/restore **SQL CI** se aprueba; **la preparación de recuperación real de Cotironda permanece bloqueante para Etapa 01/piloto**. No equiparar un dump sintético exitoso con un backup disponible de datos de clientes.
