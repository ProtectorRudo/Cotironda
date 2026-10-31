# 113 — D050: verificar «Confirmo» contra la cita original de Whapi.Cloud

**31/10/2026 · Issue #203 · Etapa 04, desarrollo offline apilado sobre D049/#202.**

## Defecto detectado

La especificación oficial de **Whapi.Cloud** incluye el identificador citado en el campo `message.context.quoted_id`, en eventos `messages/post`. Hasta D049, el receptor Cotironda D027 descartaba esa información antes del cifrado D029. Por lo tanto, no podía certificar con evidencia qué borrador había citado el proveedor. No confundir la API de Whapi.Cloud con otras plataformas denominadas «Whapi».

- Documentación de ejemplo de webhook de Whapi.Cloud: https://support.whapi.cloud/help-desk/sending/send-message-with-buttons
- Documentación de mensaje entrante y `context`: https://support.whapi.cloud/help-desk/receiving/webhooks/incoming-webhooks-format/incoming-message

## Cambios verificables de código

1. `src/server/whapi-inbound-offline.ts` lee `context.quoted_id` solo en mensajes de texto verificados por el flujo D027. Valida tipo, longitud y caracteres. Nunca interpreta como autoridad el contenido de `context.quoted_content`, `quoted_author`, archivos o URL. Si el contexto existe y contiene cita inválida, responde con rechazo sin guardar.
2. `src/server/whapi-crypto-broker.ts` incorpora **solo el ID citado** al JSON cifrado mediante AES-256-GCM con AAD y a la huella HMAC de integridad. No añade columnas SQL, guarda teléfonos ni persiste la cita en texto claro. Las entradas D029 antiguas sin cita conservan su formato y pueden seguir leyéndose, incluso con rotación de claves prevista en D032/D034. El cambio de cita con un mismo ID de mensaje produce una huella diferente y rechazo por colisión.
3. `src/server/whapi-quoted-confirmation-d050.ts` opera sobre **una entrada ya persistida y descifrada de manera autenticada** y dos consultas a un backend confiable: vínculo de entrada D028 y acuse saliente D047. Acepta únicamente un texto «Confirmo» exacto, con mayúsculas/minúsculas y espacios laterales simples; el modo libre «Confirmo CÓDIGO» no está habilitado. Calcula HMAC-SHA256 del ID de salida citado con dominio separado y exige que el trabajo de respuesta esté en `accepted_by_transport` y pertenezca al **mismo canal, chat HMAC, empresa y ronda**, con origen de borrador diferente del mensaje de confirmación. Genera un evento UUID determinista y una huella HMAC de intención para los parámetros de D049. La misma entrega repetida produce idénticos parámetros, no una operación distinta.

## Límites esenciales

**D050 no ejecuta D049 ni confirma cotizaciones.** El módulo sólo genera argumentos para que un futuro worker/puerto PostgreSQL privado ejecute D049 con la transacción de la etapa anterior. D049 debe volver a verificar consentimiento, la ronda abierta, la procedencia D048, la versión vigente y los importes; D050 no reemplaza esos controles. Los dos puertos de D050 son **interfaces a implementar**, no adaptadores reales de Supabase ni una conexión a Whapi. El productor del acuse D047 futuro deberá usar el mismo cálculo `calcularAcuseSalidaD050`, con clave custodiada en servidor y nunca revelada a la plataforma web.

Un acuse `accepted_by_transport` **no acredita entrega, lectura ni consentimiento**; solamente enlaza un ID externo de mensaje saliente con el job D047. Asimismo, `context.quoted_id` proviene de un webhook: la autenticidad de este dato sólo se puede aceptar **después** de verificar el secreto de webhook y la identidad del proveedor y de comprobar el mensaje saliente en nuestra base. **El modelo de confirmación aún no fue probado contra una entrega real de Whapi.Cloud**.

Las pruebas no comprueban que una persona haya escrito realmente «Confirmo»: validan el comportamiento frente a entradas cifradas de un webhook simulado autenticado y referencias sintéticas. La interpretación de cotizaciones con IA real, el outbox con idempotencia HTTP y un piloto móvil sin capacitación también siguen pendientes.

## Pruebas y autorización

`tests/unit/whapi-quoted-confirmation-d050.test.mjs` ejecuta casos sintéticos sobre el receptor y broker originales: almacenamiento cifrado sin cita en claro, ida y vuelta AEAD, referencia correcta, duplicado idéntico, alteración de cita, cita ausente, texto falso, reply de chat ajeno, comprobante de transport inexistente, alteración de ciphertext/tag y compatibilidad de entradas anteriores. Sin llamadas de red ni costos de IA.

D050 modifica exclusivamente una rama en GitHub, sin desplegar rutas, ejecutar SQL nuevo ni alterar Supabase DEV/producción. La instalación de D024–D049 continúa bloqueada por la recuperación real #175, y el acceso permanente del worker/las claves del ledger todavía no existe.

El flujo proyectado del proveedor sigue siendo **cero portal obligatorio**: una cotización por chat, un resumen legible y una sola confirmación explícita sobre ese resumen, sin cursos ni comandos complejos.