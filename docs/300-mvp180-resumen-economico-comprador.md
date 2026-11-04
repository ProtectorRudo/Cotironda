# MVP180 — Economía visible del comprador, sin inventar ranking

**04/11/2026 · P0-B2 #535 y P0-B2r #529 · desarrollo + ensayo SQL reversible en PILOTO.** Base PR #555. Ninguna modificación a Whapi, originales, adjudicación, contacto o datos económicos existentes.

## Problema confirmado en datos reales

La lectura `supplier_economic_facts_mvp168` contiene cuatro documentos de dos rondas: cuatro fuentes verificadas y sus SHA conservados, pero **0/4 habilitan ranking**, **4/4 tienen IVA no informado**, **3/4 flete no informado, 1/4 a convenir** y **4/4 carecen de stock corroborado y base neta acreditada**. El comparador monetario offline ya existe, pero no puede operar a costa de inventar tarifas, impuestos o disponibilidad.

## Cambio incremental conectado al seguimiento

1. La RPC `cotironda_piloto_buyer_economy_summary_mvp180(text)` se invoca **únicamente** con token privado cuyo hash fue verificado por el mismo seguimiento `MVP091`. Exige buyer consentido vigente, no revocado y ronda legible. `anon` y `authenticated` no pueden ejecutarla: solo `service_role`.
2. La RPC selecciona la **última revisión por proveedor** entre texto/media, cruza fuente v9 y ledger económico por ronda, proveedor, mensaje y SHA, y descarta evidencia superada. Compara el **multiconjunto completo de transcripciones públicas** con los presupuestos visibles al comprador, incluyendo duplicados; ante un solo desfase devuelve `null`. No representa ofertas parcialmente auditadas como si todas estuvieran comprobadas.
3. Devuelve solo conteos agregados: IVA no informado, flete no informado o a convenir, disponibilidad no corroborada, pago no informado, precio neto, plazo y mínimo sin acreditar. **Nunca precios, nombres, hashes, documentos, enlaces ni puestos.** La falta de stock acreditado no significa stock cero.
4. La Edge de seguimiento solo incorpora ese resumen si una segunda validación estricta pasa, y si la RPC está ausente, falla o no concilia, el seguimiento **continúa funcionando sin resumen**.
5. El proxy de Vercel vuelve a aplicar lista blanca y límites de conteos. La web muestra «Qué falta para comparar precios» mientras está abierta o cerrada; no oculta ofertas, no pide formularios, no abre adjudicación ni altera presupuestos. Al revocar, cancelar o perder conexión borra la sección. Se corrige además la coerción `null → 0` del contador en el proxy.

## Ensayo inicial real y reversible

El SQL exacto se ejecutó en `cotironda-piloto` con `BEGIN; ...; ROLLBACK;`, comprobando permisos `anon/auth DENEGADOS`, `service_role` autorizado y token falso sin resultado. Dos enlaces vigentes: **dos resúmenes correctos y cuatro documentos**; conteos 4 IVA no informados, 3 fletes no informados, uno a convenir, 4 disponibilidades y 4 netos sin acreditar. Después se confirmó con `to_regprocedure` que **la función no quedó instalada**.

No se extrajeron tokens en claro, números, nombres ni presupuestos. Se usaron hashes ya autorizados dentro de la propia consulta para verificar conteos.

## Criterios para habilitar en PILOTO

- Tests unitarios del reductor, proxy, DOM y contrato SQL; todos los controles GitHub relevantes verdes.
- Instalar solamente RPC en `cotironda-piloto`, volver a probar privilegios, hash falso y 2 enlaces reales con conteos sin exponer hashes.
- Desplegar Edge de staging separada con la dependencia nueva; smoke GET, token falso, aislamiento y comparar salida canónica de la Edge activa.
- Crear una Preview Vercel del SHA exacto, verificar HTML/JS/CSS MIME, CSP/no-store y POST proxy. Probar los enlaces auténticos en navegador mediante su titular, no intentar regenerarlos desde hashes.
- Solo entonces activar el nuevo resumen en la Edge activa del PILOTO, conservando reversión a v11. **No producción**.

## Alcance y pendiente de ranking

MVP180 **no convierte precios en comparables**; documenta al comprador qué falta para compararlos. P0-B2/#535 sigue abierto hasta que el auditor documental acredite IVA, flete, plazo, mínimo, equivalencia y stock/cantidad desde las fuentes, y el motor determinista devuelva opciones explicables. Las ofertas permanecen anónimas y completas/parciales, cualquiera sea la recomendación futura. Descarga original #525 y finalistas/avisos #523 siguen separados y deshabilitados.
