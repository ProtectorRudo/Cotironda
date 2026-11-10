# Acta 491 — B5, IVA y flete solo explícitos; descuentos deterministas

**Fecha:** 10/11/2026. **Autorización:** «Luz verde», SOLO código, pruebas y documentación. **Sin deploy a Supabase**, sin merge del PR; el piloto V2 sigue apagado tras las dos lecturas privadas. **Fuentes:** Acta 490, Issue #766, PDFs archivados de Ailín, y contrato V2.

## Regla comercial obligatoria aprobada por el usuario

- Si **el proveedor no menciona IVA**, NO agregar `IVA incluido`, `sin IVA`, `IVA no informado`, 21% ni ningún cargo fiscal. La salida visible debe omitir la clave de IVA. Internamente se conserva la ausencia como ausencia, sin convertirla en certeza fiscal.
- Si **el proveedor no menciona flete/envío/transporte**, NO agregar envío incluido, gratis, sin cargo, a convenir, monto, disponibilidad ni condición alguna. La salida visible debe omitir la clave de flete.
- Si dice «IVA incluido», mostrar exactamente la mención y clasificarlo como incluido explícito. Si dice «sin IVA», excluir explícitamente. Si dice solo «IVA 21%» o «IVA según factura», NO deducir si está incluido en el precio.
- Si dice «flete a convenir», mantener el literal, SIN costo numérico. Si dice explícitamente «flete $15.000», conservar importe literal sin sumarlo automáticamente al total antes de auditar si ya está comprendido.
- Si falta una cantidad, unidad, condición de pago, fecha, marca, moneda o descuento, tampoco inventar. Marcas equivalentes se evalúan en etapa posterior, no se cambian en la lectura.
- Cotironda jamás obliga a comprador o proveedor a completar formularios adicionales para corregir datos que puedan verificarse del original.

## Implementación privada

- `src/domain/presupuestos-v2/auditoria-comercial-b5.ts`: analiza la estructura V2 ya existente, sin cambiar el contrato live ni sus tablas; devuelve **solo condiciones expresamente mencionadas**. Metafrases generadas por IA como «IVA no informado»/«flete no especificado» se omiten.
- Conversión numérica argentina estricta a **BigInt centavos**, cantidades en milésimas y descuentos en puntos básicos. Rechaza separadores ambiguos y no hace conversiones de moneda.
- Reconcilia `precio de lista × (1 − descuento etiquetado)` **redondeando primero cada unidad a centavos**, luego multiplicando por cantidad; esto coincide en los cinco renglones de los dos PDF de Ailín, sin tolerancias artificiales. Para descuento solo presente en la lectura anterior archivada, `discount_origin='historical_unverified'` (NO evidencia independiente).
- Nunca **infiera un descuento** porque el subtotal sea inferior a cantidad × precio. Un 22,4 % sin la etiqueta «Dscto./Descuento» en el texto V2 y sin evidencia histórica etiquetada no se convierte en condición económica.
- Los renglones de notas (pago contado, flete a convenir) **no cuentan como materiales** ni inflan cobertura. Cargos adicionales/pallets tampoco desaparecen: se conservan, y el total de **solo materiales** puede diferir del general legítimamente.
- `lector-sombra.ts` B1 incorpora instrucciones explícitas: no agregar frases predeterminadas de IVA/flete y conservar la etiqueta del descuento tal como figura en el archivo. **No se desplegó esta versión del prompt**: la Edge publicada en piloto sigue con el código anterior hasta «Publicalo».

## Hallazgo del caso real reproducible

### PDF privado Ailín 1 (2 artículos)

| Artículo | Cant. | Precio unitario de lista | Desc. explícito en lectura previa | Subtotal declarado |
|---|---:|---:|---:|---:|
| Cemento Avellaneda 25 kg | 40 | $9.798,58 | 22,4 % | $304.148,00 |
| BIG BAG arena | 3 | $70.830,98 | 22,4 % | $164.894,52 |

Total leído $469.042,52. Para cemento, $9.798,58 × 0,776 = $7.603,69808; redondear el unitario a **$7.603,70** y multiplicar 40 da $304.148,00. Redondear recién después de multiplicar hubiera producido $304.147,92: 8 centavos de diferencia.

### PDF privado Ailín 2 (3 materiales + 2 notas)

