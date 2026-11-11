# Acta 494 — B5f: cotejo del total original y descuento por columna PDF

**Fecha:** 11 de noviembre de 2026. **Autorización:** «Luz verde» para desarrollar/probar, **sin desplegar ni enviar WhatsApps**. Rama: `feat/v2-b5f-cotejo-pdf-total-descuento-posicional-20261111`; [PR #770](https://github.com/ProtectorRudo/Cotironda/pull/770) sobre [PR #769](https://github.com/ProtectorRudo/Cotironda/pull/769), dependencias #768 y #767.

## Evidencia real que motivó el cambio

El 11/11/2026 la publicación privada de B5d en `cotironda-piloto` reauditó **2 PDF históricos** desde bytes originales y persistió 2 candidatas privadas con **7 renglones** (5 materiales y 2 notas). Los renglones individuales corroboraron su descripción/cantidad/precio literal, pero los dos documentos quedaron `source_total_unverified`, y los cinco materiales `list_vs_effective_ambiguous`. No se publicó presupuesto, ranking ni contacto; flag V2 se apagó y se corroboró que permanece apagado.

**Causa de diseño comprobada:** el lector PDF existente (PDF.js/unpdf) calcula la posición `x/y` de cada fragmento, pero antes devolvía únicamente `{page,text}`. Por eso un renglón con `22,4%` no demuestra que esté bajo el encabezado «Descuento»: sin geometría solo es un porcentaje suelto. El cotejo del total exigía una aparición textual literal del símbolo `$` dentro de una línea etiquetada «TOTAL»; no contemplaba un total sin símbolo o con etiqueta e importe en líneas inmediatas separadas. **No se infiere que esos sean los formatos de los dos originales sin reejecutar el lector; son fallos generales del verificador comprobados en el código.**

## Solución privada B5f

1. El **lector independiente de V2** `pdf-geometry-b5f.ts` conserva el `y` de fila y fragmentos `{x,text}` de PDF.js. Usa la misma librería fijada `npm:unpdf@2.1.0` y límites de páginas/tamaño, sin OCR. El archivo `supplier-source-pdf-general.ts` del webhook Whapi **NO se modifica**: su huella MVP332 queda exactamente igual. Los consumidores originales conservan su contrato `{page,text}`. Esta separación fue exigida por las regresiones de seguridad MVP332/MVP336.
2. `comprobarRenglonesPdfOriginalB5` requiere una sola etiqueta de total y un importe monetario argentino cuyo valor en centavos coincida exactamente con el declarado por el proveedor. Acepta símbolo `$` opcional y etiqueta con importe en la **fila siguiente inmediata, de la misma página y sin texto adicional**. Prohíbe múltiples totales, IVA/flete/descuentos en esa fila, importes extra y un importe aislado sin etiqueta. **No calcula el total a partir de otras filas para autenticarlo.**
3. Cada material solo obtiene una observación privada `discount_evidence` si el porcentaje del PDF está etiquetado inequívocamente como descuento en la misma fila, o está en un fragmento posicionado cuya `x` coincide con un encabezado anterior de descuento en la misma página. Rechaza encabezados ambiguos, otras tasas IVA/impuestos, porcentajes múltiples, valores mayores al 100%, coordenadas inválidas y encabezados demasiado lejanos. El encabezado usado queda reclamado para que no aparezca erróneamente como una omisión, pero nunca puede cubrir cargos o términos externos.
4. `auditarComercialPrivadoB5` recibe **solo desde el servidor** la tasa observada en fuente SHA-verificada y el renglón correspondiente. Aplica centavos y milésimas deterministas con `BigInt`. Si el modelo contradice el porcentaje de fuente, rechaza por `conflicting_explicit_discount`. Si la IA ya declaró el precio unitario efectivo, no lo descuenta dos veces. Si no existe prueba independiente, conserva `list_vs_effective_ambiguous`.
5. B2 y B5d registran los códigos de total, fuente del descuento y resultado aritmético en sus diagnósticos **privados**. En ninguna rama se escribe en ofertas, ranking, tracking, contactos ni Whapi.

## Invariantes de seguridad

- El SHA original debe coincidir antes de usar la geometría; los renglones no localizados o ambiguos no generan evidencia de descuento.
- `source_verified=false`, `full_document_covered=false`, `discount_column_verified=false` **a nivel de documento**, `can_publish=false`, `can_rank=false`, `can_reveal_contacts=false` invariables incluso si un total y una tasa coinciden. La evidencia de columna **no certifica toda la tabla**: pueden faltar cargos, rubros, fórmulas, condiciones, montos sin `$` o páginas.
- Si no hay mención IVA o flete en el original, no se añade frase de IVA/flete; un valor monetario no autoriza sumar IVA ni transporte.
- Todo queda fuera de la función de WhatsApp y de las APIs del comprador. B5f no modifica SQL ni agrega cron, roles o secretos.
- La versión ya publicada en el PILOTO (B5d, Edge V2 v3) **no cambia por este PR**. La reauditoría de los mismos dos PDF necesita futura ruta privada versionada y autorización explícita de publicación; jamás se reinician leases históricos ni se altera el ledger original.

## Pruebas de aceptación

- Totales únicos etiquetados con y sin símbolo `$`, monto solo en la fila siguiente, sin reconstruir suma a partir de productos.
- Total contradictorio/duplicado, IVA/flete en total, monto no atribuido y páginas mezcladas → revisión privada.
- PDF con descuento posicional alineado, descuento literal en la línea, encabezado equivocado/lejano, faltante o sin geometría → no se inventa porcentaje.
- `22,4%` correctamente respaldado → el cálculo puede coincidir en privado con la lectura histórica de Ailín, pero sin promocionar la candidata.
- Conflictos 19% vs 22,4%, aplicación doble del descuento, IVA silencioso, SHA alterado, celdas omitidas → bloqueos.
- CI Node de B5/B5f, trabajadores B2/B5d, Deno Edge completa; suite general de GitHub, seguridad, Next.js y DB sin cambios.

**No confundir pruebas sintéticas con cotejo real de Ailín.** Estado final se constata únicamente con GitHub Actions; sin «Publicalo» no hay ejecución sobre el piloto.

## Verificación reforzada — PDF auténtico sintético

Se añadió `tests/deno/b5f-geometria-pdf-real.test.ts`: genera en memoria un PDF 1.4 real con sus objetos, tabla de referencias y fuente Helvetica integrada, con posiciones de cantidad, descripción, precio de lista, «Dscto.», 22,4% y total declarado. El test llama al lector V2 **real** (`npm:unpdf@2.1.0`), comprueba x/y y luego coteja el mismo PDF mediante el auditor B5f. En GitHub Actions **pasó 1/1** (y el chequeo de tipos completo) en el [workflow B5f](https://github.com/ProtectorRudo/Cotironda/actions/workflows/cotironda-v2-b5f-total-y-descuentos-posicional.yml), sin OCR, API de IA ni archivos de proveedores.

Durante la regresión general se detectaron **seis fallos por huella fija del lector Whapi MVP332** al modificar el módulo PDF compartido. La arquitectura se corrigió: el lector original fue restaurado al Git blob original y la geometría se aisló en `cotironda-piloto-v2-shadow/pdf-geometry-b5f.ts`. Esta corrección está cubierta nuevamente por la suite general. No debilitar la comprobación de huella ni actualizar manifiestos para esconder la deriva.
