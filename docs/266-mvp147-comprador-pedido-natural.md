# MVP147 — Pedido natural del arquitecto bloqueado por encabezado y AI ask_material

03/11/2026 · Issue #499 · rama de desarrollo para `cotironda-piloto`.

## Diagnóstico corroborado en el piloto
Segunda ronda: a las 19:18:08Z llegó un texto de comprador, pero `whapi_inbox.processing_state=needs_review`, `request_id=NULL`; la tabla AI registra `completed/quote_request/ask_material`, la respuesta automática `materials/api_accepted`. No existe nueva ronda, tracking ni outbox de proveedores.

El texto que informó el comprador tiene 3 líneas explícitas (1 m³ de arena fina, 2 m³ de piedra partida, 25 bolsas de cemento gris 25 kg) y zona de entrega La Plata. El parser actual quita «Hola, necesito cotizar», pero deja «los siguientes materiales» como renglón sin reconocer; se marca `unresolved`. Además la ruta de IA reemplaza el parser local por una decisión `ask_material` incluso cuando la entrada determinista puede comprobar todas las líneas.

## Corrección
- Aceptar solo encabezados vacíos reconocidos (sin cantidades/precios/negaciones); nunca ocultar líneas comerciales desconocidas.
- Cuando `canPrepareBuyerPilot(local)` ya verificó todas las cantidades, unidades, familias, y localidad, evitar la llamada de IA y procesar por el camino existente de persistencia/autorización. Esto evita decisiones erróneas y costos innecesarios, **sin** saltar control de rol del comprador, zonas, invitaciones y deduplicación.
- Si el local es ambiguo/incompleto, conservar el camino de IA y la retención existente; no enviar ofertas parciales.
- Sin SQL ni cambios de secretos, no cambiar producción, no recrear manualmente la solicitud ya registrada y retenida.

## Aceptación
Pruebas unitarias del texto literal y sus variantes, saludo sin pedido, material desconocido y localidad faltante; regresión CI, Deno typecheck, revisión de Edge PILOTO. La prueba WhatsApp real es con **un nuevo mensaje auténtico**, ya que el anterior fue aceptado en inbox y no debe duplicarse ni falsificar su source. Verificar ronda nueva con exactamente 3 líneas e invitaciones a dos negocios; buyer link y PDF real.
