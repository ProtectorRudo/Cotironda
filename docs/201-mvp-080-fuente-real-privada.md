# MVP-080 — Conexión entre presupuesto real recibido y plantilla anónima

**Fecha:** 02/11/2026. **Issue:** #374. **Rama:** \`feat/mvp-080-fuente-real-privada\`, apilada sobre #373. **Alcance:** código de servidor sobre un puerto SQL privado, pruebas offline y verificación read-only en Supabase PILOTO. **Sin endpoint, despliegue ni ejecución del lector conectado a credenciales reales.**

## Evidencia real verificada sin exponer datos

En el Supabase PILOTO aislado \`ilggkalaafhtiysyzlmg\`, una consulta administrativa **solo de agregados** confirmó:
- 1 versión original de presupuesto recibida y almacenada (un único pedido).
- 1 / 1 coincidencias SHA-256 entre el texto UTF-8 inmutable \`offer_versions.original_quote\` y el campo **independiente** \`whapi_inbox.plaintext_sha256\`.
- No se copiaron presupuestos reales, teléfonos ni identificadores a la respuesta. No se alteró la base.

El vínculo técnico entre registros es \`o.source_message_hmac = w.message_hmac\`, \`request_id\` y \`supplier_key\`, con estado \`processing_state='quote_recorded'\`. Validar todo ese vínculo es importante: el HMAC del mensaje **no es** el SHA del contenido.

## Implementación

\`src/server/plantillas-piloto-mvp080.ts\`: adaptador para ser ejecutado **únicamente en un proceso backend autenticado** que suministre un puerto SQL autorizado. No tiene rutas web ni exporta el presupuesto original.

- Consulta fija y parametrizada por ID de solicitud y comprador verificado; no admite tablas, SQL o proveedores elegidos por la entrada. Selecciona la última revisión de cada proveedor, orden estable y hasta 10 resultados.
- Comprueba ID de pedido y comprador, estado \`prepared/closed\`, revisión 1..100, fuente original e SHA registrado independientemente por el inbox WhatsApp. Un hash diferente **rechaza todo el lote**.
- Una revisión de privacidad está ligada simultáneamente a \`proveedorRef\`, \`revision\` y \`sha256Original\`; sin revisión o con revisión obsoleta, oferta retenida y **ningún importe visible**. Una revisión para la versión 1 no autoriza la versión 2.
- Aplica \`crearPlantillasAnonimasMvp079\` al lote entero para preservar el orden anónimo \`Proveedor A/B\`; el resultado nunca incluye IDs internos, encabezado privado, nombre comercial o teléfonos. Si no puede garantizar cobertura de líneas o privacidad, el resultado está \`retenida_por_verificacion\`.
- El presupuesto recibido por el proveedor se preserva en \`offer_versions\`; este adaptador es **solo lectura** y no escribe fuentes ni envía mensajes.

## Límites críticos

1. **Todavía no está conectado a credenciales de la base desde el portal**: no hay ruta autenticada de arquitecto que llame al lector, no se publica la vista real, y el puerto SQL fue probado con casos sintéticos. La comprobación administrativa de hashes sobre la base PILOTO sí se ejecutó.
2. Las \`revisionesPrivacidad\` son insumos **exclusivos de un proceso privado autorizado**. El usuario o el proveedor no deben poder enviar \`privacidad='revisada_por_servidor'\` por API. La inspección de patrones MVP-079 es una defensa adicional, no prueba completa de que los textos carecen de nombres, logos o contactos.
3. La conexión PostgreSQL debe usar un **rol técnico de mínima lectura** en el esquema privado, separado del browser y del usuario final. No usar \`service_role\` expuesto a cliente ni una RPC \`security definer\` de acceso abierto. El parámetro \`compradorAutenticado\` **no autentica por sí mismo**; el llamador backend debe verificar identidad, consentimiento y pertenencia al pedido ANTES de invocar al lector.
4. La vista auténtica debe exigir autorización por pedido y empresa, no simplemente un UUID; el sistema actual todavía no tiene esa ruta lista. Sin autorización comprobada, la plantilla real permanece bloqueada.
5. Una cotización con \`$180.000\` sin aclaración de separadores permanece con el total **literal**, no se transforma silenciosamente en centavos ni se compara como si fuera confiable.
6. Presupuestos PDF, Excel, Word, imágenes o texto de más de los límites de MVP-063 todavía requieren una extracción íntegra, protección de PII y prueba adicional. No afirmar que la plantilla cubre esos archivos por esta etapa.
7. No se modifica el cron de 4 días, las notificaciones de finalistas, consentimiento ni el estado \`whatsapp_outbound_enabled=false\` del piloto.

## Pruebas y aceptación

\`tests/unit/mvp080-piloto-fuente-a-plantilla.test.mjs\`: falla cerrada para hashes alterados, versión obsoleta, otro pedido, otro comprador, estado cancelado, proveedor malformado, revisión de privacidad cruzada, extras ocultos, duplicados y más de 10 propuestas. Casos válidos de dos proveedores preservan etiquetas A/B y mantienen el TOTAL ambiguo literal.

**Siguiente etapa:** definir y probar en el backend un rol mínimo, autenticación/consentimiento de arquitecto, aprobación de privacidad independiente, un pipeline privado de lectura real y E2E de archivos antes de desplegar una vista activa. Hasta entonces, el avance es el **código de conexión y la evidencia de datos en Supabase**, no un piloto operativo de plantillas reales.
