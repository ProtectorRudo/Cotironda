# 08 — Pruebas, aceptación y escenarios críticos

## Política
Criterios de aceptación observables por Issue; casos habituales, extremos y regresión. Ningún «probado» sin ejecución y evidencia. En la Etapa 00 sólo se validan documentos; aún no existen tests ejecutables de producto.

## Puerta de aceptación UX-001 (sin curso y WhatsApp primero)
Además de pruebas técnicas, antes del piloto realizar con personas no técnicas de cada rol:
- Comprador manda lista (texto, foto/archivo cuando estén soportados) por WhatsApp; verifica que la plataforma no exija portal, reescritura ni clasificación manual.
- Proveedor responde y confirma cotización por WhatsApp sin iniciar sesión en portal; comprueba que no se pierda información, no se inventen precios y el estado aparezca correctamente en su tablero opcional.
- Pedido ambiguo: solo la duda bloquea ese material; los seguros avanzan, sin una confirmación previa por cada línea.
- Duplicados/desconexión: no repetir invitaciones ni exigir que se vuelvan a transcribir datos; mensajes de falla y recuperación claros.
- Plazo finalizado: no anunciar ganador sin adjudicación humana, conservar privacidad y distinguir confirmada de recibida.
Medir con línea base real tiempo, acciones, consultas de ayuda, abandonos y uso WhatsApp sin portal. Metas numéricas pendientes de piloto; no afirmar E2E WhatsApp aprobado antes de conectarlo. Ver [UX-001](89-ux-cero-friccion-whatsapp-first.md).

## Ranking y materiales
- T01: Solicitud 13 líneas; A=13, B=10, C=2. No comparar totales como iguales. Cobertura correcta.
- T02: Las mismas diez líneas: A $1.000.000, B $950.000. B 5% más económico solo para esas diez.
- T03: A 13 artículos por $1.300.000 + $40.000 de flete; combinación A+B $1.250.000 + $100.000. Elegir opción total A si las condiciones equivalen.
- T04: Bolsas 25 kg/50 kg: unidades y peso deben normalizarse o requerir aclaración.
- T05: Marca alternativa con especificaciones equivalentes vs marca obligatoria.
- T06: IVA sin aclarar: no inventar; solicitar confirmación.
- T07: Oferta 8 unidades para pedido de 10: no cubrir línea completa.
- T08: Ofertar artículo no registrado en catálogo: confirmar producto, no descartarlo automáticamente.
- T09: Fletes de dos proveedores, mínimos y descuentos se recalculan una sola vez según condiciones.
- T10: Empate de costos: indicar empate sin fingir un ganador.

## IA
- T11: Archivos PDF, Excel, Word, imagen y texto de 50–100 líneas con trazabilidad.
- T12: Manuscrito ilegible: revisión requerida, nada inventado.
- T13: Instrucciones maliciosas en archivos no ejecutan acciones.
- T14: Un proveedor en dos rubros recibe UNA solicitud idempotente con su subconjunto de productos confirmados; ningún artículo que no comercialice.

## WhatsApp
- T15: Webhook duplicado → único evento/acción.
- T16: Whapi desconectado → cola/reintentos sin mensajes masivos repetidos.
- T17: Cambio de precio → versión en borrador hasta confirmación.
- T18: Oferta después de cierre → rechazo o reapertura auditada.
- T19: Proveedor solicita baja → detener invitaciones futuras.

## Seguridad y pagos
- T20: Empresa ajena intenta acceder a oferta/archivo → acceso denegado.
- T21: URL firmada vencida → denegado.
- T22: Webhook de suscripción duplicado → una única transición.
- T23: Colaborador revocado no ve datos sensibles.
- T24: Proveedor no adjudicado no recibe contacto; adjudicado sí después de confirmación.

## Secuencia de pruebas
Unitarias → integración con BD aislada → browser end-to-end → WhatsApp con números autorizados → piloto comercial. Definir objetivos medibles de error, latencia y costo antes del piloto.


## D013 — verificación del planificador automático
El envío del comprador incluye autorización explícita; no hay confirmación por línea. El proveedor solo recibe artículos confirmados de su catálogo exacto y dentro de su zona, con opt-in y sin baja. Los artículos ambiguos, unidades distintas, especificaciones no equivalentes y duplicados no se envían; el resto sigue. Un único plan por ronda/proveedor con clave idempotente. Validación offline no equivale a WhatsApp real ni PDF procesado.
