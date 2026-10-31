# Archivo recuperado de migración DEV: dev_quality_once_only

> **NO EJECUTAR. Archivo forense solamente. Origen: `supabase_migrations.schema_migrations` de Cotironda DEV, consultado de solo lectura el 31/10/2026. Nunca cargar automáticamente en producción ni en DEV. Contiene DDL y puede crear funciones privilegiadas o modificar extensiones.**

- Versión aplicada originalmente: `20261030182413`
- Huella MD5 del SQL original en la tabla de migraciones: `39c5562965176a19866cd62848ffda09`
- Longitud del SQL archivado: 1231 caracteres (Unicode; comparar byte a byte en un runner UTF-8 antes de reconstruir)
- Se archivó sin ejecutar ninguna sentencia y sin extraer secretos de Vault.

```sql
-- Etapa 02 / D018 — un solo intento de benchmark por cada caso permitido.
-- Aplicar EXCLUSIVAMENTE en Supabase cotironda-dev, NUNCA en produccion.
-- Fuente auditada, sincronizada con Supabase migration dev_quality_once_only.
CREATE TABLE IF NOT EXISTS public.dev_ia_quality_claims (
  case_id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dev_ia_quality_known_case CHECK (case_id IN (
    'marca_mencionada_y_presentacion_distinta',
    'cemento_generico_sin_especificacion_inventada',
    'cemento_cpc_50_a_avellaneda_25',
    'dos_productos_misma_linea',
    'solo_marca_exclusiva',
    'RH_pedido_RF_cotizacion_diferente_no_homologada'
  ))
);
ALTER TABLE public.dev_ia_quality_claims ENABLE ROW LEVEL SECURITY;
-- Unico cliente backend autorizado: supabaseAdmin (service_role).
-- No hay policies para anon o authenticated. No almacenar textos ni keys.
REVOKE ALL ON TABLE public.dev_ia_quality_claims FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.dev_ia_quality_claims TO service_role;
COMMENT ON TABLE public.dev_ia_quality_claims IS
  'Cotironda DEV only: persistent one-shot reservation per synthetic quality benchmark case; no user data, secrets or prompts.';

```
