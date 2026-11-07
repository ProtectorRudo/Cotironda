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

## Estado de verificación del 04/11/2026

- GitHub PR #549: **8 pruebas nuevas**, **2.008 de 2.008 unitarias PASS** y **6 de 6 controles GitHub CI PASS** (incluido Deno, PostgreSQL 17, Next.js y PostgREST). Código probado en rama de desarrollo.
- Se preparó el paquete completo de 10 archivos para staging, pero la herramienta bloqueó repetidamente la acción de despliegue. **La Edge de diagnóstico del piloto permanece v1**, sin el cotejo MVP174. El recuperador operativo conserva v25.
- La evidencia real citada arriba proviene de consultar las descripciones ya registradas; los conteos del **nuevo diagnóstico TS sobre datos reales no están verificados todavía**. No atribuirle HTTP 200 ni nuevos resultados del piloto.
- Ninguna adjudicación, mensaje, ranking ni cotización original se modificó en esta subetapa.

## Nueva verificación — 04/11/2026: staging v2 desplegado

- **La limitación de despliegue anterior quedó superada.** Se desplegaron las 10 dependencias del commit `22013e2f490657ac460cbd7ce71f0e04b075c3e1` mediante la acción de Supabase: `cotironda-piloto-round-preview-staging` quedó **v2 ACTIVE** (bundle SHA-256 `aa0f9a48a3b35cf35b53a3b0ab460d0703a80b6579d496964e60de5ec4e5281a`), en **PILOTO**, sin cron. El recuperador habitual sigue **v25** y `main` no se modifica.
- **Seguridad verificada:** solicitud sin token `pg_net #317` **HTTP 401 `unauthorized`**; token falso de 96 caracteres `#319` **HTTP 401 `unauthorized`**, sin error de red. La SQL de insumos conserva `anon/auth EXECUTE=false` y solo es usada por service_role. 4 evidencias v9, 4 económicas, 0 mensajes ni finalistas.
- **Consultas SQL reales SOLO LECTURA** sobre los originales y sus evidencias SHA/v9/MVP163/MVP168: 2 coincidencias nominales de arena, 2 de piedra, **4 de masa de cemento** (20×50 kg = 40×25 kg y 25×25 kg), **1 hidrófugo con volumen de 5 L corroborado y 1 sin tamaño de envase**. Total **9 coincidencias de cantidad/presentación comercial y 1 envase no acreditado**, sin afirmar variedad idéntica, stock, IVA ni precio comparable.
- **No se pudo ejecutar la llamada autenticada completa al worker v2:** el sistema bloqueó el uso del secreto de Vault para una solicitud `pg_net`. No se leyó ni expuso ese secreto. **Por tanto los resultados 9+1 son SQL real, NO una ejecución del TypeScript v2 contra la ronda real.** La salida HTTP autorizada y la experiencia del comprador siguen pendientes.
- **Prueba integrada representativa de dos rondas** y regresiones: **2.011/2.011 unitarios PASS y 6/6 GitHub CI PASS** en el commit `22013e2...`, sin envío de WhatsApp ni publicación de ranking.

**Próximo criterio de aceptación:** ejecutar una invocación autenticada y autorizada de la Edge staging v2 sin revelar token, contrastar sus conteos con SQL 9+1, habilitar el diagnóstico para mostrarlo al comprador solo mediante autorización por empresa, sin ranking fiscal ni selección de proveedores.
