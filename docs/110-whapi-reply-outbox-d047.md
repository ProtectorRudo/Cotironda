# 110 — D047: outbox privado de respuestas WhatsApp

**31/10/2026 · Issue #197 · Solo PostgreSQL 17 de GitHub CI.** No migración a Supabase DEV ni envío por Whapi.

## Qué resolvimos

Los módulos anteriores ya tienen rondas, cotizaciones por revisión y recepción segura de mensajes. D047 reutiliza D024, D026 y D028. Suma una **bandeja SQL persistente de intenciones de respuesta**, sin duplicar la bandeja de entrada.

El nuevo esquema SQL en supabase/sql/whapi_reply_outbox_d047.sql crea whapi_reply_jobs_d047 exclusivamente en cotironda_private. Cada trabajo contiene UUID, ronda, empresa proveedora, versión exacta del borrador, identificador HMAC del mensaje, identificador HMAC del chat, intentos y estado. NO guarda número telefónico, texto, URL, secreto ni contenido económico.

- whapi_enqueue_reply_d047 verifica un mensaje de D028 ya persistido, ronda abierta e invitación vigente, contacto consentido y la revisión actual de oferta D026. Resuelve idempotencia única por ronda/proveedor/revisión.
- whapi_lease_reply_d047 reserva una tarea con token y bloqueo FOR UPDATE SKIP LOCKED, revalida borrador y opt-out, y cancela tareas obsoletas. El worker futuro deberá revalidar otra vez justo antes de enviar.
- whapi_finish_reply_d047 registra únicamente aceptación por transporte o fallo, con reintentos acotados, nunca entrega ni lectura confirmada. Usa token de lease para evitar ACK ajenos.

Las operaciones tienen un rol SQL interno NOLOGIN/NOINHERIT/NOBYPASSRLS con RLS propia; un segundo rol NOLOGIN tiene únicamente EXECUTE sobre las funciones. Ningún rol de navegador, Auth, service_role ni cotironda_app recibe estas funciones.

## Pruebas y límites

supabase/tests/ci/107_whapi_reply_outbox_d047.sql usa PostgreSQL 17 real con empresas, rondas y mensajes FICTICIOS dentro de BEGIN/ROLLBACK. Valida permisos, inserción y repetición, conflicto de evento, reserva exclusiva, ACK por token, cancelación por revisión obsoleta y tres intentos máximos. GitHub CI ejecuta el SQL D047 únicamente en un contenedor desechable.

**Una respuesta encolada no es enviada.** Aceptada por transporte no equivale a entregada o leída. Hay una posible carrera entre reservar y enviar, y un timeout de HTTP luego de un envío puede provocar entrega duplicada; exactamente una vez NO está garantizado. El broker deberá manejar idempotencia externa, estados inciertos y conciliación antes de enviar a WhatsApp real.

**Una revisión de oferta existente tampoco prueba que proviene del mensaje del proveedor.** D047 comprueba el vínculo de ronda/empresa y el estado del borrador, pero el broker de confianza debe probar y persistir causalidad entre mensaje de D028, interpretación y revisión de D026. La confirmación de precio D046 sigue pendiente de persistencia transaccional; D047 solo crea la bandeja de salida durable.

## Pendiente

Broker real autenticado, clave HMAC/cifrado, recuperación de texto seguro de inbox, composición de mensaje con nombres curados, confirmación reply-to, procesamiento y corrección de ofertas, enlace comprobable D028→D026, opt-out inmediato, revalidación final, recuperación ante fallos, cuotas por cliente y E2E con teléfonos consentidos. Requiere backup/restauración real #175 y control de permisos alojados antes de instalar D024–D047 en DEV. Producción intacta.

Referencias: docs/92, docs/109, docs/05-whatsapp.md, docs/09-roadmap.md.
