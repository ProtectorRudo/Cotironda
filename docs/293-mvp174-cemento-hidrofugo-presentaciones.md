# MVP174 — Presentaciones reales de cemento e hidrófugo

**4/11/2026 — rama de desarrollo sobre MVP173.** No se modifican precios, originales, ranking ni contacto.

## Diagnóstico real (SQL de lectura, 2 rondas / 4 cotizaciones)

Los 6 cruces que MVP173 devolvía como `no_aplica` corresponden a cemento e hidrófugo. Se inspeccionó su descripción comercial ORIGINAL, vinculada previamente a las verificaciones v9/SHA del proveedor.

- Comprador: **20 bolsas CPC 50 kg**. Proveedores: **20 bolsas CPC 50 kg** y **40 bolsas de cemento Avellaneda 25 kg**. Ambos son **1.000 kg nominales**; el segundo es una alternativa comercial, no garantía de tipo CPC idéntico.
- Comprador: **25 bolsas de cemento gris 25 kg**. Ambos proveedores cotizaron **25 bolsas Avellaneda 25 kg** (625 kg nominales).
- Comprador: **5 L de hidrófugo**. Una cotización ofrece **1 envase de 5 L** y la otra **5 unidades de «hidrófugo en pasta» sin volumen explícito**. La primera es alternativa comercial; la segunda conserva su oferta, pero se marca `presentacion_sin_acreditar`, sin convertir 5 unidades a 5 L.

## Cambio de funcionamiento

Se agrega `src/domain/cotejo-presentaciones-mvp174.ts` y se conecta al diagnóstico existente `diagnostico-ronda-mvp172.ts` solo para artículos `no_aplica` de las familias `cemento_gris_obra` e `hidrofugo`. El cotejo usa cantidad literal original, un único peso o volumen de envase explícito y ubicación de la línea en el archivo, previamente corroborados por v9/SHA/MVP163. Reutiliza `evaluarEquivalenciaCatalogoMvp171`; no exige un catálogo obligatorio.

- **Peso total comercial acreditado**: 20×50 kg y 40×25 kg coinciden en cantidad. Presentaciones, marcas y especificación técnica quedan identificadas como alternativa con aclaración, no equivalencia exacta ni stock demostrado.
- **Volumen comercial acreditado**: 1×5 L o 5×1 L cubren 5 L.
- Si la unidad o el envase se desconoce, no se infiere de la mera cantidad. Si el total comercial no alcanza, se indica diferencia de cantidad.
- Varias líneas candidatas, formato ambiguo, material distinto o falta de cita/ubicación no se resuelven por intuición. Se preservan las ofertas sin esconderlas.
- No modifica `supplier_quote_lines` ni `supplier_source_facts` ni el archivo del proveedor.
- Se devuelven **solo conteos anónimos** al trabajador privado MVP173; la condición fiscal, stock, flete, pago y precio total siguen sin acreditarse.

## Validación

`tests/unit/mvp174-cemento-hidrofugo-presentaciones.test.mjs` contiene pruebas representativas de los renglones reales, envases faltantes y cantidad distinta. Se añadió el nuevo archivo a los paths de Deno CI para cubrir la Edge privada. Una prueba de staging real queda registrada solo cuando su HTTP y conteos se consulten en Supabase.

## Siguiente etapa

Ampliar el cotejo por familia y atributo sin inventar marcas, y presentar advertencias en el portal. No publicar ranking fiscal ni ganadores hasta auditar IVA, flete, disponibilidad y condiciones por artículo.
