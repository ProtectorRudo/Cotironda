# Decisión 411 — MVP286: mensaje recibido, IA Central falló en silencio

Fecha: 7/11/2026, 03:11 AR. Incidente real abierto en [Issue #673](https://github.com/ProtectorRudo/Cotironda/issues/673).

## Evidencia verificada en `cotironda-piloto` (solo lectura)

- El arquitecto autorizado envió **un texto** que ingresó a `whapi_inbox` el 07/11/2026 a las 06:11:04 UTC (03:11:04 AR).
- `whapi_inbox.processing_state=needs_review`; `ai_central_attempts_mvp226.state=review` y `failure_code=semantic_review_required`.
- No se creó una ronda, no hay revisión de comprador ni despachos a proveedores. `ai_usage_calls_mvp264` no registró invocaciones para ese mensaje, pero eso **NO demuestra que no se llamara a OpenAI**: el registro de uso es opcional y el broker pudo hacer solicitudes sin ese tracing.
- El registro de llamadas a RPC confirma `reserve_buyer_mvp226` seguido de `finish_buyer_mvp226`, **sin llamada a `cotironda_piloto_ia_catalogo_mvp220`**. Por lo tanto la parada ocurrió antes de cargar el catálogo. No corresponde culpar a Whapi, al proveedor ni al envío PDF.
- **Causa exacta de la lectura IA NO disponible de forma retrospectiva**. El código anterior convertía fallas de modelo, lectura doble, salida JSON y conflictos de evidencia en una sola causa: `semantic_review_required`. No inventar un código HTTP de OpenAI, claves inexistentes ni un fallo de modelo sin pruebas.

## Corrección desarrollada, no publicada hasta certificación CI

1. `src/domain/ia-central/cliente-openai-v1.ts`: conservar categorías técnicas **cerradas y sin datos personales** para HTTP 401/403, 400/404/422, 429, 5xx, timeout, respuesta demasiado grande y estructura inválida. Nunca guardar mensajes, cuerpos HTTP, credenciales ni salidas del modelo.
2. `ai-central-buyer-mvp226.ts`: guardar el código de revisión validado contra una allowlist; nunca abrir una ronda si la fuente no está verificada.
3. `mvp286_notificacion_revision_semantica_sin_reenvio.sql`: ledger privado con RLS y permisos exclusivamente `service_role`; reserva única por HMAC de mensaje, identidad comprador consentida, archivo original de menos de 10 minutos, estado IA `review`, sin request asociado, 2 avisos/24h, cuatro puertas habilitadas. No llama Whapi ni OpenAI desde SQL.
4. `ai-central-review-notice-mvp286.ts`: un mensaje fijo diciendo que el pedido fue recibido pero **NO enviado**. Sólo puede enviar tras una reserva SQL válida y responde `uncertain` si Whapi no devuelve un ID de mensaje real. Reintento del mismo HMAC = denegado. No envía proveedores, no inventa precios ni presupuesto.
5. Webhook `index.ts`: llama al avisador sólo cuando IA Central devolvió `requiere_revision`, el emisor es comprador autorizado y sigue permitido el gate de revisión. No afecta validación normal ni `CONFIRMAR COTI`.
6. Pruebas Unit Node (HTTP mock, duplicados, ACL, ID faltante) y PG17 acumulativo aislado (fuente autorizada, permiso de roles, cuota, respuesta incierta, rollback).

**Límite:** no arregla por sí solo un error de credenciales o configuración del modelo. Habilita el diagnóstico exacto *del próximo mensaje nuevo*. No reanalizar ni reenviar automáticamente el mensaje fallido del 03:11: la reserva de IA es única, preservando idempotencia. El usuario deberá enviar un mensaje nuevo después de instalar el arreglo.

### Siguiente paso

Esperar CI verde y auditoría de diff. Publicar únicamente en PILOTO tras autorización correspondiente y verificar que la nueva Edge cargue el ledger, sin tocar producción ni activar gastos nuevos. Revisar un mensaje de prueba nuevo: registrar causa exacta, respuesta por WhatsApp si necesita revisión y confirmar que no exista envío automático a proveedores. Solo afirmar E2E completo cuando haya PDF a proveedores, presupuestos vinculados y ranking real.
