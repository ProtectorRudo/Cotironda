# 39 — Brecha de Etapa 01: Storage privado pendiente

**29/10/2026 · Auditoría de solo lectura sobre Supabase `cotironda-dev`.**

## Qué existe y qué falta
La Etapa 01 debe entregar **organizaciones, permisos, rubros, catálogos, zonas y Storage privado** (ver `docs/09-roadmap.md`).

Ya están presentes en el esquema actual las tablas `organizations`, `organization_members`, `catalog_categories`, `supplier_profiles`, `supplier_categories`, `supplier_products`, `supplier_delivery_areas`, además de RLS y RPC de registro protegida.

Sin embargo, SQL de solo lectura verificó:
- `SELECT count(*) FROM storage.buckets` = **0**.
- `SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects'` = **0**.

Esto no implica que un archivo sea público. **No existe aún un bucket de documentos configurado para Cotironda**, por lo que no debe afirmarse que el almacenamiento privado está terminado, ni aceptar listas reales de materiales ni enviar archivos a una URL pública.

## Contrato mínimo recomendado, para implementar en rama separada
- Bucket estrictamente **privado** para materiales, cotizaciones y adjuntos; definir clasificación y no mezclar datos de clientes.
- Prefijos de objeto que contengan un `organization_id` validado contra `organization_members`; RLS basada en `auth.uid()`, estado activo y rol, no en `user_metadata`, campos del cliente ni nombre declarado sin comprobar.
- Guardas de tamaño máximo, MIME y extensión: PDF, Excel/Word e imágenes permitidas; escaneo de contenido y defensa contra archivos maliciosos, zip bombs y archivos cifrados según política.
- Lectura para miembros autorizados de la propia empresa; escrituras limitadas a roles con permiso; compradores y proveedores solo ven los archivos que las reglas de licitación autoricen. **Ser miembro de una empresa NO confiere acceso a archivos de otra ni a ofertas anónimas ajenas.**
- RLS y tests de ataque: A no ve B; archivo con path falsificado, usuario suspendido, anónimo, no miembro y upload prohibido; enlaces firmados de expiración corta y retiro de acceso.
- Determinar cuota, retención, borrado, antivirus y backups/recuperación antes del piloto.
- Migración versionada, pruebas locales/CI y **solo luego** aplicación a `cotironda-dev` con chequeo de políticas sin habilitar registro.

## Relevancia para la salida
El objetivo de la Etapa 02 es extraer datos de PDFs/Excel/Word/imágenes enviados por compradores. Sin una política de acceso correcta para documentos sensibles, no corresponde iniciar ingesta real ni declarar lista la Etapa 01.

**No se crearon buckets, objetos ni políticas reales** durante esta auditoría. El plan de implementación queda en [Issue #50](https://github.com/ProtectorRudo/Cotironda/issues/50).

Referencia: [Supabase — Storage buckets y acceso privado](https://supabase.com/docs/guides/storage/buckets/fundamentals).

## Estado posterior a la auditoría inicial — 29/10/2026
La migración `20261029183835_storage_private_buyer_drafts` se aplicó **únicamente en `cotironda-dev`**, tras aprobar CI. El bucket privado y las 2 políticas RLS existen, sin objetos ni empresas. El dato de `0 buckets` de esta auditoría es **histórico previo a la implementación**, no refleja el estado actual. El trabajo de upload HTTP, análisis antimalware, borrado/retención y reglas de ofertas continúa pendiente. Ver `docs/40-storage-borradores-privados.md`.
