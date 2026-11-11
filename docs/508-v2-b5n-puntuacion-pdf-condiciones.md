# Acta 508 — B5n: corrección mínima de atribución de condiciones PDF.js

**Fecha:** 11/11/2026. **Autorización:** «Luz verde», desarrollo y pruebas únicamente; SIN merge, SQL, Edge, WhatsApp, Vercel ni producción. **PR:** [#781](https://github.com/ProtectorRudo/Cotironda/pull/781), apilado sobre [#778](https://github.com/ProtectorRudo/Cotironda/pull/778). **Incidente:** [#779](https://github.com/ProtectorRudo/Cotironda/issues/779).

## Evidencia del piloto real (acta 507)

Una única relectura histórica con B5m mostró 3/3 materiales aritméticamente corroborados y `material_total_matches_declared=true`, pero el análisis de cobertura B5l detuvo la atribución después de **3/5 condiciones**. En B5k anterior se detuvo después de **4/5**.

La secuencia privada `commercial_conditions_raw` del candidato real explica que el primer término no atribuido en B5m corresponde a la **condición ordinal 4: precios en efectivo**. El término ordinal 5 es `flete a convenir`; **NO** se concluye que esté mal, omitido o atribuido mientras no se resuelva el anterior. No se dispone en esta auditoría de los *fragmentos originales PDF.js* concretos de la cuarta condición; por lo tanto sería incorrecto afirmar cuál fue exactamente su problema geométrico.

## Hipótesis acotada y corrección segura

El verificador B5l exigía una igualdad literal estricta entre `commercial_conditions_raw` y todo el contenido de un fragmento PDF.js. Una condición completa `precios en efectivo` es semánticamente la misma que `precios en efectivo:` o `- precios en efectivo.` cuando la puntuación es **solamente externa**.

Se agrega `conditionLiteral`, que descarta únicamente signos de puntuación de los **extremos** de un span PDF.js, nunca letras, cifras, símbolos de precio, porcentajes, IVA, flete, texto intermedio o fragmentos distintos. La condición continúa necesitando:
- Una **única** fila fuente que la contenga y un **único span de fragmentos contiguos independientes**, sin reclamar partes de una descripción, cantidad o celda de precio.
- No compartir ningún fragmento con otras condiciones o información comercial sin atribuir.
- Mantener comprobación de IVA/flete/cargos, descuentos y sumas con las funciones deterministas B5j y B5l; todo lo ambiguo conserva el bloqueo.
- El control de cobertura reporta solamente filas **visibles** por PDF.js y no convierte un diagnóstico privado en `source_verified`, `full_document_covered`, `can_publish`, `can_rank` ni `can_reveal_contacts` (todos siguen FALSE).

## Criterios de aceptación

- Node: condiciones con `:`, `.`, guion, puntuación aislada y dos términos independientes; rechazar término unido al material, IVA 21%, importes adicionales, porcentajes, duplicados o cláusulas monetarias en un mismo fragmento.
- Node: secuencia de **cinco condiciones** simuladas, con cuarto término puntuado y quinto independiente, puede atribuir **5/5 solo en una prueba sintética**; con quinto unido al material vuelve a detenerse de modo conservador luego de **4/5**.
- Deno PDF.js: PDF sintético real que contiene condición completa puntuado en fragmento independiente vs. misma parte con flete, y verifica además condiciones públicas FALSE.
- PostgreSQL 17 ROLLBACK: asegurar que la migración B5m instalada sigue protegida por RLS y claves de versión, sin crear nueva migración ni alterar datos reales.
- Regresión general y build Next.js, sin afectar Whapi o lector PDF fijo de MVP332.

## Qué NO se demuestra

Este PR **no prueba** que la condición ordinal 4 del **PDF histórico** esté dividida de esa manera. Podría estar mezclada con un material o un importe; si es así, el bloqueo debe mantenerse. El registro histórico B5k/B5m permanece intacto y consumido. Una nueva prueba privada real necesitaría ejecución **nueva versionada** y orden separada «Publicalo»; no reabrir ni sobrescribir B5k/B5m. Antes de hacerlo, evaluar si existe una forma más directa y económica de inspeccionar la evidencia original dentro del entorno privado, evitando otra serie de diagnósticos aislados.

## Foco comercial

No confundir coincidencia del subtotal de materiales con importe final: el flete a convenir sigue sin costo y la moneda ISO no está acreditada. Priorizar después la prueba E2E desde WhatsApp hasta el arquitecto, por rubro, con equivalencias y comparaciones verificables, sin publicaciones engañosas.
