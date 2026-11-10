# Acta 470 — Hito validado: del pedido del arquitecto a ambos proveedores

**Fecha y corte de verificación:** martes 10/11/2026, 07:18 ART (2026-11-10 10:18:02 UTC).  
**Proyecto:** Cotironda, Supabase privado `cotironda-piloto` (`ilggkalaafhtiysyzlmg`).  
**Instrucción:** el propietario pidió **documentar el tramo que hoy está funcionando**, sin modificarlo ni extender la declaración al procesamiento de presupuestos.  
**Estado:** **HITO PARCIAL APROBADO: comprador → interpretación IA → liberación automática → dos solicitudes de proveedor → enlace comprador.** **NO es aún una prueba de punta a punta.**

## Caso de prueba real

- **Ronda:** `aefe169e-7801-4efc-aabf-25cd134744eb`.
- **WhatsApp entrante:** 10/11 06:20:08 ART, autenticado, vinculado al comprador `arquitecto`. Pedido libre: «15 bolsas de cemento CPC de 50 kg, 2 bolsones de arena y 1 bolsón de piedra. Entrega en La Plata».
- **Ronda creada:** 06:20:53 ART, `state=prepared`, entrega La Plata, cierre previsto **sábado 14/11/2026 a las 06:20:53 ART**.
- **IA:** un intento `staged` terminado sin `failure_code`. `request_lines` contiene exactamente:
  1. Cemento CPC 50 kg, **15 bolsas** (`unit=bag`).
  2. Arena, **2 bolsones** (`unit=bag`).
  3. Piedra, **1 bolsón** (`unit=bag`).
- **Rubros:** los 3 ítems clasificados como `obra_gruesa`.
- **Destinatarios:** 6 asignaciones de catálogo (`ai_shadow_destinos_mvp221`): 3 ítems para `corralon_ailin` y 3 para `corralon_nahuel`. Esto significa coincidencia de catálogo, **no verifica stock ni precio**.
- **Sin confirmaciones:** 1 aprobación prospectiva `ai_buyer_auto_release_mvp306`, **0** registros de emisión `ai_buyer_review_mvp279` para esta ronda. El arquitecto **no tuvo que responder `CONFIRMAR COTI`**.
- **Salida real Whapi:** 2 trabajos `ai_dispatch_jobs_mvp222`, uno por proveedor, ambos `state=api_accepted` con ID de mensaje persistido, terminados a las **06:20:57** y **06:20:59 ART**. Eso prueba aceptación por API, **no por sí solo entrega al dispositivo**.
- **Confirmación externa del usuario:** el propietario informó que **Ailín y Nahuel recibieron las solicitudes en sus WhatsApps**. Se consigna expresamente como **atestación humana**; en `delivery_receipts_mvp119` todavía no hay recibos instrumentados de proveedor para esta ronda.
- **Seguimiento del comprador:** `buyer_tracking_mvp091.send_state=api_accepted` e ID Whapi guardado. Recibo `delivery_receipts_mvp119`: `source_kind=buyer_tracking`, destinatario `arquitecto`, `state=read` a las **06:34:02 ART**. El enlace se emitió y fue leído; esto no prueba por sí solo el funcionamiento de cada pantalla.
- **Seguridad/idempotencia en el corte:** 0 despachos `leased`/`uncertain` y 0 outbox `leased`/`uncertain`; SQL `ai_auto_release_gate_mvp306.enabled=true`; batch MVP314 y aviso diferido MVP315 apagados.
- **Código instalado:** Edge `cotironda-piloto-whapi` **v75 ACTIVE** a las 07:18 ART; conserva la ruta MVP335 sin segundo interruptor `COTIRONDA_PILOT_BUYER_AUTO_RELEASE_MVP306_ENABLED` ni nuevo emisor rutinario de `CONFIRMAR COTI`. El cambio de versión 74 a 75 ocurrió al actualizar la configuración privada, **no se publica código nuevo en esta acta**.

