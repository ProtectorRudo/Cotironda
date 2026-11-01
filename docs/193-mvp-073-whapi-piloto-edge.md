# MVP-073 — Whapi nativo sobre Supabase PILOTO (01/11/2026)

## Implementación realmente aplicada

Proyecto único: `ilggkalaafhtiysyzlmg` (`cotironda-piloto`, región São Paulo). No se tocó `cotironda-dev` pausado, producción, Te Hice Esto ni el dominio. Las migraciones **aplicadas** son:
- `mvp073_whapi_private_inbox_and_optin` (esquema privado, enrolamiento de un solo uso, inbox cifrado y append-only de ofertas).
- `mvp073b_fix_item_ordinality` (corrección descubierta en SQL smoke).
- `mvp073c_fix_uuid_aggregate` (corrección UUID en PostgreSQL 17).
- `mvp073d_whapi_durable_outbox` (invitaciones en cola, claims at-most-once, estado incierto sin reintento ciego).
- `mvp073e_quote_detection_guard` (un saludo no cuenta como presupuesto; el texto original se conserva a revisión).

Edge Function `cotironda-piloto-whapi`, despliegue **v3 / ACTIVE** en Supabase PILOTO. `verify_jwt=false` exclusivamente porque Whapi no envía un JWT de Supabase; la función exige **su propio secreto** en `x-cotironda-webhook-key`, valida canal e identidad, límites de tamaño, chat individual y tiempos, más HMAC y AES-GCM. Sin configuración de secreto/flag, contesta 503 y no abre la base. Proyecto usa únicamente las variables privadas inyectadas por Supabase, jamás claves en repositorio.

## Funcionalidad comprobada y límites

- `COTI ALTA <código de 32 caracteres hex>`: cada persona envía el código único, emitido por la base, desde su propio WhatsApp. El sistema vincula el HMAC del chat a su rol y registra consentimiento; no guarda el teléfono en texto abierto. Código de un solo uso, caduca en 48 horas como máximo. Nadie debe divulgar estos códigos públicamente.
- `BAJA`: desactiva consentimiento e impide nuevos mensajes/consultas. Un mensaje de un chat no enrolado no habilita acceso.
- Mensaje texto del comprador: extractor local y **conservador** identifica familias seguras (cemento, hidrófugo y algunas otras) y zona `Entrega: La Plata`. La fuente original se mantiene; dudas o zona faltante se retienen. No usa IA remota; **PDF, Word, Excel, fotos y audios aún no se interpretan**. Los mensajes de media pueden quedar marcados a revisión pero no se descargan ni extraen.
- Solo se preparan consultas para los dos negocios con familia declarada y zona que coincide; el listado de 51 renglones por comercio incluye 10 pendientes de curación por comercio (NO representan stock comprobado).
- Respuesta de proveedor vinculado: el texto original se inserta íntegro en `offer_versions`, sin alterar totales, pallets, embalajes, descuentos, aclaraciones o flete; correcciones suman versiones. Un proveedor ambiguo (más de una invitación activa) queda sin asociar a oferta para evitar un precio de ronda equivocada.
- Outbox: arma invitaciones con zona y renglones, requiere opt-in vigente, HMAC de destino recalculado de número protegido en secretos, y un lease único por envío. Se registra `api_accepted` solo si Whapi acepta HTTP; una respuesta no comprobable queda `uncertain` sin reintento automático, para no duplicar. **API aceptada no equivale a entrega ni lectura**.
- Sin extracción económica verificable, jamás anunciar ranking de ganador. Sin apertura de contacto hasta reglas aprobadas.

## Pruebas realmente ejecutadas

