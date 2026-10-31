# Recuperación forense de cinco migraciones de laboratorio DEV

**31 de octubre de 2026 · Issue #175 · NO es una carpeta de migraciones ejecutables.**

Se recuperó el contenido **exacto** de la columna `statements[1]` de la tabla `supabase_migrations.schema_migrations` del proyecto DEV de Cotironda mediante **solo SELECT**. Cada archivo Markdown contiene una única sentencia archivada dentro de un bloque de código: la copia se leyó de vuelta desde GitHub y se comparó carácter por carácter con la fuente obtenida en la misma sesión. Las huellas MD5 fueron calculadas por PostgreSQL sobre la sentencia original, no por un proceso que pudiera introducir cambios.

| Versión | Migración | MD5 del SQL original |
| --- | --- | --- |
| 20261030182413 | dev_quality_once_only | 39c5562965176a19866cd62848ffda09 |
| 20261030190232 | dev_quality_results_ledger | d6db42b33450881298f455846e2ec720 |
| 20261030192011 | dev_quality_auto_dispatch_d020 | 003c6e782d5f10d58d49c68149d990b5 |
| 20261030192221 | dev_quality_pg_net_nonpublic_d020 | 1146ae532daa4d86a03e4b52d8b59e7e |
| 20261030194856 | dev_quality_numeric_diagnostics_d021 | ded15f2f130f8de6bcdd9b06251c91ac |

**Advertencia crítica:** la cuarta migración incluye `DROP EXTENSION IF EXISTS pg_net`. La tercera crea una función `SECURITY DEFINER` de dispatch de laboratorio que puede llamar al Edge DEV mediante pg_net si un administrador la habilita y proporciona una credencial de Vault. No ejecutar estos archivos por lotes, no trasladar el código de laboratorio a producción y no aplicar el `DROP EXTENSION` en una base existente con dependencias. La función recuperada está diseñada solamente para DEV y no es infraestructura comercial de rondas.

### Estado observado sin modificar DEV

- 17 migraciones registradas: 12 base y las 5 de laboratorio recuperadas.
- Control de disparo de IA de laboratorio: `enabled=false`.
- Trabajos de cron que invocan ese dispatcher: **0**.
- Casos de benchmark reservados: 4; trabajos pendientes de envío: 0.
- Ningún secreto de Vault fue consultado ni exportado; los scripts referencian una credencial **por nombre**, sin contener su valor.

### Qué falta para cerrar #175

1. Auditar diferencias entre el esquema actual y estos scripts antiguos, especialmente `pg_net`, `pg_cron`, funciones definer, grants, valores default y políticas RLS. Revisar las dependencias existentes antes de planear la restauración.
2. Preparar un **dump lógico real de DEV** que cubra esquema, permisos, Auth, Storage, y recursos ajenos al esquema públicos con protección de secretos. El plan Free no garantiza backup diario administrado. Mantener el backup cifrado fuera del repositorio público.
3. Probar una **restauración real en un entorno separado**, sin pisar DEV ni producción; verificar datos ficticios, seguridad, conteos, migraciones y controles de acceso, dejar informe de diferencias y rollback.
4. Recién después, aplicar de forma controlada las migraciones comerciales D024+ en DEV. Para piloto real, no se deben mover secretos ni bases de prueba a producción automáticamente.

**Esta recuperación es documental y reversible.** No es un backup, no es una restauración, no instala migraciones, no cambia ninguna tabla ni cierra el gate #175.
