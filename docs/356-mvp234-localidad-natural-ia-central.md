# Decisión 356 — Respuestas naturales de localidad para IA Central (MVP234)

## Problema

En MVP233 existe continuidad segura del pedido original si el comprador
responde una localidad simple como «En City Bell». Sin embargo,
`standaloneDeliveryCity` fue diseñado para mensajes muy breves y puede
rechazar «La entrega es en City Bell» o interpretar una frase completa
como si fuera el nombre de una ciudad.

## Cambio acotado

- Normalizar **solamente** el texto de la respuesta de localidad que IA
  Central envía al RPC de continuación MVP233. Ejemplos: «La entrega
  sería en City Bell», «Es en Berisso» y «La obra queda en Tolosa».
- El nombre de localidad se conserva sin intentar inferir códigos
  postales ni geografía externa; no hay diccionario de ciudades.
- Frases comerciales, cantidades, saludos y mensajes multilínea no son
  respuestas de localidad confirmadas. Se mantienen en el flujo existente.
- **No tocar** el parser de archivos, presupuestos, vendedores ni
  documentos heredados, para evitar regresiones.
- La atribución de la respuesta no depende del parser: MVP233 verifica
  el mensaje firmado, consentimiento, un **único** pedido `needs_zone`,
  antigüedad, estado de los controles y original AES/SHA.
- Una respuesta sin pedido pendiente no crea, por sí sola, una ronda.
  Un historial ambiguo nunca se asigna arbitrariamente.

## Criterios de aceptación

1. Extraer únicamente la localidad de frases habituales, sin conservar
   «la entrega es en» dentro del campo de destino.
2. No confundir una lista de materiales ni instrucciones adicionales
   con una respuesta autónoma de localidad.
3. Mantener intacto el contrato SQL MVP233 y la idempotencia de
   respuesta HMAC original.
4. Pasar pruebas de normalización y regresión de MVP233. El cambio
   **no envía WhatsApps** ni activa controles.
5. Actualizar el webhook **solo en el piloto y con permiso de publicación**,
   cuando estén instaladas las dependencias MVP233 y esté aprobado CI.

## Alcance y pendientes

Desarrollo en rama: ninguna publicación ni cambio de producción.
Para la prueba real faltan el despliegue autorizado, la verificación
de que MVP233 esté instalado en `cotironda-piloto`, y el circuito
WhatsApp desde pedido hasta presupuesto y ranking.
