# 129 — MVP-009: recepción SQL directa de cotizaciones, sin «Confirmo»

31/10/2026 · [Issue #231](https://github.com/ProtectorRudo/Cotironda/issues/231) · **SOLO PostgreSQL 17 efímero CI**. No instalación en Supabase DEV, ni producción, ni mensajes enviados.

## Decisión comercial vigente

**El envío de una cotización por un proveedor autenticado ya representa su presentación.** Cotironda no debe pedirle «Confirmo», ni código, ni entrar al portal. Puede responder con otra versión para corregir. IVA, flete, plazo o medio de pago no informados NO deben impedir registrar la oferta recibida; quedan como datos ausentes y nunca se convierten en cero o en un total comparable.

## Implementación MVP-009

`supabase/sql/whapi_receive_quote_direct_d059.sql` agrega la función SQL privada `cotironda_private.whapi_receive_quote_d059(channel_id,message_key,expected_revision,offer)` y la tabla privada `whapi_received_offers_d059`:

- Acepta **únicamente** un mensaje ya persistido en el inbox cifrado D028 y cuya empresa/proveedor/ronda provienen del ledger de confianza. El argumento `offer` solo admite el esquema económico validado de D026; no puede especificar el ID del proveedor ni del comprador.
- En **una misma transacción**, D048 comprueba remitente, consentimiento/BAJA, invitación y ronda vigente y guarda revisión; D026 genera inmediatamente una versión inmutable, sin mensajes intermedios D047, D049 ni acuse de salida.
- Para conservar compatibilidad con el SQL legado, D026 nombra el evento `offer_confirmed`; en **esta ruta nueva** significa «recibida del proveedor verificado», no un segundo acto de confirmación. Hay que renombrar este lenguaje en la futura migración consolidada de base cuando no queden consumidores del protocolo viejo.
- La tabla de recibos guarda **solo hashes/IDs**, no nombre del proveedor, teléfono ni texto original. Tiene FKs a inbox, origen D048 y versión D026, RLS y permisos restringidos a un rol NOLOGIN sin bypass. Ningún GRANT directo a `anon`, `authenticated`, `service_role` o `cotironda_app`.
- Un mismo mensaje reenviado **no crea otra versión**; el mismo ID con importe diferente se rechaza. Otro mensaje con revisión esperada correcta crea otra versión, conservando intacta la anterior. Después del cierre, solo se puede recuperar el acuse histórico de una recepción exacta; nunca crear nuevas versiones.

## Pruebas CI

`supabase/tests/ci/114_whapi_receive_direct_d059.sql` cubre: ausencia de inbox, baja, adjunto no aceptado como texto, proveedor no invitado, publicación de una oferta parcial sin IVA/flete/precio neto, ausencia de mensajes «Confirmo», deduplicación exacta, falsificación con mismo ID, corrección sin borrar versión anterior, revisión obsoleta, inyección de identidad en el JSON, recibos inmutables, cierre de ronda, roles NOLOGIN, RLS y falta de permisos Data API. Se ejecuta en CI en la misma instalación efímera de PG17 que las pruebas anteriores, con datos de ficción y rollback del fixture.

## Límites y pasos imprescindibles para operar

**No se añadió un endpoint, webhooks ni Whapi real.** El broker servidor todavía debe: verificar el cuerpo Whapi y descifrar el archivo/mensaje desde el inbox persistido; relacionar cada material/precio con la fuente real y detectar correcciones; invocar D059 desde una identidad de servicio privada controlada; incorporar la zona de entrega en el envío por proveedor; y mostrar las versiones al comprador autenticado. Los roles `NOLOGIN` de esta prueba no son credenciales de producción.

**Tampoco estamos guardando el importe original desconocido como un campo bruto visible** en `offer_versions_v1`: la estructura legada sólo almacena un `net_unit_price` normalizado y `vat_rate`. Si el proveedor puso «$121» sin aclarar IVA, `net_unit_price` queda `null` y el precio literal existe solo en la fuente cifrada; antes del piloto debemos agregar un campo fuente inmutable con estado económico para poder mostrar el precio declarado aunque no sea comparable. No adjudicar por valores reconstruidos ni filtrar datos entre empresas.

SQL D059 es archivo de ensayo, **no migración en el historial Supabase**. El bloqueo [#175](https://github.com/ProtectorRudo/Cotironda/issues/175) por backup auténtico DEV sigue vigente. D049/D051 y los ensayos anteriores quedan como legado de CI hasta una migración compatible. **Sin merge ni deploy**.
