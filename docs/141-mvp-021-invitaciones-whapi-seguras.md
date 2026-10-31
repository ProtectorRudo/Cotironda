# 141 — MVP-021: invitaciones WhatsApp seguras (sin activación)

31/10/2026 · Issue #255 · rama `feat/mvp-021-invitaciones-whapi-seguras`, apilada sobre MVP-020. **Únicamente PostgreSQL17 efímero CI y Node de pruebas**. No hay números reales, canal Whapi live, envíos comerciales ni migraciones Supabase DEV/producción.

## Qué reutilizamos y qué aislamos

- D055 ya implementa `POST /messages/text` con allowlist exacta, token inyectado, fetch explícito y autorización justo antes del HTTP. No hay segundo cliente HTTP.
- D068 recupera en servidor, mediante AES-256-GCM, el destinatario verificado, y D066 genera el mensaje acotado a los materiales del proveedor y zona de entrega.
- D047/D053/D054 son **respuestas del proveedor** (borradores/versiones). No se reutilizan como cola de invitaciones: hacerlo confundiría responsabilidades y podría duplicar mensajes.
- D056 proporciona política de límites diarios/mensuales/presupuesto interno **por comprador y canal**. D070 emplea la misma política y contabiliza las reservas de ambos tipos de mensajes bajo el mismo `SELECT ... FOR UPDATE`.

## Implementación D070

- `supabase/sql/whapi_invitation_outbox_d070.sql`: intención única por `(ronda, proveedor, canal)` y chat HMAC, vinculada a la invitación autorizada y contacto D028. Tabla de trabajos sin teléfono, mensaje, secretos, URL ni identificador WhatsApp legible. Reservas inmutables, sin liberación automática por incertidumbre.
- `prepare`: exige D065, D066, etiqueta humana, proveedor/rubro/zona actuales, consentimiento/BAJA y paquete cifrado D068. Repetir devuelve el mismo `jobId`, cambiar destinatario no está permitido.
- `claim`: `FOR UPDATE SKIP LOCKED`, 90 segundos, hasta tres reintentos **exclusivamente antes de empezar HTTP**. `begin` vuelve a comprobar condiciones, exige política habilitada, consume cupo en transacción y marca `in_flight`. El worker debe **esperar COMMIT** en conexión aislada antes de enviar; si se pierde el ACK de SQL, no manda nada.
- `authorize`: booleano privado D070 usado por D055, coteja chat HMAC de teléfono descifrado, reserva, política actual, fase, reloj, D068, zona, scope, BAJA y contacto verificado inmediatamente antes del HTTP. Este control minimiza la carrera con una baja posterior pero no garantiza inexistencia física de carreras entre SQL y red.
- `finish`: `accepted_by_transport` con ID remoto HMAC **solo significa que Whapi aceptó el mensaje**; no que llegó o fue leído. Timeout, error HTTP, rechazo o ACK perdido después de `begin` marcan `uncertain`, **nunca vuelven a una cola automática**. `sweep` solo marca inciertos, sin reintentar. Faltan webhooks verificados de estado y conciliación manual autenticada.
- RLS, funciones en esquema privado bajo rol NOLOGIN/NOBYPASSRLS y gateway EXECUTE-only; nada público para `anon`, `authenticated` ni `service_role`. No provisiona política ni secretos: el operador del piloto deberá autorizarlos independientemente, dentro de DEV y con presupuesto.
- La función D056 de reservas para **respuestas** se actualiza en el laboratorio D070 para incluir también reservas de invitaciones. Sin esta actualización se violarían los topes al usar ambos circuitos; la misma fila de política serializa transacciones de los dos tipos.

## Worker Node

`src/server/whapi-invitation-sender-d070.ts` combina D068 + SQL D070 + el transporte D055 existente. No busca secretos en `process.env`, no usa `fetch` global, no crea endpoints, cron ni scheduler. Sus flags `habilitado` y `pilotoAutorizado` se exigen ambos en true y, si no hay token privado, allowlist y `fetcher` confiables, no consume leases. No entrega identidad, precios ni claves al navegador. El texto contiene solo materiales del proveedor, zona y detalle fiscal si el comprador lo solicitó; sin «Confirmo».

## Pruebas y limitaciones

`tests/unit/mvp021-whapi-invitation-sender-d070.test.mjs`: simulaciones de HTTP y DB (éxito aceptado, timeout, 429, falta de autorización, falta de secreto/allowlist, payload alterado, orden commit-before-HTTP, ausencia de segundo send). `supabase/tests/ci/124_whapi_invitation_outbox_d070.sql` ensaya PostgreSQL17 real con fixture D065 en savepoint, consentimiento, scope, preparación repetida, roles, cuota faltante/excedida, in-flight, incertidumbre y BAJA.

**No confundir:** SQL y HTTP sintéticos no demuestran un Whapi real ni costo real ni consentimiento genuino. Tampoco se ha instalado SQL en el proyecto DEV, hay credenciales de sender configuradas, ni existe un scheduler comercial. Backup lógico **real** cifrado + restauración aislada Supabase DEV Issue #175 sigue pendiente y bloquea el rollout. Falta validación E2E contra Whapi de pruebas con un comercio voluntario.

**Foco comercial:** el comprador envía una lista una vez; los proveedores reciben su parte y responden desde WhatsApp, sin capacitación ni confirmación redundante.
