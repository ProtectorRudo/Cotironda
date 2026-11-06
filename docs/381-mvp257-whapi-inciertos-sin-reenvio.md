# Decisión 381 — Etapa 5: conciliación pasiva de WhatsApps inciertos, MVP257

Fecha 06/11/2026. **Sólo desarrollo.** Sin despliegue PILOTO, producción ni WhatsApps reales.

## Riesgo real

Whapi puede aceptar un mensaje aunque el cliente reciba timeout. Reenviar automáticamente un `leased` o `uncertain` suponiendo que «falló» duplicaría solicitudes o revelaría contactos indebidamente. En Cotironda hay distintas salidas: solicitud a proveedor heredada, solicitud de IA Central, enlace de comprador, acuse al proveedor y aviso de finalistas.

MVP119 registra eventos `statuses.post` sobre mensajes cuyo envío se guardó como `api_accepted`. No asociaba evidencia a un envío `uncertain` conocido por ID. Esta entrega **no reintenta mensajes**: agrega evidencia privada y un resumen operativo de casos no resueltos.

## Implementación

- `supabase/piloto/mvp257_whapi_uncertain_evidence.sql`: tabla privada `uncertain_whapi_receipts_mvp257` con RLS sin grants directos; guarda solo `SHA256` de ID Whapi, tipo de mensaje, request/recipient internos, estado, código y tiempo. Sin teléfono, texto de WhatsApp, adjunto ni contactos.
- RPC service-role-only `cotironda_piloto_observe_uncertain_whapi_mvp257`: exige ID de Whapi con formato correcto, estado/código exactos, rango temporal y destinatario enlazado por HMAC. **Debe existir exactamente un ID en todos los outboxes**; si se reutiliza para dos destinatarios o dos tipos, se rechaza. El origen tiene que estar en `uncertain`. Nunca toma una confirmación de otro canal como propia. Comprobantes repetidos o desordenados no retroceden el estado; `sent` no se informa como `delivered`.
- El webhook ya autenticado, con comprobación de canal y parser MVP119, continúa registrando el recibo ordinario. **Solo si resulta `unmatched`** intenta acreditar el evento como `uncertain`; errores del libro de evidencia devuelven HTTP 503 para que el origen pueda repetirlo, sin enviar nada a WhatsApp.
- `cotironda_piloto_uncertain_summary_mvp257`: diagnóstico privado agregado (inciertos totales, con/sin ID, leases viejos y recibos autenticados). No revela números ni IDs ni autoriza operación sobre estados de envío.
- **No se alteran `whapi_outbox`, `ai_dispatch_jobs_mvp222`, `supplier_ack_mvp104`, `buyer_tracking_mvp091` ni `finalist_whapi_outbox_mvp110`**. Ninguno puede volverse `pending` o reenviable por la evidencia. La aprobación de la ronda y los contactos es independiente.

## Limitaciones y cierre de la etapa 5

Un timeout con **ID Whapi desconocido** no puede confirmarse por `statuses.post` sin correlación. Ese caso queda para investigación manual/autorizada en el proveedor y conciliación de estado; jamás se reintenta a ciegas. Tampoco asumimos que un estado `failed` autoriza otro envío. Para cerrar completamente la etapa 5 falta estudiar una consulta **solo lectura** de Whapi, con cuotas y criterio inequívoco, la vigilancia/alerta de leases antiguos y los otros subsistemas de reintentos. No se modifica el esquema del piloto en este PR.

## Prueba

- PostgreSQL 17 en transacción reversible: destinatario ajeno, ID de otra oferta, ID inexistente, código falso, evidencia válida, duplicados, evento fuera de orden, ID reutilizado por dos empresas, RLS y permisos.
- Node: orden autenticación→canal→observación, rechazo de datos personales, nunca reenvío; regresión de parser, webhook y política MVP256.
- CI integral de GitHub: tests, TypeScript/Deno, Next.js, PostgreSQL/PostgREST. Solo merge a rama de desarrollo después de resultado verde.

**Resultado de diseño:** se consigue una evidencia adicional sin romper la regla «no reintentar estados inciertos». Se mantienen como pendientes los casos sin identificador verificable.
