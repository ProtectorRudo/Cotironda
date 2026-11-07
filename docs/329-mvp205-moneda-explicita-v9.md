# MVP205 — Moneda explícita del presupuesto original v9

**Desarrollo exclusivamente**. Issues #535 / #524 / #529.
No se instala SQL ni se modifica ningún dato del piloto; tampoco
WhatsApp, Vercel, adjudicación, contactos u originales.

## Problema

`compararPreciosCotizadosMvp185` ya compara subtotales de **materiales**
por canasta completa a una o dos empresas con IVA silencioso interpretado
comercialmente como SIN IVA, sin calcular alícuota ni flete. Pero la
entrada `moneda` solo podía provenir de un verificador privado externo
todavía no construido, por lo que ningún original en el circuito v9 podía
acreditar por sí mismo ARS o USD.

Los **cuatro** registros reales del ledger PILOTO que inspeccionamos
carecen de campo estructurado de moneda. Para ellos, el problema sigue
pendiente: el símbolo `$` aislado no acredita ARS ni USD.

## Modificación

Se agregó `monedaExplicitaFuenteMvp205(doc)` en el comparador
documental existente (no un servicio paralelo). Después de verificar
la prueba v9, SHA, revisión vigente, importes y total, reconoce
únicamente prefijos explícitos y coherentes en **todos** los importes
unitarios, por línea y total declarado:

- `AR$` → `ARS`.
- `US$`, `U$S` o `USD` → `USD`.
- `$` sin calificador, moneda en solo un renglón, ausencia de
  encabezado de moneda o mezcla ARS/USD → **NO acreditada**.

Cuando el llamador ya tiene una atestación de moneda independiente,
esta función puede complementarla, pero **nunca ignorar una declaración
explícita contradictoria**: una fuente mixta o moneda distinta produce
`moneda_contradictoria_en_original` y ninguna comparación.

No modifica la convención de IVA ni confunde un subtotal de materiales
con total final. Permanecen `rankingFinalHabilitado=false`,
`impuestosCalculados=false`, `fleteCalculado=false`,
`stockConfirmado=false`, `whatsappEnviado=false` y sin adjudicación.

## Pruebas y aceptación

- Documento v9 completo con AR$ y `moneda=null` produce referencia
  comercial etiquetada ARS sin preguntarle otra vez al proveedor.
- Canastas AR$ y US$ forman grupos distintos, nunca conversión cruzada.
- `$` suelto, marcador parcial, USD en un renglón ARS, documento
  cambiado/revisado o atestación opuesta quedan excluidos.
- Las referencias siguen siendo calculadas a partir de cantidades,
  descuentos y totales fuente exactos; un pallet sin asignar continúa
  impidiendo un subtotal artificialmente bajo.

## Siguiente bloqueo real

La mayoría de los originales del piloto usa `$` sin prefijo, y
tampoco hay moneda persistida en MVP168. Para crear un ranking
comercial útil se necesita una **política explícita y auditable**
de moneda local o un verificador que recupere la moneda del archivo
completo/condiciones contractuales, sin asumir ni inventar datos.
Después, integrar la selección preliminar al cierre, conservando las
advertencias de IVA, flete, stock, pago y especificaciones.

El checklist #529 permanece con P0-B/C abiertos hasta E2E real.
