# MVP-104 — comunicación completa del inicio y recepción por WhatsApp

**02/11/2026 · Issue #419 · En desarrollo sobre MVP-103.** Canal central: WhatsApp; plataforma: enlace privado del comprador; motor IA: interpreta, pero no garantiza fidelidad de imágenes ni autoriza precios/ranking sin comprobación.

## Defecto auditado y corrección
La función Whapi, en su versión anterior, **solo generaba el enlace del arquitecto cuando el pedido recién creado venía en texto** (`row.type==='text' && outcome==='recorded'`). Un pedido en imagen/PDF podía pasar doble lectura, quedar como `prepared`, enviar a los proveedores correspondientes y, sin embargo, **no darle el enlace al comprador**. Si el usuario respondía posteriormente «La Plata» o aclaraba unidades, tampoco recibía enlace. Se corrigen los tres recorridos: texto estructurado, documento preparado al ingreso y documento completado mediante aclaración contextual. La referencia para el enlace es siempre el HMAC del **archivo original**, nunca el HMAC del mensaje aclaratorio.

Se preserva la RPC `cotironda_piloto_issue_tracking_mvp091` que exige archivo y ronda nuevos, rol y chat comprador coincidentes, consentimiento, plazo válido, flags de salida habilitados y un único token. Su URL usa fragmento aleatorio (no query string en logs HTTP), y el texto al comprador dice que ya tenemos sus datos y reuniremos cotizaciones. No promete precios antes de la fecha de cierre; el portal muestra conteos/pendientes y abre propuestas solo conforme a sus permisos.

## Agradecimiento a negocios
Un negocio que responde **texto** y queda como `quote_recorded`, o envía **PDF/foto** con original archivado y recibo `stored_unverified`, recibe **un solo mensaje corto:** «¡Gracias! Recibimos tu presupuesto. Lo estamos procesando en Cotironda.». Se reserva el envío primero en la RPC `cotironda_piloto_reserve_supplier_ack_mvp104`; el resultado de Whapi se registra después con `cotironda_piloto_finish_supplier_ack_mvp104`. Un timeout queda `uncertain` y no se reenvía a ciegas.

El ACK exige chat autenticado, consentimiento no revocado, proveedor habilitado, una sola invitación/ronda relacionada, vigente y preparada, presupuesto original en tabla para texto o PDF binario con archivo SHA256 asociado a recibo para medios. Atención: **la bandeja de WhatsApp puede tener `request_id=NULL` en medios de proveedores**; la vinculación real es `media_archive_mvp095.request_id`, contrastada con `supplier_media_quotes_mvp098` y la invitación. Rechaza un mensaje no procesado, un chat ajeno o documentos de otra ronda. La tabla ledger tiene RLS y no admite lectura directa por clientes.

Agradecer la recepción NO implica que el presupuesto ya sea fiel, comparable, visible al arquitecto o apto para dos finalistas.

## Validación concreta
- PostgreSQL 17 del Supabase `cotironda-piloto`: las migraciones 101/102/103/104 y el smoke se ejecutaron con datos sintéticos en **una única transacción revertida**. **PASS**: archivo original comprador → enlace con token; duplicado no emite otro; otro chat no puede obtenerlo; texto proveedor → mensaje reservado una vez; PDF proveedor en estado real con `whapi_inbox.request_id=NULL` → acuse reservado; archivo pendiente sin recibo no se agradece; reintento en estado incierto bloqueado; RLS. Se verificó `ROLLBACK`. No hubo WhatsApps reales.
- Tests Node de contrato: `tests/unit/mvp104-mensajes-whatsapp.test.mjs`. La CI GitHub del PR debe verificarse por separado.

## Restricciones y trabajo pendiente del circuito total
- El portal `cotironda-piloto-seguimiento` es válido para la primera prueba; **no es todavía la URL pública de cotironda.com**. El acceso es privado por token en fragmento.
- Las cotizaciones documentales no se publican automáticamente por acuerdo IA ni suma: falta corroboración robusta contra la fuente (imagen/PDF/hoja), plantilla anónima de todos los ítems y condiciones, comparación por productos equivalentes/IVA/flete/cobertura, cierre y datos de hasta dos finalistas con autorización comercial.
- Texto libre está limitado por extracción determinista y familias/catálogos reales; los archivos tienen límites técnicos 3 MiB/25 líneas y el PDF de solicitud hasta 8 materiales. No afirmar «cualquier lenguaje y formato» hasta superar esas pruebas.
- No hay envío real probado en este PR, instalación persistente de la migración ni despliegue a producción.
