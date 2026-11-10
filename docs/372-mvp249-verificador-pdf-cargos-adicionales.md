# Decisión 372 — Verificador PDF acepta cargos sin cantidad inventada

Fecha: 06/11/2026. Etapa 3 de Cotironda. MVP249, solo desarrollo.

## Hallazgo

Aunque el puente documental MVP247 conservaba un flete con importe
final sin cantidad/precio unitario, la segunda barrera sobre el PDF
original (`checkGeneralPdfSource`) lo rechazaba: exigía que
**todas** las líneas tuvieran cantidad, unitario y total.

Eso impedía que un presupuesto genuino, con materiales y flete fijo,
llegara a la revisión privada IA Central aun cuando el PDF textual
original y su SHA hubieran sido acreditados.

## Regla corregida

- Los renglones de material conservan la comprobación original de
  cantidad expresada y precio por unidad.
- Los cargos, descuentos y pallets pueden carecer **conjuntamente**
  de cantidad y unidad si no las trae el original. Un precio unitario
  declarado sin **cantidad** sigue bloqueado. Una unidad omitida
  con cantidad expresamente acreditada (por ejemplo «40,00»)
  permanece válida: la fuente no debe inventar «bolsas» o «unidades».
- Un importe final solo se acepta si aparece literalmente, con su
  propia frecuencia, en la misma fila del PDF.
- Si una fila sin cantidad/unidad contiene números adicionales que
  no están ni en su descripción ni en el importe declarado (por
  ejemplo distancia de flete omitida, alícuota/porcentaje), queda
  en revisión. No se inventa esa información.
- Los renglones sin cargo también se mantienen cuando coinciden
  con el texto original, sin exigir un importe inexistente.
- Todos los importes del documento, notas, totales finales,
  datos personales y escaneos siguen sometidos a los mismos
  controles independientes de fuente. El resultado exitoso del
  verificador sigue siendo **no publicable por sí solo**:
  `publicationAllowed=false`, `rankingAllowed=false`; SQL MVP246
  exige además doble lectura, publicador anónimo y consentimiento.
- No se introduce OCR ni una credencial adicional y no se altera
  el esquema SQL, el webhook, ni la política de imágenes.

## Criterios de aceptación

Pruebas unitarias con PDF simulado de material+flete sin unidad+
pallet sin cargo; ausencia o duplicación de cifras; números no
reconocidos en el flete; precio unitario sin cantidad;
escaneado y datos de contacto. CI general Deno, Node,
seguridad PostgreSQL 17 y compilación Next.

No publicar ni afirmar E2E real. La etapa 3 todavía necesita
la instalación autorizada en PILOTO y la validación de imágenes
y presupuestos reales.
