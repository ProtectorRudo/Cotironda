# 118 — D055: adaptador HTTP Whapi.Cloud desactivado por defecto

**31/10/2026 · Issue #213 · Etapa 04 · PR borrador apilado sobre D054/#212.**

## Contrato externo verificado (31/10/2026)

Whapi.Cloud documenta `POST https://gate.whapi.cloud/messages/text`, autenticación `Authorization: Bearer`, y JSON con `to` y `body`. La respuesta habitual incluye `sent:true` y `message.id`; `message.status='pending'` significa que el proveedor **aceptó tramitar el mensaje**, NO que llegó al teléfono ni fue leído. Los estados posteriores se reconcilian con `statuses.post` / `statuses.put`.

Documentación oficial: https://whapi.readme.io/reference/sendmessagetext, https://support.whapi.cloud/help-desk/sending/send-text-message, https://support.whapi.cloud/help-desk/faq/why-do-i-see-status-pending-after-sending-message y https://whapi.cloud/docs. La forma concreta del cuerpo de respuesta sigue siendo un contrato a contrastar en el piloto, sin teléfonos reales en esta fase.

## Qué se implementó

`src/server/whapi-cloud-transport-d055.ts` implementa el adaptador compatible con `transport.sendText({to,body,jobId})` de D054, con esta postura de seguridad:

- **Desactivado por defecto**: se necesitan simultáneamente `habilitado:true` y `pilotoAutorizado:true`. No hay endpoint HTTP de aplicación, cron, ni creación de conexiones por defecto; `fetcher` se **inyecta obligatoriamente** y no existe un fallback a `global fetch`.
- Token Bearer **inyectado desde el futuro trabajador**; jamás en repositorio o navegador, ni mensajes de error. Envía únicamente a números internacionales simples explícitamente presentes en `destinatariosPermitidos`. No admite grupos, menciones, URL en destinatario ni parámetros arbitrarios `edit`/`quoted` en esta etapa.
- `autorizarIntento` obligatorio: una futura fuente de backend confiable tiene que aplicar consentimiento, cupo transaccional por empresa, gasto máximo, ventana temporal y rate limiting antes de autorizar. **D055 solo exige que devuelva `true`, no implementa cuotas durables**; los mocks de CI no prueban control de costos real.
- Ruta HTTPS constante; petición POST JSON limitada a `{to,body,no_link_preview:true,typing_time:0}`, sin redirects, cookies ni cache; timeout estricto de hasta 5 segundos; un único intento HTTP en la función.
- Parseo limitado a 16 KB de JSON, cabecera de contenido y codificación UTF-8 válida, sin registrar cuerpos de error HTTP. Rechaza un status HTTP distinto de 200, `sent!==true`, ID no válido, estado `failed` o destinatario `chat_id` distinto. Acepta como **acuse de transporte** solo `pending`, `sent`, `delivered` y `read`, sin afirmar que D054 probó entrega; el ID saliente viaja inmediatamente a HMAC D050 al persistirlo.
- Timeout, cierre de conexión, HTTP 4xx/429/5xx, JSON ambiguo, gran tamaño, acuse insuficiente, destinatario distinto y error de autorizador se convierten en **error neutro**. Como D054 ya ejecutó `begin_send_d053`, su reacción siempre es **incierto sin reenvío automático**. Esta política favorece seguridad frente a duplicados sobre entrega garantizada.

## Pruebas

`tests/unit/whapi-cloud-transport-d055.test.mjs` utiliza solo `fetcher` inyectado y respuestas sintéticas. Cobertura: modo apagado, autorización faltante, token inválido, allowlist/cupo, POST y headers, status pending, error de HTTP, redirect, JSON vacío/malformado, respuesta demasiado grande, ID de otro chat, timeout, error neutro y combinación real de código D054+D055 para `accepted_by_transport` o `uncertain`. Ni un solo envío de WhatsApp real.

## Lo que falta y bloquea un piloto

1. **Copia/restauración real de Supabase DEV (Issue #175)**, auditoría de migraciones D024–D055 y permisos reales; hasta entonces no se aplican cambios ni se publica.
2. Identidad worker en un entorno separado de producción, secretos y rotación bajo KMS/env de servidor, presupuesto **durable** por empresa y límites transaccionales, consentimiento, auditoría y allowlist piloto voluntaria. No se puede utilizar un booleano enviado por cliente para autorizar un número real.
3. Verificación real de API Whapi.Cloud con un destinatario expresamente consentido y una cuenta/canal de pruebas; comparar la forma de respuesta con los fixtures, revisar errores, tiempo de salida y entrega, webhooks de estados firmados y revalidación BAJA justo antes del envío.
4. Conciliador D053 de incertidumbres con privilegios separados del worker D054; sin evidencia aceptada, el mensaje queda incierto y no se reenvía.
5. Integración completa de extracción IA documental, revisión humana y comparación económica determinista, sin equiparar precios/condiciones diferentes ni adjudicar automáticamente.

**No se envían mensajes, no se instala SQL en DEV/producción y no se llama OpenAI/Whapi real.** Un `PASS` de tests con `fetcher` simulado no habilita publicar ni poner en marcha el piloto.