- SQL transaccional (rollback) sobre Supabase PILOTO: 3 enrolamientos sintéticos, comprador crea pedido, dos invitaciones, texto original con pallets y total preservado, replay rechazado, BAJA desactiva, otro mensaje ya no se acepta. Primeros dos intentos encontraron errores SQL y se corrigieron en migraciones independientes; última ejecución PASS.
- SQL transaccional de saludo/budget: «Hola» se conserva como pendiente y NO se cuenta como oferta; una cotización con importe explícito sí se versiona. PASS, rollback.
- SQL transaccional de outbox sobre Supabase PILOTO: dos pendientes, lease del destinatario consentido, autorización antes de envío, finalización 1 vez, segundo destinatario en estado incierto, no se genera tercer envío ni reenvío. PASS.
- Persistencia final: verificar vía queries que **no quedaron** enrolamientos, mensajes, pedidos, ofertas ni envíos sintéticos (ROLLBACK).
- Función desplegada y listada `ACTIVE`, versión 3. **No hay HTTP POST extremo-a-extremo autenticado con Whapi real** ni envío a teléfono real; no afirmar lo contrario.

## Únicas configuraciones externas que faltan (en Supabase, NO en chat ni GitHub)

Abrir Supabase `cotironda-piloto` → **Edge Function Secrets** y guardar:

| Variable | Valor que coloca el propietario directamente en Supabase |
| --- | --- |
| `COTIRONDA_PILOT_WHAPI_CHANNEL` | ID del canal Whapi exacto (no es el token) |
| `COTIRONDA_PILOT_WEBHOOK_SECRET` | Secreto aleatorio de 32+ caracteres. El mismo en header Whapi `x-cotironda-webhook-key` |
| `COTIRONDA_PILOT_ID_HMAC_HEX` | 32 bytes aleatorios expresados como 64 dígitos hex |
| `COTIRONDA_PILOT_AES_HEX` | Otros 32 bytes aleatorios independientes en hex |
| `COTIRONDA_PILOT_WHAPI_INBOUND_ENABLED` | `true` **solo cuando se active recepción para prueba real** |
| `COTIRONDA_PILOT_WHAPI_TOKEN` | Token del canal Whapi, secreto, no compartir |
| `COTIRONDA_PILOT_RECIPIENTS_JSON` | Objeto privado con `corralon_ailin` y `corralon_nahuel` mapeados a los teléfonos internacionales de WhatsApp SIN prefijo + ni espacios; comprobar titularidad |
| `COTIRONDA_PILOT_WHAPI_OUTBOUND_ENABLED` | `true` **solo tras alta/consentimiento y comprobaciones E2E de recepción** |

La configuración en la BD sigue `integration_flags.whatsapp_inbound_enabled=false` y `whatsapp_outbound_enabled=false`. Para iniciar pruebas con teléfonos de personas consentidas, un operador autorizado debe abrir primero SOLO recepción, configurar el webhook en Whapi Cloud en **body mode**, evento `messages.post` y encabezado personalizado; después emitir tres códigos de alta de un solo uso con caducidad y enviarlos por canal privado. No activar salida hasta comprobar alta y recepción; no cambiarlo en producción.

URL de webhook configurada por implementación:
`https://ilggkalaafhtiysyzlmg.supabase.co/functions/v1/cotironda-piloto-whapi`

Whapi documenta configuración de headers de webhook y método `POST https://gate.whapi.cloud/messages/text` con `Authorization: Bearer`, `to` y `body`:
- https://whapi.cloud/features
- https://support.whapi.cloud/help-desk/sending/send-text-message
- https://supabase.com/docs/guides/functions/secrets
- https://supabase.com/docs/guides/functions/auth

**No pegar claves/contraseñas/token en ChatGPT.** No elegir una región/proyecto de la organización anterior. No activar mensajes hasta que tres personas reales demuestren titularidad y consentimiento. El plan Free no incluye backup diario automático; mantener control de exportación y límite de costos.

## Queda pendiente para piloto al 100%

