# Decisión 364 — IA Central: moneda y cantidad acreditadas en la fuente (MVP241)

**Etapa:** 3, comprensión comercial avanzada. **Fecha:** 06/11/2026.
**Estado:** desarrollo y regresiones; no publicamos producción ni piloto.

## Hallazgo y riesgo

El lector `lector-presupuesto-proveedor-mvp225.ts` permitía que la IA
declarara `ARS` con `monedaEvidencia=null` si el texto contenía
simplemente `$`, siempre que no apareciera un símbolo USD. En Argentina
`$` suele representar pesos, pero **no acredita jurídicamente ni
comercialmente una moneda inequívoca**. Este comportamiento contradice
la decisión MVP205 ya incorporada en Cotironda para el comparador v9.

Además, el cálculo `precioConfirmado` exigía una cantidad visible
solo si faltaba el total declarado. Cuando una IA proponía cantidad
20 a partir del pedido, podía aceptar `$8.900 × 20 = $178.000`
aunque la línea del proveedor no escribiera 20: confundía una operación
aritmética coherente con evidencia documental.

## Solución de alcance acotado

1. `evidencia-moneda-mvp241.ts` es determinista y independiente de
   OpenAI. Solo acepta una moneda global ARS o USD con mención explícita
   en la fuente: `ARS`, `AR$`, `pesos argentinos`, `USD`,
   `US$`, `U$S`, `dólares`. El lector exige además que la cita
   seleccionada por IA sea literalmente parte de la fuente y contenga
   la indicación de moneda correcta; rechaza citas irrelevantes.
2. Una fuente con solo `$` conserva `moneda=no_informada`; no
   certifica competitividad automática. Una fuente que menciona ambas
   monedas no se representa falsamente mediante una moneda global.
3. Los valores monetarios literales ahora admiten también prefijos
   completos `AR$`, `US$`, `U$S`, `ARS` y `USD`, manteniendo
   aritmética exacta BigInt; no se elimina la indicación de moneda del
   original ni se admiten formatos numéricos inconsistentes.
4. El comparador por rubro aplica la misma regla al objeto tipado,
   aunque alguien lo invoque sin pasar por el lector. No compara
   monedas sin evidencia, pero **conserva cobertura, artículos y
   precios literales para revisión**.
5. `precioConfirmado` verifica antes de cualquier multiplicación
   que la cantidad normalizada también esté expresada en la MISMA
   línea original, después de retirar unitario y total literal.
   Esto rige incluso si un total numéricamente compatible fue
   mencionado por el proveedor. Soporta decimal con coma y punto;
   no adivina cantidades por precio/total.
6. No se cambia el tratamiento de IVA comercial `no_informado`
   (convención operativa sin IVA, **no** alícuota cero), flete,
   cargos adicionales, sinónimos ni equivalencias comerciales.
7. No se llama a Whapi, no se editan tablas, no se ejecuta ninguna
   migración ni se publica un presupuesto.

## Criterios de aceptación y prueba

- `$8.900` sin denominación de moneda no puede publicarse como ARS.
- Cotización con `Moneda: ARS` y cita `ARS` sí puede llegar al
  comparador si todas las demás condiciones están verificadas.
- `US$ / U$S / USD / dólares` no se confunden con `ARS`, y
  la mezcla de monedas requiere revisión.
- Una cita económica arbitraria como `cemento` no acredita moneda,
  aunque en otro lugar del texto aparezca ARS.
- Una cantidad de 20 deducida por `$178.000 / $8.900` pero ausente
  de la línea original **no** se certifica.
- Una cantidad 20 escrita claramente, con unitario y total exactos,
  mantiene la validación existente y los importes de `BigInt`.
- La oferta parcial, los extras del proveedor y la cobertura por
  rubro nunca se descartan por incertidumbre monetaria.
- Pruebas antiguas de MVP225 se actualizan con evidencia explícita
  donde deben continuar certificando precios. Nuevo corpus de
  regresiones MVP241, controles generales del repositorio y Deno.

## Pendiente dentro de etapa 3

Aún corresponde auditar la semántica de IVA, flete y pago con citas
fuente; equivalencias 25/50 kg, bidones y bolsones; cobertura íntegra
de textos y archivos PDF/Excel/foto; y confirmar lectura sobre
presupuestos reales. Este cambio **no** declara etapa 3 cerrada.
