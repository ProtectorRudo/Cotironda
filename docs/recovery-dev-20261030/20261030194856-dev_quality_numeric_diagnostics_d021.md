# Archivo recuperado de migración DEV: dev_quality_numeric_diagnostics_d021

> **NO EJECUTAR. Archivo forense solamente. Origen: `supabase_migrations.schema_migrations` de Cotironda DEV, consultado de solo lectura el 31/10/2026. Nunca cargar automáticamente en producción ni en DEV. Contiene DDL y puede crear funciones privilegiadas o modificar extensiones.**

- Versión aplicada originalmente: `20261030194856`
- Huella MD5 del SQL original en la tabla de migraciones: `ded15f2f130f8de6bcdd9b06251c91ac`
- Longitud del SQL archivado: 1507 caracteres (Unicode; comparar byte a byte en un runner UTF-8 antes de reconstruir)
- Se archivó sin ejecutar ninguna sentencia y sin extraer secretos de Vault.

```sql
-- D021 / Issue #141: motivos numéricos de retención del laboratorio DEV.
-- NO guarda respuestas de IA, prompts, textos, SKU, nombres, claves ni clientes.
-- Historial anterior permanece NULL y no se reevalúan reservas gastadas.
ALTER TABLE public.dev_ia_quality_results
  ADD COLUMN IF NOT EXISTS diag_items_propuestos integer
    CHECK (diag_items_propuestos BETWEEN 0 AND 75),
  ADD COLUMN IF NOT EXISTS diag_items_con_aclaracion integer
    CHECK (diag_items_con_aclaracion BETWEEN 0 AND 75),
  ADD COLUMN IF NOT EXISTS diag_origen_no_verificado integer
    CHECK (diag_origen_no_verificado BETWEEN 0 AND 75),
  ADD COLUMN IF NOT EXISTS diag_cantidad_sin_evidencia integer
    CHECK (diag_cantidad_sin_evidencia BETWEEN 0 AND 75),
  ADD COLUMN IF NOT EXISTS diag_segmentos_sin_extraccion integer
    CHECK (diag_segmentos_sin_extraccion BETWEEN 0 AND 75),
  ADD COLUMN IF NOT EXISTS diag_lineas_retenidas integer
    CHECK (diag_lineas_retenidas BETWEEN 0 AND 25);
COMMENT ON COLUMN public.dev_ia_quality_results.diag_items_propuestos IS
  'D021: cantidad de propuestas de IA, no contiene contenido de proveedores/documentos.';
COMMENT ON COLUMN public.dev_ia_quality_results.diag_cantidad_sin_evidencia IS
  'D021: items no verificables contra cantidad+unidad literales de origen.';
COMMENT ON COLUMN public.dev_ia_quality_results.diag_origen_no_verificado IS
  'D021: items con origen textual no verificable, sin texto original.';
-- No cambia RLS, permisos, cuota D018, keys o circuito de llamadas.

```
