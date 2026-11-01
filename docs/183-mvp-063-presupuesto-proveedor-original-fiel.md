# 183 — MVP-063: integridad 100% del presupuesto original del proveedor

**01/11/2026 · Decisión de negocio explícita · Issue #339.** La copia integral de cada presupuesto tiene prioridad sobre la extracción de los materiales que pidió el comprador.

## REGLA APROBADA: el proveedor define su propio presupuesto

**La solicitud del arquitecto NO es el esquema que limita el contenido de la cotización.** Un corralón puede agregar pallets vacíos, bolsones vacíos, bolsas, envases, embalajes, entrega, fletes, seguros, gastos, créditos, descuentos, devoluciones, otros productos, observaciones, IVA y el total. Cotironda debe mantener **TODOS** esos renglones, incluso si no existían en el pedido, **sin modificar** descripciones, orden, unidades, cantidades, precio unitario, importe de línea, moneda, impuestos, descuentos, condiciones ni el total **tal como fueron declarados**.

La IA puede **explicar, clasificar y comparar por separado**. NO puede modificar la copia original ni eliminar artículos fuera de alcance de la solicitud. Si el texto está mal escrito, posee una suma incorrecta o usa una unidad inesperada, la copia original **sigue siendo literal**; la plataforma añade un aviso y, si es comprobable, un cálculo *distinto*. Si el archivo es una imagen, PDF, Excel o Word, el archivo original debe quedar disponible inalterado con un hash de contenido (almacenamiento privado/versionado). Nunca depender solo de lo que la IA interpretó del archivo.

### Ejemplo comercial obligatorio

Solicitud del arquitecto: cemento.

Texto auténtico del corralón (ficticio):

```text
20 bolsas cemento CPC 50 kg x $ 9.500,00 = $ 190.000,00
2 pallets vacíos $ 7.000,00
3 bolsones vacíos $ 1.500,00
Flete a obra $ 12.000,00
Descuento comercial -$ 3.000,00
TOTAL FINAL: $ 217.500,00
```

En **Presupuesto del proveedor** se visualizan **todos** esos renglones, conservando los dos importes de la línea de cemento (unitario y renglón), los pallets/bolsones y el literal `$ 217.500,00`. Si no se especifica que `$ 7.000` es por pallet o por el conjunto, NO atribuir presentación o precio unitario: dejar lo que dice el proveedor y marcar duda para comparabilidad. Tampoco cambiar el total por lo que calcule la IA.

En **Comparación de materiales solicitados** se puede identificar la línea de cemento con equivalente verificado, pero pallets/bolsones y cargos deben continuar visibles como «Adicional no solicitado», «Cargo» o «Sin clasificar» con atribución basada en fuente, sin esconder su impacto económico. Si no queda claro qué gastos son obligatorios/opcionales, la oferta no recibe un «total final comparable» inventado.

### Tres importes distintos que no deben confundirse
1. **Total declarado por el proveedor:** solo desde evidencia explícita, literalmente como aparece. Si no lo informó o hay varios totales incompatibles, «No informado / Por verificar», no calcular uno y atribuírselo al corralón.
2. **Suma comprobada de conceptos del presupuesto:** aritmética decimal exacta sobre líneas realmente atribuibles, descuentos, IVA y flete **solo si las reglas y la evidencia permiten el cálculo**; mostrar diferencia respecto del total declarado cuando exista. Nunca corregirlo en el documento original.
3. **Costo de comparación de la solicitud:** basado solo en artículos equivalentes, cantidades solicitadas, cobertura y condiciones comprobables. Mostrar aparte si los pallets, bolsones, envases o fletes son cargos de la oferta. Nunca comparar los totales declarados de dos proveedores con distinta cobertura como si fueran precios equivalentes.

