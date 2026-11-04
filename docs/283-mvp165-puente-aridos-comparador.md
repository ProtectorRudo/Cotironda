# MVP165 — Enlace conservador entre la convención del bolsón y el adaptador económico

**Fecha:** 04/11/2026. Plan #529, seguimiento #535 y ranking #524. **Solo desarrollo, sin despliegue**.

## Problema confirmado

MVP164 ya puede reconocer `BIG BAG`, `bigbag`, `big biag` y `bolsón` estándar de áridos como **1 m³ nominal por envase**. Pero MVP162 solo aceptaba `unitLiteral === unidadPedido`, por lo que los documentos v9 con unidad explícita NULL no podían aprovechar esa convención. En la ronda original de Ailín/Nahuel la presentación comercial coincide, pero las variedades *arena fina* y *piedra partida* NO están acreditadas. Ninguna nueva recomendación está justificada todavía.

## Cambio de desarrollo

Se amplía la firma de `adaptarDocumentoMvp162(..., pruebasBolson=[])` sin romper consumidores antiguos. Cada prueba de bolsón vincula item, línea, SHA del documento, presentación vista y **descripción original del pedido**. Debe obtenerla un verificador **privado** que lea la solicitud auténtica y la versión de proveedor vigente; NUNCA aceptar este campo desde navegador ni salida libre de IA. El adaptador comprueba vínculo con una correlación 1:1, SHA, cantidad fuente y presentación en el texto literal. Ejecuta `interpretarBolsonAridosMvp164` y solo reemplaza **la unidad del contrato económico temporal**, no `unitLiteral`, cuando:

- Producto de la misma familia y **variedad técnica explícitamente compatible** (o pedido genérico, si se acreditó).
- Cantidad nominal solicitada = cantidad nominal de los envases efectivamente cotizados.
- Presentación nominal exactamente **1.000 m³ por envase**, no 0,75, 2, medio, mini, peso sin capacidad, etc. Esta restricción es intencional: no se calcula un precio por m³ a partir del importe de un envase de distinto tamaño sin auditoría monetaria específica.
- Equivalencia técnica independiente `verificada`, evidencia documental v9 íntegra, misma SHA/revisión, y **disponibilidad** corroborada.
- Neto por unidad **después de descuentos**, IVA por renglón, flete, mínimo y condiciones acreditados con conciliación decimal original; la normalización del envase nunca suministra esos datos.

Cuando falla alguna condición, **la cotización permanece visible pero no comparable**. El resultado no contiene SHA, número de WhatsApp, links de originales ni identidad personal, y sigue marcando `contactosRevelados=false`, `originalesDescargables=false`. El motor de recomendaciones existente calcula por separado cuando recibe una `OfertaComparable` **completa**; no se conecta ni al portal ni al cierre real mediante este PR.

## Pruebas y límites

Archivo `tests/unit/mvp165-aridos-adaptador.test.mjs`: 16 escenarios de normalización 1+2 BIG BAG nominales con variedad expresa, alias, documentos con variedad ausente (casos representativos de los originales), presentación distinta, cantidades/stock, cruces de SHA/renglones, términos económicos incompletos, IVA, importes, extras y revisión. Se conservan intactos los tests anteriores de MVP162 y MVP164.

**Pendientes fuera de este PR:** implementar en el servicio privado el productor verificable de `PruebaBolsonMvp165` con localizador de documento y origen de pedido; integrar descuentos/IVA/flete/stock de PDF/Excel/Word/imagen (#535); validar explícitamente equivalencia fina/partida; correr primero en modo solo lectura sobre ronda de prueba; escalar ranking (#532); conectar al cierre nuevo y obtener consentimiento antes de liberar originales (#525). No retroactivar rondas ni enviar mensajes a proveedores.

## Seguridad operacional

No hay migración SQL, Edge Function, flags, cambios de permisos ni mensajes WhatsApp en MVP165. No implica que la ronda actual ya sea comparable ni que el piloto esté listo de punta a punta. Entrega únicamente el enlace puro y probado por CI cuando los controles finalicen.
