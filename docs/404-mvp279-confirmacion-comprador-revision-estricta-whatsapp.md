# Decisión 404 — MVP279: revisión y confirmación exacta del comprador antes de despacho

**06/11/2026 (Argentina).** Autorización «Luz verde»: desarrollar, probar, fusionar solo a desarrollo. **No publicar**, no activar flags, no enviar Whapi reales, no contratar servicios, ni tocar producción. Respaldo pago sigue Plan B.

## Problema verificado

MVP278 ya puede crear una ronda **en sombra** desde PDF/DOCX/XLSX, con SHA de archivo original, SHA del texto derivado, evidencia independiente de renglones, consentimiento y rubros. Pero el comprador aún no aprobó cantidades antes de la invitación. Publicar inmediatamente violaría el requisito de revisión; una respuesta genérica «sí» de WhatsApp podría referirse a otra ronda.

La vista de seguimiento no tiene una sesión Auth de comprador provisionada en PILOTO. La primera confirmación verificable se hará mediante **WhatsApp autenticado** desde el mismo comprador y un código único para cada versión.

## Alcance de la solución

**SQL:** `supabase/piloto/mvp279_revision_confirmacion_whatsapp_binarios.sql` crea tabla privada `ai_buyer_review_mvp279` (RLS, sin permisos de tabla ni para `service_role`) y funciones ejecutables solo por `service_role`:

1. `ai_buyer_snapshot_mvp279(request_id)`: arma un JSON canónico ordenado con SHA original, SHA del texto derivado, pedido fuente, zona, nota de entrega, vencimiento, **TODOS los ítems, unidades, cantidades, rubros y evidencia**, además de destinos y artículos de catálogo. Destinos internos quedan **dentro de la huella**, nunca visibles en la revisión del comprador.
2. `ia_review_issue_mvp279(chat_hmac,source_hmac)`: solo para mensaje documental archivado, buyer consentido y ronda en estado `draft`; valida totalidad de renglones y cobertura. Reserva **una sola** revisión, calcula la huella del snapshot y genera `CONFIRMAR COTI <16 caracteres hex aleatorios>`; guarda solo el SHA del código y devuelve una única vez código, ciudad y lista completa. No reenvía jamás si el resultado remoto es incierto.
3. `ia_review_delivery_mvp279(request,state,whapi_id)`: registra `api_accepted` únicamente si Whapi devolvió aceptación y un ID válido, o `uncertain` como estado terminal sin reintento. `api_accepted` **NO** prueba entrega física; la evidencia fuerte es la futura respuesta auténtica del comprador con el código.
4. `ia_review_confirm_mvp279(chat_hmac,reply_hmac,exact_text)`: requiere mensaje firmado de Whapi ya almacenado cifrado en `whapi_inbox`, rol buyer consentido, mismo chat/HMAC, SHA-256 del **texto literal completo**, código asociado a una sola ronda, revisión aceptada y no vencida. Recalcula huella de snapshot; si cambió cantidad, rubro, proveedor, zona, nota, vencimiento u origen, **no confirma**. Las respuestas repetidas y de otros chats quedan denegadas. El código caduca en un máximo de 24 horas y al menos una hora antes de que cierre la ronda.
5. `confirmada_binaria_mvp279(request_id)`: verifica continuamente firma, consentimiento y huella de pedido vigente. Las funciones SQL de **publicación, búsqueda del trabajo, reclamo y generación de PDF** se modifican para denegar cualquier pedido binario pendiente de aprobación, incluso una llamada directa de `service_role` que intentase saltar el webhook. Texto y TXT/CSV originales conservan su comportamiento, sin activar nuevas puertas.

**Edge:** `ai-central-buyer-review-mvp279.ts` valida renglones completos y arma un WhatsApp que muestra cantidades, unidades y rubros, sin proveedores ni precios. Para enviar se requieren simultáneamente la autenticación de webhook/participante, controles de IA Central, outbound existente y `COTIRONDA_PILOT_BUYER_BINARY_REVIEW_SEND_ENABLED=true`, inicialmente OFF. Se reserva en SQL **antes** de un único intento de Whapi. Si la API no responde, no reintenta automáticamente.