1. Configuración privada en Supabase y Whapi por titular autorizado, incluyendo prueba de webhook y código de enrolamiento.
2. Prueba con **tres celulares** y 2 proveedores: autenticación, pedido con/sin zona, retransmisión, presupuesto íntegro, corrección y opt-out, estados Whapi (aceptación/entrega).
3. Extracción documental PDF/Excel/imagen, IA de familias con validación, fletes/IVA deterministas y ranking económico verificable; hoy solo texto conservador y original íntegro, sin ranking falso.
4. Seguridad revisada, copias/restore de piloto, límites de gasto y plan de migración reversible a `cotironda-dev` pausado, antes del plazo de recuperación (90 días desde 01/11/2026).

Se documenta expresamente que **Edge ACTIVE no es Whapi E2E PASS**.

## Auditoría posterior MVP-073f — 01/11/2026

Se detectaron y corrigieron dos riesgos reales antes de activar Whapi:

- **No despachar una lista incompleta**: `canPrepareBuyerPilot` obliga localidad, 1–8 renglones reconocidos y **cero** segmentos pendientes. Si aparece algún desconocido o el texto es ambiguo, el webhook pasa `p_items=null`, y el SQL marca `needs_review` sin generar invitaciones. Se añadió test de la mezcla «cemento + material desconocido». Esta funcionalidad de retención se encuentra en Edge **v3**, pero no hay una prueba real por HTTP del canal.
- **Consentimiento dinámico del comprador**: migración aplicada `mvp073f_outbox_buyer_consent_guard`. La RPC de selección y la comprobación inmediatamente anterior al envío exigen comprador con consentimiento vigente, ronda preparada y creada en los últimos 7 días. Una `BAJA` cancela autorización para el lease previamente adquirido y bloquea el resto de la cola. Reprobado con SQL transaccional y ROLLBACK, ejecutado con éxito desde `supabase/piloto/mvp073f_buyer_baja_smoke_rollback.sql`.

El endpoint sigue **apagado por falta de secretos privados y activación deliberada**. La Edge Function es pública a nivel HTTPS (`verify_jwt=false` por ser webhook) pero requiere el secreto personalizado para cualquier evento, y con configuración incompleta falla cerrada; no afirmamos que pueda recibir ni enviar mensajes reales todavía.

Fuente técnica de Whapi Cloud: https://support.whapi.cloud/help-desk/receiving/webhooks/detailed-webhook-settings y https://support.whapi.cloud/help-desk/sending/send-text-message .

## Alta operativa de los tres participantes (sin pasar teléfonos ni secretos por ChatGPT)

