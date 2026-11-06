# Decisión 366 — Presentaciones comerciales: cantidad física, no equivalencia automática (MVP243)

**Etapa 3 — comprensión comercial**, 06/11/2026. Entorno objetivo: desarrollo;
NO activar WhatsApp, producción ni nuevos mensajes de piloto.

## Contexto

El comparador comercial por fuente v9 ya tiene dos piezas probadas:
`cotejarPresentacionObraMvp174` (cementos/hidrófugos) y
`compararPreciosCotizadosMvp185`/MVP195, que usan fuente SHA, página
y fila. Sin embargo, el lector de IA Central MVP225 recibe texto
descifrado y oferta semántica, y la regla `alternativa_razonable`
NO ofrecía una explicación normalizada de los envases por artículo.
No sería seguro copiar el cotejador v9 como si una salida de IA
probara ubicación página/fila, ficha técnica o denominación de material.

## Solución

Se incorpora un diagnóstico **informativo, determinista y genérico**
en `diagnostico-presentaciones-mvp243.ts`, para enlaces semánticos
`alternativa_razonable` validados por el motor:

- Reconoce una única capacidad **escrita expresamente** en la
  descripción del pedido y en el renglón original de la oferta
  (kg/g, L/ml o m³). No tiene catálogo cerrado de productos.
- Toma cantidades normalizadas SOLO si la cifra de bultos figura
  explícitamente en la línea, eliminando previamente importes
  y cantidades de capacidad de envase para no inventar números.
- Emplea **BigInt** en milésimos de unidad base, sin flotantes.
- Distingue `cantidad_nominal_igual`, `cantidad_nominal_diferente`,
  `presentacion_sin_acreditar` y `base_incompatible`.
- Es una comparación de **cantidad nominal física**, NO una
  certificación de material, clase, marca o calidad. Nunca deduce
  que arena es piedra, que cemento CPC es CPP, que 5 L son
  sustituto perfecto de 4 L ni que 1 bolsón sin capacidad declarada
  tiene exactamente 1 m³.
- La etiqueta de estado mantiene
  `comparableTecnico=false` y `comparableEconomico=false`
  por contrato. El motor de ranking NO usa este dato.
- Cuando toda una oferta contiene solo alternativas sin precios
  homogéneos, no se marca `verificada_para_comparacion`.
- El RPC privado MVP227 conserva el diagnóstico bajo `presentaciones`
  dentro de su resumen de revisión, por allowlist sin nombres,
  teléfonos, originales, precios alternativos ni contacto.
  El RPC público de seguimiento no lo expone automáticamente.
- La cobertura y las cotizaciones parciales siguen visibles; otras
  líneas exactas no pierden su posible comparación de precios.
- No se asignan ganadores, se modifican precios ni se envían mensajes.

## Escenarios adversarios de regresión

20×50 kg vs 40×25 kg: mismos 1.000 kg nominales, equivalencia técnica
pendiente. 20×50 vs 20×25: diferencia 1.000 vs 500 kg.
5 L hidrófugo vs un bidón 5 L: cantidad nominal igual sin asegurar
especificación. 4 L pedido vs lata 5 L: cantidad distinta.
`hidrófugo en pasta` sin L: sin acreditar.
Bolsón sin capacidad: no usar 1 m³ por defecto en diagnóstico económico.
Tres bolsones **explícitos** de 1 m³ cada uno: tres m³ nominales.
Arena vs piedra del mismo peso: no acredita sustitución.
Cantidad ofrecida extraída de precio o del tamaño de envase:
bloqueo. Dos envases distintos en mismo renglón: bloqueo.
Otras líneas exactas de una oferta parcial siguen cotejables.

## Límite y cierre

La fuente v9 y el cotejo MVP174/195 conservan su propia política
de evidencias, consentimiento y restricciones técnicas. MVP243 no
los sustituye ni promueve alternativas por sí solo. La etapa 3
tampoco puede darse por terminada operativamente mientras falten
documentos de WhatsApp reales de varias familias, originales PDF/Excel
completos, condiciones por ítem y prueba end-to-end autorizada.

## Criterios de aceptación

Suite específica MVP243, pruebas generales, compilación Deno del
webhook, Node, TypeScript/Next.js, regresión de precios por rubro.
Trabajar en PR; no desplegar sin orden `Publicalo` y puerta de
piloto verificada. Documentar resultados y restantes.
