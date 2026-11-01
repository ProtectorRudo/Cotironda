# 139 — MVP-019: vínculo cifrado de destinatario WhatsApp (sin activar envíos)

31/10/2026 · Issue #251. Desarrollo y PostgreSQL 17 descartable de CI **solamente**. No se instalará en Supabase DEV ni producción antes del respaldo/restauración auténticos #175.

## Hallazgo al revisar el código existente

Cotironda ya tiene transporte Whapi.Cloud `POST /messages/text` D055, worker de respuesta D054, autorización pre-HTTP D056 y registro anti-reenvío D053. **No conviene crear otro sender desde cero**.

Sin embargo, en D028 se guarda el identificador del chat exclusivamente como HMAC-SHA256 con una clave privada. El HMAC es irreversible: **no sirve para reconstruir el número de WhatsApp**. Por ello, la preparación del pedido D065/D066 no puede generar un envío comercial válido aun cuando tenga un contacto consentido.

## Implementación D068

- Nuevo `whapi_recipient_vault_d068` en esquema privado, RLS habilitada, `nonce`, `cipher`, `tag` y `crypto_key_id` por `(channel_id,chat_key)`, con FK al contacto D028. **No almacena número ni chat ID en claro**. La tabla es inmutable (bloquea UPDATE/DELETE).
- Enrolamiento en Node: `cifrarDestinatarioD068` recibe el teléfono de un contacto YA verificado por el broker, calcula su HMAC exactamente como D056, cifra `<telefono>@s.whatsapp.net` con AES-256-GCM, nonce aleatoria de 96 bits y AAD que incorpora canal, huella de contacto, empresa proveedora y key-id. Usa una clave AES **separada** de la identidad HMAC y de la clave de contenido entrante. No deriva claves automáticamente ni consulta secretos globales.
- `whapi_store_recipient_d068`: función privada con propietario NOLOGIN/NOBYPASSRLS, ejecutable únicamente desde `cotironda_recipient_gateway_d068`. Requiere contacto consentido+verificado actual del mismo canal, huella y proveedor. Guarda una sola vez; reintentos no sobreescriben el cifrado y una empresa distinta no puede reclamar la huella. La autenticidad del texto antes de cifrar depende del broker verificado.
- `whapi_read_recipient_packet_d068`: lectura server-only; exige ronda D064/D065 preparada y paquete D066 vigente con rubro, zona y contacto con BAJA no registrada, y **exactamente un contacto consentido por proveedor y canal**. Devuelve solo cifra, HMAC y paquete comercial; nunca teléfono. No es permiso para enviar.
- `descifrarDestinatarioD068`: únicamente el worker backend con las dos claves puede descifrar. Verifica integridad AES-GCM con AAD y comprueba de nuevo, en tiempo constante, que el teléfono recuperado corresponde al HMAC del mismo canal.
- `crearResolverInvitacionD068`: combina lectura privada + desencriptado + mensaje corto D066, listo como **vista previa de un posible envío**, no como job de WhatsApp. No crea ningún trabajo de salida ni toca D053/D054/D055.

## Pruebas y límites del piloto

`tests/unit/mvp019-encrypted-recipient-d068.test.mjs`: recuperación exacta, nonce distinta por cifrado, ausencia de PII, alteración de canal/empresa/HMAC/nonce/tag/cifrado/clave, respuesta SQL maliciosa, datos inválidos y ausencia de llamadas HTTP.

`supabase/tests/ci/123_whapi_encrypted_recipient_d068.sql` reutiliza la ronda ficticia del D065 en una **savepoint con rollback** antes del ensayo D066: permisos de roles, recuperación exclusiva de ciphertext y scope de cemento, replay, proveedor ajeno, canal ajeno y BAJA posterior. Nada se instala en DEV.

**No se habilitan envíos**. Todavía hay que definir un sender de *invitaciones comerciales* distinto de la cola D054 (que gestiona respuestas), con reserva transaccional idempotente, límites comerciales, revalidación inmediata de opt-out y un protocolo de estado incierto que **nunca reenvíe automáticamente** tras un timeout HTTP. Asimismo, hay que resolver con qué mecanismo autorizado el broker enrola un contacto comprobando su identidad. Whapi.Cloud devuelve aceptación HTTP, no confirmación de entrega; esta se corrobora por webhooks de estado. <https://support.whapi.cloud/help-desk/getting-started/api-docs>

**Fricción:** no se agrega paso alguno al comprador ni al comercio. El proveedor sigue respondiendo por WhatsApp sin «Confirmo».
