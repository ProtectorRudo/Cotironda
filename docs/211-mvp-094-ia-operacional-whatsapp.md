# MVP-094 — Cotironda IA operacional: interpretar sin inventar ni conversar de más

02/11/2026 · Issue #398 · PR #399 · PILOTO, no producción.

## La función de la IA

La IA interpreta el **mensaje original de WhatsApp** y el contexto de negocio comprobado. Clasifica saludo, pedido de cotización, pregunta breve sobre Cotironda, seguimiento y otros. Cuando es un pedido, propone localidad, nota de entrega y cada artículo con cantidad, unidad, descripción completa y evidencia literal. No sabe existencias, precios reales, impuestos, fechas prometidas ni datos de ganadores, por lo que **jamás los inventa**. El proveedor cotiza con su mensaje o archivo original; Cotironda debe preservarlo íntegro antes de extraer importes.

La IA **no redacta mensajes libres ni ejecuta acciones**: `business-ai-policy.ts` elige entre textos cortos, aprobados y versionados. No responde a simples saludos ni a temas sin respuesta verificable. Sólo se pregunta por la localidad faltante o por información material ambigua. Los presupuestos se guardan, distribuyen y comparan con reglas deterministas; la IA no ordena ofertas ni revela identidades.

Los únicos hechos comerciales publicados por respuestas fijas:
- Cotironda recibe pedidos y consulta a negocios según rubro y zona.
- Proveedores: uso gratis, sin comisiones.
- Compradores: servicio en piloto, precio futuro sujeto a confirmación.
- Durante la ronda hay anonimato; la consulta de avance es por enlace privado.
- El plazo de cierre controla cuándo se pueden ver ofertas, sin adjudicación automática.

No afirmar que YA funciona la clasificación/documentación de todas las categorías cuando el piloto se limita a dos familias y un arquitecto.

## Seguridad: IA como propuesta + validación independiente

1. El webhook valida Whapi por secreto, canal, HMAC de identidad y mensaje. Antes de llamar a OpenAI, `cotironda_piloto_reserve_ai_mvp094` controla rol `buyer`, consentimiento vigente, baja, entrada activada, replay y **un máximo de 12 llamadas/24 horas por comprador**. No intenta interpretar cotizaciones de proveedores con este modelo de comprador.
2. Adaptador `ai-interpreter.ts` usa Responses API con JSON Schema estricto, modelo de laboratorio `gpt-6-luna`, `store:false`, `tools:[]`, `max_output_tokens=2100`, 3000 caracteres por mensaje, timeout 16 s. No registra prompts, datos de terceros, claves ni respuestas crudas; no usa MCP, búsqueda web ni acceso a herramientas remotas.
3. La respuesta es estructura de intención y artículos. `validateAiBuyerProposal()` coteja cantidad/unidad/producto, evidencia literal y todas las líneas con un analizador independiente. **La IA sola nunca autoriza enviar solicitudes.** Si hay omisión, falta zona, error o rechazo del modelo, se retiene el original cifrado con estado de revisión. Este filtro es intencionadamente conservador hasta medir precisión real.
4. Si hay una consulta puntual y está permitido responder, `cotironda_piloto_reserve_reply_mvp094` exige mensaje ya persistido en `whapi_inbox`, rol comprador, consentimiento, salida Whapi habilitada, estado `needs_zone` o `needs_review`, 5 respuestas/24 h y unicidad del HMAC. Un único envío directo; timeout/API incierta se marca `uncertain`, sin reintento automático. La fuente de texto siempre es `shortBusinessReply()`, nunca el modelo.
5. **Dos banderas privadas separadas, ambas OFF si no se configuran:** `COTIRONDA_PILOT_AI_ENABLED=true` habilita el intento de interpretación; `COTIRONDA_PILOT_AI_REPLIES_ENABLED=true` habilita mensajes operativos breves. La clave `COTIRONDA_PILOT_OPENAI_API_KEY` se instala **una sola vez** en Edge secrets del entorno; no debe cargarse por cliente, ni compartirse en chat, GitHub, logs o envíos.
6. El coste está acotado por 12 solicitudes/día por comprador, 2100 tokens de salida máximos, timeout y registro sin doble gasto; **no es un presupuesto monetario completo**. Antes de uso con clientes reales hacen falta límite global de dinero, observabilidad de `usage` y alertas de costos.

## Alcance efectivo / no implementado aún

- MVP-094 conecta IA de intención para **texto del comprador autenticado** con autorización verificable y flags; conserva el parser determinista como fallback cuando la IA no está habilitada. No interpreta automáticamente PDF, Excel, Word, foto ni audios: MVP-093 sólo preserva metadata del adjunto cifrada, no su binario.
- Por seguridad, una extracción IA no cotejada al 100% con la fuente no se convierte en pedido; pregunta solo si faltan datos esenciales. La IA no resuelve unidades faltantes ni suscripciones comerciales.
- El resto del piloto sigue limitado a 1 nueva ronda en zona La Plata y proveedores Ailín/Nahuel con familias cemento/hidrófugo; el registro dinámico de contactos y catálogos reales sigue pendiente.
- Una cotización de proveedor se guarda en `offer_versions` como original inmutable. La creación de plantilla anónima fiel (PR #389) y el comparador determinista ya existen pero requieren conectar revisión de datos y proceso de cierre; **ranking y revelación de finalistas automáticos NO forman parte de este incremento**.
- Antes del cierre, el enlace muestra cantidad de ofertas y recibos anónimos. No se muestran importes ni nombres. Después, sólo ofertas explícitamente auditadas/anonimizadas; no inventar ranking si las ofertas son parciales.

## Plan de verificación y apagado

- `tests/unit/mvp094-ia-interprete-cotironda.test.mjs`: respuesta a preguntas frecuentes, saludos que no disparan mensajes, texto claro, omisión/monto inventado, proveedor sin modelo, inyección, fallos 401/429, timeout, salida Structured Outputs.
- `supabase/piloto/mvp094_smoke_rollback.sql`: prueba transaccional con HMAC sintéticos del comprador de ensayo (sin números/tokens), consentimiento, cuota diaria, idempotencia, role gating, reply ledger, RLS y rollback.
- Verificar GitHub CI de la rama exacta, SQL smoke real en PG17 PILOTO y Edge activa sin flags de IA configuradas antes de habilitar una llamada real.
- Si el modelo produce un falso positivo, el sistema debe guardar `needs_review` y **no** consultar a proveedores sin evidencia. El interruptor de emergencia es `COTIRONDA_PILOT_AI_ENABLED=false`; no cambia la recepción de Whapi ni el cron de cierre.

## Próximas fases

Descargar documento Whapi por media ID validado → original cifrado privado → extracción IA con evidencia por página/hoja y validación humana cuando sea indispensable → planificador catálogo/rubro/zona → cotizaciones proveedor fieles → comparación determinista (IVA/fletes/unidades/cobertura) → ranking cerrado y revelación idempotente hasta 2 finalistas. Separar entregas y probar cada gate con ejemplos reales y adversarios.

Fuentes: `src/server/openai-extraccion.ts` y pruebas de IA DEV anteriores; docs 04, 06, 68, 210; [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [Responses API](https://developers.openai.com/api/docs/guides/text-generation).
