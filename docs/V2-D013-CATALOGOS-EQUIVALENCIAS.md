# D013 — Catálogos individuales por producto y equivalencias técnicas

**APROBADA: 12/11/2026. Estado: decisión DOCUMENTADA; todavía NO implementada ni probada en piloto.**

Esta decisión amplía D012 y precisa D008. Tiene precedencia sobre cualquier mención anterior a «distribuir por rubro». La IA Central continúa como cerebro operativo de Cotironda.

## Regla central

**Un proveedor recibe solicitudes exclusivamente por los PRODUCTOS CONCRETOS que figuran en su catálogo propio y que son compatibles con el pedido, y por su zona de entrega.** El rubro/nicho es solo un atributo para ordenar la información y el informe, NUNCA un filtro de selección o exclusión de proveedores. No deducir que un comercio vende todos los artículos de su rubro; no excluir a un comercio multirrubro. Si el producto figura en catálogos de varios proveedores, todos pueden ser candidatos según zona y habilitación. Cada proveedor recibe únicamente las líneas del pedido que trabaja, aunque sea una sola de veinte. No mandar invitaciones por mera pertenencia a una categoría. Catálogo no garantiza stock.

## Inteligencia semántica y comercial

- Interpretar lenguaje libre, marcas y nombres genéricos, abreviaturas, sinónimos, errores ortográficos, unidades, variantes y presentaciones, en todos los ámbitos de materiales de construcción especificables; no depender de una lista rígida de marcas.
- Buscar coincidencia por IDENTIDAD DEL MATERIAL Y PRESTACIONES: función, familia técnica, composición/tipo, características obligatorias, uso, norma, calidad, dosificación cuando aplique y presentación.
- Ejemplo: «Ceresita» puede identificarse como referencia comercial a un **hidrófugo** y admitir otro hidrófugo de catálogo SOLO cuando su aplicación y prestaciones sean realmente compatibles. No todos los impermeabilizantes/hidrófugos son sustitutos automáticos.
- Ejemplo: «cemento Loma Negra 50 kg» puede recibir oferta de cemento de **otra marca o marca no declarada, del mismo tipo y prestaciones**, en bolsas de **25 kg**. **100 bolsas × 50 kg = 5.000 kg = 200 bolsas × 25 kg**. La masa coincide, NO el número de envases. Verificar diferencias de flete, manipulación, envase, condiciones y precio por kg; no inventar ninguna de ellas.
- La marca mencionada es flexible salvo que el comprador exprese «solo esta marca», «marca excluyente» u otra restricción inequívoca. **Las especificaciones técnicas obligatorias se respetan siempre**: cemento Portland no es equivalente automáticamente a cemento de albañilería; distinto calibre, rendimiento, norma, espesor, formulación o uso puede invalidar una sustitución.
- Para litros, metros, rollos, m², bolsas, placas y otras presentaciones, convertir por una regla matemática verificable solo cuando el factor y la equivalencia técnica estén sustentados. No extrapolar rendimientos o dosificaciones desde el nombre.

## Selección, incertidumbre y presentación

1. Extraer por renglón: descripción original, cantidad, unidad, especificaciones obligatorias y preferencias.
2. Cruzar con **cada producto** del catálogo de **cada proveedor** habilitado en la zona, identificando coincidencia exacta, sinónimo, alternativa compatible o incertidumbre técnica.
3. Distribuir automáticamente solo líneas compatibles con evidencia razonable, sin duplicar envíos. Si la equivalencia es materialmente incierta, no atribuirla como exacta: marcar alternativa o derivar a revisión interna sin crear fricción para cliente/proveedor.
4. Conservar en la trazabilidad: artículo solicitado, ID de artículo de catálogo, nombre normalizado, atributos técnicos, tipo de coincidencia, evidencia/diferencia de marca, presentación, factor de conversión, confianza y motivo de exclusión cuando corresponda.
5. Mostrar la diferencia al arquitecto en los comentarios individuales y el informe final. El presupuesto ORIGINAL, sin reescritura, es fuente de verdad; la IA interpreta y explica, los cálculos de cantidades/precios equivalentes son deterministas.
6. Si nadie trabaja un producto del pedido, registrar falta de cobertura para análisis comercial, sin inventar proveedores ni enviar solicitudes masivas por rubro.

## Criterios de aceptación (pendientes de implementación/pruebas)

- [ ] «Ceresita» localiza hidrófugos realmente compatibles por ficha técnica, y no invita a proveedores por rubro genérico.
- [ ] 100 bolsas de 50 kg de cemento con marca no excluyente pueden cotejarse con 200 de 25 kg del mismo tipo; se exponen las diferencias y cualquier límite comercial.
- [ ] «Solo Loma Negra» u otra característica excluyente impide ofrecer una alternativa como si cumpliera.
- [ ] Un negocio multirrubro recibe solo los artículos de su catálogo; un negocio sin productos compatibles recibe cero solicitudes.
- [ ] Se deduplican coincidencias de un mismo negocio en distintos rubros y se admiten presupuestos parciales.
- [ ] No se equiparan cemento estructural/albañilería ni productos distintos solo por nombre parecido; unidades sin conversión válida se reportan como no comparables.
- [ ] IA no inventa cantidades, stock, IVA, flete, precios o condiciones; conserva originales y explicación trazable.

## Impacto y continuidad

Documentar esta decisión en Contrato V2, Plan V2, Estado V2, AGENTS y Issue #794. **V2-00 sigue siendo la única próxima tarea técnica:** inventario de catálogo, normalización, IA y destinatarios existentes antes de desarrollar. **V2-01** implementará el matching; **V2-04** describirá sustituciones; **V2-05** comparará unidades equivalentes. No modifica la prioridad V2-02 de asociación segura de respuestas ni autoriza cambios en código, Whapi, Supabase o despliegues.