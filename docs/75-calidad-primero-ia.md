# 75 — D016: calidad de interpretación primero, economía de tokens después

**30/10/2026 · Etapa 02 · Issue #123 · PR draft hija de #122.**

## Decisión comercial
El propietario confirma que Cotironda **prioriza calidad de resultados, amplitud de proveedores correctamente seleccionados y trazabilidad** por encima de reducir costos de IA. Si hacen falta consultas de modelo en cada lista, se pagan, siempre con presupuesto sostenible y mediciones. La ruta local de docs/74 **NO debe convertirse en ruta principal solo por ser gratuita**.

## Nuevo contrato
`src/server/flujo-calidad-ia.ts` implementa `simularRondaConCalidadIA(...)`. Usa IA primero por defecto en **laboratorio**: `extraerMaterialesConIA` (OpenAI Responses API) → validación documental → taxonomía curada de productos argentinos → matcher por SKUs confirmados/zona/consentimiento D015.

El resultado, **`plan_calidad_prioritaria_sin_envio`**, es una preparación de invitaciones, no un envío. Devuelve resumen por **cada línea fuente no vacía** con estados:

- `preparada_para_consultar`: producto identificado, sin advertencias, con al menos un proveedor elegible.
- `parcial`: una parte de los artículos extraídos de esa línea obtuvo proveedor o existen advertencias para otra parte.
- `retenida`: datos ambiguos, marca exclusiva sin evidencia, duplicados u otra alerta técnica/documental.
- `sin_proveedor_confirmado`: producto reconocido pero ninguno de los comercios del catálogo y zona dados puede cotizarlo.
- `omitida_por_ia`: el modelo no devolvió un ítem para esa línea. Nunca se presume que el pedido quedó completo.

También informa la cantidad de proveedores distintos y `pedido_totalmente_cubierto` solo cuando todas las líneas tienen resultado preparado. El estado por línea distingue **cobertura documental** de **participación posible**; todavía no equivale a cotización recibida ni adjudicación.

## Evidencia de extracción y lenguaje habitual
Se amplió de modo conservador el verificador `fuenteCantidadUnidad` para tolerar envoltorios inequívocos como `Necesito 20 bolsas de Cemento CPC 50 kg`. La IA tiene que citar el **producto completo**, cantidad y unidad explícitas en la fuente. Si recorta `CPC 50 kg` y devuelve solo `Cemento`, o interpreta los **50 kg de la bolsa** como cantidad solicitada, se retiene. Ninguna frase genérica autoriza alterar el pedido. Se preservan duplicados.

## Ruta económica de la etapa anterior
El módulo `entrada-economica.ts` sigue siendo útil como **comparador**, preprocesamiento o futura optimización. No forma parte del coordinador IA-first de D016. Solo se habilitará como ruta principal si un benchmark independiente por nicho demuestra cobertura y error de invitación al menos equivalentes a IA, incluidas solicitudes coloquiales y de marcas o envases alternativos. La comparación debe registrar precisión, recall, errores críticos, falsos proveedores, costo/token, latencia y retenciones por rubro.

## Seguridad y límites comerciales
- El preflight para comprador y proveedores ocurre antes de la llamada remota; **el caller autenticado** aún debe conectar tenencia/empresa, cuotas, secretos de entorno, protección de documentos, consentimiento y presupuesto. Una bandera de función no es un control de acceso de producción.
- Si OpenAI falla, 429 o no está autorizada la red, la función devuelve error controlado y **no sustituye** silenciosamente con un envío basado en reglas locales.
- Catálogos del laboratorio son **ficticios**; el código no accede a Supabase real, ni envía WhatsApp/Whapi, ni anuncia adjudicaciones ni calcula precios.
- El criterio actual 'una o más extracciones por línea' es **insuficiente para garantizar que una misma línea con varios productos haya sido exhaustivamente cubierta**. Hasta incorporar segmentación por evidencias o span de texto, no afirmar cobertura semántica perfecta. El corpus sigue limitado y no se realizaron inferencias auténticas.
- `pedido_totalmente_cubierto` es un indicador **interno del plan observado**, no un certificado de que el modelo haya identificado absolutamente todos los productos escritos.

## Pruebas
`tests/unit/flujo-calidad-ia.test.mjs` ensaya con **MOCK** de Responses API: producto claro, envoltorios coloquiales, líneas omitidas, fuera de taxonomía, sin proveedor, cantidad inventada, pesos de envase confundidos, descripción recortada, marca flexible/exclusiva, duplicados, error 429, sin autorización comprador, red deshabilitada y proveedor sin consentimiento.

**NO hubo ninguna llamada real a OpenAI ni uso de créditos de IA**. Para obtener evidencia de calidad por rubro hacen falta secrets privados DEV y presupuesto autorizado, corpus independiente y pruebas de respuestas reales. Ninguna funcionalidad de este PR habilita WhatsApp ni producción.

## Condiciones antes del piloto
Revisión de factibilidad con documentos de clientes anonimizados/autorizados, antimalware/cuarentena (Issue #61), validación contra catálogos reales aislados por empresa, pruebas de captura de cada artículo, costo por solicitud/cliente, seguridad y reintentos de Whapi. No publicar ni hacer merge hasta integrar en orden los PRs apilados.