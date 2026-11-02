# MVP-074 — Evitar pedir cotización dos veces al proveedor

**Hallazgo del piloto real (02/11/2026).** El arquitecto envió por WhatsApp un pedido de cemento CPC e hidrófugo, y la respuesta de Ailín fue recibida y versionada fielmente. Sin embargo, la invitación automática de Ailín seguía `pending` en la cola. Si se activara outbound, Cotironda le pediría cotizar algo que **ya presupuestó**. El mensaje a Nahuel sigue pendiente y no debe cancelarse.

## Regla

- Al registrar una nueva versión de cotización en `offer_versions`, cancelar la invitación del **mismo pedido y proveedor** únicamente si aún está `pending`. Dejar **todas las versiones del presupuesto original sin modificaciones**, incluidos precios, importes declarados, embalajes, descuentos, IVA/flete y aclaraciones.
- Reparar los `pending` ya existentes con oferta registrada. No cancelar el mensaje de otro proveedor ni otra solicitud.
- Bloquear selección (`claim`) si ese proveedor ya tiene una cotización para ese pedido. Añadir la misma condición en la verificación de autorización inmediatamente anterior a Whapi, para mitigar la carrera entre `claim` y recepción.
- Un mensaje `leased`, `api_accepted` o `uncertain` **NO** se altera ni se reintenta: no se conoce si WhatsApp lo recibió. La cancelación no equivale a una notificación.
- Mantener identidad, zona, consentimiento vigente de comprador/proveedor, fecha límite, aislamiento y flags actuales. `outbound=false` hasta que el piloto esté autorizado y probado.

## Implementación y alcance

Migración idempotente en su lógica de estados `supabase/piloto/mvp074_no_invites_after_quote.sql`: trigger `after insert` + saneamiento de cola + cambios en los dos RPC existentes, preservando exactamente las validaciones D073f del comprador. **Solo base piloto aislada**, no producción, no DEV histórica ni Te Hice Esto.

La creación de trigger es una migración **de un solo uso** (no volver a aplicarla), con sello de migraciones Supabase. Es una modificación de estado de cola, no de ofertas, catálogos ni WhatsApp. No se leen ni insertan contactos, teléfonos o secretos.

## Evidencia y pruebas

1. Antes de aplicar, ejecución real de `BEGIN; <migración>; <aserciones>; ROLLBACK;` sobre el proyecto piloto: **PASS**. Quedó verificado que Ailín pasaría a `cancelled`, Nahuel permanece `pending`, un insert de corrección cancela el pendiente, y `leased`/`uncertain` no se alteran.
2. En el mismo ensayo, se activó hipotéticamente `outbound=true` **dentro de la transacción que se revierte**, y se verificó que `cotironda_piloto_authorize_whapi_v1` rechaza un lease si existe una oferta. La fuente literal de la primera versión se comprobó inalterada.
3. `supabase/piloto/mvp074_smoke_rollback.sql`: ensayo repetible **solo en PILOTO después de instalar**; rollback final. `tests/unit/mvp074-no-invites-after-quote.test.mjs`: protección contra cambios accidentales del alcance, guardias y privilegios.
4. Después de aplicar, volver a consultar `whapi_outbox` y `offer_versions` directamente. **No afirmar envío ni ranking** por cambiar el estado de la cola.

## Límites que quedan

- Ventana residual de carrera inevitable entre el último control de autorización y la respuesta de API externa; no se puede afirmar entrega/ausencia de entrega sin evidencias del proveedor. La autorización se verifica lo más cerca posible del envío y nunca se reintenta un estado incierto automáticamente.
- El ranking determinista, parseo del presupuesto íntegro, IVA, flete y costos comparables siguen pendientes; el texto original de la oferta se conserva, pero **no es un total normalizado/validado**.
- Nahuel todavía debe vincular su teléfono. No habilitar envíos solo por haber corregido esta cola.
