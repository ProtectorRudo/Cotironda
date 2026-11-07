# Decisión 424 — MVP298: acuerdo económico entre dos lecturas sin exigir la misma redacción

**Fecha:** 07/11/2026. **Estado actual: PUBLICADO SOLO EN `cotironda-piloto` (07/11/2026).** Código PR #690, squash `d59f882d10cee3b0322627521c7c4ce164cb1f63`. Sin producción ni relectura de originales históricos.

## Problema confirmado por inspección de código

El contrato MVP225 ya obliga a que **cada lectura**, de manera independiente, acredite citas literales del original, moneda explícita, condición de IVA/flete/pago, renglones monetarios íntegros y vínculos con artículos pedidos. Sin embargo, `firmaEconomica` comparaba también `lineas[].descripcion` —una glosa libre no usada para calcular precios— y los fragmentos exactos de `monedaEvidencia`, `ivaEvidencia`, `fleteEvidencia` y `pagoEvidencia`. Dos interpretaciones igualmente válidas podían elegir «ARS» y «Moneda: ARS» y quedar en revisión por **incompatibilidad textual sin diferencia económica**.

No existe prueba del contenido bruto de las dos lecturas históricas de Nahuel: **no** se atribuye ese diagnóstico a su caso, **no** se vuelve a consumir IA y **no** se reinterpreta el original anterior.

## Cambio conservador

- Mantener las dos verificaciones `verifyRead()` sin alteraciones y **antes** de comparar firmas. Cada evidencia alternativa debe aparecer literalmente en la fuente y sustentar el mismo estado declarado.
- Excluir de `firmaEconomica` solo la **descripción libre de línea** y los **fragmentos de cita literal** que ya se corroboraron de manera independiente. La fuente original se conserva en `textoOriginal`.
- Exigir igualdad exacta en intención, moneda/IVA/flete/pago declarados; en cada línea: número, cita original, cantidad, unidad, importe unitario literal, total literal y clase; en vínculos: número de línea, artículo solicitado y tipo de equivalencia. Diferencias en importes, unidades, mapeo, presencia de renglones o condiciones mantienen estado de revisión privada.
- No cambiar el verificador económico determinista, la reserva/ledger idempotente, consumo MVP264, SQL, la vista del comprador, el tiempo de ronda, el cierre, contactos, WhatsApp ni cron.

## Pruebas de aceptación

1. Dos lecturas que solo varían la descripción y cita «ARS» frente a «Moneda: ARS» deben lograr el mismo resultado económico, con **dos** llamadas simuladas.
2. Dos lecturas que citan «con IVA» frente a «IVA incluido» para la misma fuente que contiene ambas frases deben pasar por `evidenciaCondicionMvp242` y coincidir.
3. Dos lecturas que asignan un importe unitario distinto **aunque ambos literales aparezcan en el original** quedan en `readings_disagree`; ningún precio se publica.
4. Preservar negativos MVP297: citas ausentes, moneda contradictoria, IVA no demostrado, cargos monetarios omitidos, vinculación ajena, segunda lectura inválida, inyección de diagnóstico; sin relectura costosa.
5. CI Node y Deno sin secretos ni llamadas reales; cotejar el bundle Whapi completo antes de cualquier despliegue autorizado.

## Bloqueos E2E independientes

Esta corrección mejora una causa comprobada de falsos rechazos **en el código**, no resuelve por sí misma la aceptación y publicación de cotizaciones cuya moneda no está declarada ni de equivalentes con precios no comparables. Hoy el servidor requiere `verificada_para_comparacion` y moneda explícita para persistir una oferta `verified`, y la función SQL del comprador muestra únicamente `verified`. Un presupuesto bajo `review` puede tener `summary` privado de cobertura, pero no aparece como oferta anónima pública. La solución futura es separar **respuesta documental auditada** de **precio comparable** y mostrar cobertura sin precios no acreditados, evitando supuestos y sin revelar contacto. Esto necesita cambio SQL + DTO + interfaz + tests específicos.

Faltan pruebas auténticas, prospectivas y consentidas: WhatsApp del comprador, PDF segmentado a dos proveedores, respuestas nuevas, dos lecturas, publicación anónima y pantalla por rubros; y por separado cierre/selección/contactos cuando las reglas autoricen. Los registros históricos de Ailín y Nahuel no se tocan. No confundir CI verde con circuito real.


## Publicación confirmada — 07/11/2026

- Autorización expresa posterior: **«Publicalo»** para MVP298 y MVP299, limitada a `cotironda-piloto` y su proyecto web de seguimiento del piloto.
- Whapi actualizada de **v67 → v68 (ACTIVE)** mediante reemplazo del lector `lector-presupuesto-proveedor-mvp225.ts` y el productor MVP227; todos los demás archivos del bundle se conservaron.
- Comprobación después de publicar: el lector coincide exactamente con el código de la rama integrada; el PR #690 tenía 14/14 verificaciones aprobadas antes de fusionar.
- Sin llamadas IA, cambios de presupuesto, procesamiento de Nahuel/Ailín, WhatsApps, ajustes de flags ni contacto revelado. La aceptación económica estricta no cambió.
- La verificación de una **nueva ronda real** aún está pendiente; `ACTIVE` no acredita un E2E de WhatsApp y ofertas.
