# Cotironda V2-13 — presupuestos adjuntos después del aviso del proveedor

**Fecha:** 12/11/2026. **Estado:** desarrollo aislado; **no publicado**. Base: PR #833, SHA `7887da525597d24993b6d9a5d71e7c1c9ccb3c0d`.

## Defecto funcional verificado en código

Si un proveedor escribe, por ejemplo, «te paso el presupuesto» y después envía un PDF/Excel, el flujo histórico MVP238 puede asociar el archivo a una ronda. El vínculo resultante es `ai_supplier_links_mvp225.association='prior_supplier_preamble'`. Este vínculo **no equivale a una conjetura semántica**: MVP238 verifica el proveedor, chat, contenido exacto SHA del aviso, estado de la invitación, despacho ya aceptado, contexto no ambiguo, archivo almacenado y huella SHA del documento.

Sin embargo, la RPC de V2-03 `cotironda_piloto_v2_responders_private` filtraba exclusivamente `quoted_whapi_id` y `single_active_round`; asimismo, la RPC de descarga `cotironda_piloto_v2_original_source_private` rechazaba ese tercer tipo. Así, un presupuesto que **sí** quedó vinculado correctamente mediante el aviso podía no aparecer ante el comprador.

La observación agregada real del 12/11/2026 muestra **27 mensajes de texto**, **6 documentos**, **2 imágenes** y **un solo vínculo MVP225**, de texto con método `semantic_unique_mvp291`. No se encontró un presupuesto **real actual** con vínculo `prior_supplier_preamble` apto para mostrar en V2. **La regresión está probada en la ruta de código y su simulación, no en un mensaje real.**

## Corrección mínima

1. El catálogo V2 admite `prior_supplier_preamble` **únicamente cuando existe una fila de `ai_supplier_preambles_mvp238`** que apunta al archivo exactamente indicado por `link.message_hmac` y coincide con solicitud, proveedor y chat.
2. El aviso original también debe estar en `whapi_inbox`, marcado como `text`, asociado a la **misma ronda** y con **hash del texto idéntico** a la huella del registro MVP238. Su fecha de recepción debe coincidir y anteceder al archivo, con separación máxima de 24 horas. El vínculo debe tener `attached_at` posterior a la recepción del archivo.
3. Se mantienen el resto de puertas V2: usuario Supabase Auth con sesión válida y WhatsApp del comprador verificado, política prospectiva habilitada, consentimiento V2 por comercio **anterior a la invitación**, `api_accepted`, invitación válida, original SHA/Storage exacto, estado `awaiting_semantic_review`, ausencia de conflicto MVP237, revocación activa y ventana de la ronda.
4. La descarga amplía solo la lista de **tipos de vínculo admitidos**, pero **no** la lista de documentos accesibles: debe haber pasado antes por la RPC de catálogo, que reevalúa la prueba MVP238 para ese documento opaco. El original no se reescribe ni se interpreta como JSON comercial.
5. No se cambian MVP238, Whapi v76, IA Central, ranking, precios, IVA, flete ni producción. No se agregan mensajes ni se pide al proveedor que complete formularios.

## Prueba y seguridad

Se amplió `supabase/tests/ci/v2-03-respondedores-pg17.sql` con un proveedor sintético que envía un aviso y un PDF original. La misma transacción PostgreSQL 17 prueba:
- Sin consentimiento prospectivo V2, el archivo **no** aparece.
- Con consentimiento auténtico y el vínculo MVP238 completo, aparece y el comprador puede obtener el origen exacto del PDF.
- Si cambia el SHA del aviso, el chat, la temporalidad, el enlace aviso→archivo o se revoca el consentimiento, el catálogo excluye la respuesta y el origen privado falla cerrado.
- Los casos anteriores de 0/1/2 proveedores, buyer distinto, ronda distinta, descargas por SHA y RLS continúan cubiertos; se agrega contrato Node V2-13 y ejecución desde CI.

**Criterios de aceptación:**
- [x] Cambio de las dos RPC en código sin romper la ruta v1.
- [x] Escenarios sintéticos PG17 negativos y positivos escritos, con rollback.
- [ ] CI completa del **SHA final** de esta rama.
- [ ] Instalación autorizada de SQL en PILOTO y Preview fijada a SHA, nunca en producción.
- [ ] Compra real de prueba: aviso del proveedor seguido del PDF/Excel sin respuesta citada, asociación exacta, visibilidad 0→1 y descarga original con Auth comprador.
- [ ] Soporte real para respuestas **de texto puro** en el portal: **sigue pendiente**; este cambio no considera texto de WhatsApp un archivo descargable ni saltea el cifrado `whapi_inbox`.

## Dependencias de pilotaje

Aunque este cambio supere CI, para el primer presupuesto visible siguen pendientes la Preview Vercel V2 segura, comprador Auth SMS probado y consentimientos prospectivos existentes; la política de originales está OFF en PILOTO. `Avanza` no habilita deploy/SQL/Whapi; se necesita `Publicalo` explícito para esa etapa. No fingir que esta mejora resuelve por sí sola el piloto 100 %.
