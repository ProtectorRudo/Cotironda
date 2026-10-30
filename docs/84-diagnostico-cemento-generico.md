# 84 — D021: diagnóstico del fallo LIVE de cemento genérico

**30/10/2026 · Issue #141 · rama `fix/02-cemento-generico-diagnostics` apilada sobre PR #140.**
No hay habilitación comercial ni nuevas inferencias pagadas.

## Evidencia y límites
Se confirmó en Supabase DEV que el caso `cemento_generico_sin_especificacion_inventada` consumió una reserva D018 y produjo un resultado `edge_runtime` con 0/1 extracción exacta, 0/1 proveedores, un artículo no reconocido y una línea retenida por segmento sin extracción. La respuesta original de IA no fue guardada: **no es posible afirmar cuál campo propuso el modelo ni cuál fue el rechazo exacto**.

Código auditado:
- `fuenteCantidadUnidad` en `src/server/openai-extraccion.ts` comprueba correspondencia literal de descripción, cantidad y unidad en la fuente, sin inventar equivalencias. Cuando no encuentra la evidencia, agrega `cantidad_sin_evidencia`; además marca `origen_no_verificado` si la descripción no figura en el texto de origen.
- El benchmark `evaluarCalidadInvitacionesPorProducto` exige descripción, cantidad, unidad, rubro y producto_id equivalentes al gold. Un artículo extraído pero rechazado aparece como 1 omitido y 1 alterado/no reconocido en el scorer; **no es lo mismo que cero propuestas del modelo**.
- Con salida MOCK que replica literalmente el gold (texto «10 bolsas de Cemento» → descripción «Cemento», cantidad «10», unidad `bag` y rubro `corralon`) el flujo debe pasar. Las variantes con unidad errónea, descripción inventada, cantidad incorporada indebidamente al nombre o cantidad diferente deben permanecer retenidas.

## Ajuste conservador
Se clarificó el prompt de extracción para exigir descripción literal del material **sin la cantidad solicitada, unidad de compra ni conector anterior**, usando un ejemplo ajeno al gold («7 bolsas de arena gruesa»). Se refuerza que no debe agregar CPC, CPN, marca, peso ni tipo si no aparece en el documento. No se relaja la validación determinista de evidencias ni el matcher comercial. Se mantiene la copia byte-idéntica en Edge.

## Diagnóstico sin contenido
`supabase/functions/cotironda-ia-dev/lab.ts` cuenta: `items_propuestos`, `items_con_aclaracion`, `origen_no_verificado`, `cantidad_sin_evidencia`, `segmentos_sin_extraccion` y `items_retenidos`. Todos son números derivados del plan y no revelan texto, respuestas crudas, SKU, proveedores, marcas o credenciales. Se agregaron columnas numéricas acotadas opcionales en `public.dev_ia_quality_results` mediante `supabase/sql/dev_quality_numeric_diagnostics.sql` para futuras corridas; los cuatro registros históricos quedan con campos NULL, sin retrodiagnosticar.

La nueva respuesta de Edge incluirá el bloque numérico. La misma función de persistencia guarda estos números solo después de una inferencia ya autorizada, sin reintento ante error de base. Las claves, credenciales, auth secret, flags, case ID permitidos, reserva D018 y límite de 6 **no cambian**.

## Pruebas y aceptación
1. Suite `tests/unit/cemento-generico-regresion.test.mjs` con MOCK sin API: gold literal, mayúsculas, unidad equivocada, atributos inventados, cantidad en descripción, cantidad inventada y omisión total.
2. CI: unit, Deno Typecheck, Next, PostgreSQL y otros workflows. Sync byte exact Edge/source.
3. Migración solo en `cotironda-dev`; comprobar columnas, grants, RLS y que siguen intactas las cuatro claims/resultados. No registrar datos nuevos ni habilitar CRON.
4. Desplegar Edge **solo DEV** una vez aprobados los tests y revisión de esquema, pero no ejecutar `quality_case` sin autorización posterior basada en análisis de resultados.
5. Probar `mode:status` sin gasto y verificar cuota sigue 4/6. No reintentar caso consumido; quedan dos casos sin ejecutar.

**Interpretación:** mayor claridad del prompt y diagnósticos mejores NO constituyen prueba de haber corregido la falla real. Debe mantenerse abierta la investigación hasta nueva evidencia independiente.
