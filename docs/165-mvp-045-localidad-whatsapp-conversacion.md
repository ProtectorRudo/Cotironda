# 165 — MVP-045: pregunta de localidad y continuación por WhatsApp

**01/11/2026 · Issue #303 · solo PostgreSQL17 CI y código de desarrollo.**

## Problema que resuelve

El arquitecto envía `20 bolsas de cemento`, pero no informa la localidad. Cotironda debe preguntar una vez «¿En qué localidad se entregan los materiales?». Si responde `La Plata`, el sistema usa la lista original sin obligarlo a repetirla ni copiarla en una tabla de texto libre.

## Implementación

- `supabase/sql/whapi_zone_conversation_d077.sql` agrega `buyer_zone_pending_d077` (un origen HMAC por chat+canal, vencimiento 48 horas) y `buyer_zone_question_d077` (un registro **pendiente de envío** por origen, pregunta de código fijo `localidad_entrega`). **No guardan teléfono ni texto original.** El pedido se conserva cifrado en D074.
- La función privada `whapi_zone_enqueue_d077` exige que origen, chat y empresa coincidan con una entrada buyer D074 **de texto** y consentimiento actual. Usa bloqueo por chat (advisory transaction lock) para impedir preguntas simultáneas/duplicadas. Si hay otro pedido pendiente vigente, lo bloquea en vez de confundir sus materiales. Tras 48 h, permite otra solicitud manteniendo histórico de outbox sin sobrescribirlo. Únicamente prepara outbox: **no manda WhatsApp** ni consulta Whapi.
- `whapi_zone_context_d077` lee el mensaje actual y, si existe un pedido pendiente del mismo comprador/chat, posterioridad cronológica y vigencia, devuelve **dos paquetes cifrados** (mensaje actual y original) mediante el lector protegido D076. Ni siquiera el SQL conoce el texto del pedido; un BAJA impide lectura.
- `src/server/buyer-whatsapp-zone-conversation-d077.ts` autentica ambos paquetes con el broker AES-GCM/AAD existente, verifica identidad, canal, timestamp y orden, y alimenta el mismo procesador D073. Ante una respuesta de zona válida, reanuda con los materiales originales y llama al **puerto privado** `crearRonda`, después al puerto D071 `prepararInvitaciones`. Los dos últimos puertos **todavía NO están conectados a transacciones comerciales reales**; solo tienen contratos y fixtures. Nunca se envía mensaje desde este módulo.
- D077 usa dos roles `NOLOGIN/NOBYPASSRLS` con permisos separados (lector de D076, escritor de pending/outbox) y funciones `SECURITY DEFINER` propiedad de roles limitados, esquema no publicado. Las RPC no se otorgan a `anon`, `authenticated` ni `service_role`.
- SQL PostgreSQL17 real: `supabase/tests/ci/130_whapi_zone_conversation_d077.sql`, rollback de fixtures sintéticas. Unitarias: `tests/unit/mvp045-whapi-zone-conversation.test.mjs`.

## Riesgos y próximas tareas críticas

**La pregunta está en cola, no enviada.** Todavía falta un worker outbox que resuelva destinatario del chat cifrado/autorizado y envíe mediante D055/D070 con revalidación de consentimiento. No es posible enviar una consulta antes de tener una vía segura de recuperación del número, canal y consentimiento.

**El pedido retomado aún no crea rondas en DEV**: el puerto `crearRonda` de D073 todavía carece de transacción comercial para WhatsApp y debe cerrar/consumir la referencia pendiente **atómicamente al registrar la ronda**, de modo que otras respuestas no creen múltiples rondas. Por ahora D073 exige idempotencia por origen al puerto, y esta entrega no se presenta como un proceso E2E real.

**Documentos PDF, Excel, Word, imagen**: solo se marcan pendientes hasta descarga autorizada y escaneo/IA; no se infiere contenido de un link de Whapi. También faltan el webhook HTTP, enrolamiento buyer/supplier, integración real con D071/D061, cierre/ranking por rubro y contacto mutuo seguro UX-002.

**Backup/restore #175:** Supabase DEV todavía no tiene instalado D024+ ni este SQL. Para instalar se requiere respaldo cifrado real de DEV y restauración aislada verificada, no un ensayo de PG17 sintético. No compartir contraseñas ni identidad age por chat y no almacenar claves en Vercel/GitHub.

**Restricciones:** solo rama de integración privada; nada en main, Whapi, Supabase DEV, DNS o producción. Ningún mensaje real, ni entrega de contactos, ni pago/adjudicación.
