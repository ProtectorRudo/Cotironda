# MVP170 — Enlace del pedido real con presentaciones de áridos acreditadas

**04/11/2026 · Issues #535 y #529 · SOLO DESARROLLO.** No modificar \`main\`, portal, WhatsApp, datos del piloto ni producción.

## Motivo y evidencia del piloto

El 04/11/2026 se comprobó con consultas **SQL de solo lectura** sobre \`cotironda-piloto\`:

- 2 rondas de prueba, 5 artículos solicitados en \`request_lines\`; 4 presupuestos originales, 10 renglones cotizados.
- Unidades literales de proveedor \`NULL\` en **10 de 10** renglones. Los hechos MVP163 indican \`unitStatus=not_explicit\` en los 10, **pero 4 tienen \`presentation=big_bag\`** corroborada en la fuente.
- Pedido: **arena fina 1 m³**, **piedra partida 2 m³**, cemento por bolsas (dos cantidades, 20 y 25) e hidrófugo 5 L.
- Todos los precios comerciales en MVP168 están conciliados, pero **IVA no informado en los 4 archivos**, flete no informado o a convenir; no hay stock, entrega y neto fiscal acreditados para ranking.

**Interpretación comercial sin inventos:** un BIG BAG normal de áridos es 1 m³ nominal. Por eso 1 BIG BAG arena y 2 BIG BAG piedra pueden coincidir en *volumen nominal* con lo solicitado. Pero la descripción «arena» no demuestra «arena fina» ni «piedra» demuestra «piedra partida»; esas variantes requieren evidencia propia. Nunca registrar stock disponible por la sola cantidad cotizada.

## Implementación

Se amplía **directamente** \`src/domain/adaptador-documental-mvp162.ts\`, reutilizando \`interpretarBolsonAridosMvp164\` y el puente \`adaptarDocumentoMvp162\`; **no crea otro motor de ranking**. La función \`prepararPresentacionesAridosMvp170\` consume:

- Pedido original estructurado de \`request_lines\` con descripciones, cantidades y unidades.
- Documento fuente de \`supplier_quote_lines_mvp101\` más prueba original v9 vigente, importes y SHA.
- Envelope de hechos inmutables MVP163, mismo \`requestId\`, \`messageHmac\`, \`sourceSha256\`, mismas líneas numeradas, página/fila, presentación \`big_bag\` o \`bolson\` y estado de lectura fuente.
- El módulo **no acepta simplemente que la IA afirme** una presentación ni corrige \`unitLiteral\` del archivo. Rechaza SHA, HMAC, versión, estructura y total divergente.

El resultado separa **volumen comercial nominal** de variedad técnica, registra motivos por artículo y solo crea las \`CorrelacionFuente\` y \`PruebaBolsonMvp165\` necesarias cuando existe exactamente una coincidencia técnica y de cantidad. Nunca asigna la misma línea a dos artículos. Las pruebas de stock siempre quedan \`false\`, y el puente recibe términos económicos \`null\` hasta que exista evidencia completa. La salida se usa **solo en backend**: las pruebas contienen SHA y descripción privada del pedido. No se expone este resultado directamente en el navegador.

### Reglas clave

1. \`arena fina\` solicitada vs \`BIG BAG de arena\`: \`variedad_no_acreditada\`, sin equivalencia completa.
2. \`piedra partida\` vs \`BIG BAG de piedra\`: \`variedad_no_acreditada\`, sin equivalencia completa.
3. \`arena\` genérica vs \`1 BIG BAG de arena\`: \`coincide_volumen_nominal_sin_stock\` para 1 m³; **sin ranking**.
4. \`piedra\` genérica vs \`2 BIG BAG de piedra\`: ídem para 2 m³.
5. BIG BAG 0,5 m³, variedad opuesta, página/fila inexistente, hechos ilegibles o más de una oferta candidata: **no forzar una coincidencia**.
6. Cemento/hidrófugo se conservan en el pedido, no se intentan mapear artificialmente con regla de áridos.

## Pruebas y criterios de aceptación

\`tests/unit/mvp170-match-aridos-source-ledgers.test.mjs\`: 19 casos, incluyendo datos sintéticos representativos de las 4 familias solicitadas, fuente v9 y SHA, montos, no duplicar, calidad, cantidades nominales, presentaciones faltantes, clasificación fuera de rubro y stock no acreditado. CI del repositorio requerido antes de merge. Los importes de prueba son sintéticos: **no** se ejecutó el puente TS sobre datos reales de proveedores; solo se auditó la base con SQL de lectura.

## Qué queda para ranking verdadero

- Ampliar el cotejo técnico a cemento en bolsa de 25/50 kg, hidrófugos, electricidad y más rubros, sin equiparar presentaciones diferentes sin conversión y condiciones.
- Obtener equivalencias de variedad donde fuente no indica fino/partido; permitir mostrar ofrecido como variante genérica y **no eliminar la oferta**, pero no presentarlo como idéntico.
- Verificar stock real, IVA, pago, flete, entrega y mínimos. Para estas 4 ofertas el IVA está **no informado**, no equivale a 0%.
- Mantener versiones originales descargables por comprador **según consentimiento**, cierre de rondas y selección manual. Nunca seleccionar ganadores porque un subtotal parcial sea menor.

**No hay modificaciones de SQL o Edge en este MVP170, ni envío WhatsApp, ni ranking publicado.**
