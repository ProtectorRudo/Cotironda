# Decisión 402 — MVP277: prueba independiente de originales PDF/DOCX/XLSX del comprador

**Fecha:** 06/11/2026 (Argentina; tareas de CI pueden registrar UTC del día 7). **Luz verde = desarrollar y probar, no desplegar**. Sin comprar servicios, abrir nuevos usuarios, instalar migraciones, activar WhatsApp ni tocar producción.

## Problema

MVP275/276 habilitan el circuito IA Central desde TXT/CSV originales. El comprador real suele enviar PDF/Excel/Word e imágenes. Dos lecturas iguales de IA **no prueban** haber leído todos los renglones. Y convertir la salida del modelo a texto para las funciones de TXT violaría la autorización original SHA-256: los bytes del PDF u Office no son el texto extraído.

## MVP277, solo verificación privada

`ai-central-buyer-binary-mvp277.ts` reutiliza lectores **independientes existentes** en Cotironda:
- PDF: `readPdfPositioned` (unpdf), páginas con orden visual/posiciones, rechaza fuentes escaneadas, capas invisibles y sin texto seleccionable. Máximo 12 páginas.
- DOCX y XLSX: `readOfficeVisibleRows`, desempaqueta ZIP con límites, CRC y rechazo de hojas ocultas, fórmulas, imágenes, macros y contenido embebido fuera del contrato. No afirma soporte de DOC/XLS antiguos.
- Recalcula SHA-256 de **todos los bytes originales** del documento; no confía en la huella indicada por Whapi o por el modelo.

Cada línea de los dos borradores de IA del comprador tiene que concordar en descripción, cantidad, unidad, zona y aclaraciones. El lector independiente encuentra la descripción literal y una cantidad/unidad separadas **en el mismo renglón** del PDF o de la hoja/párrafo, en el mismo orden; no acepta confundir 2,5 mm² o 50 kg de especificación con la cantidad. Renglones extra con números, posibles productos sin cantidad, fletes, descuentos, encabezados numerados o indicaciones comerciales no cubiertas **bloquean la verificación** para no perder materiales ni condiciones. La zona de entrega no se inventa: si no está visible literalmente, `requiere_zona`.

Como la capa actual de SQL requiere `original_request` de longitud máxima 4000 y el lector IA permite hasta 25 artículos por borrador, esta primera etapa se limita a 25 ítems, 90 filas/4.000 caracteres extraídos y 3 MiB del archivo. Fuentes mayores requieren segmentación segura con rastro original; **nunca recortar 26.º artículo** para aparentar cobertura. El texto normalizado del lector y su SHA se generan exclusivamente en memoria del servidor como evidencia privada; no se imprimen en logs ni en una respuesta HTTP.

## Integración y seguridad

En el webhook, la bandera `COTIRONDA_PILOT_BUYER_BINARY_CENTRAL_PREVIEW_ENABLED` (OFF por defecto) permite exclusivamente una previsualización privada de PDF, DOCX y XLSX de un comprador cuya fuente ya pasó el almacenamiento privado. Es **mutuamente excluyente** con el viejo preparador documental y con el broker MVP276 durante esa solicitud. Nunca crea rondas, despachos, contactos, tokens de seguimiento o mensajes. En caso de error queda la fuente almacenada para revisión; no reintenta Whapi ni acepta un cambio silencioso de cifra.

El PDF escaneado y las fotos JPEG/PNG/WebP requieren OCR/vista visual independiente, aún no disponible. **No se promociona coincidencia de dos modelos como corroboración visual**.

La migración MVP276 valida originales TXT/CSV en `media_archive_mvp095` y cuatro funciones RPC. **NO** se amplía automáticamente para PDF/XLSX/DOCX: exige una futura atestación server-side confiable para SHA del binario, SHA del texto derivado, cobertura completa de líneas, autorización de comprador y catálogo, idempotencia y revisión antes de permitir publicación. Nunca insertar texto generado por IA con `kind='text'`.

## Criterios de aceptación y evidencia

1. Casos unitarios TXT no afectados; DOCX y XLSX auténticos sintéticos (ZIP/XML + CRC) con dos rubros y extra de línea, tampering, hojas ocultas, fórmulas y multimedia.
2. PDF de dos páginas **real sintético** en Deno, interpretado por `unpdf@2.1.0`; cantidad errónea rechazada.
3. Casos límite: PDF escaneado, cifras ocultas o sin cubrir, línea adicional, unidad errónea, cambio de SHA, lectura doble contradictoria, más de 25 líneas.
4. Deno typecheck del webhook, CI general y compilación de Next.js; corrección de errores antes de fusionar.
5. Fusión **solo a desarrollo**. No instalar SQL, Edge, cron ni webhook en el piloto. El respaldo pago sigue Plan B por decisión del propietario, no implica seguridad automática de datos reales.

**Estado declarado:** verificador de originales y previsualización privada, no compatibilidad E2E multiformato. El objetivo siguiente es la transacción original-documento → evidencia de origen → IA Central y una ronda de prueba controlada de 3 participantes con permisos `Publicalo` solo después de validar.
