# MVP-114 — cotejo independiente de presupuestos PDF sencillos

**02/11/2026, Issue #439.** Se agrega lectura *conservadora* de PDF binario original para el piloto, detrás de las auditorías MVP102/103/106/107. No se alteran las solicitudes enviadas ni las cotizaciones originales.

## Alcance REAL del lector

- Acepta solo PDF **versión 1.0–1.7, una página, una secuencia de contenido, una fuente estándar Helvetica/Courier/Times-Roman sin encoding extra**, texto ASCII literal, una sola columna con movimientos de línea de arriba hacia abajo y `(...) Tj` completos por renglón. Puede procesar stream sin compresión o Deflate (FlateDecode), con límites de longitud/expansión. Lee cada línea visible en orden: incluye flete, pallets, descuentos si el modelo los extrajo como renglones, y el total literal.
- Antes de habilitar origen verifica cabecera y fin PDF, un solo EOF, objetos sin duplicados, página única, referencia única de contenido y de fuente, un solo stream cuyo tamaño coincide con `/Length`, y **operadores de texto completamente comprendidos**. Si encuentra contenido dibujado, tipos de letra no estándar/embebidos, múltiples páginas o streams, imágenes/XObjects, capas, formularios, cifrado, anotaciones, acciones, metadatos complejos o caracteres no representables, devuelve `needs_source_review` y no autoriza publicación.
- Compara el texto reconstruido con **el mismo guardia de TXT/CSV** de MVP106, el SHA256 del PDF **original archivado** y el registro de líneas: cantidades, unidades, descripciones, precios unitarios, cargos, descuentos y total. El cotejo por sí solo nunca entrega precios al comprador: se requiere doble IA, matemática decimal `balanced`, consentimiento, anonimización, y versión más reciente del proveedor.
- Se habilitó `application/pdf` exclusivamente en los controles privados de fuente y proyección, no como vía libre para cualquier PDF. Un PDF ilegible o escaneado se archiva íntegro para revisión interna; la IA no le inventa cifras ni exige confirmación rutinaria al proveedor.

## Pruebas realizadas

- `tests/unit/mvp114-pdf-simple-source.test.mjs`: genera **PDFs reales en memoria** con tabla `xref` y objetos, stream literal y FlateDecode; verifica control de importe, flete, total, modificaciones de precio, líneas omitidas, dibujo, página extra, firma incorrecta, MIME falso y dudas no resueltas. La ejecución CI es el control de aprobación.
- `mvp114_pdf_source_smoke_rollback.sql`: PG17 en Supabase PILOTO con migraciones MVP101–110 encadenadas, caso fuente PDF sintético, corroboración de IA, aritmética, registro de fuente, cotización pública anónima y actualización de enlace. **PASS ROLLBACK**, `no_sql_installed=true`. Esta prueba SQL **NO comprueba bytes del PDF**: los bytes se verifican en Node.
- Antiguas pruebas de fuente y privacidad se mantienen; publicar un dato ambiguo es FAIL.

## Lo que este cambio NO resuelve

Los PDF comerciales habituales pueden contener grillas, múltiples páginas, imágenes, fuentes incrustadas, columnas o texto con acentos y no pasan el lector. Las fotografías y PDF escaneados requieren un lector con OCR y cotejo de geometría/verificación humana interna, por lo que **NO se presenta esto como un lector general de PDF**. Tampoco elimina por sí mismo límites de 3 MiB/25 líneas/8 materiales; no implementa ranking comparable IVA/flete/stock ni combinaciones parciales; la versión piloto instalada sigue siendo antigua. Está en rama de desarrollo, NO desplegado.

Para una prueba E2E real sin perder cifras, **usar documentos TXT/CSV, DOCX/XLSX sencillos o PDF de una sola página con texto compatible** y verificar la recepción completa. El soporte comercial universal es otro criterio no cumplido.

## Límites y condiciones de operación

Los documentos se siguen archivando privados por Whapi ID (nunca URL del proveedor); proveedor autenticado y catálogo/zona comprobados; cálculo monetario exacto, correcciones versionadas, 96 h de anonimato y contacto mutuo solo después de cierre y consentimiento explícito. El piloto debe pasar el preflight `mvp112_readiness_readonly.sql` antes de una activación real, sin reactivación de rondas históricas (MVP113).
