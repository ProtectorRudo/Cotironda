# MVP-119 — evidencia de entrega WhatsApp, no confundir aceptación API con recepción

**02/11/2026. Issue #449. Desarrollo sin despliegue.** Ningún teléfono real fue contactado.

## Bloqueo descubierto

Whapi informa `sent: true` y un identificador al aceptar `POST /messages/text` o `POST /messages/document`. **No significa entregado al destinatario.** Según [la documentación oficial de eventos de Whapi](https://support.whapi.cloud/help-desk/receiving/webhooks/incoming-webhooks-format/sent-message), los mensajes directos reciben cambios posteriores como `statuses.post` con `statuses: [{id,code,status,recipient_id,timestamp}]`. El mismo estado puede repetirse y los eventos pueden llegar en orden distinto. Las confirmaciones de lectura pueden no llegar aunque la persona haya abierto el mensaje. Para grupos, Whapi usa `statuses.put` por `viewer_id`, que **no** es equivalente a un único destino.

Antes, nuestro endpoint `cotironda-piloto-whapi` respondía a `statuses.post` con una respuesta de prueba sin guardar entrega; entonces podía aparentar éxito porque la API aceptó un texto. Este cambio agrega evidencia independiente.

## Implementación

1. `supabase/functions/cotironda-piloto-whapi/delivery-status.ts`: parser sin red, limitado a 10 confirmaciones por evento, esquema de Whapi validado, estado/código/timestamp, solo chats directos; estados de grupo `statuses.put` quedan excluidos. No se almacena `recipient_id` ni `viewer_id` en registros.
2. `supabase/functions/cotironda-piloto-whapi/index.ts`: un webhook de estados es **accionable**, por lo que se exige el mismo secreto de webhook y canal del mensaje original **antes** de cualquier escritura SQL. Cada confirmación se correlaciona en SQL con un mensaje previamente aceptado por Whapi; chat de destino se identifica por HMAC y el ID se sustituye por SHA256 en el libro de evidencia. Eventos desconocidos, de otro contacto o repetidos no prueban entrega. No produce reenvíos automáticos.
3. `mvp119_whapi_delivery_receipts.sql`: libro de evidencia privado `delivery_receipts_mvp119` con RLS, revocación de acceso directo a `anon`, `authenticated` y `service_role`; RPC solo para el servidor y `security definer` con `search_path=''`. Correlaciona 4 tipos de mensajes aceptados: invitación a negocio, enlace privado al arquitecto, agradecimiento de presupuesto y aviso de finalista. Los últimos dos tipos antes no retenían el ID Whapi: se agregan columnas privadas y RPC idempotentes para hacerlo después del envío.
4. Monotonicidad: `pending < sent < failed/deleted < delivered < read < played`. Una confirmación posterior de `sent` o `failed` **jamás borra** una prueba ya recibida de `delivered` o `read`. Duplicados no crean filas nuevas.
5. `cotironda_piloto_delivery_summary_mvp119` solo para operaciones internas: distingue estado observado vs entrega confirmada, nunca publica teléfonos, mensaje original o datos de contactos. **Un mensaje aceptado sin webhook de entrega no cuenta como entregado.**

## Prueba realizada

- `tests/unit/mvp119-whapi-status-delivery.test.mjs`: 8 tests de carga `statuses.post` oficial, `statuses.put` por grupo, formato malicioso, evento sin autorización, DNI/contacto ajeno, ID inválido, tiempo antiguo, estado/código incoherente, mapeo de RPC y privacidad.
- `supabase/piloto/mvp119_receipts_smoke_rollback.sql` sobre proyecto PILOTO PostgreSQL 17, después de cargar **temporalmente** el stack SQL MVP101–119: creó ronda sintética, invitación y outbox con ID de API aceptado, registró `sent` → `delivered` → `read`, intentó democión `sent` y `failed`, duplicado, destinatario ajeno y mensaje desconocido. Creó enlace buyer sintético sin ID y demostró que no podía darse por entregado hasta registrar su ID; repitió para aviso finalista sintético. Verificó 3 entregas y ausencia de acceso público y de ID sin hash en libro. **PASS ROLLBACK** (`safely_reverted=true`).
- No se enviaron mensajes ni se aplicaron migraciones permanentes; el ensayo usa únicamente IDs de ejemplo y HMAC de participantes existentes, dentro de una transacción.

## Límites y verificación real pendiente

- **Puede existir una carrera**: Whapi podría enviar el estado antes de que la función termine de guardar el ID. En ese caso el evento desconocido no queda asociado. No se envía otro WhatsApp; se requiere reconciliar con el GET de estado de mensaje en Whapi o repetir la notificación del webhook, sin duplicar el mensaje.
- Los estados de **grupos** requieren correlación por persona distinta y aquí se excluyen; el piloto usa solo chats directos.
- No hay garantía de evento `read` por configuración de privacidad: `delivered` basta como evidencia de entrega, pero el destinatario debe verificar que vio el documento completo para aprobar el piloto.
- Para demostrar la ronda completa hace falta instalar el stack SQL y desplegar Edge Whapi/seguimiento/finalistas en entorno PILOTO autorizado, asegurar secreto de webhook y selección de eventos `statuses.post` en Whapi, y completar el ensayo de **1 arquitecto + 2 negocios** con recepción efectiva. Los elementos de fuente económica y documentos generales continúan bajo el contrato docs/223.
- Mantener `NO_GO` de publicación hasta `Publicalo: PILOTO`, con backup, rollback y versión exacta. No publicar un reporte como «WhatsApp entregado» basado solo en `sent:true`.

## Criterio de aceptación final para entrega

- Recepción real: proveedor 1 y proveedor 2 reciben y abren un PDF completo con su subconjunto; contenido sin filas faltantes, IVA/flete del comprador y zona.
- Envío real: el comprador recibe su enlace, ve ofertas anónimas verificadas en el portal y el sistema cierra en la fecha acordada.
- Consentimientos reales: los tres autorizan revelación; worker envía como máximo un aviso por destinatario, no contacta rondas históricas; webhook marca `delivered` independiente de `api_accepted`.
- Seguridad: revocación, actualizaciones tardías, ID de WhatsApp ajeno, documentos con instrucciones maliciosas, estados fallidos e inciertos nunca provocan envíos duplicados ni fugas.
