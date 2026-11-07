# Decisión 421 — MVP295: de asociación histórica a cotización verificable sin intermediarios

**Fecha:** 07/11/2026. **Estado:** **publicado exclusivamente en `cotironda-piloto`** por [PR #686](https://github.com/ProtectorRudo/Cotironda/pull/686), migración n.º 82 y seguimiento v23/worker v7; luego corregida la activación del worker en MVP296 (v8 y migración n.º 83). **Publicación técnica acreditada; la oferta comercial real requiere verificación de resultados del cron.**

## Auditoría real previa (solo lectura)

- Piloto: se registraron respuestas de los dos proveedores consentidos. **Ailín**: documento ambiguo, no forzar asociación; una versión histórica de oferta independiente y documentos en revisión. **Nahuel**: mensaje WhatsApp **texto** autoasociado inequívocamente por MVP291/MVP292, pero sin ninguna fila `ai_supplier_review_mvp227` ni propuesta anónima comercial para esa fuente.
- El vínculo de Nahuel pasó la fuente original HMAC/SHA, petición vigente, despacho previo confirmado, empresa remitente y coincidencia `whapi_inbox.request_id`. **El mensaje ya tenía más de 10 minutos**.
- La reserva comercial existente `cotironda_piloto_ia_reserve_quote_mvp227` exige `m.received_at > now()-interval '10 minutes'`, por lo que un original vinculado durante recuperación histórica ya no puede pasar a la doble lectura comercial, aunque la ronda siga abierta.
- Incluso un resumen comercial verificado permanecería **invisible como primera oferta** en el seguimiento: la Edge `cotironda-piloto-seguimiento` llamaba `cotironda_piloto_ia_buyer_rubros_mvp227` solo si el seguimiento legacy respondía `can_open=true`. Sin una oferta legacy, la IA Central nunca podía activar `can_open` por sí misma.

## Corrección desarrollada

1. **Excepción de siete días estrictamente limitada** a textos cuyos originales ya se vincularon por `semantic_unique_mvp291`, con libro MVP292 `state='linked'`, doble IA MVP291 coincidente, ledger unresolved resuelto, SHA igual, consentimiento comprador/proveedor, WhatsApp `api_accepted` previo al mensaje, pedido aún `prepared` y no vencido. El resto de los mensajes conserva el límite de diez minutos.
2. **Cola de un solo uso** `ai_supplier_linked_replay_mvp295` (RLS, service role, máximo seis intentos/24h, una fuente por tick). El SQL selecciona por evidencias, NUNCA por nombre, precio o fecha más reciente. La reserva impide que un timeout vuelva a gastar tokens; no se permite reintentar si el resultado es incierto.
3. **Reusar el mismo analizador económico MVP227**, sin código paralelo de precios: AES-GCM del inbox con AAD y SHA, dos lecturas de fuente, cotejo de citas de IVA/flete/pago, normalización por rubro, cantidades y aritmética determinista. Registrar consumo sí o sí mediante MVP264, que bloquea usos futuros si el gasto es desconocido, y registrar versiones comerciales con MVP261 (sin combinar revisiones parciales).
4. **Worker aislado**: solo si el MVP292 anterior devuelve `empty`, si `COTIRONDA_PILOT_AI_CENTRAL_SUPPLIER_QUOTE_ENABLED='true'` y si los gates privados de recuperación siguen activos, se permite una fuente vinculada. No crea nueva tarea ni envía WhatsApp.
5. **Primer presupuesto IA visible**: el seguimiento consulta el RPC independiente por rubros aun cuando `can_open` legacy sea falso, **solo** si el seguimiento base es `waiting` o `closed`. El RPC vuelve a autorizar el token/empresa/revocación, DTO rechaza identidad, HMAC, originales y formatos de economía inválidos. `can_open` pasa a verdadero exclusivamente si hay ofertas IA realmente verificadas. Cobertura parcial no se compara como total ganador.

## Lo que NO se hace

- No asignar automáticamente el documento de Ailín: dos lecturas divergentes/solicitudes indistinguibles requieren evidencia nueva, no inferencia por precios o fecha.
- No publicar como oferta comparativa un texto sin fuente económica verificable, moneda explícita o IVA/flete acreditados; revisión privada permanece como revisión.
- No exponer teléfonos, originales, descuentos hipotéticos ni fuentes privadas al comprador.
- No mover de producción, no activar secrets, no correr migraciones ni cron en Supabase real durante Luz verde.
- No anunciar oferta visible sin E2E real en el piloto, y nunca confundir `ai_supplier_review` privado con `anonymous_offers_mvp091`: son proyecciones distintas.

## Criterios de aceptación

- PostgreSQL 17 sintético: rechazo de RPC a anon/auth, RLS en nueva tabla, fuente antigua verificable autorizada una vez, chateo cruzado rechazado, intento duplicado rechazado, proceso `verified` sin ledger de revisión rechazado, cero jobs/outbox nuevos, rollback único.
- Node: gate apagado no hace RPC, empty no llama modelo, selección de una fuente por SQL, usage trace siempre habilitado, salida solo privada, error/timeout terminal y no reintento, fuente inválida sin modelo.
- Seguimiento: un único presupuesto IA ya verificado habilita la apertura sin depender de otro presupuesto legacy; ningún precio no verificado se agrega.
- Deno typecheck del nuevo Edge, seguimiento, Whapi; CI completa.
- Tras autorización posterior de publicación: preflight real de schema/flags/costos, migración, Edge bundle completo con preservación de módulos, verificación del origen real de Nahuel y el estado del caso de Ailín, navegador y ranking por rubro, sin reenviar nada.

Referencias: [416](416-mvp291-correlacion-automatica-sin-friccion.md), [417](417-mvp292-texto-historicos-sin-friccion.md), [419](419-mvp293-puente-cron-recuperacion-historica.md), [420](420-mvp294-supabase-claves-modernas-worker.md).
