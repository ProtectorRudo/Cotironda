# Acta 505 — B5m: suma de artículos y condiciones compartidas en PDF

**Fecha:** 11/11/2026. **Autorización:** «Luz verde», solo desarrollo y pruebas.
**Rama:** `fix/v2-flete-condiciones-fila-compartida-20261111`.
**PR:** [#777](https://github.com/ProtectorRudo/Cotironda/pull/777), apilado sobre [#776](https://github.com/ProtectorRudo/Cotironda/pull/776), SIN merge.
**Estado del piloto:** B5k+B5l publicados previamente en Edge sombra V2 **v8** y cinco flags apagados. **B5m NO desplegado**.

## Causa real de los cambios

La relectura privada del segundo PDF histórico (Acta 504) comprobó símbolo monetario `$` uniforme y 3/3 materiales con aritmética cotejada, pero terminó con:
- `fiscal_or_freight_ambiguous`: una condición menciona flete **sin importe ni declaración de incluido/gratuito**.
- `line_assignment_ambiguous`: al menos una condición comercial comparte una fila geométrica con un renglón de material.
No se comprobó el total final, la moneda ISO, la cobertura gráfica completa ni el derecho a publicar/rankear ofertas.

## Decisión comercial B5m: comprobar lo conocido sin afirmar lo desconocido

B5j ahora registra `material_total_matches_declared=true` cuando la suma exacta en centavos de los **renglones documentados** coincide con la cifra candidata del original, aun si el flete u otro tratamiento fiscal sigue sin resolver. **El código de salida permanece `fiscal_or_freight_ambiguous`** y el campo `freight` es `mentioned_unpriced` cuando se menciona sin importe.

Esto significa exclusivamente «coinciden las líneas de artículos/precios explícitos y la cifra candidata». **NO significa que ese sea el importe final pagadero.** No se introduce un valor cero para flete, no se supone IVA incluido/excluido y no se compara un total incompleto contra un total con cargos conocidos. Si las líneas difieren un centavo, el indicador de coincidencia sigue en `false` aun cuando haya un flete no cotizado.

No se exponen montos al comprador desde B5m y todas las banderas permanecen `source_verified=false`, `full_document_covered=false`, `can_publish=false`, `can_rank=false`, `can_reveal_contacts=false`. El indicador de suma privada deberá utilizarse **junto con** el estado de flete, IVA y cobertura para cualquier futura presentación de subtotales comparables; jamás como verificación del total final.

## Decisión técnica B5m: atributos por fragmentos originales, no por substring

Se modificó el módulo B5l que ya existe (no se incorporó nueva tabla, RPC, cola, Edge ni modelo):
1. Una condición encontrada en la misma fila que un material puede atribuirse **únicamente si toda su expresión está en uno o varios fragmentos PDF.js consecutivos e independientes**.
2. Cada fragmento queda reservado a un solo concepto. La condición no puede apropiarse del nombre del material, de cantidades, de una celda de importe, ni de texto fiscal o comercial adicional.
3. Solo se excluyen del examen de ese material los fragmentos de condiciones expresamente comprobados. Se siguen detectando cargos ocultos, porcentajes IVA, importes en celdas adicionales y condiciones parciales.
4. Una condición mezclada con la descripción del material **dentro del mismo fragmento** continúa siendo ambigua; no se elimina ese bloqueo por comodidad.
5. Varias condiciones completas en la misma fila pueden corroborarse si ocupan fragmentos independientes y no se reutilizan. Las condiciones y notas sin precio permanecen visibles en el diagnóstico, sin inventar condiciones de pago/entrega.
6. `visible_rows_accounted_private` continúa significando solo cobertura de filas **visibles por PDF.js**, nunca certificación de un PDF escaneado, gráfico o de campos no extraíbles.

## Pruebas realizadas

- **Node:** flete mencionado pero no cotizado y subtotal coincidente/diferente, gratis explícito, IVA 21 % ambiguo; condiciones separadas de la fila material, múltiples condiciones/celdas, texto fragmentado en varias partes, descripción/condición mezcladas en un mismo fragmento, cargos extra, IVA oculto y uso duplicado de texto.
- **Deno/PDF.js:** PDF sintético REAL con material y texto de flete en la **misma coordenada vertical** pero dos fragmentos independientes, censo de cobertura privado y suma de artículos coincidente sin certificar el importe pagadero.
- **PostgreSQL 17 con rollback:** los controles de RLS, modos exclusivos, ledger privado y campos permitidos no cambiaron.
- **Regresión completa:** **3.917 tests, 3.907 aprobados, 10 omitidos y 0 fallas** en la última batería de código comprobada. Workflow específico 4/4 jobs `SUCCESS`.
- **CI general:** ejecutar y confirmar workflows sobre último HEAD antes de declarar el cierre de desarrollo.

## Criterios antes de la prueba real

B5m debe publicarse solamente después de una orden distinta **«Publicalo»** y solo en `cotironda-piloto`. La relectura del PDF 2 tendrá que usar ejecución versionada que permita constatar los cambios **sin reutilizar falsamente el estado B5k anterior ni alterar la prueba histórica**, con rollback o nuevo ledger privado según corresponda. No reactivar todos los workers ni enviar WhatsApps durante la comprobación económica.

Tras la prueba real, concentrar el desarrollo en el circuito E2E: solicitud por WhatsApp, recepción automática de cotizaciones de varios proveedores, revisión económica y de equivalencias deterministas, vista de subtotales/condiciones por rubro y cierre/revelación según las reglas. **No crear rondas engañosas ni anunciar el piloto completo antes de probarlo.**

Fuentes: [Acta 504](504-v2-b5k-b5l-publicacion-piloto-moneda-flete-cobertura.md), código y tests de los PR #775–#777.
