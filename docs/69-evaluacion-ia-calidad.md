# 69 — Banco de calidad de IA documental: seguridad del despacho y cobertura

**30/10/2026 · Etapa 02 · Issue #110 · rama `feat/02-ia-quality-gate` · hija de PR #109.**

## Qué se implementó
Nuevo evaluador **determinista y sin red** `src/domain/evaluacion-ia-documental.ts` que contrasta la extracción de materiales y el plan del matcher contra un *gold set* de líneas y destinatarios esperados. Se mide una línea por **ubicación, descripción, cantidad, unidad y rubro**, y cada destino por **proveedor, fila, descripción, cantidad, unidad y rubro**. Los duplicados cuentan mediante *multisets*: no se fusionan ni se maquillan.

Las métricas independientes son: **exactos, omitidos, inventados, errores de cantidad/unidad, precisión y cobertura de extracción**; además, **destinos correctos, incorrectos, omitidos y retenidos**, precisión y cobertura del despacho. En canastas diferentes no se infieren rankings económicos.

## Dos puertas separadas
- `puerta_seguridad=FAIL` si hay artículos inventados, atributo de cantidad/unidad/rubro alterado, envíos a proveedores no esperados o destinatarios con cantidades equivocadas. **Meta: cero falsos destinatarios**.
- `puerta_cobertura=FAIL` cuando la cobertura de destinos esperados (o de extracción si no hay destinatarios elegibles) cae por debajo del umbral configurable, inicialmente **90%**. Una línea retenida puede evitar un envío incorrecto, pero no se contabiliza como compra procesada.
- **Ningún PASS offline autoriza un envío real**: el resultado fijo `apto_para_envio_real=false` documenta esta barrera.

## Corpus y tests
- `tests/fixtures/gold-despacho-ia-v1.json`: **12 casos de construcción argentina, 100% sintéticos**, con respuestas modeladas, catálogo por proveedor, zonas/consentimiento y adjudicación esperada. Incluye 2 casos deliberadamente mal interpretados y 1 caso deliberadamente incompleto: la prueba debe marcarlos con FAIL cuando corresponda.
- `tests/helpers/evaluador-gold.mjs`: ejecuta respuesta **MOCK** de Responses API sobre el adaptador y planificador existentes. Inspecciona método, `store:false`, `tools:[]`. No ejecuta ninguna llamada remota.
- `tests/unit/evaluacion-ia-documental.test.mjs`: prueba el gold completo, falsos destinatarios, cantidad alterada, cobertura baja, falta de autorización, duplicados y contratos inválidos.
- Comando reproducible **`npm run benchmark:ia:offline`** (Node 22+). Imprime los resultados agregados sin secretos y retorna código distinto de cero si algún caso deja de clasificarse según las puertas esperadas.

## Interpretación correcta
Que el benchmark sintético coincida en los 12 casos significa que **la métrica y las protecciones se comportan como se diseñaron**, NO que GPT-6 Luna logre 100% de precisión. Las predicciones del conjunto se suministran directamente como mocks; no hubo inferencia auténtica, consumo de tokens ni costo de OpenAI.

Un mismo artículo enviado correctamente a dos proveedores habilitados cuenta como **dos destinos correctos**, no como un ranking de ofertas. Cuando no hay proveedor con opt-in y zona, la cobertura de distribución es `null`, no se inventa un `100%` de proveedores cotizando.

## Próximo paso antes de activar IA real
1. Asegurar secretos y límite de gasto del proyecto de desarrollo, **sin compartir claves en el chat**.
2. Ejecutar con autorización 3 casos sintéticos live y cotejar resultados contra el gold set; registrar conteos, latencia y tokens reales.
3. Ampliar el corpus a varios cientos de listas/archivos sintéticos y después anonimizados autorizados; medir precisión por rubro, cantidad, marca, unidad y falsa invitación.
4. Definir alias técnicos por rubro y proveedores con catálogos confirmados; integración de archivos auténticos solo tras la cuarentena/AV de Issue #61.

**Estado de integración:** rama apilada sobre PR #109 y anteriores. Sin merges a main, producción, WhatsApp, Supabase ni archivos de clientes. El cierre del Issue requiere pruebas CI documentadas.

## Evolución del evaluador live preparado en este mismo PR
Se actualizó `scripts/eval/openai-texto.mjs` para **comparar 3 pruebas sintéticas reales** (`normal_cemento`, `tres_rubros`, `numero_ambiguo_retenido`) con este gold set, no solo leer si la respuesta parece JSON. El comando sin `--live` continúa offline; con `--live` requiere secret de servidor `OPENAI_API_KEY`, `COTIRONDA_IA_LIVE_EVAL=AUTORIZADO_DEV`, **no CI, no GitHub Actions, no Vercel production**. Se detiene ante error o ausencia de `usage`, sin reintentos. Reporta precisión de destinatarios, líneas retenidas, exactitud, tokens y **estimación** de costo basado en tarifa Standard de Luna a 30/10/2026 (USD 0,10/M entrada y 0,50/M salida; consultar tarifa vigente). Un corte suave de USD 0,02 no equivale a límite contable duro: el verdadero bloqueo de gastos debe configurarse en la cuenta OpenAI antes de ejecutar live. Este código **NO ha ejecutado aún ninguna inferencia real**.
