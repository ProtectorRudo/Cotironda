# 65 — Primer módulo ejecutable de la Etapa 02: borrador documental seguro

**30/10/2026 · Issue #100 · rama `feat/02-draft-extraction-contract` · PR en borrador sobre #99.**

## Qué se implementó
`src/domain/extraccion-documental.ts` transforma una salida estructurada **no confiable** de un futuro modelo de IA en líneas revisables. No hace solicitudes de red, lectura de archivos, análisis de PDF, acceso a Supabase, llamadas a OpenAI, cálculo de precios ni notificaciones.

Contrato de entrada: `prepararBorradorDocumental(formato, { items: [...] })`, con `formato` perteneciente a `texto | pdf | excel | word | imagen`.

Cada elemento de `items` puede proporcionar:
- `ubicacion`: página, línea, hoja o celda donde figura el material;
- `descripcion_original` y `producto_normalizado`;
- `cantidad`: string numérico decimal sin separador de miles;
- `unidad` y `rubro`: códigos del catálogo compartido;
- `marca`, `marca_obligatoria`, `confianza`.

La salida contiene solamente campos autorizados, incidencias por fila, referencias y posibles duplicados. Estado único: **`pendiente_despacho_automatico`**. El comprador no revisa cada línea: autoriza distribución al enviar su lista. El estado NO implica envío real: un matcher debe filtrar catálogos específicos, zona y consentimiento.

## Invariantes de calidad y seguridad
1. Conservar descripción original y localización; no inventar cantidades, rubros ni unidades.
2. `2,5` pasa a la representación decimal exacta `2.5` como **string**; `1.000` y `1,000` se consideran ambiguos, nunca se normalizan a mil sin consulta.
3. Falta de dato, formato inválido, marca exigida sin marca o baja trazabilidad genera error o aclaración, no un pedido listo para enviar.
4. Duplicados se **conservan** y se marcan. Se podrían referir a entregas distintas.
5. Campos arbitrarios que entregue la IA (`precio`, `telefono`, `email`) se descartan. La IA no tiene autoridad para insertar precios ni instrucciones.
6. Límite de 100 líneas por ejecución y longitudes máximas para la salida del modelo, con rechazo de cargas sobredimensionadas.
7. No habilitar uploads: el Issue #61 exige antivirus/escaneo real, cuarentena y autorización antes de manejar documentos auténticos.

## Pruebas y alcance
`tests/unit/extraccion-documental.test.mjs` cubre estado, trazabilidad, coma decimal, cantidades ambiguas, campos ausentes, marca, duplicados, supresión de datos extra, prompt injection, tipos inválidos, límites y ausencia de equivalencia inventada.

Estas son pruebas de contrato con **datos sintéticos**, no validación de precisión de OCR/LLM, compatibilidad comercial, modelo OpenAI ni documentos auténticos. El siguiente incremento de la Etapa 02 debe agregar un corpus sintético auditable y adaptadores de extracción restringidos por formato.

## Condiciones antes de piloto
Sin fusionar PRs apilados, comprobar backup real offsite, controles HTTPS de Auth, antivirus con cuarentena, costos y autorización por organización. No publicar un portal comercial ni conectar WhatsApp en esta fase.

## Rectificación D013 — 30/10/2026
La confirmación manual del comprador se RETIRA. La extracción queda pendiente de distribución automática y se pasa al planificador puro despacho-automatico.ts, que devuelve exclusivamente subconjuntos por proveedor de catálogo confirmado, zona y consentimiento; nunca envía. MVP matcher estricto: descripción original y normalizada idénticas (sin inventar especificaciones), producto exacto en catálogo confirmado, unidad/rubro iguales, cantidad segura, marca obligatoria compatible, alta confianza como filtro negativo y sin duplicados/dudas. Sinónimos/equivalencias requieren verificación técnica futura, no la afirmación de IA. Catálogos y consentimiento provienen exclusivamente del backend confiable, no del archivo. Los proveedores cotizan y confirman sus precios después.
