# Decisión 472 — MVP337: presupuestos heterogéneos, evidencia completa y pruebas sintéticas

**Fecha:** 10/11/2026. **Estado:** desarrollo sin despliegue; PR independiente y dependiente del PR #742 (MVP336).  
**Objetivo de negocio:** el proveedor debe cotizar de la manera habitual y Cotironda adaptarse, sin plantillas obligatorias ni confirmaciones repetidas.

## Auditoría previa del código real

- La recepción Whapi acepta MIME de PDF, JPEG/PNG/WebP, DOC/DOCX, XLS/XLSX y CSV/TXT con archivo de hasta **8 MB**. Las extensiones heredadas DOC/XLS pueden originar un borrador privado, no una validación comercial automática.
- `document-ai-draft.ts` acepta un máximo de **25 líneas por lectura**, independientemente de cuántas líneas tenga el original.
- El PDF general comprueba un máximo de **12 páginas** y **300 filas extraídas** por llamada; considera escaneos y capas visuales complejas como revisión.
- El verificador Office comprueba fórmulas, hojas ocultas, medios embebidos y otras situaciones complejas conservadoramente; no las publica.
- El verificador visual `supplier-source-image-mvp251.ts` siempre devuelve `needs_source_review`, aun cuando dos lecturas coincidan, pues los dos modelos no prueban el píxel original.
- El puente económico `ai-central-document-mvp245.ts` también recibe como máximo **25 líneas** y exige `source_text_covered`. El texto libre de proveedor tiene otras cotas propias.
- Estas barreras **no deben relajarse por decreto**. Un resultado de IA no justifica publicar un precio que el original no respalde.

## Diseño MVP337 — entrega implementada en desarrollo

### 1. Adaptador textual conservador

`src/domain/ia-central/adaptador-texto-flexible-mvp337.ts` transforma TXT, CSV o mensajes en filas originales con números estables de posición y sección. No elimina productos ni condiciones; conserva el texto **exactamente**, incluso descuentos, cargos y notas. Ignora únicamente separadores vacíos. No extrae precios ni decide equivalencias.

### 2. Planificador de lotes independientes del formato

`src/domain/ia-central/ingesta-evidencia-flexible-mvp337.ts` recibe filas ya extraídas por un lector autorizado (cualquier formato identificado). Cada fila tiene `position`, `section` (página, hoja, mensaje, imagen, transcripción) y `literal`; el plan hereda el SHA-256 del original autenticado.

- Divide documentos de **más de 25 líneas** en lotes con máximo de 20 filas y 4.500 caracteres por lote; **no corta jamás una fila**.
- Establece límites de seguridad (hasta 1.200 filas y 450.000 caracteres de texto extraído) sin confundir el límite de costo con una cuota comercial: un archivo fuera de rango queda **en revisión**, no se recorta silenciosamente ni se declara cotizado.
- Preserva el orden, las secciones y todas las filas, incluidos encabezados, totales, condiciones, descuentos y material adicional.
- La función **no procesa bytes PDF/Excel/fotos**, solo evidencia textual previamente extraída. Su presencia no elimina los límites de 8 MB, 12 páginas o 25 renglones del pipeline actual.

### 3. Dos lecturas y reconciliación de los renglones

`corroborarLecturasMvp337` recibe dos propuestas independientes que especifican las evidencias literales de cada fila. Deben:

- Cubrir todos los IDs originales exactamente una vez, sin inserciones ni borrados.
- Citar fragmentos contiguos verificables del texto original para descripción, cantidad, unidad, precio y total.
- Evitar atribuir el número 15 de `15000` o de `15.000` como cantidad 15.
- Concordar en las interpretaciones. Una lectura dudosa, fila desconocida, importe inventado, fila omitida, repetición, identificación cruzada o discrepancia hace fallar el gate.
- Si ambas coinciden, el resultado **solo** pasa a `ready_for_independent_source_audit`. Nunca marca `economicPublicationAllowed=true` ni envía mensajes.

La coincidencia de dos lecturas por IA no es auditoría visual u OCR independiente y no permite publicar ofertas por sí sola.

### 4. Corpus sintético reproducible

`tests/fixtures/mvp337-presupuestos-heterogeneos.mjs` contiene **192 combinaciones sintéticas**: 12 etiquetas de origen × 16 variantes de diseños comerciales, incluyendo 42/87 líneas, descuentos, retornos de pallets, total ausente, IVA, pago, flete y rubros mezclados. `tests/unit/mvp337-ingesta-universal-proveedores.test.mjs` comprueba trazabilidad, orden, integridad, lectura concordante y escenarios adversarios. `scripts/eval/mvp337-corpus-offline.mjs` imprime un informe reproducible.

