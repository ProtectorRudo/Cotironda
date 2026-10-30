# 68 — Primer adaptador de IA real (OpenAI Responses) para Cotironda

**30/10/2026 · Etapa 02 · Issue #108 · rama `feat/02-openai-responses-extraction` · PR borrador sobre #107.**

## Estado preciso
Se codificó la integración del lado servidor hacia **OpenAI Responses API** con formato de salida **JSON Schema estricto**. El primer modelo candidato es **`gpt-6-luna`** para pruebas controladas de texto. **NO hubo una inferencia real de la API ni se conoce todavía precisión, costo efectivo o disponibilidad de créditos en la cuenta del proyecto**. Las pruebas automatizadas usan un `fetchImpl` simulado; jamás realizan llamadas ni consumen tokens. No instalar `OPENAI_API_KEY` en GitHub Actions ni adjuntar archivos/compras reales.

Documentación oficial consultada el 30/10/2026: [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [modelo gpt-6-luna](https://developers.openai.com/api/docs/models/gpt-6-luna), [precios API](https://platform.openai.com/pricing). Verificar de nuevo antes de comprar créditos o habilitar tráfico remoto.

## Secuencia técnica
1. **Futuro backend** autentica al comprador, verifica empresa/permiso, cuota y consentimiento informado al enviar. Solo ese backend aporta el texto, una clave **servidor** y catálogos/zonas confirmados.
2. `extraerMaterialesConIA(...)` exige flag `habilitarLlamadaExterna=true`, clave de servidor `sk-*`, máximo 9.000 caracteres, 25 líneas por llamada; modelo fijo `gpt-6-luna`, `store:false`, `tools:[]`, `max_output_tokens:3500`, timeout de 18 segundos, endpoint fijo `https://api.openai.com/v1/responses`.
3. Se separa rol system (reglas de extracción) de contenido de usuario **no confiable**. El esquema exige `ubicacion`, `descripcion_original`, `producto_normalizado`, `cantidad`, `unidad`, `rubro`, `marca`, `marca_obligatoria`, `confianza`; campos opcionales usan `null` y `additionalProperties:false`.
4. Respuestas incompletas, rechazo, error, JSON malformado, referencias inexistentes, campos de más y tamaños excedidos fallan cerrado. No se emiten cuerpos crudos de errores/API a logs.
5. La validación local compara el nombre citado con la **línea fuente** y exige evidencia de cantidad + unidad **fuera de la descripción técnica**. Ejemplo: en `20 bolsas de Cemento CPC 50 kg`, el `50 kg` no puede pasar por `50 kg pedidos`. Si la IA omite `CPC 50 kg` y devuelve solo `Cemento`, se bloquea el despacho de la línea.
6. `prepararBorradorDocumental()` conserva duplicados, ambigüedades y referencias. Añadidos códigos `origen_no_verificado` y `cantidad_sin_evidencia`, que el matcher interpreta como **no enviable**.
7. `simularPlanesConIA(...)` verifica permiso de envío antes de gastar tokens, llama al extractor y usa `planificarDespachoAutomatico()` para generar **solo un plan sin envío real** por proveedor apto, catálogo específico y zona. La IA NO elige proveedores ni modifica catálogos.
8. Se devuelven `lineas_sin_extraccion` para detectar omisiones: no se puede decir que el pedido se procesó íntegramente si la IA dejó líneas sin cubrir.

## Límites de precisión y seguridad
- **El modelo no está entrenado para Cotironda**: usaremos inicialmente instrucciones versionadas y corpus de evaluación, no fine-tuning.
- Un `confianza=0.99` dicho por la IA no certifica verdad. La distribución sigue exigiendo coincidencia exacta conservadora con catálogo y unidad confirmados, evidencias y controles de baja/zonas.
- Las reglas actuales intencionalmente **retienen muchas variantes lingüísticas** («el cemento común»), hasta disponer de alias y equivalencias técnicas verificados: no falsificar la tasa de cobertura.
- La prueba de texto no incluye imágenes, OCR, PDFs, Excel arbitrario, Word, archivos maliciosos, integración de permisos de empresas reales, WhatsApp, cola, pagos ni Vercel.
- `store:false` es una opción de la solicitud, **no una garantía absoluta de retención cero o tratamiento legal de datos**. Evaluar las políticas vigentes antes de remitir documentos reales, pedir consentimiento y minimizar datos.
- Aislamiento de secretos: clave solo en Secret Manager del entorno de desarrollo autorizado; **nunca** repositorio, frontend, mensaje de chat, logs o workflow público.

## Cómo evaluar precisión REAL sin entrenar
El corpus `tests/fixtures/materiales-argentinos-ia-v1.json` contiene 12 casos ficticios: cemento 25/50 kg, látex 20 l, placas 12,5 mm, cable, coma decimal, número ambiguo, duplicados, ausencia de cantidad, marca obligatoria y prompt injection.

`npm run eval:ia` es **OFFLINE**: no hace llamadas, no consume créditos.

Para una evaluación real **solo tras autorización de gasto y configuración privada**, ejecutar manualmente en un equipo o worker DEV aislado: `COTIRONDA_IA_LIVE_EVAL=AUTORIZADO_DEV` y secret `OPENAI_API_KEY` inyectado por su gestor, seguido de `npm run eval:ia -- --live`. El evaluador limita a **3 muestras sintéticas**, un modelo, salida limitada a 3.500 tokens por caso, nunca se ejecuta en GitHub Actions y entrega resumen sanitizado: coincidencia de cantidades, líneas omitidas, advertencias y uso de tokens. No habilitar hasta disponer de clave DEV y presupuesto aprobado.

**NO hay datos de precisión reales todavía.** Se deben medir al menos exactitud de cantidad/unidad, evidencia de descripción, cobertura, falsos destinatarios (objetivo de 0), tiempo por solicitud y costo por comprador. A/B de modelos solo con presupuesto/corpus aprobado.

## Pruebas y despliegue
`tests/unit/openai-extraccion.test.mjs`: mocks de Responses, encabezados y schema, permisos/clave, referencias, omisiones, rechazo, 401/429, JSON inválido, límites, duplicados, instrucciones adversarias, descripciones parciales, peso de envase vs cantidad y el plan con catálogo. No existe endpoint accesible al navegador ni conexión WhatsApp.

Al revisar PR y GitHub Actions del commit final registrar CI real; la creación de código no equivale a ejecutar IA remota. El PR debe permanecer borrador apilado sobre #107, **sin merge, despliegue ni tráfico externo automático**.
