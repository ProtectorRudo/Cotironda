# MVP-111 — cotejo de fuentes Word/Excel Office OpenXML

**02/11/2026 — Issue #433 — desarrollo en rama sobre MVP-110**. No se aplica migración permanente ni se despliega ninguna función; no salen WhatsApps reales.

## Hallazgo auditado

La descarga Whapi ya acepta documentos MIME DOCX y XLSX, valida su firma ZIP, tamaño e integridad SHA256, y archiva el original en Storage privado. La IA extrae un borrador dos veces y se validan los importes determinísticamente. Sin embargo, `checkSupplierTextSource` solo consideraba una fuente TXT o CSV: **DOCX/XLSX siempre quedaban pendientes aunque fueran simples**. Una doble lectura de IA no prueba que haya leído cada celda o renglón.

## Nueva implementación

La función pura `checkSupplierOfficeSource` inspecciona los **bytes originales** DOCX/XLSX archivados, usando lector ZIP propio, directorio central y descompresión nativa `DecompressionStream('deflate-raw')` compatible con Deno. Antes de confiar en el contenido valida tamaño del ZIP, tamaño declarado y real de cada entrada, CRC32, límites de número de archivos/entradas/expansión, rutas, nombres duplicados, tipo de compresión, cabeceras locales, XML y ausencia de entidades externas. Nunca descarga plantillas ni depende de URLs contenidas en el documento.

- **Word sencillo:** lee todos los párrafos visibles de `word/document.xml`, preserva el orden, las partes de texto y las entidades XML. Si hay tablas, encabezados, pies, notas, control de cambios, dibujos, imágenes, saltos, texto oculto, elementos no reconocibles o líneas vacías, pasa a `needs_source_review` sin publicar.
- **Excel sencillo:** comprueba una sola hoja, sin fórmulas ni hojas adicionales/ocultas, sin estilos de cifra incierta, dibujos o celdas combinadas. Lee todos los renglones y celdas simples `inlineStr`, cadenas compartidas o números literales, preservando exactamente el texto visible. **No convierte** un `9500` en `$ 9.500,00`: si la cifra visible depende de un formato monetario no interpretado, se mantiene en revisión.
- El texto extraído se coteja contra **cada renglón del borrador IA** con el validador MVP-106 existente: todas las descripciones, cantidades, unidades, precios, cargos extras y total tienen que corresponder; nada se recalcula ni se inventa. Se mantiene el SHA256 del archivo ZIP original como evidencia privada.
- Solo cuando además pasan dos lecturas de IA coincidentes, auditoría decimal `balanced`, consentimiento, catálogo/piloto autorizado y sanitización anti-identidad de MVP-107, se crea la proyección Cotironda anónima. PDF/fotos o Word/Excel complejos **no se publican** porque las dos lecturas no son corroboración suficiente.
- Se amplió en las migraciones **aún no instaladas** MVP-106/107 la lista de MIME admisibles únicamente para este validador de fuente. No se modificaron los permisos públicos, RLS, contactos, cron ni límite de exposición.

## Criterios de aceptación y verificación

- Node: `tests/unit/mvp111-word-excel-source.test.mjs` crea verdaderos paquetes ZIP DOCX/XLSX `stored` y `deflate`. Verifica Word normal; Excel normal; diferencia de precio; fila faltante; hoja extra; fila oculta; fórmula; Word con control de cambios/imagen; ZIP corrupto; MIME PDF; identidad telefónica y dudas de IVA, con resultado conservador.
- PostgreSQL 17 Supabase PILOTO: migraciones MVP-101..110 apiladas (con whitelist Office) y `mvp111_office_source_smoke_rollback.sql`: ronda y ofertas documentales sintéticas con MIME DOCX y XLSX → espejo de líneas, dos lecturas, aritmética, registro de fuente, proyección anónima, enlace del comprador y ocultamiento inmediato tras nueva versión PDF no validada. **PASS** en una sola transacción revertida; `rolled_back=true`.
- La prueba SQL no genera un ZIP real dentro de PostgreSQL: valida la integración y los permisos de MIME; **la inspección de bytes la prueban los tests Node**. La ejecución CI debe verificarse antes de declarar cerrado el desarrollo.

## Todavía bloqueado para una prueba completa

- PDF con texto, imágenes escaneadas y fotos requieren extracción/control independiente de la fuente. DOCX con tablas/encabezados y XLSX con fórmulas/moneda formateada quedan en revisión; la mayoría de presupuestos reales puede utilizar esas estructuras, por lo que **no es soporte universal**.
- Siguen activos los límites técnicos de ~3 MiB, 25 renglones de IA y 8 materiales en PDF de solicitud al proveedor. El piloto general no podrá prometer «cualquier cantidad y formato» hasta rediseñar estos límites con partición/cobertura completa y costo máximo por documento.
- MVP-108 reconoce únicamente cobertura exacta completa con dos proveedores; no termina la competencia económica entre parciales, IVA/flete/disponibilidad/pago ni combinación de dos comercios. La notificación de MVP-110 es «alternativas completas», no ganadores por menor precio.
- Migrations/Edge y el flujo real comprador→dos negocios→vista→cierre→WhatsApp siguen **sin desplegar ni ensayar de punta a punta**. GitHub es la fuente de verdad. Ver contrato `docs/223-contrato-piloto-whatsapp-punta-a-punta.md`.
