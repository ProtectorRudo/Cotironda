# 91 — D027: recepción Whapi OFFLINE, sin abrir webhook

**30/10/2026 · Issue #155 · rama `feat/04-whapi-inbound-adapter-offline`, sobre D026.**

## Qué se verificó de Whapi (fuentes oficiales)

- Los eventos de mensajes entrantes usan el cuerpo JSON `{event:{type:'messages',event:'post'},channel_id,messages:[...]}`; los objetos incluyen `id`, `chat_id`, `from`, `from_me`, `timestamp`, `type`, `text.body`. Una notificación puede incluir varios mensajes. Fuente: [Incoming Message](https://support.whapi.cloud/help-desk/receiving/webhooks/incoming-webhooks-format/incoming-message).
- El modo Body despacha los eventos por `POST`. Fuente: [Detailed webhook settings](https://support.whapi.cloud/help-desk/receiving/webhooks/detailed-webhook-settings).
- La referencia de pruebas permite **headers adicionales** en webhook, incluyendo Authorization y encabezados propios: [Webhook test API](https://whapi.readme.io/reference/webhooktest). Esta funcionalidad debe verificarse además en los ajustes del canal real antes del despliegue. **No se encontró garantía general de HMAC de Whapi.Cloud.** Por lo tanto NO declarar que valida firma; el diseño depende de un secreto compartido por canal en `X-Cotironda-Webhook-Key`, enviado vía HTTPS, comparado en tiempo constante, y protegido en gestor de secretos server-only. Verificación fuerte adicional de origen/IP o firma nativa quedará pendiente de documentación específica del proveedor y configuración real.

## Entrega
`src/server/whapi-inbound-offline.ts` es un receptor de `Request` puro con adaptadores inyectables. **No existe ruta HTTP publicada, no está configurado el número de WhatsApp, no hay secrets ni tokens cargados en la rama.**

Orden de validaciones:
1. Flag `habilitado` OFF por defecto en cualquier futuro montaje; solo POST, header compartido secreto obligatorio y distinto de la API key saliente, Content-Type JSON, límite de 64 KiB por lote y 10 mensajes.
2. Rechaza `channel_id` distinto del canal configurado en el servidor; solo evento `messages.post` de modo Body. `statuses`, mensajes salientes, grupos, canales y conversaciones `@lid` no generan cotización.
3. Mensaje nuevo: `from_me===false`, ID externo limitado, chat individual `@s.whatsapp.net`, coincidencia textual con `from`, timestamp en ventana tolerante de hasta 48 horas atrás y 5 minutos hacia adelante. Los eventos antiguos o incorrectos no se aceptan.
4. `resolverProveedor(canalId,chatId)` **solo en backend de confianza**: devuelve un único `supplierOrgId` y `roundId` verificados, opt-in vigente e invitación vigente. No se aceptan esos valores enviados por Whapi, cliente o IA. Si faltan, HTTP 403 sin registro.
5. Persistencia `persistirEntrada(entrada)` debe ser durable y atómica en una futura cola privada, con restricción única de `(canalId,mensajeId)`, detección de colisión mediante SHA-256 y opción `guardada/duplicada`. **Este puerto no está implementado contra PostgreSQL todavía**: hay tests con un `Map` sintético, pero no garantía durable real. Se responde 200 exclusivamente cuando todos los mensajes quedan guardados o identificados como duplicados. En error parcial 503 para que se reintente el lote y el sink deduplique los registros anteriores.
6. Guarda únicamente campos mínimos para futura interpretación. **No descarga enlaces de media** ni persigue URLs entregadas por proveedores; documentos, fotos, audios y voces quedan como `pendiente_interpretacion`. Se requiere módulo posterior de descarga autorizada con validación de tipo/tamaño, almacenamiento privado y antivirus.
7. Texto `Confirmo` es solo texto entrante, **no** invoca confirmación de D026. Un traductor de intención deberá primero buscar conversación única y versión pendiente de confirmar y exigir confirmación inequívoca; todavía no existe.
8. Respuesta HTTP no contiene número telefónico, nombre, texto del presupuesto, secretos, identidades comerciales ni detalles de SQL.

## UX-001 — sin curso ni carga doble
- Corralón escribe cotización por WhatsApp normalmente; Cotironda la interpretará y propondrá confirmación simple, con dudas puntuales, sin portal obligatorio.
- El comprador también podrá iniciar solicitudes por WhatsApp en otro incremento. **D027 solo prepara entrada de proveedor**, no inaugura el canal comprador.
- Las notificaciones deben representar estado verdadero: «mensaje recibido y pendiente de interpretación» no es «presupuesto entregado».
- Opt-out BAJA debe registrarse aun si la persona deja de estar habilitada: se requiere circuito de cumplimiento/consentimiento independiente antes del piloto. El módulo **no automatiza bajas todavía**; no mostrarlo como terminado.

## Riesgos pendientes para D028/D029
- No hay backend duradero, configuración real de headers del canal, número de Whapi ni verificación de origen por firma nativa. El secreto compartido puede filtrarse y por sí solo no evita suplantación si se pierde; rotación y rate limit necesarios antes de producción.
- `from` y `chat_id` coincidentes no autentican identidad comercial por sí solos. El resolver debe usar asociación verificada y única por conversación, consentimiento activo y empresa; cambios de teléfono deben autenticarse fuera del payload.
- WhatsApp Cloud/Whapi soportan identificadores de chat adicionales (`@lid`, reply etc.). No se deducen automáticamente; D027 los retiene/descarta conservadoramente hasta tener identificación segura.
- Cualquier respuesta IA se considera **no confiable** y nunca se ejecuta como instrucción del sistema. El mensaje o archivo tampoco contiene autorización para comandos administrativos.
- Falta un outbox de mensajes con deduplicación, entregado vs encolado, retención de datos, protección de spam, consentimiento, seguimiento de costos, pruebas E2E y el webhook real.
- Test con mapa es solamente test offline, no persistencia segura. **No dar por funcionando la integración WhatsApp ni activar ninguna ruta.**

## Pruebas
`tests/unit/whapi-inbound-offline.test.mjs` cubre credenciales erróneas, canal incorrecto, remitente ajeno, opt-in y vinculación, grupos/estados/salientes, texto y media, URLs internas bloqueadas, reintentos idénticos y cambiados, lote parcial y error de persistencia, tamaños, fechas y payloads inesperados. Ejecuta `node --experimental-strip-types --test tests/unit/*.test.mjs` como parte de CI y compilación TS.

**Sin cambios DEV/producción, Whapi real, proveedor, OpenAI, pagos ni credenciales.**