**Advertencia obligatoria:** estas son **filas de texto y propuestas de IA ficticias preparadas por el test**, no 192 PDF, Excel, imágenes o audios reales. Cero llamadas a OpenAI; no se midió precisión ni se evaluó OCR real. Las etiquetas de origen prueban independencia del layout, no compatibilidad real de esos decodificadores.

## Criterios de aceptación ya codificados

1. 192 escenarios sintéticos preservan el 100% de renglones en su orden y sección; se ensayan 25+ y 80+ filas.
2. Una fuente ilegible, excesiva, con caracteres de control, hash inválido o fila cortada no obtiene estado aprobado.
3. Fila omitida, duplicada, añadida, interpretada dos veces de modo divergente, importe inventado o fragmento numérico incompleto exige revisión.
4. Una oferta parcial sin total explícito NO recibe total inventado. Materiales y extras se conservan sin atribuir ganador.
5. Sin modificaciones del webhook histórico ni del módulo MVP291 congelado. Sin migraciones, gastos de IA, Whapi, cron, Vercel, Supabase piloto o producción bajo «Luz verde».
6. El PR se acepta únicamente tras Node/TypeScript, pruebas del corpus y regresiones MVP332/MVP336 en GitHub.

## Resultado CI verificado del primer candidato

- Head auditado: `a853d946438f94591454105f6e672b7b4367f200` (antes del agregado de esta constancia).
- Workflow MVP337: **PASS**, comprobación de tipos Deno, **200/200** pruebas del corpus y adversarias, más **29/29** regresiones de módulos históricos MVP291/MVP292/MVP332/MVP336.
- Informe offline: **192** fuentes sintéticas, **12** etiquetas de formato, **3.120** renglones, **24** ejemplos de más de 25 renglones y **60** sin total declarado; cero fallas del contrato sintético.
- Suite general: **3.686 PASS**, **0 FAIL**, **10 SKIP** sobre 3.696 pruebas.
- CI de etapa documental MVP245, PostgreSQL17 de aislamiento por empresa, PostgREST y chequeo de sitio: exitosos.
- El check de Next.js seguía ejecutándose al momento de la primera verificación; no confundir esa espera con una aprobación. Checks de Vercel pueden estar limitados por cuota.
- **0** modelos IA reales evaluados, **0** presupuestos binarios reales leídos, **0** cambios de tablas, **0** mensajes, **0** ofertas publicadas.

## Lo que NO está terminado y es requisito de publicación

- Integrar la extracción segura por formato para PDF mult página, OCR real de escaneos/fotos, DOCX/XLSX reales y archivos extensos; especialmente 26+ renglones **desde bytes hasta cotejo comercial**.
- Diseñar límites de presupuesto de tokens/OCR y cuotas razonables, con lotes idempotentes que no reanalicen contenido ya procesado y mantengan originales cifrados.
- Acoplar los lotes al worker real, a la doble lectura, a la comparación fuente independiente y a los RPC privados de precios y tracking. Es necesario versionar contratos SQL y mantener RLS/consentimiento/canales. Las imágenes requieren corroboración OCR ajena al mismo modelo.
- Registrar correcciones de proveedor, mensajes consecutivos y varios documentos sobre una misma ronda sin confundir envíos o duplicar un presupuesto.
- Validar una **muestra representativa de al menos 150 originales reales anonimizados**, con oráculo humano por renglón, error de cantidades, dinero, extras, moneda y fechas, costes y latencias. No usar únicamente variaciones generadas con plantillas.
- Probar Whapi -> archivo -> asociación de ronda -> fuente económica verificada -> seguimiento anónimo -> cierre con 2 proveedores. Un test de contrato no sustituye el piloto.
- Comprobar costos y seguridad antes de ampliar límites físicos. No prometer lectura perfecta de ilegibles; registrar `requiere_revision` sin abandonar el documento.

**Decisión:** desarrollar la capa flexible y el corpus sin publicar todavía. MVP336 se mantiene como corrección específica en PR #742; MVP337 se apila como nueva rama para integrar después de su auditoría. La publicación del piloto requiere instrucción independiente «Publicalo» y preflight conjunto.
