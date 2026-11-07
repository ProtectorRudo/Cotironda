# Decisión 416 — MVP291: vinculación automática, cero trabajo extra

**Estado: desarrollo solamente, NO publicado ni integrado; 07/11/2026.** [Issue #681](https://github.com/ProtectorRudo/Cotironda/issues/681) · [PR #683](https://github.com/ProtectorRudo/Cotironda/pull/683). Reemplaza el enfoque de selección manual de [PR #682](https://github.com/ProtectorRudo/Cotironda/pull/682), cerrado sin merge.

## Decisión de producto
Cotironda debe recibir respuestas por WhatsApp (PDF, Excel, Word, foto y mensajes), interpretar el material, y asociarlas por sí sola con el pedido correcto. No puede exigir códigos de selección, pantallas nuevas, ni solicitar a arquitecto/proveedor que elijan ronda.

**Garantía realizable:** automatizar toda atribución con evidencia suficientemente distintiva; no exponer cotizaciones a compradores incorrectos. Si dos solicitudes son físicamente indistinguibles y el archivo no cita ninguna, la intención del autor es incognoscible. La IA no puede fabricar certeza. En ese caso: guardar original y diagnóstico privado, sin publicar ni molestar al cliente/proveedor; gestión interna o futura evidencia verificable.

## Por qué fallaba
El ruteador SQL MVP225 encontraba más de una invitación enviada: una antigua por `whapi_outbox` y otra de IA Central por `ai_dispatch_jobs_mvp222`. Al no citar el PDF original de Cotironda, preservaba un PDF de proveedor en `media_archive_mvp095` con `ambiguous_round`. Era correcto abstenerse, pero faltaba **la correlación inteligente automática**.

## Flujo MVP291, sin fricción
1. Si el proveedor responde citando el mensaje original Whapi, el sistema actual usa su ID exacto. El PDF de solicitud ya exhibe código de solicitud visible para interoperabilidad futura; no hay que introducirlo manualmente.
2. Si el archivo no incluye referencia y hay varias rondas: archivar el original en Storage privado, verificar su SHA, extraer las líneas y condiciones dos veces. Discrepancias entre lecturas bloquean asociación.
3. SQL consulta los **pedidos realmente enviados al mismo comercio antes del documento**, abiertos al momento de recibirlo y de vincular, para los que hay evidencia `api_accepted` + Whapi ID. Incluye despachos IA y legacy. Solo devuelve los renglones del rubro enviados al comercio; las rondas legacy sin mapa usan sus artículos originales. No envía al modelo cliente, teléfono, UUID real ni totales de oferta.
4. Dos interpretaciones independientes de IA Central proponen vínculos semánticos entre renglones de cotización y pedidos (sin tabla exhaustiva de materiales). El modelo reconoce sinónimos, variantes comerciales y marcas flexibles; no adjudica, no publica, no decide titularidad.
5. El evaluador TypeScript recalcula **cantidades y unidades**: 40×25 kg = 20×50 kg; 40×25 kg ≠ 10×50 kg. Un material coincide solo con evidencia física y correspondencia semántica; no usa precios, ni orden de llegada, ni gana por ser el más reciente. Si dos candidatos tienen puntuaciones iguales, el modelo discrepa, solo hay afinidades débiles o no hay diferencia clara, se abstiene.
6. Un único SQL service-role comprueba nuevamente remitente, consentimiento bilateral, original, SHA, fecha, que ya se había despachado ese pedido a ESE proveedor, vigencia de la ronda, no duplicado. En una transacción vincula `whapi_inbox`, `media_archive_mvp095`, `ai_supplier_links_mvp225`, `ai_supplier_unresolved_mvp237` y ledger privado.
7. Reanudar exactamente el flujo documental existente: dos lecturas, aritmética determinista, corroboración con el binario, condiciones de pago/IVA/flete, anonimización. **Asociado no significa verificado ni publicado**. Ninguna cotización se muestra si falla una etapa.
8. Una fuente ambigua no genera WhatsApps de aclaración cuando `COTIRONDA_PILOT_AUTO_CORRELATION_MVP291_ENABLED` está ON. Sin respuestas humanas adicionales.

## Protección y límites
- Nueva tabla privada `ai_supplier_auto_correlation_mvp291` con RLS y `anon`/`authenticated` revocados. RPC `prepare`/`bind`/`finish` únicamente `service_role`, `SECURITY DEFINER search_path=''`.
- Un solo lease por mensaje (no volver a facturar IA por replay), 10 fuentes en 24 h por proveedor en este paso, 2 lecturas de IA, máximo 8 rondas candidatas y 25 artículos por solicitud. Esto requiere medir costos en piloto antes de ampliar.
- Estados inciertos no causan reenvío de WhatsApp ni nueva invitación; el PDF queda privado para conciliación interna.
- Política de confianza: IA propone vínculos por material; aplicación valida números/masa/volumen, unicidad y margen; SQL verifica identidad/autorización. No permitir contacto, ganador, ranking o dato económico sin verificaciones existentes.
- Cuando hay dos candidatos realmente idénticos, el algoritmo debe abstenerse. Es una restricción de información, no un error que se arregle subiendo confianza artificial.

## Alcance de esta entrega
- Implementado para **documentos del proveedor** PDF/Excel/Word/foto por el webhook activo cuando ambas lecturas documentales concordaron. Para **texto libre** con múltiples rondas todavía falta extender la extracción/correlación (queda identificado explícitamente, no declarar el caso resuelto).
- Sin backfill sobre el caso puntual ni escritura en base piloto; el original histórico sigue en revisión hasta una estrategia de recuperación verificada y autorizada.
- Ningún flag activado, ni migración real, ni nueva Edge publicada, ni Whapi real.
- CI Node/PG17/Deno, regresiones, RLS, hashes y rollback. La prueba real E2E requiere publicación explícita después del merge, nuevos presupuestos consentidos y verificación de panel comprador.

## Criterios de aceptación
1. Dos rondas abiertas (legacy + IA), un proveedor: comparar 40 bolsas 25kg con 20 bolsas 50kg y descartar petición con 10 bolsas 50kg.
2. Dos rondas iguales, dos lecturas en desacuerdo, un solo artículo compartido, cantidad desconocida, documento incompleto: **no atribuir ni publicar**.
3. Sin fuente binaria ni SHA firmado, sin invitación aceptada anterior, remitente incorrecto, consentimientos ausentes, pedido cerrado: bloquear.
4. Idempotencia del mismo PDF, incertidumbre de OpenAI/SQL, ninguna nueva cola, ningún WhatsApp de selección.
5. Posible asociación exige validación documental/económica por separado antes de aparecer anónima en seguimiento.
