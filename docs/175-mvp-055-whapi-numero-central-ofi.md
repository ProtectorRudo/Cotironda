# 175 — MVP-055: un WhatsApp central para todos los arquitectos y comercios

**01/11/2026 · Issue #323 · desarrollo y pruebas locales GitHub Actions. NO conectamos Whapi, ni reutilizamos credenciales OFI.**

## Decisión operativa
Una sola cuenta y un único **número central de Cotironda** conectado como un único canal Whapi. Cada arquitecto o proveedor usa **SU propio WhatsApp habitual** para conversar con Cotironda. No se crean canales ni números adicionales por comercio; la base de Cotironda asigna cada remitente registrado a su empresa/rol y usa sus catálogos/zonas para determinar destinatarios. El frontend no pide `companyId` ni `buyerOrgId` en cada mensaje.

Esta conclusión surge de revisar nuestro repositorio privado **ProtectorRudo/ofi**, rama `ofi-v2`:
- `app/v2_whapi_http_composition.py`: múltiples profesionales pueden compartir el mismo `whapi_channel_id`.
- `app/v2_whapi_http.py`: cuando comparte canal, el servicio resuelve la identidad del profesional por su número verificado, nunca por un cuerpo JSON del remitente no autenticado.
- `app/v2_operational_roster.py`: mapea credenciales por canal y profesional con aislamiento.

**Reutilizamos el patrón, no importamos código Python, identificadores de OFI, contactos, números, credenciales, webhooks ni su infraestructura.** Cotironda conserva su propio registro SQL de comprador/proveedor con HMAC de chat, cifrado de texto y baja voluntaria. OFI no se edita ni desconecta.

## Plan Whapi comprobado el 01/11/2026
Fuente oficial: https://whapi.cloud/es/price ; documentación https://support.whapi.cloud/help-desk/getting-started/pricing

| Modalidad | Canales/números | Conversaciones | Mensajes y API |
|---|---|---|---|
| Developer Sandbox (gratis) | 1 número/canal por sandbox | **5 conversaciones activas al mes** | 150 mensajes/día, 1.000 llamadas API/mes, 30 verificaciones números/día |
| Developer Premium (de pago) | **1 canal para el número central** | Whapi no anuncia límite estricto en el plan comercial | Mensajes/medios y API sin cargo por unidad, sujetos a uso razonable y controles antispam WhatsApp |

El sitio publicita precio desde **USD 29/mes** según modalidad de facturación y promoción. **No son USD 29 por proveedor**; se paga por el canal central. La posible limitación de contactos/canales del Sandbox depende de Whapi; **no se añade límite 5 a nuestra base de datos ni al enrutamiento de Cotironda**. Un número puede comunicarse con múltiples compradores y vendedores sin crear nuevos canales.

Los canales basados en dispositivo vinculado no eliminan riesgos de bloqueo por automatizaciones masivas. Exigir consentimiento previo, verificación de empresa, `BAJA`, cuotas de mensajes y envío espaciado. Si se necesita soporte oficial o garantías mayores a escala, auditar vías Meta oficiales en fase comercial, sin obstaculizar el piloto.

## Plan exacto para el Sandbox (5 conversaciones)
Un ensayo controlado con **2 arquitectos y 3 comercios** voluntarios. Ellos envían/reciben desde sus números individuales; solo Cotironda consume 1 canal Whapi. *Si la política de Whapi cuenta su propia línea, bots o chats de prueba, confirmar el cupo desde el dashboard antes de registrar participantes.* No usar el Sandbox para una base de contactos mayor.

En GitHub la prueba `tests/unit/mvp055-whapi-canal-central.test.mjs` simula D083 + D027 + D029 + D030/D074 con ese lote de 5 remitentes ficticios y un 6º registrado separado para demostrar que **Cotironda no limita su aplicación a cinco**. Valida persistencia separada por empresa/rol, IDs HMAC, texto cifrado, webhook repetido idempotente, bloqueo de otro canal/remitente desconocido/identidad doble, mensajes propios ignorados y secreto correcto antes de SQL. **No reemplaza una prueba con Whapi real** ni prueba que el Sandbox autorice 6º chat.

## Cuando el propietario abra la cuenta de Whapi
1. Crear cuenta propia de Cotironda con correo controlado por el negocio; **no necesita coincidir con ChatGPT**. Enlazar un número **exclusivo** mediante WhatsApp > Dispositivos vinculados > QR de Whapi. https://whapi.cloud/es/docs
2. Conservar en el panel Whapi la ID del canal, el estado conectado y el token API. **No pegar token, código QR ni contraseñas en GitHub, issues, capturas públicas o mensajes de ChatGPT**. Configurar secretos en variables privadas de la plataforma cuando la conexión real esté lista; no copiar el de OFI.
3. La ruta real del endpoint Next.js de Cotironda es `/api/integraciones/whapi`, en un dominio HTTPS de **Preview privada verificada**, no `cotironda.com` comercial todavía. El código actual de Next (`route.ts`) **responde 503 porque NO tiene inyección del gateway PostgreSQL**. No configurar aún el webhook para entregas reales: reintentaría y provocaría ruido. Cuando se habilite, configurar `messages.post` en modo Body y header personalizado `X-Cotironda-Webhook-Key` en Settings del canal. Docs oficiales: https://support.whapi.cloud/help-desk/receiving/webhooks/set-the-webhook-link-to-the-channel y https://support.whapi.cloud/help-desk/receiving/webhooks/detailed-webhook-settings
4. Preparación privada pendiente: SQL comercial en DEV aislada recuperable, LOGIN mínimo y driver de DB, activación por banderas Preview, registro autorizado de 2 compradores/3 proveedores, enrutamiento de materiales, worker de presupuestos y contactos de finalistas después de cierre.
5. Primer E2E real limitado: uno de esos arquitectos envía una lista textual con zona; Cotironda debe resolver la identidad, crear la ronda de 5 días y poner invitaciones en cola. Antes de habilitar `send`, comprobar contactos voluntarios, cuota diaria, reintentos/antiduplicados y no revelación de datos.

## Qué falta para el primer piloto integral
El objetivo es recibir texto/PDF/imagen/Excel, extraer y separar rubros, distribuir por catálogo y zona, recibir los archivos/respuestas de proveedores, calcular el ranking, vencer ronda y revelar **hasta dos finalistas por rubro** con consentimiento mutuo. Hoy hay piezas simuladas y SQL CI pero ninguna ronda integral live. El gate #175 de recuperación DEV sigue abierto; la alternativa de una DEV aislada limpia debe probarse/documentarse sin tocar la instancia histórica hasta que el usuario autorice el ambiente y costos correspondientes.

No se instaló nada, no se envió un WhatsApp, no se consumió API ni se afectó el número OFI.
