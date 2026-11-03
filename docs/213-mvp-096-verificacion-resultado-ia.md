# MVP-096 — Auditoría del resultado de interpretación IA (02/11/2026)

Incidente: durante prueba real WhatsApp del arquitecto a las **16:27:09 ART**, Whapi registró HTTP 200 y `ai_attempts_mvp094` incluyó la reserva, con `whapi_inbox.processing_state=needs_review` y sin nueva ronda. Sin embargo el código anterior no guardaba si Responses API devolvió resultado válido o falló; ambos producían `needs_review`. **No está demostrado que OpenAI haya interpretado correctamente el primer mensaje.**

## Solución
- Nueva migración `mvp096_ai_outcome_audit.sql`: columnas privadas `result_state`, `intent`, `decision`, `failure_category`, `finished_at` en `ai_attempts_mvp094` protegida por RLS/revocaciones actuales. `public.cotironda_piloto_finish_ai_mvp096` puede finalizar un intento una sola vez, con rol exclusivo service_role; cualquier repetición es falsa. No guarda prompt, teléfono, original, salida del modelo ni clave.
- El webhook termina cada reserva IA con `completed` y código de intención/acción **solamente después** de validación JSON y reglas deterministas. Si hubo error, guarda `failed` y categoría permitida (`auth_config`, `quota`, `upstream`, `bad_output`, `other`), sin detalles de contenido.
- Si falla el registro de auditoría, devuelve error de reconciliación, sin reintentar OpenAI automáticamente. El mensaje de WhatsApp de origen queda privado y los proveedores no reciben solicitudes por saludos/FAQ.
- Los intentos anteriores, incluido el del 02/11 16:27, quedan legítimamente `reserved` sin resultado conocido. No inferir su éxito retroactivamente, no re-procesarlos manualmente ni volver a gastar tokens por el mismo HMAC.
- Próximo paso: **un mensaje nuevo del arquitecto**, después de desplegar v27 en PILOTO; verificar `result_state='completed'`, `intent='business_question'`, `decision='answer_faq'`, HTTP 200, y ausencia de nueva ronda/invitaciones. Si error: ver `failure_category` y corregir sin compartir claves ni pedir otro mensaje hasta resolver.

## Pruebas
- `supabase/piloto/mvp096_smoke_rollback.sql`: prueba real PostgreSQL de un éxito y un fallo, validación de enum, idempotencia, privilegios y transacción reversible sin tocar datos del arquitecto.
- `tests/unit/mvp096-ai-outcome-audit.test.mjs`: wiring del adaptador y exclusión de contenidos sensibles.
- Revisión GitHub CI 6/6 antes de desplegar. No activar nuevos mensajes automáticos ni producción.

El ranking, documentos IA reales y revelación comercial siguen fuera de este incremento.
