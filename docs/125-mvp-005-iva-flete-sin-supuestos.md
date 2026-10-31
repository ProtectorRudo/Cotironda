# 125 — MVP-005: IVA y flete solo cuando el proveedor los declara

31/10/2026 · Rectificación comercial aprobada por el propietario · [Issue #223](https://github.com/ProtectorRudo/Cotironda/issues/223).

## Regla permanente
**Nunca** presentar una cotización como «con IVA incluido», «flete incluido» o «envío gratis» por defecto. En el detalle de **cada proveedor** deben figurar las condiciones económicas realmente declaradas: si el precio está expresado con o sin IVA, la tasa/importe confirmado cuando corresponda y si hay flete, su valor o que está sin cargo, siempre según lo confirmado por ese proveedor.

Cuando uno de esos datos no fue aclarado, mostrar **«IVA: sin aclarar»** o **«Flete: sin aclarar»**. No transformar ausencias en tasa cero, flete cero ni precio final. Hacer la pregunta faltante al proveedor, sin obligar al comprador a elegir un supuesto. Incluso con oferta completa por artículos, el total económico **no se compara** hasta contar con información suficiente y verificada.

## Implementación en MVP-005 (demostración sin datos reales)
- La ruta `/probar/ofertas` deja de anunciar IVA y flete como «incluidos». El importe destacado se llama **importe comparable según datos declarados**, y el cálculo detallado queda plegado en «Aclaraciones de IVA y flete» por proveedor y «Ver asignación y aclaraciones económicas» por combinación.
- `src/domain/detalle-economico-explicito-mvp005.ts` usa solo los campos efectivamente presentes en la oferta ficticia. Si falta el impuesto o el flete, devuelve estado `pendiente`, no deduce cero ni incluido. Si está declarado el flete `0.00`, lo diferencia de `null`.
- El fixture `anon_d` incluye **IVA y flete no aclarados**, además de no estar confirmado. Queda fuera del ranking económico. No se genera tarifa comercial alguna ni se altera el comparador de importes de D022, que ya rechaza entradas sin IVA/flete explícitos.
- Los importes y las tasas del ejemplo son completamente ficticios: que el fixture dé `precioUnitarioNeto` significa únicamente que la prueba creó una base **neta inventada**. **No autoriza** asumir que el precio informado por un proveedor real es neto.

## Obligatorio antes del piloto
Un mensaje o PDF comercial puede expresar «precio final IVA incluido», «más IVA», «IVA no detallado», «flete a convenir», «envío sin cargo» o no especificar nada. **No convertirlo automáticamente a `precioUnitarioNeto`**: la conversión de bruto/neto a centavos y la alícuota tienen que estar confirmadas por el proveedor con evidencia de origen, o quedar pendientes de aclaración. Tampoco inferir valor de flete del catálogo, ubicación, tipo de material o resultado de IA. El comparador seguirá requiriendo importes suficientes y condiciones equivalentes. Esta adaptación de recepción real aún **no está integrada**; no declararla implementada por haber mejorado la demo.

## Criterios de aceptación
- No hay anuncios globales de impuestos ni transporte incluidos.
- Detalles por cada proveedor con impuestos/tarifa expresos o «sin aclarar».
- `null` IVA y `null` flete bloquean importe comparable y ranking; `0` explícito **no** es lo mismo que dato ausente.
- Alternativas de hasta dos proveedores solo si ambos aportan datos claros y confirmados; no inventar descuentos, equivalencias ni impuestos.
- Regresión unitaria, smoke HTTP real y compilación Next.js; sin deploy, Whapi, Supabase DEV ni producción. El bloqueo backup #175 continúa abierto.

## Complemento MVP-006
El proveedor no siempre declara IVA/flete junto a cada precio: la lectura de presupuesto buscará **también** notas, comentarios y texto acompañante; ver [docs/126](126-mvp-006-condiciones-iva-flete-documentales.md). Sin evidencia, la etiqueta operativa es «no informado» y el importe visible no acredita IVA/flete, **no** una afirmación de exclusión fiscal. Si el comprador exige IVA incluido, debe comunicarse expresamente a los proveedores.
