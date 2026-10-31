# 112 — D049: confirmación conversacional transaccional (solo PostgreSQL 17 CI)

**31/10/2026 · Issue #201 · PR en borrador, apilado sobre D048/#200.**

## Resultado comercial que buscamos

Un proveedor responde a una cotización por WhatsApp y recibe un borrador legible. Cuando responde **«Confirmo» al mensaje correcto**, su oferta pasa a confirmada, preservando un historial de versiones. Si envía el mismo mensaje de nuevo, no se crea otra versión. Si hubo una corrección posterior, no se confirma una revisión vieja.

D046 define esta interacción en memoria y D049 agrega una parte de la persistencia SQL, **sin conectar WhatsApp real**.

## Implementación

La migración de ensayo `supabase/sql/whapi_confirm_atomic_d049.sql` depende de D024, D026, D028, D047 y D048. Se aplica únicamente al contenedor PostgreSQL descartable de GitHub CI.

La función privada `whapi_confirm_from_inbox_d049` recibe una **referencia interna a un mensaje previamente persistido**, un trabajo de respuesta del outbox, ID de evento, hash HMAC del acuse de salida y hash HMAC de la intención interpretada por el futuro broker:

1. Deriva empresa, ronda y chat desde la fila del inbox (jamás desde el texto WhatsApp).
2. Reconoce el replay exacto de una confirmación ya guardada, aun cuando la ronda haya terminado o exista una baja posterior. No vuelve a editar ofertas.
3. Bloquea nuevas confirmaciones si falta consentimiento, si el contacto está de baja, o si el mensaje es de otra empresa, chat o ronda.
4. Exige que el trabajo D047 sea del mismo contacto y borrador, que haya sido **aceptado por el transporte** y que coincida la huella del mensaje saliente cuya respuesta verificó el broker. El mensaje de origen del borrador no puede reutilizarse como mensaje de confirmación.
5. Exige origen D048 y revisión vigente, datos económicos completos (precio neto e IVA explícitos por línea, flete, mínimo, plazo, pago) sin inventar valores.
6. Llama a `confirm_offer_atomic_v1` D026, que valida ronda abierta y crea una **versión económica inmutable**, e inserta en la misma transacción un comprobante ligado al mensaje entrante. Si falla cualquiera de los pasos, ambos registros se revierten.

La tabla `whapi_confirm_sources_d049` vincula mensaje entrante, ronda/proveedor, trabajo de salida, revisión, evento y versión confirmada. Tiene FKs, claves únicas, RLS y no almacena teléfono, texto, contacto ni token. Roles internos `cotironda_confirm_writer` y `cotironda_confirm_gateway` son NOLOGIN/NOINHERIT/NOBYPASSRLS; las funciones no se exponen al frontend, `anon`, `authenticated` ni `service_role`.

## Límite de seguridad importantísimo

**La base de datos no puede leer ni autenticar el texto descifrado «Confirmo» ni los metadatos reply-to de Whapi.** Recibe una afirmación del broker confiable sobre una intención ya verificada y el HMAC del mensaje saliente. Por lo tanto, un PASS de PostgreSQL prueba la integridad transaccional de esa afirmación, **no demuestra autenticidad real de la respuesta de WhatsApp**. Antes de producción, el broker deberá verificar el webhook, preservar el texto cifrado, validar intención exacta, correlacionar reply-to con mensaje saliente y asociar HMAC mediante claves secretas bajo custodia. No utilizar una confirmación aislada sin reply-to; el modo alternativo «Confirmo CÓDIGO» de D046 queda expresamente **pendiente** hasta contar con una referencia/código durable de backend.

«Confirmado por el proveedor» significa que aceptó precios y condiciones; **no homologa equivalencia técnica** entre materiales ni autoriza adjudicación. La homologación independiente D045 sigue obligatoria antes de la comparación.

## Pruebas

`supabase/tests/ci/109_whapi_confirm_atomic_d049.sql` usa BEGIN/ROLLBACK y empresas/mensajes totalmente ficticios en PostgreSQL 17 real: roles y permisos, falta de acuse, hash equivocado, otra conversación, mensaje fuente reusado, precio/IVA incompletos, réplica idempotente, colisión de mensaje, doble confirmación, revisión obsoleta, nueva versión después de corrección, baja y replay seguro después de baja.

La CI de PostgreSQL carga D049 **después** de D024–D048. No se guarda ninguna fila en Supabase DEV, no se activa Whapi, no se llama OpenAI, no hay envío de mensajes. Backup/restauración real DEV (#175) continúa bloqueando instalación, y los PRs apilados siguen sin fusionarse.

## Pendiente para piloto

Broker seguro y probado con Whapi (incluidos reintentos/estado incierto), recibos de salida y reply-to reales, descifrado/correlación e interpretación IA bajo controles, validación humana de caso ambiguo, persistencia del resumen legible y del código de confirmación, transacciones E2E con el receptor D028 y permisos alojados, cuota/costos, y prueba de usabilidad móvil sin capacitación para proveedores voluntarios.
