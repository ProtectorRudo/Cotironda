# Decisión 388 — Etapa 7: contabilizar tokens de OpenAI realmente observados sin inventar pesos (MVP264)

Fecha 06/11/2026. **Solo desarrollo.** Autorización «Luz verde» sin instalación SQL en PILOTO, activación, producción ni mensajes reales.

## Hallazgo

IA Central ya limita las cotizaciones por comprador y proveedor. Sin embargo, su cliente de OpenAI usa Responses API y no conserva su objeto `usage`. No existe una tarifa por modelo validada para cotizar ARS ni reconciliación contra facturas del proveedor; asignar costo monetario de cero ante un timeout o extrapolar tokens sería incorrecto. La documentación actual de Responses permite tomar `usage.input_tokens`, `usage.output_tokens`, `usage.total_tokens` y el ID opaco de la respuesta.

## Implementación

1. `ai_usage_calls_mvp264` guarda exclusivamente número de llamada, HMAC de mensaje original acreditado por Whapi, clave interna de participante, modelo permitido, estado, conteo de tokens cuando existe, SHA-256 del ID de respuesta de OpenAI y fechas. **No guarda tokens de autenticación, prompt, cuerpo de WhatsApp, respuesta del modelo ni identificadores personales en las proyecciones.**
2. RPC `cotironda_piloto_ai_usage_reserve_mvp264` valida mensaje/HMAC de chat, consentimiento, rol y **reserva duradera** existente en las tablas IA Central de comprador o proveedor. La reserva se bloquea por participante para evitar dos llamadas concurrentes que se salteen el límite. Limita a **24 llamadas por participante en 24 horas**, a **200.000 tokens medidos** acumulados en 24 horas y a **8 llamadas por un mensaje de comprador/2 por proveedor**. Un intento previo sin medición (`reserved` o `unmetered`) bloquea futuras llamadas para ese participante hasta reconciliarse. No confundir 200.000 tokens con 200.000 pesos ni suponer que el costo real queda cubierto en un máximo monetario.
3. RPC `cotironda_piloto_ai_usage_finish_mvp264` admite un único cierre por llamada, con estado `observed` y conteos validados (`total=input+output`) o `unmetered` con causa: timeout, HTTP fallido, ausencia/forma inválida de `usage` o respuesta ilegible. Un timeout nunca equivale a entrega fallida ni gasto cero; la reserva queda registrada. Ni una pérdida de confirmación de la base puede justificar repetir automáticamente la llamada.
4. `instrumentoOpenAiMvp264` intercepta solo `POST https://api.openai.com/v1/responses`, con modelo declarado, `store:false` y `tools:[]`. Reserva **antes** de la llamada y obtiene `usage` de una copia de la respuesta, sin alterar el cuerpo que leerá el intérprete. Cuando no recibe conteo auténtico, registra `unmetered` y **falla cerrado**, sin continuar a la segunda llamada ni publicar oferta.
5. El procesador del comprador (que puede invocar lector, verificador, catálogo y ruteador) y el del proveedor (dos lecturas) utilizan esta única envoltura. Las entradas de webhook habilitan el mecanismo solo con **`COTIRONDA_PILOT_AI_USAGE_TRACE_ENABLED === 'true'`**, desactivado por defecto.
6. `cotironda_piloto_ai_usage_summary_mvp264` devuelve solo **agregados por rol** con llamadas, mediciones, consumos desconocidos y tokens efectivamente observados, sin IDs de usuarios o rondas. Su respuesta muestra explícitamente `pricing_verified=false`, `provider_invoice_reconciled=false`, `monetary_cost=null`, `currency=null` y `unknown_usage_is_zero=false`. La función no crea facturas, pagos, suscripciones ni límites de pesos inventados.

El libro privado usa RLS y niega SELECT/INSERT directos a `PUBLIC`, `anon`, `authenticated` y `service_role`, exponiendo únicamente RPC de privilegio controlado al servicio. No se integra la medición con ranking, adjudicación, WhatsApp, cron ni interfaz pública.

## Límites y acciones de cierre

No tenemos todavía un cálculo monetario confiable del modelo ni conversión de USD/ARS, tarifas por modelo verificadas o facturas por proveedor. **El techo por tokens no es garantía de presupuesto en ARS:** pueden existir tokens de entrada multimodal, costos diferentes por servicio, respuestas sin medición, o diferencias entre observación y facturación. En cuanto haya facturas confiables, hacer conciliación determinista por período y modelo, con un ledger separado de precios aprobados y acceso autorizado. Nunca inventar costos para cumplir una meta de `7/7`.

Debe probarse en dos rondas reales y fallas de red: la primera API puede consumir tokens aunque no llegue la respuesta. Mientras esté en `unmetered`, el operador debe revisar el panel de uso de OpenAI antes de volver a permitir llamadas. Este PR no habilita un mecanismo automático de eliminación/reintento de estados inciertos. No se conecta todavía con el saldo de presupuesto de Supabase o Whapi.

## Aceptación

- PG17 transaccional con `ROLLBACK`: dos empresas aisladas, validación HMAC/rol/modelo, reserva/finalización única, límite por tokens y ausencia de uso distinto de cero, consentimiento revocado, permisos SQL.
- Node con `Response` real sintética: extrae usage del API, coteja totales, guarda SHA del ID; timeout/HTTP/uso inválido detienen flujos, cuotas fallidas evitan llamadas de red y la bandera OFF mantiene el broker previo.
- GitHub CI general: Deno, Next.js, PostgreSQL17, PostgREST y test unitarios. Solo fusionar a desarrollo si todo está verde.
