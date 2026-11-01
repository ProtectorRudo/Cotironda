# 167 — MVP-047: cola duradera de pedidos Whapi del arquitecto

**01/11/2026 · Issue #307 · Solo PostgreSQL 17 de CI + código privado. Ningún envío o despliegue real.**

## Necesidad operativa

El receptor Whapi D027 almacena el mensaje cifrado del comprador en D074. En un webhook real no debemos esperar que se complete la interpretación, la solicitud de localidad y la creación de ronda D081 **antes** de responder a Whapi. Un corte entre guardar el mensaje y procesarlo podría dejar el pedido sin trabajo. MVP-047 conecta de manera atómica la persistencia del inbox buyer con una cola independiente **sin teléfono, texto ni documentos en claro**.

### Nuevo SQL D082

`supabase/sql/whapi_buyer_queue_d082.sql` crea tabla privada `whapi_buyer_jobs_d082` y un trigger `AFTER INSERT` sobre inbox cifrado D074, con un trabajo único por `(channel_id,message_key)`. Solo eventos no-BAJA generan un trabajo. No se modifican eventos ni el inbox. Todo se confirma en la misma transacción original de D074; si falla crear el trabajo, no se confirma el mensaje original.

`whapi_claim_buyer_d082(channel)` toma un trabajo mediante `FOR UPDATE SKIP LOCKED` bajo lease de 3 minutos, máximo 4 intentos y recuperación de leases vencidos; no selecciona mensajes de otros canales ni devuelve datos personales. `whapi_finish_buyer_d082(channel,messageKey,leaseToken,outcome)` cierra el trabajo únicamente con su lease correcto: completado, revisión, descartado por autorización o reintento con demora. Tras 4 intentos se declara `dead` para revisión humana, nunca enviado/reintentado indefinidamente. Si el ACK se pierde, otro worker puede reintentar la operación idempotente al vencer el lease.

Solo el rol `cotironda_buyer_queue_owner_d082` NOLOGIN/NOBYPASSRLS con RLS administra la cola. Otro rol NOLOGIN de gateway solo dispone de `EXECUTE` para claim/finish; no puede SELECT de inbox, contactos ni trabajos, y no hay permisos nuevos para browser/anon/authenticated/service_role. **El rol servidor real de conexión deberá ser configurado separadamente después del respaldo DEV.**

### Worker de aplicación D082

`src/server/buyer-whatsapp-queue-worker-d082.ts` recibe **por inyección** el puerto SQL de la cola y `crearLectorCompradorConZonaD077` como handler. Este último ya usa D081 para crear ronda y D071 para preparar invitaciones. Mapea los resultados de forma conservadora:

- `zona_solicitada_en_cola` → `done`: pregunta guardada en outbox D077; **no enviada**.
- `ronda_registrada_consultas_en_cola` o `ronda_registrada_sin_consultas` → `done`: ronda creada, D071 planificado; **no enviado**.
- `ronda_registrada_preparacion_pendiente` o excepción → `pending`/reintento; D081 y D071 garantizan idempotencia de origen y destino.
- Medio sin extracción segura / lista ambigua → `manual_review`, sin interpretar URL de adjunto como contenido.
- Baja/identidad perdida → `discarded`, sin mensajes adicionales.
- Función desactivada → no reclama ningún trabajo ni consulta SQL.

**Aún NO hay webhook HTTPS montado ni worker ejecutándose en servidor**. Tampoco hay descarga/escaneo/IA de PDF/Excel/foto, servicio real de respuestas automáticas del arquitecto, onboarding de compradores, ni envío comercial Whapi. Esto requiere integrar y desplegar los componentes de forma gradual, con allowlist y consentimiento. Nada se habilita automáticamente.

### Verificación

Pruebas PostgreSQL17 `supabase/tests/ci/132_whapi_buyer_queue_d082.sql`: creación de trabajos desde inbox buyer cifrado, no BAJA, replay, asignación canal, leases/ACK y seguridad de permisos, rollback de toda fixture. Pruebas Node: `tests/unit/mvp047-whapi-buyer-queue.test.mjs` con casos de pedido, zona, fallo poscommit, adjunto y errores adversariales. CI exige cinco verificaciones, incluyendo build/typecheck Next.js.

**Dependencia bloqueo #175:** Supabase DEV plan Free sin backup automático. Preparar respaldo privado cifrado real y restaurarlo en entorno independiente antes de instalar D024-D082. No subir credenciales, volcados ni datos personales a GitHub/CI/ChatGPT. El respaldo/restore real no puede acreditarse solo con el PostgreSQL 17 sintético de CI. [Documentación oficial Supabase](https://supabase.com/docs/guides/platform/backups).

**Resultado de negocio previsto:** arquitecto manda pedido por WhatsApp → inbox cifrado + cola durable → interpreta y prepara localidad o ronda → D071 selecciona según catálogos/zona → WhatsApp de proveedores → D061 cotizaciones → ranking objetivo. Las etapas posteriores siguen pendientes de integración real.
