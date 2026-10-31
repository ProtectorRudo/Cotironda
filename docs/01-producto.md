# 01 — Producto

## Problema
Compradores de materiales de obra deben solicitar cotizaciones por múltiples canales, perseguir respuestas y comparar propuestas difíciles de equiparar. Muchos proveedores rechazan registrarse en portales nuevos.

## Propuesta
El comprador (arquitecto, estudio, constructora, desarrolladora o responsable de compras) importa un PDF, Excel, Word, imagen o texto; IA extrae y distribuye automáticamente solicitudes por producto confirmado de catálogo y zona, sin revisión previa del comprador. Los proveedores reciben invitaciones pertinentes por WhatsApp y cotizan por mensaje, archivo o portal opcional. Las ofertas son anónimas en la ronda; el comprador ve cobertura y costos comparables, y adjudica a uno o dos proveedores por rubro.

## Modelo comercial
Proveedor $0, sin comisión. Comprador con prueba gratuita por definir y suscripción prevista ARS 10.000/mes, solicitudes ilimitadas sujetas a uso razonable. Precio y condiciones sujetos a piloto.

## Rubros iniciales
Corralones; pinturerías; electricidad; construcción en seco; sanitarios/plomería. Posteriores: ferretería, hierros, revestimientos, techos/aislaciones. Productos físicos especificables, no mano de obra subjetiva.

## Mandato de experiencia — UX-001
**Hiperintuitivo, cero fricción innecesaria, amigable con compradores y proveedores, sin capacitación.** La operación cotidiana se resuelve prioritariamente por WhatsApp en ambos extremos; la web es una alternativa y un tablero de consulta/decisión.
- Comprador: enviar la lista una vez desde WhatsApp o web; Cotironda distribuye lo seguro por rubro/producto y zona, sin copiar ni revisar línea por línea. Si un artículo necesita aclaración, preguntar solo eso.
- Proveedor: recibir por WhatsApp, contestar con su forma habitual (texto/archivo/audio compatible), resolver dudas puntuales y confirmar el resumen; Cotironda registra el presupuesto en el portal automáticamente. Ningún paso rutinario debe exigir login.
- El comprador consulta progreso y compara al cierre; adjudica manualmente. **Siete días es un ejemplo de plazo configurable, no una selección automática de ganador**.
- El estado mostrado debe distinguir mensaje recibido, borrador detectado, oferta confirmada, ronda cerrada y adjudicación. No dar por entregado o confirmado lo que está pendiente.
- Mantener controles de consentimiento, seguridad, exactitud y privacidad sin trasladar complejidad al usuario. Antes del piloto se exigirán pruebas sin capacitación con compradores y corralones reales.
[Contrato UX-001](89-ux-cero-friccion-whatsapp-first.md). Este diseño de WhatsApp todavía no está conectado al MVP.

## Experiencia esencial
Comprador: **enviar lista → distribución automática → comparar → adjudicar**.
Proveedor: **recibir → cotizar → confirmar → ajustar opcionalmente → resultado**.

## No incluido inicialmente
Compra/venta directa de materiales, inventario en tiempo real garantizado, adjudicación automática, garantía de entrega, facturación del proveedor o comisión sobre compras. Portal de proveedor siempre opcional.

## Métricas piloto (objetivos a validar)
Tasa de solicitudes con ≥2 cotizaciones válidas, cobertura por línea y cantidad, tiempo hasta oferta, adjudicaciones, uso recurrente, bajas de WhatsApp, costo por ronda y por comprador.

## Diferencial D013 — distribución automática
El comprador envía su presupuesto/lista una sola vez (PDF, Excel, imagen, Word o texto), autorizando la distribución. Cotironda extrae y deriva automáticamente solo los materiales que cada proveedor confirmó que comercializa y entrega en esa zona. El comprador recibe resumen posterior de cobertura y dudas, sin confirmar cada línea. Una línea ambigua no detiene el resto. Cotizaciones y precios propuestos continúan requiriendo confirmación del proveedor; adjudicación manual.
