# 181 — MVP-061: ruta privada de envío de consultas Whapi (sin habilitar)

**01/11/2026 · Issue #335 · solo desarrollo y GitHub CI.**

## Hallazgo de auditoría

El emisor correcto YA EXISTÍA: `src/server/whapi-invitation-sender-d070.ts`, con `src/server/whapi-cloud-transport-d055.ts`, y la recuperación del destinatario cifrado `D068`. Esos módulos ya garantizan que:

- La cola D070 prepara una sola invitación por ronda y proveedor, con materiales de su alcance, localidad y condición del comprador.
- Cada destinatario se recupera de un vault AES-GCM, y su número tiene que coincidir con el HMAC del contacto vigente.
- Antes del envío, `whapi_begin_invite_d070` reserva cupo/cuota y pasa a fase `in_flight` mediante operación PostgreSQL **COMMITTED**, sin completar un envío por el solo hecho de crear una ronda.
- Justo antes de `POST https://gate.whapi.cloud/messages/text`, se verifica identidad, consentimiento y BAJA de proveedor, canal y cupo, además de la lista autorizada de teléfonos.
- Un resultado HTTP ambiguo, error 429/timeout o pérdida de confirmación **no se reenvía automáticamente**. Solo puede afirmarse `accepted_by_transport`, nunca entregado/leído sin prueba posterior.

Faltaba un driver SQL y una ruta privada que pudieran ejecutar el emisor real en Preview.

## Cambios

**Nuevo endpoint**: `POST /api/integraciones/whapi/enviar` (Next Node). No hay nueva pantalla ni interacción exigida al arquitecto o corralón. Requiere Preview autorizada, método POST **sin cuerpo**, header propio `x-cotironda-invite-key`, y configuración íntegra verificada antes de importar PostgreSQL. Una invocación procesa **como máximo una invitación**. Rechaza GET/PUT, rama main, producción, token ausente, JSON del cliente, 0 o más de tres contactos, números duplicados o mal formateados. Responde únicamente un estado sin números, mensajes, empresas, tokens o mensajes de Whapi.

**Driver**: `src/server/whapi-invite-sql-sender-mvp061.ts` crea una **nueva sesión reservada y exclusiva por RPC**, para que D070 `begin_invite` haya COMMIT antes del HTTP externo (Postgres autocommit por statement; no hay `BEGIN` explícito). Cada sesión usa TLS con CA verificada y `SET ROLE` al rol D091, valida `session_user` y `current_user`, y se libera/cierra al completar. Solo seis RPC concretas, no SQL arbitrario.

**D091**: login `cotironda_invite_sender_login_d091` `PASSWORD NULL`, `NOINHERIT`, `NOBYPASSRLS`, sin tablas ni Auth, asociado únicamente a `cotironda_invite_sender_gateway_d091` `NOLOGIN`. El gateway tiene EXECUTE sobre cinco operaciones D070 (claim, fail-preflight, begin, authorize, finish) y la lectura cifrada D068; NO tiene prepare, sweep ni reconcile. El SQL se ejecuta únicamente en PostgreSQL17 CI, pendiente de instalación segura en DEV.

**Whapi API**: reusamos el endpoint documentado de mensajes de texto, con `Bearer` y `to` internacional sin +. [Documentación oficial](https://support.whapi.cloud/help-desk/sending/send-text-message). Aceptación del transporte no significa entrega al usuario.

## Flags privados FUTUROS (todos apagados actualmente)

- `COTIRONDA_INVITE_SEND_ENABLED=true` y `COTIRONDA_INVITE_SEND_PILOT_AUTHORIZED=true`; únicamente tras aprobar prueba real.
- `COTIRONDA_INVITE_SEND_SECRET`: secreto privado distinto a webhook y al worker comprador.
- `COTIRONDA_INVITE_SEND_WHAPI_TOKEN`: token del **único canal central**, nunca en chat/GitHub.
- `COTIRONDA_INVITE_SEND_ALLOWED_TO`: lista separada por comas de **1 a 3 números autorizados**, formato internacional sin `+`, exclusivamente comercios voluntarios del piloto. No se admite un envío arbitrario a números suministrados por la solicitud HTTP.
- `COTIRONDA_INVITE_SEND_DB_DRIVER_ENABLED=true`, `COTIRONDA_INVITE_SEND_DB_PROJECT_REF=qkercsoqhehbenbbncwk`, `COTIRONDA_INVITE_SEND_DB_URL` con LOGIN D091 dedicado y contraseña privada (modo **Session 5432**, nunca transaction 6543), `COTIRONDA_INVITE_SEND_DB_CA_PEM` certificado confiable de Supabase.
- `COTIRONDA_WHAPI_HMAC_ID_HEX` (compartida con broker D029), `COTIRONDA_WHAPI_RECIPIENT_AES_HEX` (misma clave con que D068 creó los vaults) y `COTIRONDA_WHAPI_ACK_HMAC_HEX` (HMAC de IDs devueltos por transporte), tres claves distintas y privadas; `COTIRONDA_WHAPI_CHANNEL` igual al canal central.

Todas las claves deben administrarse desde un almacén de secretos del entorno de Preview; **no se activaron ni configuraron en Vercel**. No existe un cron ni job que invoque el endpoint.

## Ensayos y aceptación

`tests/unit/mvp061-whapi-private-invite-sender.test.mjs`: simulación sin Whapi real de una invitación comercial, DB COMMIT antes del HTTP, respuesta `accepted_by_transport` una sola vez, segundo tick sin trabajo, autorización revocada, descifrado/packet inválido, pérdida de `begin`, rutas GET/PUT, secretos/faltas de permisos, allowlist, TLS y ref DB, rol SQL y cierre por RPC.

`supabase/tests/ci/138_invitation_sender_login_d091.sql`: privilegios del LOGIN nulos, un único SET ROLE, RPCs permitidas y prohibidas, ausencia de lectura directa de tablas, rol mínimo.

Para el piloto real todavía faltan #175 (ambiente DEV recuperable), instalar los SQL de catálogo/canales/roles en ese entorno, registrar 1 arquitecto y 3 proveedores con consentimiento y material de prueba, configurar Whapi, trabajador de comprador, **programador privado**, confirmación de envíos y presupuestos entrantes, rankings y finalistas. Se usará una lista explícita de cuatro teléfonos y un solo canal central. Si hay estado incierto, se investiga manualmente en Whapi, sin reintentar a ciegas.

**No se tocó Supabase DEV, Vercel, producción, `main`, OFI, ni se realizó ningún envío WhatsApp real.**
