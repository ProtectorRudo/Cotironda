# Decisión 450 — MVP320: puerta read-only del circuito sin confirmaciones y Sandbox

**Fecha:** 08/11/2026 ART. **Autorización:** «Dale» después de «Déjalo así» respecto de la configuración Whapi. **Alcance:** solo desarrollo, SQL `SELECT` en el piloto para leer esquema/contadores, pruebas Node22 y documentación; NO alterar Supabase, Whapi, claves, Vercel, GitHub main ni cron. El usuario decide continuar sin respaldo.

## Hallazgos respaldados por consultas reales, sin datos personales

En `cotironda-piloto` (**09/11/2026 00:27:08 UTC**; hora Argentina 08/11/2026 21:27:08) el preflight READ ONLY detectó:
- PostgreSQL17: sí; **7** archivos originales de Storage conservados.
- `MVP309`: NO, `MVP310` (restricciones y trigger): NO, `MVP312`: NO, `MVP313`: NO, `MVP314`: NO, `MVP315`: NO.
- `ai_auto_release_gate_mvp306.enabled=false`: el pedido prospectivo **sin CONFIRMAR COTI** no está activado.
- `ai_dispatch_gate_mvp222.enabled=true` y flags inbound/outbound true: existen caminos de IA **heredados** habilitados; eso NO equivale a despacho autónomo nuevo.
- `ai_buyer_auto_release_mvp306`: 0 filas. No se creó ronda nueva para el ensayo.
- No se probaron envíos Whapi, respuesta auténtica de proveedores ni vista del comprador. Ninguna cotización, contacto, teléfono ni token se leyó.

## Lo confirmado por el operador en la pantalla de Whapi

Canal `Cotironda Piloto` con WhatsApp Business autorizado y Developer Sandbox gratuito sin expiración. Contadores visibles al momento: **1/150 mensajes, 3/5 chats, 53/1000 solicitudes API**. No se conoce desde aquí si los 3 chats activos son precisamente las 3 personas del piloto; la API externa no se comprobó desde esta ejecución. Debe respetarse el límite del Sandbox, no los cupos mayores del worker MVP314.

**Seguridad importante:** el token de Whapi quedó visible en imágenes de la conversación. El responsable solicitó dejar la configuración como está; por eso NO se rotó ni se utilizó el token. Antes de cualquier envío automático, se recomienda rotarlo en el panel y actualizar el secreto de Supabase por un canal privado. No compartir tokens en capturas ni GitHub.

## Archivos nuevos

- `scripts/piloto/mvp320-preflight-sin-confirmacion-readonly.sql`: SQL completamente de lectura, sin SELECT de contenido de presupuestos, fuentes, PII o claves; introspección de restricciones/tables/RPC de la secuencia y conteos anónimos.
- `scripts/piloto/mvp320-preflight-gate.mjs`: validador local del esquema exacto del informe: booleans, contadores, prohibición de campos adicionales y no aceptación de certificados E2E falsos. Aun con todas las migraciones y flags instalados, **nunca** permite salida real ni certifica E2E desde esta sola evidencia.
- `tests/unit/mvp320-preflight-sin-confirmacion.test.mjs`: 6 casos; además corre la regresión MVP300 del testigo anterior (pedido con confirmación) porque la ruta prospectiva **no** exige `CONFIRMAR COTI`. La existencia del testigo MVP300 no demuestra la ruta nueva.
- Workflow `cotironda-mvp320-preflight-piloto.yml`: solo fixtures sanitizados, sin red ni secretos.

## Gates antes de una ronda real completa

1. Validar SHA actuales de las 14 RPC MVP311 y prueba de migraciones MVP309–315 en PostgreSQL17 con rollback; instalar solo bajo orden `Publicalo`, en el **piloto** y con switches OFF, bajo riesgo explícito de no tener backup real.
2. Revisar la diferencia entre Sandbox `3/5 chats` y destinatarios realmente necesarios, y renovar la credencial expuesta antes de tráfico real automático. No pagar ni ampliar el canal sin autorización.
3. Verificar al menos una ronda prospectiva real: WhatsApp comprador -> IA Central -> distribución por rubro a Ailín y Nahuel -> dos presupuestos nuevos verificables -> ranking válido / pendientes sin precios -> vista privada -> cierre y revelación autorizada de nombres comerciales. Evitar permisos o confirmaciones por ronda.
4. Registrar evidencia externa de recepción WhatsApp y navegador, costos, ausencia de duplicados. No declarar E2E completo con CI o con un status ACTIVE del gateway.

## Lo que NO prueba MVP320

No valida hash MVP311 por sí solo, credenciales de Supabase/Whapi, cuotas reales del Sandbox, consentimientos específicos ni exportación/restauración. Tampoco prueba disponibilidad de modelos de IA ni publicación en Vercel. Solo es un **check preflight de cambios** para no hacer activaciones a ciegas.

**Regla final:** ningún reporte read-only puede indicar `real_e2e_certified=true` ni `eligible_for_real_outbound=true`. Solo el circuito real, con autorización para publicar y datos personales protegidos, podrá confirmar funcionamiento completo.
