# Acta 502 — B5k: símbolo de moneda corroborado con PDF original

Fecha: 11/11/2026. Autorización: **«Avanza» — SOLO DESARROLLO**.
PR [#775](https://github.com/ProtectorRudo/Cotironda/pull/775) sobre PR #774 B5j. **No desplegar** SQL ni Edge al piloto sin «Publicalo»; no realizar merge ni publicar ofertas.

## Diagnóstico real que origina B5k

La publicación de B5j en `cotironda-piloto` Edge V2 v7 constató:
- PDF histórico 1: `grand_total_balances_private`: 2/2 materiales y 3/3 condiciones, suma coincidente, no fuente completamente certificada.
- PDF histórico 2: `currency_ambiguous` antes de calcular la suma; campo `currency_declared_raw` nulo, pero los tres precios unitarios, tres importes de material y total candidato **extraídos** llevan `$`.
- No deducir que la moneda de la fuente sea ARS ni que el total económico PDF 2 sea correcto; la extracción anterior sigue siendo un borrador.

## Implementación conservadora

1. **`cotejarMonedaOriginalB5k`:** lee solamente filas/celdas PDF.js del original ya autenticado por SHA y cotejado por B5; exige todos los materiales, precios unitarios explícitos y el importe candidato al pie con símbolo monetario en fuente. No confía solo en el campo de moneda IA, nombre de archivo ni provincia.
2. Identifica `uniform_dollar_symbol_iso_unstated` cuando las celdas originales presentan `$` de forma consistente, **sin declarar ARS** ni convertir USD. `explicit_ars_source` exige declaración explícita ARS/pesos argentinos. USD, U$S, US$, EUR, euros, dólares, mezclas y pruebas insuficientes bloquean la observación.
3. **B5j solo en modo privado:** parámetro opcional `currencyEvidence` permite calcular el balance aun si el campo IA de moneda está nulo, exclusivamente cuando cada artículo y cifra final están respaldados por símbolo consistente en el PDF. El presupuesto original no se modifica; no hay cálculo de tasas de cambio.
4. **Worker B5k:** vuelve a descargar por SHA el único original histórico de B5j con código `currency_ambiguous`, ejecuta lector geométrico B5f una vez y reutiliza B5j para la conciliación. No repite PDF 1, no llama IA ni envía WhatsApp.
5. **SQL B5k privado**, versionado y RLS ON: nueva tabla solo para códigos/contadores y banderas siempre falsas. Solo `service_role` con RPC limitadas; cuota de una lectura/hora; modo `b5k_only=false` por defecto y mutuamente excluyente de B5h/B5i/B5j. No altera anteriores ledgers.
6. **Edge V2:** comprobación exclusiva B5k antes de B5j, B5i, B5h y lectura IA. Cola vacía detiene ejecución; error de modo aborta sin fallback. Preserva autenticación interna, original Whapi, cron, ranking y front-end.

## Límites irrenunciables

Un `$` corroborado representa un **símbolo monetario uniforme**, no una identificación inequívoca de ARS o USD. Ninguna salida B5k permite publicitar `currency_iso_verified=true` a partir de `$`. Aun si el total B5j balanceara en privado, `source_verified=false`, `full_document_covered=false`, `can_publish=false`, `can_rank=false`, `can_reveal_contacts=false`. Ni IVA ni flete se suponen por defecto; se mantiene cobertura vs. competitividad antes de cualquier ranking.

## Pruebas y criterios de aceptación

- Node: nulo en cabecera pero símbolos homogéneos del original; conflicto con moneda candidata, falta de símbolo de un artículo/pie, U$S/USD/EUR/€, moneda expresamente ARS, fuentes SHA inválidas, original duplicado, B5j con y sin corroboración.
- Worker: un único archivo SHA, respuesta privada sin importes/PII, idempotencia, cero cambios externos, caso de archivo alterado, error seguro.
- Edge: modo exclusivo antes de B5j y otros, rechazo de claves no autorizadas, error SQL fail-closed, sin OpenAI y no fallthrough hacia cotizaciones.
- Deno: PDF.js real sintético, sin asumir ISO, cálculo privado y diferencia de un centavo.
- PostgreSQL 17 con ROLLBACK: seleccionar **solo** el histórico `currency_ambiguous`, jamás el previamente balanceado, roles y RLS, flags OFF, reintentos, errores SHA, detección de campos extra/PII, no publicaciones y aislamiento.
- GitHub: seis workflows y suite completa, PR abierto y documentado, piloto sin cambios hasta futura autorización distinta.

**Estado inicial del piloto:** Edge V2 v7 activo, cuatro flags V2/B5h/B5i/B5j OFF, dos diagnósticos B5j privados, cero ofertas creadas desde B5j. B5k **no instalado**.

**Próximo ensayo real (solo tras «Publicalo»):** migración SQL B5k primero con flag OFF, Edge actualizada después, solo una llamada interna autenticada para PDF 2, cierre de cinco flags y auditoría de ledger/WhatsApp/ofertas. El resultado puede confirmar símbolo uniforme, o marcar un bloqueo legítimo si el texto PDF carece del símbolo.