## Aprobación por tramo y fuentes de evidencia

| Tramo | Resultado | Evidencia |
|---|---|---|
| WhatsApp real al webhook | **Verificado** | `whapi_inbox` del arquitecto, hora y origen vinculados a ronda |
| Interpretación IA, cantidades, zona y rubro | **Verificado** | `request_lines`, `ai_shadow_rubros_mvp221`, intento `staged` |
| Elegir 2 proveedores con catálogo | **Verificado** | 6 destinos en `ai_shadow_destinos_mvp221` |
| Libera sin pedir confirmación | **Verificado** | auto-release=1; buyer-review=0 |
| Se enviaron dos solicitudes | **Verificado hasta aceptación API** | 2 `ai_dispatch_jobs_mvp222.api_accepted`, IDs guardados |
| Recepción por Ailín y Nahuel | **Confirmada por el usuario** | Ambos informados como receptores; sin recibos de proveedor en BD |
| Enlace del arquitecto | **Verificado hasta lectura** | `buyer_tracking_mvp091` y `delivery_receipts_mvp119.state=read` |
| Proveedores envían presupuesto | **Pendiente** | El usuario confirmó que ninguno respondió aún; últimos mensajes previos a la ronda |
| IA extrae y conserva ofertas | **Pendiente** | 0 `anonymous_offers_mvp091` en esta ronda |
| Vista anónima, cobertura y ranking justo | **Pendiente prueba real** | Requiere respuestas de proveedores |
| Cierre automático, revelación y contactos | **Pendiente prueba real** | La ronda no venció; cierre 14/11 |
| Rotación coordinada de credenciales expuestas | **Pendiente antes de ampliar piloto** | No incluir secretos ni tokens en archivos o logs |

## Próximo trabajo, sin fricción

1. **Esperar las cotizaciones reales de Ailín y Nahuel.** Pueden responder directamente por WhatsApp en lenguaje libre y con archivos; no imponer formulario, portal ni confirmación.
2. **Auditar recepción y asociación automática:** `whapi_inbox`, lectura de PDF/Excel/texto, fidelidad de líneas, unidades/precios/IVA/flete y conservación de condiciones, sin inventar datos ni enviar WhatsApps duplicados.
3. **Auditar ofertas del arquitecto:** anonimato durante la ronda; artículo, cantidad, cobertura y total preliminar; comparar solo equivalentes, nunca totales de cobertura desigual como si fueran comparables.
4. **Auditar cierre:** cuando llegue la fecha, comprobar revelación de todos los proveedores invitados según reglas, datos del arquitecto protegidos y adjudicación/manual/contactos bajo las reglas de la plataforma.
5. **Seguridad previa a expansión:** rotar de forma coordinada tokens y webhook secret expuestos accidentalmente en la conversación, **sin revelar los nuevos secretos en documentos ni romper el canal**.

## Alcance de esta acta

Este hito **está funcionando como se definió hasta la recepción de solicitudes por los dos proveedores**, sustentado tanto en comprobación de base como en afirmación directa del propietario. **No afirmar “100%”, “ronda finalizada”, “dos presupuestos publicados” ni “entregado al dispositivo según recibos de Supabase” sin la evidencia correspondiente.**

**Esta acta no modifica** Supabase, código, cron, WhatsApp, pagos, configuraciones ni secretos. Se crea exclusivamente como documentación versionada para auditar el piloto. Ante dudas, no reiniciar ni duplicar envíos de la ronda.

Antecedentes: [Acta 468](468-mvp335-sql-only-sin-confirmacion-y-secretos.md), [Acta 469](469-mvp335-v74-publicacion-verificada-piloto.md), [PR #739](https://github.com/ProtectorRudo/Cotironda/pull/739), [PR #740](https://github.com/ProtectorRudo/Cotironda/pull/740).
