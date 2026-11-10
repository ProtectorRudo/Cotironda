# Decisión 414 — MVP289: confirmación y enlace privado de seguimiento

Fecha: 07/11/2026. [Issue #679](https://github.com/ProtectorRudo/Cotironda/issues/679). Solo desarrollo; **NO publicar PILOTO ni producción**.

## Incidente confirmado
El WhatsApp `CONFIRMAR COTI` de la revisión MVP288 quedó registrado como `confirmed` en `cotironda-piloto` el 07/11/2026 08:33 AR. La ronda pasó a `prepared` y sus dos trabajos de despacho a `api_accepted` con identificadores Whapi. **No había fila en `buyer_tracking_mvp091`**, por lo que no se generó enlace. En el código, la rama `buyerReviewCommand` ejecuta `continue` antes del bloque antiguo de seguimiento, diseñado para otras entradas y limitado a cinco minutos.

## Decisión
1. Mantener **el mismo sitio de seguimiento** y token opaco MVP091/MVP212, en `https://...` con token privado únicamente en fragmento `#`. No modificar Vercel, ranking, finalistas, privacidad ni condiciones de adjudicación.
2. Tras una **confirmación exacta** de comprador y el despacho de la ronda, emitir un enlace nuevo solo cuando **todos** los trabajos de despacho consten `api_accepted` con ID Whapi. La aceptación de la API no prueba entrega final, por lo que la confirmación dice que se **enviaron las solicitudes**, no que fueron recibidas o cotizadas.
3. Nuevo RPC `issue_confirmed_tracking_mvp289` autoriza exclusivamente `service_role`, confirma identidad de comprador, consentimiento, vinculación de evento WhatsApp original, revisión aprobada, ronda preparada, destinatarios despachados, y ausencia de token anterior. Usa bloqueo de ronda, PK única por solicitud y `ON CONFLICT DO NOTHING`. Nunca crea invitaciones, solicitudes, mensajes a proveedores ni altera ofertas.
4. El webhook envía **un único mensaje** que contiene confirmación y enlace tras finalizar los despachos. El envío se asienta usando el registro `buyer_tracking_mvp091` existente. Ante timeout/ID ausente registra `uncertain` y **no reintenta automáticamente** ni emite un segundo token.
5. Para recuperar el enlace de una ronda previamente confirmada que nunca tuvo token, el comprador puede escribir `SEGUIMIENTO COTI` desde **el mismo WhatsApp**. SQL exige ronda confirmada y despacho aceptado, y un único candidato elegible sin token; si es ambiguo o ya existe uno, no envía nada. Esto no reenvía pedidos.
6. El enlace persiste durante la ventana de vigencia ya autorizada. El sitio permite consultar cotizaciones anónimas y eventualmente finalistas solo bajo las políticas activas. **Finalista o sugerencia de cobertura no significa adjudicación comercial automática**, ni garantiza hoy que aparezcan contactos: los permisos de finalistas requieren pruebas independientes.

## Pruebas requeridas
- Node: firma/identidad inválidas, kill switch, una reserva y un WhatsApp, entrega incierta sin retry, comando de recuperación fuera de IA/dispatch, token en fragmento y nada de contactos privados.
- PostgreSQL 17: migraciones acumuladas dentro de un único `BEGIN/ROLLBACK`, roles `anon`/`authenticated` denegados, no enlace previo a todos los despachos, rechazo de remitente ajeno, token único por ronda, recuperación sin duplicado ni nuevo despacho.
- Antes de `Publicalo`: inspeccionar el diff, CI completo, pruebas de Edge/Next/PG, estado y cuotas; después del despliegue acotado, comprobar en la base y con consentimiento real WhatsApp + apertura del enlace en navegador.
- Para el pedido de las 08:33, **no enviar un mensaje solo por instalar SQL**; requiere un nuevo evento firmado `SEGUIMIENTO COTI`, o un procedimiento de operador diseñado y auditado aparte.

No hay secretos, tokens reales ni números de compradores/proveedores en el cambio.
