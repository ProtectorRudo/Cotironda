# 117 — D054: trabajador saliente seguro, transporte simulado y protocolo de no duplicación

**31/10/2026 · Issue #211 · PR apilado sobre D053/#210 · solo desarrollo y PostgreSQL17 CI.**

## Qué se implementó

`src/server/whapi-send-worker-d054.ts` es un orquestador **exclusivamente de servidor, sin cliente HTTP, sin URL de Whapi, sin cron ni despliegue**. Recibe un transporte inyectado (ficticio en las pruebas), un resolvedor interno de destinatario/mensaje y llamadas RPC transaccionales independientes.

Flujo:

1. Reclama un trabajo privado D047 mediante `whapi_lease_reply_d047()`, sin SELECT sobre tablas.
2. Solicita al backend confiable un destinatario y texto. **Verifica contra los datos del trabajo de BD**: canal, chat HMAC, empresa proveedora, ronda y revisión. No acepta información económica, destinatario ni empresa autodeclarados por mensajes de WhatsApp.
3. Si falla la preparación **antes de transmitir**, usa `whapi_finish_reply_d047(..., false, null)` para permitir reintento con backoff y máximo de intentos.
4. Ejecuta `whapi_begin_send_d053(job,lease)` en una transacción **confirmada** antes de llamar al transporte. Si el servidor bloquea por BAJA/ronda/revisión, no envía. Si pierde la respuesta de PostgreSQL (podría haberse confirmado el `begin_send`), **no envía ni reintenta**.
5. Con `in_flight` confirmado invoca `transport.sendText` una sola vez. Si la respuesta simulada contiene un ID externo validado con estado `accepted`, calcula HMAC-SHA256 con el mismo contrato D050 y usa `whapi_record_send_outcome_d053` para registrar **aceptación por transporte**, no entrega/lectura.
6. Ante timeout, fallo o respuesta ambigua, guarda `uncertain` y no permite reenvío automático. Si falla la escritura de ese resultado, el trabajo queda `in_flight` hasta el barrido D053: tampoco se reenvía.

El trabajador devuelve códigos de estado sin texto de presupuesto, teléfonos, token, ID externo en claro ni secreto. No registra datos personales en logs.

### Separación de poderes

`supabase/sql/whapi_sender_gateway_d054.sql` crea el rol `cotironda_reply_sender_d054` NOLOGIN/NOINHERIT/NOBYPASSRLS con **solo EXECUTE** sobre reclamar, marcar preenvío, comenzar y registrar resultado D047/D053. No puede conciliar `uncertain` ni consultar tablas. Un futuro reconciliador deberá tener otra identidad, usar evidencia externa autenticada y no compartir credenciales con el emisor. El login ficticio usado en CI solo hereda los permisos del rol sender.

### Pruebas

- `tests/unit/whapi-send-worker-d054.test.mjs`: orden de operaciones, un transporte inyectado, respuesta con ID validado, HMAC de salida, timeout, error de SQL antes/después de HTTP, texto inválido, identidad de otra empresa/chat/ronda, confirmación bloqueada y respuesta ambigua.
- `scripts/ci/whapi-pg/send-d054-seed.sql`: tres solicitudes sintéticas para tres rondas y un proveedor ficticio en PostgreSQL 17, con credencial temporal sin permisos de lectura de tablas ni conciliación.
- `scripts/ci/whapi-pg/send-d054-e2e.mjs`: **driver Node22/pg real y conexiones aisladas con autocommit** para ejecutar D047/D053. Transporte *falso*: primer mensaje responde ID aceptado, segundo simula timeout después de iniciar envío, tercero falla antes de HTTP y queda pendiente de reintento seguro. Verifica una sola invocación por envío y que nadie puede leer tablas privadas.
- `.github/workflows/postgres-rls.yml`: corre D054 luego de D052/D053, con contraseñas y claves HMAC efímeras enmascaradas y SQL final para comprobar que hay exactamente un aceptado, un incierto y un fallo de preenvío reencolado.

## Revisión de API Whapi.Cloud

La documentación consultada indica que `POST https://gate.whapi.cloud/messages/text` recibe `to` y `body` y que el acuse inicial incluye identificador de mensaje en estado pendiente. **Pending no es Delivered ni Read**. El contrato real de respuesta y los webhooks de estados deben validarse con una cuenta de prueba consentida antes de crear el adaptador HTTP, y los IDs externos deben entrar en el ledger solo como HMAC. Fuentes oficiales:

- https://whapi.readme.io/reference/sendmessagetext
- https://support.whapi.cloud/help-desk/getting-started/api-docs

D054 **NO implementa ni ejecuta ese endpoint**. Solo utiliza un transporte artificial, y no se puede activar accidentalmente para números reales desde la aplicación publicada.

## Límites

El worker NO garantiza entrega exactly-once: la protección es conservadora y prefiere dejar el mensaje incierto para conciliación antes que enviarlo dos veces. El futuro transporte HTTP necesita tiempo máximo, validación de acuse, protección de credenciales, rate limiting, consentimiento, cotas de gasto, event log, y revalidación inmediatamente previa de la baja/versión, además de ensayo con teléfonos voluntarios. La fase SQL `begin_send` ya revisa consentimiento y revisión, pero existe una carrera temporal entre la confirmación SQL y la salida HTTP.

No hay IA documental ni extracción de precios, no se publicaron migraciones D024–D054 en Supabase DEV, no se enviaron mensajes reales y la copia/restauración auténtica DEV sigue abierta en #175. PR draft, sin merge ni despliegue.
