# Decisión 367 — No omitir importes del presupuesto original (MVP244)

**Etapa:** 3, fidelidad comercial. **Fecha:** 06/11/2026.
**Entorno:** desarrollo. No habilitar WhatsApp ni publicación en piloto/producción.

## Riesgo

La doble lectura MVP225 exige que cada línea propuesta esté contenida en
el texto original, pero no obliga a representar **todos los importes del
original**. Dos lecturas iguales pueden omitir un pallet, un flete o un
descuento, dejando una comparación aparentemente completa.

Es un riesgo económico y de confianza: Cotironda no puede eliminar
un cargo por el simple hecho de que la IA no lo clasificó.

## Corrección

- Se incorpora fidelidad-importes-fuente-mvp244.ts: compara el
  multiconjunto de **importes monetarios literales** del original con
  los de las líneas citadas por IA. Cada aparición se cuenta,
  preservando duplicados válidos y detectando duplicados inventados.
- Considera precios explícitamente prefijados por $, AR$, US$, U$S,
  ARS o USD; la denominación real de moneda sigue validada por MVP241.
  **No** deduce que el signo $ es ARS.
- No discrimina por rubro o palabras exactas: un pallet, descuento,
  envase o flete con importe es tan importante como el cemento.
- Separa filas por salto de línea o punto y coma; conserva prosa libre
  sin imponer PDF estandarizado, Excel ni formularios.
- Una línea recapitulativa con título TOTAL, SUBTOTAL o IMPORTE TOTAL
  no es un producto. Se conserva en el texto fuente original pero no
  debe duplicarse artificialmente como un artículo.
- Se ejecuta **antes de la segunda llamada a IA** (ahorro de tokens)
  y en el comparador directo. Ante omisión hay revisión privada, no
  homologación o ranking, pero se conservan cobertura, materiales y
  precios por línea respaldados por fuente.
- No habilita contacto, descarga, adjudicación ni envío.

## Límites explícitos

- Importes SIN prefijo monetario y renglones «sin cargo» continúan
  a cargo de la doble comprensión de IA y otros controles; esta regla
  no pretende ser un extractor exhaustivo. Debe probarse frente a
  textos escaneados y documentos reales.
- La fuente original debe provenir de un archivo íntegro y con
  SHA256 validado; el cotejo no compensa falta de extracción PDF/Excel.
- Los subtotales y totales finales no se calculan ni se homologan en
  esta etapa; no se inventan IVA/flete ni condiciones por omisión.

## Criterios de aceptación

Regresión Node para: material + pallet + flete + descuento, omitir
cualquier cargo, precios duplicados, renglones separados por punto y
coma, total recapitulativo sin ítem artificial, importes falsificados,
doble lectura, comparador directo, cobertura preservada, errores
que no disparan segundo análisis. Suite general + Deno + Next + PG17.

La etapa 3 permanece abierta hasta completar auditoría de archivos
PDF/Excel/imágenes y los ensayos reales con proveedores autorizados.
