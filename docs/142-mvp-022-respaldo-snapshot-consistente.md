# 142 — MVP-022: instantánea consistente para el respaldo cifrado de DEV

31/10/2026 · Issue #257 · modificación del exportador existente `scripts/ops/export-encrypted-dev-mvp003.mjs` sobre la rama integrada. **Sin exportación de datos reales y sin restauración real.**

## Hallazgo

La versión anterior ejecutaba `pg_dump` cuatro veces en sesiones independientes para separar esquema/datos comerciales y esquema/datos de `supabase_migrations`. Cada `pg_dump` es individualmente consistente, pero **no está garantizado que todos observen el mismo punto en el tiempo** si otro usuario altera la base durante la secuencia; por ejemplo, versiones/filas de migración podrían diferir del esquema correspondiente.

PostgreSQL17 permite compartir snapshot con `pg_export_snapshot()` y `pg_dump --snapshot=...` mientras esté viva la transacción que lo exportó. Referencia oficial:
- https://www.postgresql.org/docs/17/app-pgdump.html
- https://www.postgresql.org/docs/17/functions-admin.html

## Cambio

El script exige además `psql` de PostgreSQL17. Exporta roles globales por separado (no existe snapshot universal para roles). Después abre una sesión `psql` `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY`, obtiene un identificador opaco por `SELECT pg_export_snapshot()`, deja abierta esa conexión y pasa **el mismo snapshot** a los cuatro `pg_dump`. Finalmente cierra explícitamente la transacción con `ROLLBACK`, inclusive ante fallo de la exportación, manteniendo `default_transaction_read_only=on`, `--no-password` y secretos exclusivamente en entorno privado del proceso, nunca en línea de comando ni logs.

Una salida inesperada, versión equivocada, protocolo inválido, tiempo de espera agotado, error de `pg_dump` o cierre anormal invalida el paquete. Los fragmentos incompletos se eliminan; nadie debe usar copias parciales para una restauración.

La consistencia se limita a las **cuatro piezas por base de datos**. Las definiciones globales de roles pueden cambiar mientras corre el respaldo; por eso todavía hay que comprobar ACLs y roles en el restore aislado, y preferentemente operar con cambios administrativos y registros congelados durante la ventana. El dump SQL no contiene los bytes de objetos Storage ni la configuración externa de Auth/Edge/WhatsApp. La configuración cifrada de Vault en otra instancia requiere tratamiento propio.

## Pruebas y puerta de producción

Tests sintéticos: las cuatro invocaciones reciben exactamente el mismo snapshot, la sesión solo usa comando read-only, cierre explícito, falla cerrada ante formato de instantánea inesperado/desconexión de `psql`/versión antigua, no fugan credenciales ni generan SQL en disco. Se ejecutan por GitHub Actions en Node22, sin host Supabase ni WhatsApp.

**La existencia de un script mejorado no sustituye la primera exportación y restauración genuinas**. Mantener Issue #175 ABIERTO hasta comprobar backup age real en un equipo privado, descifrado de cinco piezas y restore aislado con 17 migraciones, datos Auth, RLS, Storage, Vault y cobertura de Edge/configuración. No habilitar D024–D070 ni enviar WhatsApp sin ese gate.

## Próximo paso del operador

En una computadora de confianza con PostgreSQL17 (`pg_dump`, `pg_dumpall`, `psql`) y `age`, ejecutar la comprobación de destino D041 y el script D003 usando credenciales y clave age guardadas **localmente** (nunca en ChatGPT/GitHub). Los comandos y permisos están en `docs/104-local-age-preflight-d041.md`. Exportar a carpeta fuera del repositorio, sin sincronización a nubes públicas. Comprobar luego el descifrado D041 y restaurar solo en entorno aislado autorizado. Si no se dispone de un equipo así, no hacer el respaldo todavía.
