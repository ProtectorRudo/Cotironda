# Acta 516 — B7: auditar todas las filas PDF pendientes antes de categorizar el riesgo

**Fecha:** 11/11/2026. **Autorización:** «Luz verde» — desarrollo y pruebas **SIN** ejecutar SQL real, Edge, Vercel, WhatsApp ni producción. **Base:** commit `99095f784574d31ec20db55e9e46db1837eae819` de [PR #786](https://github.com/ProtectorRudo/Cotironda/pull/786). **Resultado real anterior:** [Acta 515 / PR #787](https://github.com/ProtectorRudo/Cotironda/pull/787).

## Hallazgo verificado

El PDF histórico B5o tiene **13 filas visibles** según PDF.js, **8 atribuidas y 5 sin atribuir**. Ya se corroboraron **3/3 materiales**, el subtotal de materiales y **5/5 condiciones comerciales**. La cobertura quedó `unmapped_text`, y `source_verified`, `full_document_covered`, `can_publish`, `can_rank`, `can_reveal_contacts` son todos `false`. La economía sigue `fiscal_or_freight_ambiguous`, e ISO de moneda no está corroborado.

La causa técnica encontrada en `auditoria-cobertura-original-b5l.ts` es específica: el barrido final de filas visibles no atribuidas **retornaba en la primera fila desconocida**. Si hubiese **después** de ella un `IVA`, un `flete`, una cláusula de descuento, un importe o porcentaje, el diagnóstico final sería solamente `unmapped_text`. No se daba permiso de publicar, pero podía **subestimar la categoría de riesgo** y sesgar las prioridades de revisión. No hay evidencia en el diagnóstico histórico guardado para afirmar qué contienen las cinco filas reales; no clasificarlas como encabezados por defecto.

## Corrección

- Barrer **todas** las filas PDF.js restantes, preservando el cotejo previo de SHA, materiales, notas comerciales, condiciones y total.
- Conservar únicamente la tolerancia estructural **ya existente** para encabezados de columnas estrictamente reconocidos (y filas de texto vacío). Nombres, CUIT, fechas y cláusulas desconocidas **siguen bloqueadas**.
- Si hay algún fragmento fiscal/logístico sin atribuir: `unmapped_fiscal_or_logistics`. En ausencia de ello, si queda moneda, monto o porcentaje: `unmapped_monetary_or_percentage`. Si quedan otros textos no identificados: `unmapped_text`. Solo si no quedan filas: `visible_rows_accounted_private`.
- **Nunca** devolver fragmentos de texto, precios, teléfono, CUIT, HMAC/SHA o coordenadas en el resultado; los contadores de filas permanecen exactos y no se autorizan contactos, ranking ni publicación.
- **No modificar** el contrato del ledger privado ni el formato del worker: se usa el `coverage_code` existente, así que no se crea ninguna tabla o versión nueva B5p y no hay migración SQL.

## Pruebas

- **Node:** desconocido seguido de IVA, desconocido seguido de importe, importe seguido de flete, porcentaje sin atribuir, cinco filas desconocidas sin aceptación, encabezado estricto después de texto desconocido, valor de transporte con precio y metadatos como CUIT sin exposición.
- **Deno/PDF.js:** genera originales PDF sintéticos con SHA, incluye texto desconocido seguido de IVA explícito y, por separado, seguido de dinero. Ningún escenario permite `can_publish`, `can_rank` o `can_reveal_contacts`.
- **CI general y PG17 ROLLBACK:** proteger el lector, el catálogo, los ledgers privados, el proveedor y la vista del comprador. No declarar éxito hasta obtener controles de GitHub sobre el HEAD final.

## Estado comercial del piloto (consulta privada de solo lectura)

- `requests`: 2 `draft`, 1 `prepared`, 4 `closed`. Invitaciones: 8 `prepared`, 2 `cancelled`. **No interpretar automáticamente `prepared` como una ronda activa o aprobada**.
- 4 presupuestos de medios en `awaiting_fidelity_check`, 10 renglones históricos en espejo y **0 ofertas anónimas nuevas publicadas**.
- 3 fuentes en `ambiguous_round`. Diagnósticos de correlación: `insufficient_material_evidence`, `independent_reads_disagree`, `multiple_indistinguishable_rounds`. No asignar por proximidad horaria ni crear una nueva ronda para ocultar esas dudas.
- Comprador: las vistas privadas de cobertura/precios `MVP175/186/204/210` y comparación B6 **ya existen**. No duplicarlas. Para usarlas en el piloto deben recibir **fuentes verificadas y correctamente asociadas a la ronda**.
- 5 flags V2 OFF, 0 leases, B5k/B5m/B5n/B5o=1 cada uno, `whapi_outbox=6`, sin nuevos mensajes. Este PR solo contiene código y pruebas.

## Orden del trabajo pendiente, sin desarrollar indefinidamente

1. Evidencia original: las **cinco filas reales** requieren clasificación fundada (texto estructural vs. cargo/flete/IVA vs. otra condición), manteniendo el PDF original, su hash y privacidad. El cambio B7 evita diagnósticos falsamente benignos, **pero no prueba el contenido histórico por sí solo**.
2. Fidelidad y vinculación: resolver las rondas candidatas con evidencia de materiales/unidades, no por fecha o por orden de WhatsApp; asociar PDFs/Excel originales a la ronda y proveedor correctos.
3. Economía: totales, descuentos, IVA, flete, moneda y condiciones explícitas; no convertir ausencia de IVA en 0%, flete sin precio en gratis, ni `$` en ARS por defecto.
4. Reutilizar B6 y los módulos del seguimiento para mostrar **cobertura y subtotales acreditados**, distinguiendo parciales y rubros. Nunca enfrentar totales de canastas distintas, adjudicar automáticamente ni revelar contacto del comprador.
5. Prueba WhatsApp → 2 proveedores → recepción de ofertas → seguimiento del arquitecto → cierre/revelación conforme a reglas aprobadas, solo en piloto tras orden de publicación.

**Decisión:** no crear otro replay privado B5p automáticamente. El bloqueo P0 del piloto E2E sigue [Issue #750](https://github.com/ProtectorRudo/Cotironda/issues/750); este PR corrige el riesgo de subdiagnosticar filas posteriores, no certifica la oferta histórica.