### Cambios de interpretación y versiones
- Presupuesto original de texto/archivo asociado a **remitente autenticado, ronda y mensaje/versión**, conservado inmutable. Si el proveedor envía corrección se crea **otra versión**, con su fuente nueva, sin borrar la anterior. No pedir «Confirmo».
- Ningún proveedor puede ver original ni identificación del otro antes de cierre; comprador solo lee presupuestos de su empresa y ronda. Auditar RLS, pertenencia, sesión revocada y URL temporal.
- El ranking **no puede declarar ganadores** mientras los costos obligatorios, equivalencias o cobertura estén incompletos. Hasta dos finalistas por rubro/canasta comparable al cierre, contactos mutuos solo según UX-002 y consentimiento.
- El envío por WhatsApp debe ser directo y sin pasos para el proveedor, salvo aclaración imprescindible para comparación, que NO bloquea registrar su presupuesto fiel.

## Auditoría técnica del 01/11 (estado REAL)

Actualmente `src/server/whapi-quote-inbox-processor-d061.ts` + D063/D060 interpretan y guardan SOLO `roundItems` **correspondientes a los artículos que pidió el comprador**. El inbox D028 mantiene el texto original cifrado, pero la vista `PreciosRealesComprador` y `buyer_quoted_prices_d060` enseñan SOLAMENTE las líneas vinculadas al pedido; **pallets, bolsones, descuentos, otros renglones y TOTAL original no se pueden ver ahí**.

**Por lo tanto todavía NO se cumple el requisito end-to-end de 100% fidelidad.** No se debe presentar esa vista como presupuesto original completo ni como total final. Este PR corrige su aviso de seguridad comercial.

### Primera pieza implementada y probada en este PR

`src/domain/presupuesto-original-fiel-mvp063.ts` captura literalmente el TEXTO origen, todos los renglones con numeración/orden (incluyendo blanco, CRLF y espacios) y todos los tokens de importes `$` sin transformarlos. Calcula SHA256 de texto original UTF-8. Solo identifica «total final» si aparece de forma explícita, **única y monetariamente inequívoca**, y conserva también la cadena original (ej. `$ 217.500,00`); la normalización a centavos solo es auxiliar, nunca una sustitución de la cifra que escribió el comercio. Si el total es duplicado/ambiguo, se retiene `totalDeclarado=null` pero el texto literal completo se conserva.

La función `separarAlcancePresupuestoMvp063` admite una atribución EXTERNA auditada de las líneas como `solicitado/no_solicitado/cargo/descuento/aclaracion` y entrega TODAS las líneas, incluso las que no tienen clasificación. La clasificación NO proviene automáticamente de la IA y no autoriza modificaciones ni sumas.

`tests/unit/mvp063-presupuesto-original-fiel.test.mjs` valida fuente íntegra, pallets, bolsones, flete, descuento, total verificado literal, total declarado que no concuerda con suma (se conserva), ausencia/ambigüedad de total, formatos monetarios, líneas desconocidas y entradas adversarias. Código puro offline: no lee ni divulga fuentes comerciales reales ni envía mensajes.

## GATE para dar por terminada la funcionalidad (NO IMPLEMENTADO EN ESTE PR)

1. **Ledger D093**: asociar el espejo íntegro y hash al recibo/version de oferta D059/D060 e inbox cifrado D028 en **la misma transacción**, con inmutabilidad, anti-replay y control de acceso. No guardar textos con nombres/teléfonos en logs ni índices públicos.
2. **PDF/Excel/Word/fotos**: guardar archivo binario original privado, calcular SHA256 **sobre bytes originales**, mostrar original con acceso temporal autorizado; nunca 100% fidelidad a partir de OCR/IA exclusivamente. La extracción debe declarar por renglón evidencia/página/celda y no eliminar otros.
3. **Vista comprador autorizada**: dos pestañas «Presupuesto original íntegro» y «Comparar materiales solicitados». Lista completa de artículos y total exacto, con estado de conciliación; auditar aislamiento multicliente, anonimato, RLS y reglas de finalistas.
4. **Determinismo económico**: cálculo secundario con decimales exactos, precio por unidad/presentación/total de línea, descuentos globales, recargos, pallets retornables, IVA/flete condicionados. Si falta información, marcado «sin total comparable», no adjudicación engañosa.
5. **E2E** con cuatro teléfonos y un presupuesto que agregue pallets/bolsones en documento real, y otro que tenga total equivocado. Comprobar que ningún texto/precio/ítem desaparece y que una corrección registra nueva versión.

**NO se modificó Supabase DEV (#175), Whapi, Vercel ni producción en este PR.**
