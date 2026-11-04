# MVP193 — Bolsón/BIG BAG de áridos en referencias de precio por m³ nominal

**Estado:** solo rama de desarrollo, sin escritura en base, Edge, Vercel,
WhatsApp, exposición de contactos, adjudicación ni publicación de ranking.

## Evidencia real del bloqueo

Consulta **solo lectura** a `cotironda-piloto` (04/11/2026):

- 3 rondas `prepared`; 4 documentos archivados, 10 renglones económicos.
- Los 10 renglones del ledger de fuente están en `unitStatus=not_explicit`.
- Cuatro tienen `presentation=big_bag`; seis `presentation=none`.
- No se permite completar `supplier_quote_lines_mvp101.unit_literal`
  inventando una unidad. Tampoco marcar esos diez renglones como stock
  verificado ni habilitar ranking final.

## Decisión comercial implementada

Se **reutiliza** `interpretarBolsonAridosMvp164` y las pruebas de procedencia
`PruebaBolsonMvp165` existentes. Un bolsón/BIG BAG de **arena, piedra o
cascote** generalmente representa **1 m³ nominal embolsado**; no significa
que el fabricante haya declarado 1 m³ exacto, ni demuestra granulometría,
disponibilidad, entrega o IVA.

`compararPreciosCotizadosMvp185` acepta una referencia económica preliminar
de material únicamente cuando el servicio PRIVADO aporta una prueba vinculada
a **una línea del original actual v9/SHA**, a la descripción ORIGINAL del pedido,
y la presenta como `big_bag` o `bolson` corroborado por la fuente:

1. La cantidad pedida está expresada en `m3` y la oferta indica un bolsón
   o BIG BAG de un árido de la misma familia.
2. Hay cantidad numérica real y una correlación independiente marcada
   `comercial_razonable`; no basta un nombre propuesto por IA.
3. El original de ese proveedor tiene unidad literal ausente
   (`not_explicit` / `unit=null`), presentación corroborada en
   página/fila y sin unidad contradictoria.
4. Coinciden **cantidades nominales totales**; si el origen declara
   presentación chica, capacidad distinta, peso sin volumen, variedad
   excluyente incompatible o ambigüedad, no se asume un metro cúbico.
5. El PDF/Excel fuente, descuentos, total, SHA, revisión vigente, IVA
   silencioso, moneda y asignación uno-a-uno pasan la auditoría previa.
   Un pallet, recargo u otro renglón extra **no desaparece** para bajar total.
6. La referencia puede constituir una canasta completa de un proveedor
   o combinación de **dos proveedores**, nunca una oferta parcial barata
   falsamente presentada como ganadora.

Las opciones que emplean el cálculo muestran la advertencia
`bolson_1m3_nominal_sin_stock`; conservan
`rankingFinalHabilitado=false`, `adjudicacion=false`,
`contactosRevelados=false`, `impuestosCalculados=false`,
`fleteCalculado=false`, `stockConfirmado=false`.

## Lo que NO significa

No supone que los cuatro renglones reales `big_bag` puedan ordenarse
inmediatamente: aún se necesitan correlaciones, pedidos/monedas/importe por
línea y restantes materiales corroborados en la fuente privada; los otros seis
renglones carecen de presentación acreditada. Esta mejora NO habilita
finalistas, descarga de originales, avisos ni E2E.

## Verificación y revertibilidad

Pruebas junto a `tests/unit/mvp185-comparacion-precios-sin-iva.test.mjs`:
nominal correcto, cantidades, ofertas parciales complementarias, pruebas
ausentes/cambiadas, presentaciones chicas, subtipos excluyentes, familias
distintas, página/fila, unidades contradictorias, extras, IVA y no filtración
de identidad. Además CI unitario, Node/Next, PostgreSQL17 y Auth.

Rollback: revertir PR de desarrollo; ninguna tabla o endpoint de piloto
cambia. Próximo trabajo: validar fuente privada con 10 líneas actuales,
correlaciones y moneda real para cada oferta; si no se prueba, dejar visible
el presupuesto completo sin pretender un orden de costos. #535/#524/#529.
