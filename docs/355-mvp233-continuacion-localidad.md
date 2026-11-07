# Decisión 355 — Continuación de localidad del comprador (MVP233)

## Problema real
IA Central acepta un pedido libre sin localidad y registra un intento `needs_zone`. La respuesta del comprador «La Plata» se recibía como un nuevo mensaje y el circuito heredado no podía reconstruir el plan semántico. El comprador debía repetir la lista o el pedido quedaba sin procesar.

## Solución
1. El webhook registra el nuevo mensaje Whapi firmado como siempre; antes de abrir un nuevo intento semántico interpreta únicamente una localidad breve con el validador existente.
2. La RPC privada `cotironda_piloto_ia_claim_zone_mvp233` exige que la ventana temporal de prueba siga vigente, gates activos, rol comprador con consentimiento, reply con SHA original, y **exactamente una** fuente anterior del mismo chat terminada en `needs_zone`. Con bloqueo transaccional registra el enlace uno-a-uno y pasa el intento antiguo a reservado. Nunca permite una segunda atribución al mismo origen.
3. La Edge descifra el mensaje original con AES-GCM y AAD ya existente, recalcula SHA256, vuelve a pasar ambas lecturas IA con la única localidad como contexto, y rechaza que el modelo cambie esa localidad.
4. El puente prepara SQL **con el texto original inmutable**, no con el contexto concatenado. Todas las citas de materiales deben existir literalmente en la fuente que envió el comprador. El despacho sigue bajo gates propios.
5. Respuestas ambiguas no se atribuyen; `review` no publica ni reenvía. No se liberan contactos, presupuestos originales ni ranking por este cambio.

## Criterios y pruebas
- Node 22.16: localidad contradicha, SHA alterado, pedido falsificado, gates de publicación OFF, firma falsa y original ilegible.
- PostgreSQL 17 con ROLLBACK: reply ajena, localidad inventada, gate OFF, enlace atómico, idempotencia, permisos de service_role y RLS.
- Regresión webhook: Deno typecheck / compilación y suites existentes.
- Piloto solo después de autorización explícita; la prueba real WhatsApp del comprador + dos proveedores sigue pendiente. **No cerrar #597 ni #529 por este PR.**

Riesgos conocidos: esta versión continúa solo mensajes de texto, no adjuntos del comprador. El manejo de múltiples pedidos pendientes queda en revisión explícita, nunca asignación automática arbitraria.

## Estado posterior (5/11/2026)

La migración MVP233 se instaló en el proyecto Supabase `cotironda-piloto` y
la Edge de recepción quedó en versión 53, junto con la normalización MVP234.
Controles privados apagados, sin mensajes reales ni cambios de producción.
La prueba E2E completa sigue pendiente. Ver decisión 356.
