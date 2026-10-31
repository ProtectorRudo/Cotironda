# 131 — MVP-011: broker privado, inbox cifrado → oferta recibida (sin «Confirmo»)

31/10/2026 · [Issue #235](https://github.com/ProtectorRudo/Cotironda/issues/235) · **laboratorio y servidor inyectado; NO conectado a Whapi real ni Supabase DEV**.

## Objetivo

No basta con guardar un WhatsApp en el inbox y tener una rutina que guarda ofertas: faltaba la **conexión autenticada**. Enviar un presupuesto por el proveedor **ya es suficiente** para registrar la oferta recibida. Una corrección posterior crea otra versión; se preserva el precio original aunque no se haya aclarado IVA y flete. Nunca generar un mensaje adicional «Confirmo».

## Implementación

- `supabase/sql/whapi_quote_inbox_read_d061.sql`: única función privada de lectura `whapi_quote_read_d061(channel,messageKey)` en PostgreSQL 17 efímero. Devuelve exclusivamente contenido **cifrado**, metadatos HMAC, fuente/clave AES, revisión esperada y mapeo de artículos `itemId/line_no/unit` sacados de la ronda persistida. Antes de responder exige contacto confirmado sin BAJA, invitación y ventana de ronda abierta. Si falta autorización devuelve `null` y no filtra identidad. Un recibo previo conserva revisión original para replays, aunque haya versiones posteriores. Su rol lector NOLOGIN/NOBYPASSRLS no permite escrituras ni acceso a textos en claro; la función es privada y no se concede a Data API, `anon`, `authenticated` ni `service_role`.
- `src/server/whapi-quote-inbox-processor-d061.ts`: un coordinador **server-only** sin HTTP ni cron. Recibe una conexión PostgreSQL inyectada, el **verificador AES-GCM del broker D029** y una función interpretadora inyectada. Lee inbox cifrado D061, autentica y descifra, rechaza «Confirmo»/«BAJA» como ofertas, entrega texto y artículos del ledger a la interpretación, verifica que los precios/citas existen literalmente, que los ítems/unidades corresponden al snapshot del pedido y que nadie introduce otra empresa, moneda falsa o condición del comprador no registrada. Si hay precio cotejado, invoca el puerto D060 **una sola vez**, guardando versión y precio literal en transacción SQL; si la lectura es ambigua, no inventa una oferta. No envía mensajes.
- `tests/unit/whapi-quote-inbox-processor-d061.test.mjs`: ensaya cifrado **AES-GCM real en Node** con SQL simulado, además de respuestas duplicadas, texto falsificado, llave incorrecta, «Confirmo»/«BAJA» y falla de lectura. `supabase/tests/ci/116_whapi_quote_read_d061.sql`: prueba aislada PostgreSQL17 de identidad, revisión, correcciones, replay, BAJA, permisos/RLS y ausencia de campos de contacto.

## Límites operativos

**No está activada la API de OpenAI ni el procesamiento de PDFs/Excel/imágenes ni Whapi real.** El interpretador es una **dependencia inyectada**; aún falta implementar su ejecutor real, con límites de costo, evidencia y control contra prompt injection. Tampoco existe el worker que busque mensajes pendientes y ejecute este coordinador, ni una identidad DB con credenciales reales; hay que conectarlos con mecanismo de colas y reintentos seguros. SQL D061 **no** es una migración instalada.

La interpretación no puede certificar semánticamente que una cita de precio pertenece al artículo; para el piloto, antes de habilitar cotizaciones de múltiples materiales hay que añadir anclajes semánticos o retener los casos ambiguos. Los campos `condicionIvaComprador` se restringen a `no_especificado` en este camino hasta disponer de condiciones de comprador persistidas con fuente confiable. Un comprador que pidió IVA incluido debe tener ese dato conectado desde su ronda real, nunca deducido por la IA. No permitir que cualquier proveedor cambie IDs de otro.

Un ingreso parcial sin precio cotejable debe permanecer como **mensaje recibido pendiente de interpretación**, no inventar monto cero ni presionar al comercio. La demanda de un solo dato vital (zona de entrega) y consulta única al proveedor se mantiene. Antes de aplicar migraciones comerciales en Supabase DEV, completar **backup/restauración auténticos #175**. No merge ni deployment sin autorización.

## Estado de pruebas

Controles a ejecutar: unitarias, TypeScript/Next, PostgREST HTTP, PostgreSQL17 con D061, smoke y restauración efímera. CI green no equivale a WhatsApp live ni a piloto de empresa real.
