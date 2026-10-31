# 76 — Materiales múltiples en una misma línea, cobertura sin falsos éxitos

**30/10/2026 · Etapa 02 · Issue #125 · rama `feat/02-multimaterial-source-coverage`, hija de PR #124.**

## Riesgo corregido

El informe D016 podía considerar completa una línea escrita como `20 bolsas de Cemento CPC 50 kg; 5 litros de pintura látex interior` aunque el modelo devolviera **solo cemento**. Esto es un riesgo comercial serio: una oportunidad de cotización quedaría oculta bajo un estado de éxito. La prioridad del propietario es calidad y cobertura antes que ahorro de tokens.

## Solución conservadora

El extractor `extraerMaterialesConIA` identifica **separadores explícitos** `;`, `+`, `y` o coma seguidos por una **nueva cantidad + unidad**. Cada tramo es una evidencia de origen independiente, aunque todos citen `Texto, línea N`. La verificación de cantidad, unidad y **descripción técnica completa** se hace contra el tramo, no contra toda la línea.

- `20 bolsas de Cemento CPC 50 kg` => **1** segmento, no confunde `50 kg` (peso de envase) con otro artículo solicitado.
- `20 bolsas de Cemento CPC 50 kg y 5 litros de pintura látex interior` => **2** segmentos.
- Si el modelo reconoce uno y omite otro, el coordinador `simularRondaConCalidadIA` reporta `parcial`, el motivo `segmento_sin_extraccion`, el número estimado de segmentos y el número no extraído. `pedido_totalmente_cubierto=false`.
- Si ambos están respaldados y tienen catálogos/zonas/consentimiento, ambos pueden preparar **consultas** sin que eso signifique cotización recibida ni adjudicación.
- Una IA que duplique un mismo segmento no puede duplicar solicitudes: los segmentos no unívocos se retienen con `origen_no_verificado`.
- Si el delimitador es dudoso o no hay nueva cantidad/unidad, se conserva la cadena sin segmentarla: la evidencia exacta exige claridad. **No hay extracción semántica general de enumeraciones sin cantidades**.

La respuesta del adaptador puede incluir hasta 75 artículos para 25 líneas fuente; se conserva el máximo de 3.500 tokens de salida, tiempo acotado, `store:false`, sin herramientas ni mensajería. Si el modelo no consigue procesar la lista, **no se afirma éxito**.

## Métricas y contrato

`ResultadoExtraccionIA.segmentos_fuente`: segmentos estimados por línea. `segmentos_sin_extraccion`: los que no tienen una única extracción respaldada y libre de avisos. El coordinador D016 suma `segmentos_fuente_estimados` y `segmentos_sin_extraccion` en la línea y el resumen.

Estos conteos reflejan **segmentación explícita de texto**, no comprenden todos los materiales de cualquier oración. El estado `completa` significa *que todas las evidencias explícitas detectadas fueron preparadas*, no una garantía absoluta sobre cualquier lista escrita por una persona.

## Casos y estado

`tests/unit/flujo-calidad-ia.test.mjs` comprueba: dos productos extraídos de una línea, uno u otro omitidos, separador `y`, peso de envase, respuesta duplicada, segunda línea independiente y delimitador incompleto. El resto de la suite protege IA, login, aislamiento, matching y seguridad documental.

**No hay inferencias OpenAI reales ni WhatsApp**, solo mocks, proveedores sintéticos y CI. Antes de piloto: evaluación de precisión con modelo real, catálogos Supabase confirmados, antivirus/cuarentena, autorización de costo y cola idempotente, más mediciones con líneas que contienen artículos sin cantidades.

Issue #125; PR borrador hijo de #124, sin merge, despliegue ni cambios en producción.
