# MVP-130 — PDF con tablas y fuentes incrustadas, cotejo independiente

**03/11/2026 · Issue #468 · PILOTO en desarrollo.**

La versión v39 almacena y propone PDFs/fotos/Word/Excel, pero el comprobador de PDF anterior solo daba cobertura a un diseño muy simple. Ese es un límite de Cotironda, no de los archivos que envían los proveedores.

## Implementación

- Se conserva **como primera opción** el comprobador conservador `supplier-source-pdf.ts` que funciona con PDFs simples. Si identifica `unsupported_layout`, pasa a `supplier-source-pdf-general.ts` con `unpdf@1.9.1` pinneado (PDF.js serverless sin ejecución de JavaScript de PDF), límites de 8 MiB, 12 páginas, 9000 elementos de texto, 300 filas, imágenes hasta 16 megapíxeles y 10 segundos de timeout.
- El lector extrae coordenadas de los fragmentos de texto y recompone filas ordenadas en pantalla. Una página escaneada u OCR invisible nunca habilita publicación automáticamente.
- Se exige que **cada renglón** del borrador de IA encuentre una fila fuente distinta con descripción, cantidad, unidad, precio unitario e importe literal. Los importes de cada fila se comparan como multiconjunto; dos importes iguales requieren dos apariciones, evitando omisiones.
- Todos los importes de todas las páginas deben estar asociados al presupuesto o al total. Fletes, pallets, bonificaciones y descuentos se consideran renglones originales si el proveedor los escribió así. IVA, entrega y condiciones de pago no pueden omitirse: si aparecen en una fila aparte, se exige que la nota haya sido conservada.
- Cualquier subtotal, precio, número, dato comercial o condición sin trazabilidad deja el archivo en `needs_source_review`, manteniendo intacto el original y el borrador privado.
- Es un cotejo económico automatizado **conservador**, no la garantía de comprender cualquier PDF. No se habilitan cotizaciones de un escaneo ilegible ni totales contradictorios.

## Pruebas y seguridad

En `tests/unit/mvp130-source-pdf-tables.test.mjs`: PDF de 2 páginas con pallet extra, precio adicional, flete omitido, subtotal no incluido, total modificado, IVA explícito, flete como ítem, escaneo/OCR, duda sin resolver y encabezado con números. Las pruebas usan evidencia posicionada sintética para aislar la lógica del analizador; todavía falta un fixture PDF complejo real que ejercite la librería en ejecución Edge.

Deno check, tests unitarios y regresiones de PDF simple deben estar verdes antes de fusionar. **No desplegar a PILOTO** si la versión npm o parsing runtime no están confirmados en Supabase Edge. El PDF real de Ailín permanece privado y su recuperación todavía no tiene resultado verificable. El trabajo evita inventar precios y preservar la confidencialidad comercial.
