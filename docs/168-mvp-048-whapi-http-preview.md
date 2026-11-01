# 168 — MVP-048: primera ruta HTTP de Whapi, aislada y cerrada

**01/11/2026 · Issue #309 · Estado: código de desarrollo y CI. Sin mensajes reales.**

## Objetivo

Poder recibir una llamada HTTPS de Whapi en Next.js, autenticar el encabezado compartido **antes de abrir una conexión a PostgreSQL**, cifrar la entrada por el broker existente y guardar en el inbox D074, cuyo trigger D082 encola al comprador dentro de la transacción. No replicar lectores, IA ni motores de ofertas.

Whapi documenta eventos `messages.post` con `event: {type:'messages', event:'post'}`, `channel_id` y lista `messages`, y configuración de headers personalizados para los callbacks. No asegura una firma HMAC propia del webhook: Cotironda requiere el header personalizado `x-cotironda-webhook-key`. Referencias oficiales: [Formato](https://support.whapi.cloud/help-desk/receiving/webhooks/incoming-webhooks-format/incoming-message), [Webhook](https://support.whapi.cloud/help-desk/receiving/webhooks), [Headers](https://whapi.cloud/changelog). Usar siempre HTTPS, canal de ensayo y números autorizados.

## Componentes

- `src/server/whapi-preview-http-d083.ts`: función HTTP server-only para la recepción. El chequeo de entorno (Preview exacta, rama privada, flags OFF por defecto y registro general no habilitado), método POST y comparación constante del header ocurre antes de pedir SQL. Valida canal/versión AES y **tres claves criptográficas separadas**. Reutiliza `procesarWebhookWhapiAislado` D027, `construirBrokerWhapiPrivado` D029 y `crearPuertoPostgresWhapiDualD074` D030. D027 admite solo chats directos autenticados; ignora grupos, limita payload y solo almacena media cifrada como evento no extraído. Jamás descarga URL ni envía WhatsApp.
- `apps/portal/app/api/integraciones/whapi/route.ts`: primera ruta Next Node (no-cache). **La ruta no inyecta una conexión de base de datos** por seguridad: incluso si alguien activa los flags sin el operador PostgreSQL de permisos mínimos, responde 503. No usa service_role, JWT de usuarios, RPC públicas ni importes de conexión. GET y PUT rechazan con 405; no hay status debug ni lectura de datos.
- `tests/unit/mvp048-whapi-http-preview.test.mjs`: route Next efectiva con flags OFF, encabezados inválidos antes de SQL, gate de rama/ambiente, HMAC+A​ES, replay, BAJA, mensajes documento sin descarga, fallo de SQL sanitizado.

## Flags privados (NO poner secretos en NEXT_PUBLIC)

```dotenv
COTIRONDA_WHAPI_WEBHOOK_ENABLED=false
COTIRONDA_WHAPI_PILOT_AUTHORIZED=false
COTIRONDA_WHAPI_CHANNEL=
COTIRONDA_WHAPI_WEBHOOK_SECRET=
COTIRONDA_WHAPI_HMAC_ID_HEX=
COTIRONDA_WHAPI_HMAC_FINGERPRINT_HEX=
COTIRONDA_WHAPI_AES_CONTENT_HEX=
COTIRONDA_WHAPI_AES_KEY_ID=aes_2026_a
```

**El encendido está bloqueado adicionalmente por** `VERCEL_ENV=preview` y `VERCEL_GIT_COMMIT_REF=integration/mvp-piloto-20261031`. Las claves se mantienen solo en secretos server-side del entorno de ensayo, con 32 bytes no nulos y diferentes. Nunca pegarlas en GitHub ni en este chat. Whapi no debe apuntarse a esta URL hasta instalar gateway duradero y probarlo con solicitudes autenticadas; el encabezado no es un token de autorización del comprador, solo protege el origen del callback. El comprador y el proveedor deben estar dados de alta/verificados por HMAC+consentimiento en PostgreSQL.

## Lo que todavía NO está resuelto

El **driver y la conexión real** bajo permisos SQL mínimos no están instalados en Next ni en un worker separado. No hay un singleton con privilegios de administrador ni una API PostgREST privada abierta; se necesita crear un login técnico de base limitado a los RPC de D030/D074, de preferencia un servicio privado separado con conexiones/roles diferenciados por responsabilidad. La falta de ese puerto deja la ruta en 503, deliberadamente. Es falso decir que “Whapi está conectado”.

Tampoco están en DEV las migraciones comerciales D024+, D074/D082; **#175 exige respaldo real cifrado y restauración aislada** de cotironda-dev. Ya hay un asistente local de exportación cifrada D075, pero su verificación de descifrado **no equivale a restauración**. El respaldo real en Free no es automático: [Supabase backups](https://supabase.com/docs/guides/platform/backups).

Después faltan conexión privada real, controles de secretos/roles, worker D082 desplegado, pregunta de localidad por WhatsApp con outbox y consentimiento, extracción segura y IA documental, catálogo, envíos D070, recepción D061, ranking y revelado autorizado de contactos. No hay producción, Vercel, Supabase DEV, DNS ni Whapi modificados en MVP-048.

**Criterio de aceptación de esta etapa:** HTTP de Preview en código, fail-closed incluso ante activación accidental, semántica D027 sin duplicar y unitarias + build CI verde. La entrada real por un número queda para etapa posterior.
