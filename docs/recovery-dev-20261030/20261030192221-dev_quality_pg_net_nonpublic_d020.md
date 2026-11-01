# Archivo recuperado de migración DEV: dev_quality_pg_net_nonpublic_d020

> **NO EJECUTAR. Archivo forense solamente. Origen: `supabase_migrations.schema_migrations` de Cotironda DEV, consultado de solo lectura el 31/10/2026. Nunca cargar automáticamente en producción ni en DEV. Contiene DDL y puede crear funciones privilegiadas o modificar extensiones.**

- Versión aplicada originalmente: `20261030192221`
- Huella MD5 del SQL original en la tabla de migraciones: `1146ae532daa4d86a03e4b52d8b59e7e`
- Longitud del SQL archivado: 172 caracteres (Unicode; comparar byte a byte en un runner UTF-8 antes de reconstruir)
- Se archivó sin ejecutar ninguna sentencia y sin extraer secretos de Vault.

```sql
-- D020 DEV: pg_net recién instalado, sin jobs/requests/dependencias externas (verificado).
DROP EXTENSION IF EXISTS pg_net;
CREATE EXTENSION pg_net WITH SCHEMA extensions;
```
