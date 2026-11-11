# Acta 513 — B5o: una misma nota comercial, una sola evidencia PDF

**Fecha:** 11/11/2026. **Autorización:** «Luz verde» (desarrollo y pruebas; SIN desplegar, integrar, enviar WhatsApps ni publicar presupuestos). **PR de desarrollo:** [#785](https://github.com/ProtectorRudo/Cotironda/pull/785), apilado sobre [#783](https://github.com/ProtectorRudo/Cotironda/pull/783). **Incidente:** [#779](https://github.com/ProtectorRudo/Cotironda/issues/779).

## Causa real identificada sin exponer originales

El cron B4 y B5n se ejecutaron una vez en piloto (Acta 512). La lectura privada indicó primer bloqueo de condición 4/5 con `source_part_mixed`; material subtotal conciliado, pero flete y moneda ISO sin certificar.

Una **consulta privada y exclusivamente estructural** del candidato original, asociada al SHA y la misma fuente B5n, comprobó:
- 3 renglones `material` y 2 `commercial_note`.
- El renglón 4 es `commercial_note`, sin cantidad/unidad/precio/total, y su `original_description_raw` **coincide exactamente** con la cuarta condición en `commercial_conditions_raw`. El renglón 5 también es una nota comercial sin importe; su descripción coincide con la quinta condición.
- La condición 4 no incluye símbolo de precio ni porcentaje. No se extrajeron ni registraron en GitHub textos completos, teléfonos, precios ni fragmentos privados.
- El comparador B5l rechazaba indiscriminadamente cualquier `segment.includes(description)`, incluso cuando el mismo contenido ya estaba representado correctamente como una *nota sin importe*. No había dos elementos de origen que reclamar: era **una misma evidencia expresada en dos lugares de la estructura del candidato**.

El código existente distinguía fragmentos PDF.js independientes para notas en filas de materiales, pero **no reconciliaba la misma nota comercial** como `lines[*]` y como `commercial_conditions_raw[*]`. La clasificación `source_part_mixed` no prueba, por sí sola, que el PDF.js físico mezclara un material y un texto; el bloqueo podía ser un falso positivo por estructura redundante.

## Corrección general, sin fragmentar ni inventar

Archivo: `src/domain/presupuestos-v2/auditoria-cobertura-original-b5l.ts`.

El lector permite que una condición quede corroborada por **el mismo fragmento PDF.js único y completo** que ya corresponde a una nota comercial, solo cuando TODAS las condiciones siguientes sean ciertas:

1. La línea ya está corroborada por el lector del PDF **original** (SHA, origen y fila única), y `kind==='commercial_note'`.
2. `quantity_raw`, `unit_raw`, `unit_price_raw`, `line_total_raw` son `null`, `unit_price_role==='absent'`.
3. La condición completa y normalizada equivale **exactamente** a `original_description_raw` y al segmento completo de PDF.js; no se acepta substring parcial, ni un nombre parecido.
4. La condición y su `original_line_raw` no presentan importes, IVA/cargos adicionales o riesgos fiscales no contenidos en la descripción, ni porcentajes monetarios camuflados.
5. Se mantiene `uniqueConditionParts`: el mismo fragmento no puede asignarse a dos condiciones distintas y no se admite evidencia duplicada en dos filas diferentes.
6. Si la fila contiene un importe extra, IVA, flete no declarado, descuento, o texto económico sobrante, las verificaciones `materialLineHasUnclaimedCommercial` y de cobertura conservan el bloqueo.

**La excepción NO aplica a materiales:** si una descripción de material coincide con un texto comercial, sigue sin habilitarse como condición. Tampoco autoriza separar una cláusula dentro de una celda mixta arbitraria. No se modifica el lector de WhatsApp/MVP332 ni la función PDF.js B5f.

En toda salida siguen:`source_verified=false`, `full_document_covered=false`, `can_publish=false`, `can_rank=false`, `can_reveal_contacts=false`.

## Pruebas y criterios

- Node: nota comercial que figura simultáneamente como condición, dos notas comerciales sin importe, duplicados, material con texto superpuesto, coincidencia parcial, IVA adicional, precio adicional y porcentaje.
- Deno/PDF.js: genera PDF auténtico sintético, verifica SHA y notas visibles una sola vez, y prueba IVA sin atribuir en la misma fila.
- PostgreSQL 17 ROLLBACK: regresión de ledger privado, B4, SHA, autoapagado y permisos, **sin cambios SQL nuevos**.
- Regresión general y build Next.js. CI en rama/PR separado para B5o.

## Restricciones y próximos pasos

**No se puede afirmar que B5o haya resuelto el PDF histórico real sin ejecutar esa versión en el entorno privado.** Tampoco habilita publicación, ranking ni contactos. Los resultados previos B5k/B5m/B5n se preservan: no reutilizar `v2_b5n_20261111` ni sobrescribir su evidencia.

Antes de una eventual nueva ejecución, **NO agregar una ronda de diagnóstico por inercia**: evaluar si puede inspeccionarse la evidencia real ya guardada o preparar una única comprobación versionada final, solo con autorización «Publicalo», criterios estrictos y prueba económica E2E. Priorizar que Cotironda reciba y compare los presupuestos de diferentes proveedores por rubro, sin inferir flete o IVA de un silencio ni equiparar ofertas de distinta cobertura.

Se deja aclarado: este cambio resuelve una clase **estructural de doble referencia a la misma nota**, no un caso de “separar cualquier texto mezclado”. La atribución de fuente debe ser conservadora.