La respuesta `CONFIRMAR COTI <código>` se detecta **antes** del clasificador de IA, se archiva por el receptor Whapi existente y, solo con `COTIRONDA_PILOT_BUYER_BINARY_REVIEW_CONFIRM_ENABLED=true`, llama a la confirmación SQL. No interpreta «sí», «ok» ni un texto de IA como autorización económica. Para convertir la confirmación en invitaciones reales se requiere **además** `COTIRONDA_PILOT_BUYER_BINARY_REVIEW_RELEASE_ENABLED=true`, el gate de despacho SQL existente, el gate temporal y transporte outbound habilitados. Todos los switches nuevos permanecen OFF por defecto. Si la liberación falla o tiene respuesta de red incierta, queda para conciliación; no hay reenvíos automáticos.

## Riesgos y límites

- La autorización tiene alcance inicial **solo PDF, DOCX y XLSX con lectura independiente de fuente**, 1–25 ítems y texto de revisión que cabe íntegro en WhatsApp. Archivos más largos, imágenes escaneadas, contenido conflictivo, flete o cifras adicionales no acreditadas siguen en revisión; no se recortan productos.
- Una reserva de revisión con envío `uncertain` es terminal: **no se presume entrega ni se reintenta**. El comprador tendría que iniciar otro pedido o existir una intervención operativa revisada. No afirmar sin fricción total hasta probarlo.
- Un código de 16 caracteres sirve para distinguir la ronda, pero **no sustituye** identidad de WhatsApp: SQL exige siempre HMAC de mensaje y chat recibido y SHA literal. Códigos no guardados en texto claro ni expuestos a frontend/telemetría; no se incluyen en logs.
- La integridad de bytes al registrar el original no prueba que Storage no haya sufrido reemplazo invisible manteniendo metadatos. Mantener originales privados/no sobrescribibles y mejorar validación de bytes antes de habilitar producción.
- El pipeline de PDF/Office no tiene prueba comercial real punta a punta; estas pruebas son sintéticas en desarrollo. Ni `api_accepted` equivale a entrega ni una ronda en sombra equivale a cotizaciones recibidas.
- La estrategia de backup externo restaurable sigue pospuesta por costo y **no elimina el riesgo de pérdida de datos reales**; piloto comercial abierto no autorizado.

## Criterios de aceptación

1. PG17: sin confirmación, publicación y reclamo denegados; código emitido solo una vez, caducidad y Whapi incierto; archivo alterado, zona/rubro/ítems/destinos mutados invalidan snapshot, otra persona/chat y BAJA denegados, confirmación válida autoriza exactamente una versión, y la cola deja de entregar si el pedido cambia después.
2. Node: mensaje sin recorte, código estricto y exclusivo, no enviar duplicados, timeout incierto sin reintentos, consulta real de confirmación SQL, liberación detrás de **tres gates**, incompatibilidad sin filtrar secretos.
3. Verificar Deno webhook + CI completas, regresión sin modificación de texto y TXT/CSV; documentar hash de commit y PR.
4. Ensayo reversible sobre `cotironda-piloto` con `BEGIN/ROLLBACK` que confirme ausencia de tablas/funciones luego y gates OFF. No es publicación.
5. Reversión manual `mvp279_rollback_confirmacion_binarios_MANUAL.sql`: bloquea si IA/despacho están ON o si hay ronda documental abierta; conserva **la evidencia y las confirmaciones** para auditoría.

**Siguiente paso para operar:** actualizar y versionar migraciones/Edge publicadas con autorización explícita «Publicalo en cotironda-piloto», sincronizar el estado de los 12 módulos pendientes de etapa 7, preparar preflight de costos y observar una ronda WhatsApp→revisión→confirmación→PDF→2 proveedores→ofertas→comparador por rubro→cierre. Sin un E2E de teléfonos reales, no declarar el piloto terminado.
