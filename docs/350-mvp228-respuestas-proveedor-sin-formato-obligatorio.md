# MVP228 — No restringir respuestas de proveedores a un formato de precio

Fecha: 2026-11-05. Enfoque: **IA interpreta lenguaje libre, SQL demuestra la ronda**.

## Incidente prevenido

En el webhook heredado, un mensaje de proveedor sin `$`, formato
de miles o la palabra `total` se almacena como `needs_review`. El
nuevo vinculador MVP225 solo se llamaba para `unmatched_quote`: una
respuesta habitual como «CPC 8900 bolsa, arena 32000 bolsón» nunca
entraba al analizador IA, aunque respondiera a un PDF exacto.

Además, `ia_is_supplier_mvp226` dejaba de proteger respuestas en
rondas IA Central abiertas si el operador apagaba el flag de IA del
comprador. El parser heredado podía entonces adjudicar la respuesta
a una invitación anterior, especialmente si esa era la única legacy.

## Solución

- Para cualquier texto o archivo firmado del proveedor, consultar el
  RPC `ia_is_supplier_mvp226`, independientemente de banderas de IA.
  Solo reconoce un negocio registrado y consentido con un trabajo de
  despacho IA abierto; de ningún modo elige un comprador por similitud.
- Si tiene una ronda IA abierta, su texto no puede entrar al
  autoasociador legacy. El nuevo vínculo se intenta desde
  `needs_review` y `unmatched_quote`, y el RPC comprueba fuente SHA,
  destinatario HMAC, plazo y mensaje Whapi citado; sin cita, solamente
  cuando hay UNA ronda inequívoca, considerando también rondas legacy.
- El guard persiste aun con gate IA en OFF, para no perder respuestas
  pendientes. Esto incluye trabajos con resultado Whapi incierto:
  se protegen de mala atribución pero no se asocian económicamente
  hasta acreditar su fuente y la entrega.
- El analizador económico nuevo solo se invoca con la bandera
  `COTIRONDA_PILOT_AI_CENTRAL_QUOTE_ANALYSIS_ENABLED=true`.
  No se activa ni manda WhatsApps a partir de esta corrección.

## Verificación y alcance

CI PG17 sintético prueba un presupuesto sin signo de pesos,
identificador `wamid.`, guard encendido con gate OFF, dos rondas
ambiguas, PDF original, HMAC y permisos. Pruebas unitarias adicionales
controlan el enlace de los dos estados y el bloqueo de la ruta legacy.

Todavía quedan: archivos PDF/Excel/imagen en el lector IA nuevo,
reanudación de localidad faltante, consolidación de ofertas múltiples,
ranking comparable/descargas/cierre y E2E real con los tres teléfonos
autorizados. No cerrar el checklist #529 ni afirmar piloto finalizado.
