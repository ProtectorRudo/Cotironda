# 67 — Primer XLSX auténtico de prueba hasta planes por proveedor (sin enviar)

**30/10/2026 · Issue #106 · rama `feat/02-xlsx-offline-ingestion` hija de PR #105.**

## Objetivo comercial
El comprador podrá enviar su lista de materiales sin corregir cada ítem. Este primer incremento prueba **bytes XLSX (Office Open XML) → tabla → cantidades y productos → planes seleccionados por catálogo** con referencias a hoja y fila. Es un **módulo offline de laboratorio**, no un endpoint abierto, no un servicio de archivos comercial ni una integración con WhatsApp. La autorización de distribución del comprador se exige en la llamada del planificador; ofertas económicas siguen requiriendo confirmación de los proveedores.

## Alcance exacto y ejemplos
- Formato `.xlsx` basado en ZIP/OOXML; **NO** `.xls`, `.xlsm`, `.csv`, documentos Word, PDF, imágenes ni archivos con macros/fórmulas.
- Solo archivos reducidos y estrictos: **una a tres hojas técnicas `xl/worksheets/sheetN.xml`**, cada una con encabezado `Cantidad | Unidad | Material` o `Material | Cantidad | Unidad` (acepta `Producto`/`Descripción` como sinónimos de encabezado). El catálogo determina si una línea resulta enviable: igualdad de producto y unidad, rubro inequívoco, zona y consentimiento del proveedor.
- Soporta celdas `inlineStr` y `sharedStrings`, filas reales por número de hoja/fila, hasta 100 líneas en total. Una fila incompleta se conserva como referencia retenida; una cantidad `1.000` ambigua no se convierte sin aclaración.
- `scripts/offline/xlsx-seguro.mjs`: lector de bytes en memoria, sin dependencias externas. Reutiliza `simularDespachoDesdeTexto()` con parámetro opcional de ubicaciones, y el matcher puro de PR #103. **Nada se guarda ni se envía**.
- `tests/helpers/xlsx-fixture.mjs`: crea ZIP/OOXML sintético real en Node con central directory, deflate y CRC32. **No acredita cobertura con Excel de clientes ni equivalencia de productos reales.**
- `scripts/demo/xlsx-demo.mjs` genera 5 líneas de un archivo de prueba: 3 planes por proveedor, 1 cantidad ambigua y 1 producto sin catálogo.

## Defensa de procesamiento (laboratorio)
- Tamaño total de archivo hasta 4 MiB, 48 entradas ZIP, máximo XML de 1 MiB por pieza, 5 MiB descomprimidos totales, límites de razón de compresión, 3 hojas y 100 artículos.
- Lee central directory, verifica local headers, nombres, offsets, tamaño, CRC32, ZIP cifrado/descriptor/ZIP64 y estructura. Rechaza rutas peligrosas, contenidos activos/embebidos, vínculos externos, DTD/ENTITY, tipos macroEnabled, fórmulas y hojas/filas ocultas.
- Si una columna adicional contiene datos, falla para no omitir silenciosamente información. No ejecuta macros, fórmulas, XML externo ni instrucciones de la planilla.
- **No publicar un endpoint de carga basándose solo en este lector.** Aún faltan biblioteca mantenida y su revisión, antivirus real, cuarentena, inspección de tipos por bytes, límites HTTP/CPU, backups y servicio aislado según Issue #61.

## Comprobación reproducible
Node 22+: `npm run demo:xlsx` para impresión de JSON simulado sin secretos ni red. `npm run test:unit` / GitHub Actions ejecutan `tests/unit/xlsx-offline.test.mjs` junto con la suite previa. Estado exacto de CI y commit deben tomarse del PR después de ejecutar los jobs, nunca suponerse.

## Lo que NO está hecho
No soporta hojas arbitrarias, encabezados libres, fórmulas o sinónimos comerciales por IA; para el MVP real se necesita parsing/OCR maduro, representación estructurada comprobada, alias/productos validados por proveedor, autorización de tenant tomada de base real, bitácora, cola y Whapi. Ninguna cuenta, empresa, objeto Storage, publicación o número de WhatsApp se modificó en este incremento.

## Precondiciones para integrar
Este PR se apila sobre #105 → #103 → #101 y los PRs de Etapa 01. No fusionar suelto a `main`, no desplegar en producción y no habilitar archivos comerciales antes de completar Issue #61.