1. En el [SQL Editor del proyecto piloto](https://supabase.com/dashboard/project/ilggkalaafhtiysyzlmg/sql), pegar y ejecutar **solo dentro del proyecto PILOTO** el contenido de `supabase/piloto/mvp073_onboarding_codes_operator.sql`. La consulta devuelve **tres** mensajes `COTI ALTA <código>` con validez 60 minutos; la sintaxis se probó con un rollback que generó exactamente 3 registros sin persistirlos.
2. Cada persona envía exclusivamente su código desde su propio WhatsApp a la **línea central Whapi**. Esto vincula el chat a su rol y constituye el opt-in; un mensaje enviado por otro número vincularía ese otro número y se debe corregir antes de habilitar salida. **El dueño no debe reenviar códigos en nombre de terceros**.
3. Antes de generar los códigos, configurar en `Project Settings → Edge Function Secrets` las variables del apartado anterior. La instalación de secretos en Dashboard los hace disponibles sin redesplegar la función. El webhook de Whapi Cloud debe apuntar a la URL documentada, estar en **Body mode** y evento **POST messages**, con encabezado personalizado coincidente. Verificar primero recepción sin salida.
4. Activar conscientemente **recepción** en Edge Secrets (`COTIRONDA_PILOT_WHAPI_INBOUND_ENABLED=true`) y en la fila privada de la tabla `integration_flags` por SQL administrativo. Sin ambas condiciones no se procesa ningún mensaje. Mantener la **salida** falsa hasta comprobar los tres opt-ins, identidad y la allowlist de destinatarios de secretos. No poner un token Whapi en público.
5. Después de enviar códigos y un mensaje de prueba sin datos comerciales, comprobar en SQL el número de vínculos y el inbox sin copiar/mostrar el cifrado ni los códigos. Recién entonces activar la salida de forma limitada, con autorización expresa y verificación de cada destinatario. **Nunca habilitar producción o reintentos automáticos para mensajes de resultado incierto.**

El piloto no confirma que una consulta esté entregada a una persona solo por obtener HTTP 200 de Whapi; distinguir `api_accepted`, entrega y lectura. Los identificadores reales, tokens y códigos no deben aparecer en comentarios, screenshots compartidos ni commits.

## Configuración simplificada — verificada 01/11/2026

El conector de Supabase utilizado por ChatGPT **no ofrece acción para gestionar Edge Function Secrets**. Esa configuración requiere intervención administrativa en el Dashboard de Supabase y Whapi (sin introducir secretos en GitHub ni en ChatGPT).

1. Abrir [SQL Editor PILOTO](https://supabase.com/dashboard/project/ilggkalaafhtiysyzlmg/sql) y ejecutar **una única vez** `supabase/piloto/mvp073_setup_secrets_operator.sql`. Genera tres valores aleatorios e independientes de 64 caracteres hexadecimales para `COTIRONDA_PILOT_WEBHOOK_SECRET`, `COTIRONDA_PILOT_ID_HMAC_HEX` y `COTIRONDA_PILOT_AES_HEX`. Se comprobó disponibilidad de `extensions.gen_random_bytes` en PostgreSQL del proyecto y se ensayó **3/3 distintos, largo 64** sin divulgar los resultados ni persistir las claves. No volver a generar después de tener chats inscritos o perderían el vínculo HMAC.
2. En [Edge Function Secrets PILOTO](https://supabase.com/dashboard/project/ilggkalaafhtiysyzlmg/settings/functions) cargar los tres pares **clave/valor exactos** anteriores; también `COTIRONDA_PILOT_WHAPI_CHANNEL` (ID exacto del canal en Whapi) y `COTIRONDA_PILOT_WHAPI_INBOUND_ENABLED=true`. Dejar salida apagada. **No usar aquí el token de Whapi aún**: solo se necesita al habilitar mensajes salientes.
3. En [Whapi Cloud](https://panel.whapi.cloud/) abrir canal → Settings → Webhooks. URL `https://ilggkalaafhtiysyzlmg.supabase.co/functions/v1/cotironda-piloto-whapi`, modo `Body`, evento `POST messages`, añadir encabezado `x-cotironda-webhook-key` cuyo valor sea exactamente el mismo secreto `COTIRONDA_PILOT_WEBHOOK_SECRET`. Whapi documenta hasta 5 encabezados adicionales; confirmar en la UI que se puede personalizar el header.
4. Avisar al desarrollador una vez guardada la configuración, **sin copiar valores ni capturas que muestren secretos**. El desarrollador verificará estado y habilitará por SQL únicamente `whatsapp_inbound_enabled=true` en la base PILOTO. Luego usar `mvp073_onboarding_codes_operator.sql` desde el SQL Editor para los tres códigos únicos de alta que las tres personas envían al WhatsApp del canal central. Después de confirmar vínculo, configurar outbound limitadamente, con token y dos destinatarios en secrets privados.

Comprobación previa a cualquier envío: `cotironda_piloto_privado.integration_flags` (ambas banderas en `false`), cero códigos reales almacenados, cero chats vinculados y cero mensajes registrados. Ni el SQL de generación ni la función automática deben enviar datos al usuario por chat.

Fuente oficial Supabase sobre secrets: https://supabase.com/docs/guides/functions/secrets ; documentación oficial Whapi del webhook: https://support.whapi.cloud/help-desk/receiving/webhooks/set-the-webhook-link-to-the-channel ; evento/headers: https://whapi.readme.io/reference/webhooktest .
