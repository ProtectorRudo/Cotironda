# MVP-123 — ReferenceError de ACK fuera del ciclo y bloqueo de PDF

**03/11/2026 · Issue #456 · únicamente PILOTO.**

## Caso real
La corrección del contexto de localidad (MVP-122, Whapi v35) creó una ronda real con dos materiales, ciudad La Plata, dos invitaciones, dos entradas de outbox en estado `pending` y enlace privado al comprador con `api_accepted`. El webhook registró dos HTTP **503** con `cotironda_pilot_unexpected: ReferenceError` después del registro del enlace. No había entregas a los proveedores ni ofertas recibidas.

## Causa y alcance
En `supabase/functions/cotironda-piloto-whapi/index.ts`, la llave de cierre del ciclo `for(const row of event.messages)` estaba **antes** de la sección `Acknowledge a supplier`. Esa sección utilizaba `supplierAckMode`, `messageHash`, `chatHash` y `row` **fuera de su ámbito léxico**; incluso cuando no había una cotización de proveedor, el primer acceso provocaba `ReferenceError`, y se abortaba el webhook antes de `dispatchTwo(sec,db)`. Una respuesta de API parcialmente exitosa no garantizaba los PDF.

## Corrección
Mover el cierre del ciclo **después** del bloque de agradecimiento al proveedor. Mantener el envío de PDFs `dispatchTwo` **fuera** del ciclo, una sola vez por webhook; usa claims SQL, validación de destinatarios/consentimientos, máximo 2 mensajes, recibo `api_accepted` o `uncertain` (sin reintentos ciegos). No cambiar fuente, productos, zona ni condiciones de la ronda ya creada.

## Ensayos y controles
- Nuevo test de regresión `tests/unit/mvp123-whapi-ack-scope.test.mjs` detecta cierre anticipado, exige ACK dentro del ciclo y dispatch después, además de verificar rutas de idempotencia.
- Ejecución SQL real en Supabase PILOTO dentro de `BEGIN/ROLLBACK` sobre los dos outboxes pendientes: ambos se pudieron reclamar y autorizar; cada snapshot privado contiene exactamente **2 artículos** y La Plata; un tercer claim devolvió `empty`. Verificación posterior: `leased=0, pending=2` (reversión completa). **No se enviaron PDFs en este ensayo**.
- CI del PR y publicación Edge con commit verificado se registran por separado. No se habilita el guardia de finalistas.

## Próxima evidencia requerida
Comprobar tras el despliegue que **ambos** pendientes pasan a `api_accepted` o `uncertain`, que se conserva el ID de Whapi cuando esté disponible y que exista evento real `delivered` antes de afirmar recepción. Registrar ofertas autenticadas de los proveedores y auditar fidelidad de renglones, condiciones y enlaces. No divulgar ni reproducir el token privado del enlace de seguimiento. Si se necesita un evento nuevo para vaciar la cola, usar una interacción auténtica del participante autorizado; no fabricar mensajes, secretos o webhooks. Aún no corresponde declarar E2E completo.
