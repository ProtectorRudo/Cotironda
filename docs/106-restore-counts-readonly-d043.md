# 106 — D043: inventario de recuperación de Cotironda DEV

**31/10/2026 · Issue #188 · continuación D042/#187.** Solo lectura y comparación offline. La exportación auténtica de DEV y su restauración NO se han completado; #175 continúa bloqueante.

## Evidencia alojada (solo SELECT)

Inventario obtenido en el proyecto explícito `cotironda-dev` (PostgreSQL 17.11): 17 migraciones, dos usuarios Auth, dos identidades, cero sesiones; dos buckets Storage privados, cero metadatos de objetos; una entrada en Vault (no se leyó su valor); cuatro registros de reservas de calidad IA, cero cron, IA automática y registro comercial apagados; sin tablas públicas o privadas detectadas con RLS deshabilitado. Tres extensiones relevantes instaladas: pg_cron, pg_net y supabase_vault.

La API de Supabase informa **una Edge Function activa** `cotironda-ia-dev`, con `verify_jwt=false` a nivel plataforma. Esto NO prueba por sí mismo un acceso no autorizado: la función puede validar una credencial dentro de su código. Exige auditoría específica de control de acceso y límites, sin realizar llamadas de ejecución ni alterar la función.

## SQL de inventario

`supabase/sql/restore_inventory_readonly_d043.sql` ejecuta exclusivamente un SELECT. Obtiene conteos y las versiones/nombres públicos del historial, no nombres de personas, contraseñas, correos, listas comerciales, secretos Vault ni texto de archivos. Requiere permisos de auditoría legítimos en la base de datos. No lo ejecutar en producción.

La foto de origen debe tomarse **en una ventana de backup coordinada**: los datos pueden cambiar entre extracción y consulta. Conservar las fotos en una carpeta segura fuera del repositorio. Acompañar la evidencia con hora, versión CLI, cifrado y hash del paquete, sin compartir datos privados.

## Comparador sin red

`scripts/ops/compare-restore-inventory-d043.mjs` compara dos archivos JSON locales del inventario (antes y después). Rechaza estructuras incompletas, 17 migraciones con nombres/orden erróneos, PostgreSQL anterior a 17 o distinto, faltantes de extensiones, conteos divergentes, RLS apagada, buckets públicos, cron activo e interruptores IA/registro encendidos.

Ejemplo sobre archivos de METADATOS exclusivamente, después de efectuar una restauración externa autorizada:

    node scripts/ops/compare-restore-inventory-d043.mjs /ruta/privada/origen.json /ruta/privada/restaurado.json

Ambos deben contener el JSON correspondiente al valor `inventory` de la consulta D043, ya sea el objeto directamente o un sobre con esa única clave. El resultado únicamente indica `INVENTARIOS_COINCIDENTES_SIN_RESTORE_CERTIFICADO`, con `backup_real_verificado=false`, `restore_verified=false`, `gate_d024_open=false`. Un PASS de conteos **no garantiza igualdad de filas ni de definiciones, SQL restaurable, integridad de objetos Storage, permisos efectivos de roles, existencia real del secreto correcto en Vault o autenticación funcional.** Un atacante que altera ambos inventarios también puede falsificar un PASS; custodiar snapshots de fuente independiente y verificarlos con sellos de tiempo y hashes firmados.

## Cobertura adicional obligatoria para cierre de #175

- Exportar realmente roles, esquema y datos con CLI oficial; guardar también las cinco migraciones especiales y el historial 17/17. Confirmar con el dump auténtico el alcance sobre Auth; las guías de migración pueden variar por mecanismo y destino.
- Recuperar/verificar usuarios e identidades Auth; no asumir que sesiones/JWT viejos seguirán funcionando en otro entorno. Reconfigurar Auth Hooks, proveedores OAuth y correo, configuración de signup y protección contra contraseñas filtradas.
- Restaurar buckets, RLS y políticas; aunque hoy hay cero objetos, volver a censarlos en el momento real de exportar. Si existen bytes, transferirlos por un procedimiento Storage separado: el SQL solo cubre metadatos.
- Inventariar y restaurar correctamente las claves Vault, tomando en cuenta cifrado/llaves de la instancia nueva. NO exponer ni exportar secretos en este informe.
- Reinstalar/inventariar extensiones pg_net/pg_cron/Vault; ejecutar en aislamiento sin salida a red ni despacho de IA. Registrar cero jobs y flags OFF antes y después.
- Reinstalar/verificar la Edge Function solo en entorno autorizado con controles de autenticación (la función desplegada no está en SQL de respaldo).
- Probar una restauración completa en un entorno de prueba separado: comparar definiciones SQL/hashes, RLS, permisos por empresa, sesión revocada, datos de prueba y operaciones negativas. No escribir ni restaurar sobre DEV original.

## Método

Solo código de comparación, SQL SELECT-only y pruebas unitarias con snapshots **sintéticos**; no hubo descarga de backup real ni ensayo sobre los datos genuinos. Mantener PR en borrador, no fusionar ni instalar D024–D035 hasta resolver #175 y el gate independiente de permisos alojados D025/#167.

Referencias: [Supabase Backup & Restore CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), [Self-hosted restore](https://supabase.com/docs/guides/self-hosting/restore-from-platform), [D042](105-age-real-synthetic-ci-d042.md).
