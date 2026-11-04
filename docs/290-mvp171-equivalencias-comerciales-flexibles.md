# MVP171 — Equivalencias comerciales flexibles, sin rigidez de vocabulario

**Decisión comercial aprobada el 04/11/2026. Estado: desarrollo, PR #546.**

## Objetivo

Un corralón cotiza como trabaja: pone «arena», «piedra», «cemento», «hidrófugo», una marca o una descripción corta. No hay que exigir que repita cada adjetivo del comprador. Tampoco hay que afirmar falsamente que el material es exactamente el mismo.

## Política nueva

Tres resultados operativos:

1. **Equivalente acreditado:** misma familia, magnitud y especificaciones necesarias explícitas.
2. **Alternativa comercial razonable:** misma familia y cantidad comercial comprobada, el proveedor usa un nombre genérico o una marca distinta, y el comprador **no exige exclusividad**. Puede participar en comparación económica con el aviso **«Alternativa comercial: puede diferir alguna especificación o marca»**. El documento original no se edita, la oferta sigue visible y no se fuerza consulta al proveedor ni se le pide nueva cotización.
3. **Diferencia material real / especificación excluyente:** familias distintas, variantes explícitamente contrarias (arena gruesa por fina, piedra rodada por partida), medidas que no alcanzan, tipo o sección de cable distintos o pedido «exclusivamente / excluyente / debe ser». No afirmar equivalencia.

**Ejemplos:**

| Pedido | Cotización del proveedor | Tratamiento |
|---|---|---|
| 1 m³ arena fina | 1 BIG BAG arena | Alternativa comercial razonable (1 m³ nominal). Falta variedad, no queda excluida por defecto |
| 2 m³ piedra partida | 2 BIG BAG piedra | Alternativa razonable. No inventar que es partida |
| 1 m³ arena fina exclusivamente | 1 BIG BAG arena | Especificación excluyente no acreditada |
| Arena fina | Arena gruesa | Incompatible por variante expresamente contraria |
| Hidrófugo de marca A | Hidrófugo de marca B, misma cantidad | Alternativa comercial razonable, salvo marca excluyente |
| 5 L hidrófugo | 4 L hidrófugo | Cobertura insuficiente, no fingir equivalencia económica |
| 50 kg cemento de tipo acreditado | 2 bolsas 25 kg del mismo tipo | Cantidad equivalente SOLO con conversión de presentación acreditada, sin presumir precio unitario por bolsa = kg |
| Cable 2,5 mm² | Cable 1,5 mm² | Incompatible; no es cuestión de marketing |
| Cable 2,5 mm² | Cable sin sección declarada | Falta atributo físico crítico, no acreditar sección |

## Implementación en código

- \`aridos-bolson-mvp164.ts\`: agrega \`compatible_con_aclaracion\`. El adjetivo no mencionado no bloquea la alternativa comercial, salvo lenguaje de exigencia excluyente. Una variedad distinta declarada sí bloquea.
- \`adaptador-documental-mvp162.ts\`: aprovecha el puente y la preparación de hechos de fuente MVP163, crea correlación \`comercial_razonable\` y **no altera** unidades literales del proveedor. Si el stock o fiscalidad no están acreditados, sigue \`visible_no_comparable\` por causas económicas, no por el nombre genérico.
- \`comparacion-ofertas.ts\`: acepta la categoría \`comercial_razonable\` en cobertura/opciones offline; agrega \`advertencia: alternativa_comercial_con_aclaracion\` en líneas y una \`advertencias\` por artículo en la opción económica. Se exigen igualmente unidades, cantidades, IVA, flete, mínimos, moneda, pago y disponibilidad cuando corresponda. **Una alternativa no se presenta como identidad exacta.**
- \`equivalencia-catalogo-mvp171.ts\`: regla reutilizable por **familia canónica y atributos de catálogo comprobados**, sin una tabla fija de frases. La IA puede sugerir familia/atributos, pero **el backend debe cotejar que coinciden con el archivo original o con el catálogo del proveedor**; sin esa prueba no existe equivalencia. **El catálogo NO es obligatorio**: un comercio que no lo cargó puede cotizar por WhatsApp y el verificador puede reconocer la familia comercial corroborándola contra el archivo original. Las marcas solo son excluyentes si el comprador las declara así; las medidas físicas incompatibles no se perdonan.

## Límites

No se han conectado todavía los catálogos de proveedores de todos los rubros al evaluador genérico, ni se deducen equivalencias por semejanza superficial de palabras. Es arquitectura y código para que al enchufar fuentes verificadas la IA no se convierta en un cuello de botella.

**Ranking del piloto:** sigue OFF porque IVA, stock, flete y términos económicos no están completos. **No se deben usar advertencias para tapar importes fiscales inventados.** Los originales de las 4 ofertas del piloto, los contactos y WhatsApp no se modifican.

## Criterios de aceptación

- Compatibilidad nominal y equivalencias de marca no excluyente admitidas.
- Advertencia visible al calcular cobertura y opciones económicas, incluso con hasta dos proveedores.
- Unidades y cantidades distintas sin conversión o atributos técnicos expresamente contrarios no equivalen.
- Seguridad/voltaje/sección no acreditados siguen sin comparación.
- Sin falsos ganadores, sin activar ranking del piloto, sin revelar contactos ni pedir confirmaciones innecesarias.
- Pruebas sintéticas para hidrófugo, cemento, cable, big bags, exclusividad, IVA desconocido, y regresión de adaptador y comparador.

Referencias: [docs/289](289-mvp170-puente-presentaciones-aridos.md), [Issue #535](https://github.com/ProtectorRudo/Cotironda/issues/535). Solo rama de desarrollo.
