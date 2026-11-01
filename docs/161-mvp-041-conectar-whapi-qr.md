# 161 — MVP-041: conectar Whapi por QR con control seguro y sin envíos

**31/10/2026 · Issue #295 · implementación únicamente en rama privada.**

## Decisión comercial

Usamos **Whapi.Cloud** como transporte del primer piloto, no crearemos una sesión WhatsApp Web propia. Un número exclusivo de prueba conectado a un canal Whapi por QR recibe solicitudes de arquitectos y responde a proveedores; Cotironda hará la lectura, búsqueda de comercios elegibles, invitaciones, recepción de cotizaciones y ranking por rubro. Los presupuestos finalistas NO son adjudicaciones de venta (UX-002, docs/159).

**El QR lo escanea solo el administrador del número Cotironda**, en WhatsApp → Dispositivos vinculados. Los arquitectos y proveedores NO escanean ni instalan aplicaciones adicionales.

Fuentes oficiales verificadas:
- [Documentación Whapi](https://whapi.cloud/docs): emparejamiento por QR, API Bearer, GET /health, GET /settings, GET /users/profile y mensajes/webhooks.
- [Whapi Health](https://whapi.readme.io/reference/checkhealth): **`GET /health?wakeup=false`** verifica estado sin despertar una sesión apagada.
- [Configuración webhook](https://support.whapi.cloud/help-desk/receiving/webhooks/detailed-webhook-settings): modo Body, todos los mensajes POST y persistencia de callbacks.
- [PATCH settings](https://whapi.readme.io/reference/updatechannelsettings): puede restablecer campos omitidos. **Nunca PATCH automático sin revisar ajustes existentes y riesgo de perder configuración.**

## Implementación comprobable

`src/server/whapi-channel-preflight-mvp041.ts` crea el payload futuro de webhook y consulta **solo por GET**, mediante un transporte inyectado:
1. `GET https://gate.whapi.cloud/health?wakeup=false` — no considerar un simple 200 como sesión conectada; exigir estado `AUTH` explícito.
2. `GET /users/profile` — comprobar que es consultable; **descartar** cuerpo (puede contener nombre/número).
3. `GET /settings` — validar que el canal tiene webhook HTTPS previsto en `/api/whapi/webhook`, modo **body**, evento `messages.post`, encabezado **`X-Cotironda-Webhook-Key`** con secreto compartido exacto y `callback_persist:true`. Nunca devolver settings crudos.
4. Estados sanitizados: `configuracion_incompleta`, `canal_sin_verificar`, `webhook_incorrecto` o `configuracion_whapi_verificada_sin_envio`; nada implica que Cotironda acepte ya webhooks reales ni haya enviado mensajes.

`scripts/ops/auditar-canal-whapi-mvp041.mjs --read-only`: comando LOCAL, requiere Node 22+ y las variables provistas de forma privada con `COTIRONDA_WHAPI_PREPARE_AUDIT=SI` y `COTIRONDA_WHAPI_RUNTIME=development`. Si está en CI/Vercel/producción o envío habilitado, no ejecuta llamadas. Imprime **solo estado**, no token/secret/perfil/URLs. No pasa credenciales como argumentos ni permite un proceso que envíe, cambie o restablezca un canal. Ejecutarlo **solo en un dispositivo privado**, sin compartir logs de entorno, historiales ni secretos. Aun si devuelve "verificada", solo demuestra configuración de Whapi, no la llegada auténtica al webhook de Cotironda.

**Importante:** la ruta `/api/whapi/webhook` todavía **NO EXISTE** como endpoint real activado, por lo que no es correcto usar un URL inventado de Preview. No configurar un webhook que acepte y descarte mensajes: un ACK 200 debe ir después de persistir el evento. El código propone el camino previsto para la futura ruta y el preflight quedará útil cuando se integre.

## Preparación manual del titular, cuando se habilite el entorno

1. Abrir [Whapi](https://panel.whapi.cloud/), crear una cuenta si no existe y vincular un **número dedicado de ensayo** por QR desde *Dispositivos vinculados*. No usar un número personal ni conectar comerciantes todavía.
2. Guardar el token Bearer del canal **solo en el gestor de secretos del worker privado** bajo `COTIRONDA_WHAPI_TOKEN`. No escribirlo en GitHub, chat ni variables `NEXT_PUBLIC_`.
3. Cuando el backend se haya desplegado con URL HTTPS auténtica `/api/whapi/webhook`, configurar el webhook en Whapi: **Body**, `messages.post`, `callback_persist:true`, header `X-Cotironda-Webhook-Key` con secreto aleatorio de 32 bytes hexadecimal (=64 caracteres) independiente de token, HMAC y AES. El mismo valor se guarda de forma privada como `COTIRONDA_WHAPI_WEBHOOK_SECRET_HEX`; nunca se publica en navegador. Configurar desde interfaz, **no ejecutar PATCH de /settings sobre otros ajustes por sorpresa**.
4. En el backend privado de desarrollo registrar `COTIRONDA_WHAPI_CHANNEL` y `COTIRONDA_WHAPI_WEBHOOK_URL` (origen HTTPS real, no dominio comprado sin publicar). Mantener `COTIRONDA_WHAPI_SEND_ENABLED=false` y `COTIRONDA_WHAPI_PILOT_SEND_AUTHORIZED=false`.
5. Verificar primero conexión y configuración mediante lectura. Después, **solo con infraestructura real segura**, probar un único webhook de cuenta autorizada y su persistencia cifrada, deduplicación y respuesta; luego permitidos de envío y presupuesto de mensajes.

**Nunca pegar el QR, token, clave AES, secreto webhook ni contraseña por el chat.**

## Radiografía de preparación verificada de Supabase DEV

Consulta **solo de lectura del 31/10/2026**: `cotironda-dev` (ref `qkercsoqhehbenbbncwk`, PostgreSQL 17) está `ACTIVE_HEALTHY`, **17 migraciones instaladas** base/Storage/laboratorio IA. Las migraciones comerciales privadas D024+ para rondas y WhatsApp **no están instaladas**. No existe un flujo en producción ni hay registros de compradores/proveedores reales para probar.

**Bloqueo de seguridad #175:** antes de aplicar las migraciones comerciales al DEV existente, cumplir backup cifrado auténtico y restauración aislada verificable. No alcanza el backup helper y su prueba sintética.

## Lo que falta después de vincular QR — NO confundir con listo comercial

- Webhook POST privado para mensajes entrantes de **ambos roles** (comprador y proveedor) con origen autenticado, roles verificados por chat y registros cifrados; D027 actual atiende proveedores solamente; D073 comprador solo tiene puertos no conectados.
- Almacenamiento comprador seguro, identidad y consentimiento de empresa, correlación con ronda, pregunta única por zona en outbox y creación/consulta D064→D071.
- Descarga verificada de PDF/Excel/Word/foto y extracción IA, con tamaño/antimalware y presupuestos de tokens. Hoy D073 permite solo texto previamente validado.
- Instalación real D024–D072, configuración de identidades/opt-in y prueba Whapi E2E de dos proveedores; D055/D070 ya preparan el envío pero **permanecen apagados**.
- Cierre real y ranking por rubro sobre las ofertas recibidas, con D022 + MVP-039, respetando cobertura, IVA/flete y equivalencia técnica. Contactos solo a finalistas consentidos al finalizar, sin adjudicación automática.

**No se publica main, ni se cambia el DNS, Vercel, Supabase DEV o Whapi ahora.** El beneficio de MVP-041 es preparar el canal y detectar una configuración incorrecta **antes** de exponer mensajes o gastar IA.

## Calidad

Pruebas unitarias sin red real sobre canal AUTH, sesión QR no conectada, webhook URL equivocado, modo Path, evento distinto, secreto omitido o distinto, persistencia OFF, HTTP 429/500, respuesta HTML/JSON inválida, respuesta grande, error neutro, desactivado, URL insegura y garantías de **cero POST/PATCH/WhatsApp**. Además ejecutar los cinco workflows habituales y no declarar aprobado hasta ver sus conclusiones.