| Material | Cant. | Unitario lista | Desc. etiquetado en lectura previa | Subtotal declarado |
|---|---:|---:|---:|---:|
| Cemento Avellaneda | 15 | $17.024,70 | 22,4 % | $198.167,55 |
| BIG BAG arena | 2 | $70.830,98 | 22,4 % | $109.929,68 |
| BIG BAG piedra | 1 | $109.218,23 | 22,4 % | $84.753,35 |

Total leído $392.850,58; menciona «precios en efectivo» y «flete a convenir». Si un documento carece de IVA, no mostrarlo. Este cálculo solo **reproduce la coherencia de transcripciones**: no reemplaza la verificación independiente del PDF original.

## Pruebas

Casos sintéticos Node: dos PDF reales reconstruidos con sus cinco importes, redondeo unitario vs total, metafrases fiscales falsas, IVA incluido/excluido/solo tasa, flete ausente/a convenir/expreso, cargos, dos notas no materiales, descuentos contradictorios o inventados, CSV de números inválidos, unidad/cantidad ausente, parcialidades y privacidad. Deno tipa módulo B5, contrato B1, lector y worker. CI general no debe romperse.

## Pendientes para que el piloto funcione completo

1. **B5 fuente por campo:** comprobar descuentos, unidades, IVA/flete y totales contra PDF/Excel original mediante un auditor independiente y SHA, no por acuerdo de dos modelos. Habilitar auditoría por página/celda y resultado por renglón, bloqueando solo los dudosos.
2. **Planilla Nahuel:** su Excel y PDF ya están vinculados a rondas; B2 actual solo lee archivos sin `request_id`. Implementar ruta sombra versionada segura para fuentes YA asociadas, lectura de todas las celdas, límites, y prueba sin reenvío de WhatsApp.
3. **B6 ranking:** comparar materiales equivalentes con cantidades/unidades/IVA/flete y cobertura; nunca totales de pedidos distintos. Calcular combinaciones de hasta dos proveedores con matemática determinista.
4. **B7 seguimiento real:** mostrar ítems verificados en el enlace del comprador, conservar originales y anonimato durante ronda, revelar proveedores al cierre y contactar ganadores según permisos, con pruebas E2E reales.

**Estado honesto:** la lectura de los dos PDF Ailín de punta a punta en sombra ya funciona; **no** se han acreditado ofertas comerciales ni se ha probado el Excel de Nahuel por V2; no hay fecha garantizada de piloto final antes de cerrar B5/B6/B7. **No publicar este módulo con «Luz verde»**.
## Segunda protección B5 — cotejo independiente de renglones contra PDF original

Se añadió `src/domain/presupuestos-v2/evidencia-pdf-original-b5.ts`, que reutiliza **el lector posicional PDF.js/unpdf ya presente en Cotironda** (`supplier-source-pdf-general.ts`) en lugar de crear otro extractor. Siempre opera sobre **bytes originales SHA256 comprobados**, no una imagen que devuelve otro modelo.

Para cada renglón comprueba en una fila concreta y página del PDF: descripción literal, cantidad fuera de las medidas del producto (25 kg ≠ 25 bolsas), precio unitario y subtotal citados. Rechaza archivos alterados, PDFs sin texto, páginas incompatibles, filas duplicadas ambiguas, precios imaginados y notas comerciales que el borrador añadió pero no aparecen en fuente. Los errores retornan **códigos neutros sin datos personales**, y las pruebas no usan ningún archivo real.

**Limitación deliberada:** incluso si todas las filas del borrador coinciden, la fuente puede tener **filas extra no capturadas, IVA, flete, descuentos de columna, importes o totales**. El resultado conserva siempre `full_document_covered=false`, `discount_column_verified=false`, `can_publish=false` y `can_rank=false`. Esto **no** constituye auditoría integral ni permite publicar; solo agrega evidencia independiente por renglón para B5/B6.

Pruebas adicionales: PDF original SHA verificado, integridad alterada, cantidad confundida con tamaño, documento escaneado, mención inventada de IVA, filas duplicadas, datos no cubiertos, fallo del lector, falta de ubicación y notas verdaderamente presentes. CI B5 Node + Deno completo resuelve `npm:unpdf@2.1.0` con `--node-modules-dir=auto`, sin descargar PDF privado ni llamar OpenAI.

**Próximo trabajo obligatorio:** enchufar este verificador al worker protegido, ejecutar lectura real del PDF ya guardado sin crear otra oferta ni resetear el ledger histórico, resolver descuento explícito mediante encabezado de columna y corroboración de todos los importes, y después soportar Excel de Nahuel vinculado. No confundir coincidencia de filas con cobertura total.