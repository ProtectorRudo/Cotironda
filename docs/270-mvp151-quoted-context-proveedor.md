# MVP151 — Cotizaciones identificadas por la respuesta a un PDF de WhatsApp

03/11/2026 · Issue #507 (subetapa #505). Solo `cotironda-piloto`. No actualizar main/producción.

## Origen y causa
Con múltiples invitaciones abiertas, el RPC original `receive_whapi_v1` solamente relaciona texto del proveedor cuando cuenta exactamente una invitación. Una respuesta por archivo en `reserve_media_mvp095` también usa la única invitación como referencia y puede quedar sin vínculo. Whapi.Cloud informa al webhook de respuestas citadas `context.quoted_id`, y el mensaje del PDF saliente ya se guardó en `whapi_outbox.whapi_message_id` (fuente: https://support.whapi.cloud/help-desk/sending/send-message-with-buttons).

## Cambios
- Extraer `context.quoted_id` con gramática estricta, exclusivamente de webhook autenticado y contacto de los dos proveedores aprobados; no usarlo para cambiar la localidad del comprador.
- Para proveedor con cita en texto, usar marcador interno en parámetro actualmente no usado por proveedor de `receive_whapi_v1`, a fin de impedir autovinculación legacy por ronda única; después de archivar la fuente cifrada, RPC privado compara destinatario, ID de PDF saliente aceptado, invitación preparada, ronda vigente, consentimientos y hash literal del presupuesto. Solo si hay **una** coincidencia inserta la versión original con revisión y vincula inbox. Si no, conserva `unmatched_quote` sin falsas ofertas.
- Para foto/PDF/Excel de proveedor, luego de reservar archivo y antes de IA, la RPC de media toma como autoridad el PDF citado para relacionar `media_archive.request_id`; si cita errónea, revierte cualquier asignación por ronda única y conserva archivo sin asociarlo al pedido incorrecto.
- Sin cita y con una única invitación abierta, la conducta de antes sigue disponible. Más de una ronda sin cita no se adivina; queda pendiente de aclaración específica.

## Seguridad y pruebas
- El transportador valida firma/token Whapi; ambas RPC adicionales solo `service_role`, verificación de fuente SHA-256 y permisos por role/supplier.
- Pruebas con cotizaciones de 2 rondas, citado correcto y cita ajena, duplicación, hash distinto, archivo equivocado. Test SQL BEGIN/ROLLBACK sin mensajes salientes ni cambios persistentes.
- No tocar cálculo económico ni anonimato; archivos aún pasan por verificación documental y nunca se publican por solo estar vinculados.
- Comparar los bytes de runtime Whapi v42 y del SQL actual antes de desplegar. Rollback: redeploy webhook v42 y reponer la función `receive_whapi_v1` anterior; mantener las fuentes ya vinculadas sin borrar.
