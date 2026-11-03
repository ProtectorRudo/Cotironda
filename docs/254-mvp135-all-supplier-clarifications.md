# MVP-135 — Todas las aclaraciones del proveedor en el presupuesto

**03/11/2026 · Issue #482 · trabajo en desarrollo, sin producción.**

## Regla de negocio

El comercio envía una sola vez por WhatsApp su cotización, de la manera que quiera. Cotironda registra íntegros el original, todos los artículos (también extras), sus valores literales y las condiciones comerciales. No pide un segundo CONFIRMO ni obliga al proveedor a iniciar sesión.

- Conceptos monetarios añadidos, como pallets/bolsones vacíos cobrados, flete fijo, descuentos o seguros, son RENGLONES del presupuesto y no se esconden bajo aclaraciones.
- Las condiciones no desglosadas como importe, por ejemplo **PRECIOS LISTA 7**, **PRECIOS DE PAGO CONTADO EN EFECTIVO**, **FLETE A CONVENIR**, **DEVOLUCIÓN DE PALLETS**, entregas, embalajes retornables, medio de pago y vigencia se conservan en **ACLARACIONES DEL PROVEEDOR**. No hay una lista cerrada de términos: toda condición explícita y legible pertenece al presupuesto.
- El campo privado histórico de IA llamado requested_delivery_note almacena todas estas condiciones, no solo la dirección de entrega. Las notas pueden tener hasta 4096 caracteres y no se recortan silenciosamente. El original sigue íntegro en Storage privado.
- La descripción, precio unitario declarado, cantidad, importe de línea y TOTAL declarado son campos DISTINTOS: no recalcular ni alterar los literales ni suponer que un precio de lista es el unitario de contado. Descuento efectivo, impuesto, moneda, devolución o disponibilidad solo se afirman si aparecen inequívocamente en la fuente.
- Si faltan IVA, stock, flete o código de moneda, marcarlos como **no informados** sin interrumpir el registro ni preguntar al proveedor por cada detalle. Para comparar ofertas y elegir finalistas, sí exigir condiciones verificables.

## Código

1. Se ajusta el prompt de extracción estructurada para preservar TODAS las aclaraciones que aparecen en PDF, Word, Excel, imágenes y texto, sin resumirlas ni inventarlas. Se amplía el margen de notas privadas y se separan dudas genuinas de datos simplemente no informados.
2. El comprobador PDF de tablas admite una cantidad numérica aislada antes de precios explícitos incluso cuando el proveedor no indicó unidad. No infiere bolsa por el nombre cemento 25 kg. Maneja cantidades decimales que de otro modo podrían parecer importes sin signo $.
3. Se verifica que las líneas fuente sobre PRECIOS LISTA 7, contado/efectivo, flete o pallets estén enteras en las aclaraciones. Una línea con importe monetario extra no puede quedar oculta en notas.
4. Migración separada y retrocompatible del renderizador SQL MVP107: añade el bloque ACLARACIONES DEL PROVEEDOR al texto del presupuesto anónimo aprobado, tal como lo capturó el borrador corroborado. Se conservan todos los requisitos anteriores de hash, dos lecturas, fuente independiente, aritmética de líneas, última versión, identidad/consentimiento, PII, RLS y ausencia de ranking engañoso.
5. No se modifica la fuente ni se reescriben presupuestos antiguos; no se envían mensajes nuevos. Todo se presenta con fidelidad, sin revelar identidad del negocio mientras dure la ronda.

## Pruebas

- PDF posicionado sintético de dos renglones con cantidades 40,00 y 1,00 sin unidad, productos de 25 kg y 5 L, precios unitarios de lista distintos de los importes de línea, total igual a suma literal, y 5 notas comerciales.
- Omisión de una nota -> fuente no cubierta; un cargo monetario camuflado como nota -> rechazo; cantidad inferida del peso del producto -> rechazo.
- Un dato de IVA, disponibilidad o moneda que no se pudo determinar mantiene el estado de comparación pendiente.
- SQL recompilado en transacción con ROLLBACK sobre PILOTO: conservados los grants service_role y las negativas a anon; no modifica la función instalada hasta autorización de publicación.
- Tests unitarios y Deno más CI GitHub; prueba económica de precio condicionado futura por separado: no declarar aprobación total de cotización sobre mera transcripción.

## Pendiente para piloto end-to-end real

El PDF de Ailín ya cuenta con borrador original privado de 2 líneas, pero su doble lectura previa discrepó en metadatos, las 3 dudas quedaron registradas e importes de lista no multiplican los importes de línea. Por seguridad, ese caso NO se convierte automáticamente en presupuesto aprobado o comparable. El modelo y la interfaz de comparación deberán incorporar el concepto de precio de lista y precio final según condiciones explícitas, moneda, IVA y fletes; solo después de verificarlos se podrán mostrar resultados comerciales y seleccionar finalistas.
