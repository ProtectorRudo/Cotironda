# 109 — D046: confirmar cotizaciones desde la conversación, sin portal obligatorio

**31/10/2026 · Issue #195 · PR de desarrollo apilado sobre D045/#194.**

## Objetivo de negocio

El corralón puede responder por WhatsApp. Cotironda debe guardar esa respuesta, interpretarla y devolver un resumen de precios, cantidades, IVA, flete y condiciones para que el proveedor confirme sin abrir otra aplicación. Un «Confirmo» **no debe validar cualquier presupuesto** ni permitir que un mensaje antiguo apruebe una corrección nueva.

D046 implementa **el protocolo de dominio offline**, no su envío o integración real. Se reutiliza `src/server/whapi-inbound-offline.ts` (D027/D028), que únicamente autentica/verifica un evento y lo deja pendiente de interpretación, y `src/domain/comparacion-ofertas.ts` (Etapa 03), que rechaza precios no comparables.

## Componentes entregados

`src/domain/confirmacion-cotizacion-offline.mjs` contiene funciones puras:

1. `iniciarCotizacionChatD046` crea una sesión limitada a proveedor, ronda, canal, huella HMAC de chat y alias anónimo. No guarda teléfonos ni secretos. El pedido lleva artículos, unidades y cantidades confirmadas desde backend.
2. `prepararBorradorCotizacionD046` recibe **solamente una propuesta estructurada ya interpretada por un servicio futuro** (no texto libre) y un evento persistido/vinculado previamente por el broker confiable. Filtra atributos no permitidos, valida precios decimales con el comparador existente, no admite productos extra ni unidades distintas del pedido, mantiene precio sin confirmar y arma un resumen conversacional. Los nombres amigables de cada material provienen exclusivamente de etiquetas curadas que entrega el backend al iniciar la sesión (o «Artículo N» en el ensayo), nunca de comandos del proveedor: no muestra identificadores internos en el mensaje.
3. `confirmarBorradorCotizacionD046` acepta «Confirmo» exclusivamente cuando el broker comprobó que el proveedor **respondió al mensaje de confirmación correcto** y lo mapeó a `replyToDraftId`. Alternativamente acepta «Confirmo ABC123» con código del borrador vigente. Ningún mensaje aislado o de otra ronda/empresa/chat puede confirmarlo. Si faltan IVA, precio, flete, monto mínimo, forma de pago o plazo, la confirmación falla sin inventar el dato.
4. `ultimaOfertaConfirmadaD046` devuelve la última versión confirmada. Nuevos precios generan otro borrador; mientras esperan confirmación, la versión anterior permanece intacta y es la única confirmada.

Cada evento posee clave idempotente y huella para rechazar el mismo ID con contenido cambiado. Los duplicados idénticos no crean versiones nuevas. El estado de esta demo se guarda **solo en memoria**. Su límite de 128 eventos no reemplaza persistencia, transacción ni deduplicación durable del SQL D028: antes de desplegar será obligatorio guardar el historial y serializar las transiciones con locks/optimistic concurrency dentro de PostgreSQL.

## Regla de homologación crucial

**Confirmar el precio NO significa que un material ofertado sea técnicamente equivalente al solicitado.** El módulo obliga a que todas las líneas de una propuesta se etiqueten inicialmente `equivalencia:'sin_verificar'`, independientemente de cualquier afirmación de la IA. Por eso, incluso la oferta ya confirmada **no aparece en una compra comparable** hasta una validación técnica independiente y trazable. La demostración no habilita adjudicación ni revelación de proveedores.

También admite ofertas parciales confirmadas; estas nunca se confunden con una canasta completa. La marca y la presentación se evalúan por el motor de producto canónico D015/D045, no por el precio de la respuesta.

## Pruebas

- `tests/unit/confirmacion-cotizacion-d046.test.mjs`: confirmación con respuesta/código correcto, sin contexto, antirreplay, cambios de precio versionados e inmutables, otra ronda/proveedor/chat, falta de consentimiento o invitación, ronda cerrada, IVA/flete/plazo/cantidad, alternativa no homologada y ofertas parciales.
- `tests/unit/whapi-confirmacion-integrada-d046.test.mjs`: recibe dos mensajes sintéticos en el receptor D027; demuestra que ACK del webhook **no** es presupuesto confirmado; el primer mensaje alimenta un borrador mediante una **propuesta ficticia explícita**; el segundo confirma solo tras correlación confiable; una retransmisión es idempotente; ID reciclado con texto adulterado se rechaza.

**No se envían mensajes.** La prueba no demuestra que Whapi devuelva un `reply_to` confiable: el futuro broker deberá comprobar el contexto y asociar el ID de mensaje de salida con el `draftId`. Tampoco demuestra extracción IA de precios. La alternativa «Confirmo CÓDIGO» facilita celulares donde el reply-to no sea verificable, pero no es una autenticación por sí misma: se exigen igualmente el chat/canal/ronda/identidad validados por backend.

## Qué falta para operar con proveedores reales

Broker con vínculo HMAC de chat a empresa, entrada cifrada/persistida, antivirus y archivos, interpretación de WhatsApp de texto/foto/audio/PDF dentro de cuotas y auditoría, fila transaccional de ofertas, control de costos y consentimiento, outbox con recibo de entrega y correlación `reply_to`, tratamiento de BAJA independiente, conciliación ante concurrencia y expiración, versión validada por comprador cuando corresponda, homologación técnica y comparación exacta. Prueba real con proveedores voluntarios, sin exigir el portal, y alternativas ante desconexión de Whapi.

**D046 no modifica Supabase DEV ni producción, ni conecta Whapi/OpenAI, ni destraba migraciones D024–D035.** El respaldo/restauración real de DEV sigue bloqueado por #175. No fusionar ni desplegar sin revisión y autorización.
