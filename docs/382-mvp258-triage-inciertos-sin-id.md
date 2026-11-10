# Decisión 382 — MVP258: revisión segura de envíos sin ID de Whapi

Fecha 06/11/2026. IA Central etapa 5. **Solo desarrollo**: sin publicación del piloto, sin producción y sin enviar mensajes reales.

## Problema y objetivo

En MVP257 ya se registran comprobantes autenticados de Whapi para mensajes inciertos **con ID persistido**. Cuando el envío agotó su espera de red **sin un ID de Whapi**, no hay prueba de que el destinatario lo haya recibido ni de que haya fallado. Reintentar podría duplicar solicitudes, comunicaciones comerciales o revelación de contactos.

Se necesita visibilidad y revisión manual de esos casos, no otro mecanismo de envío.

## Diseño implementado

`supabase/piloto/mvp258_uncertain_noid_triage.sql` añade dos tablas privadas y tres RPC, en la arquitectura existente y sin cambiar tablas originales.

- **`uncertain_triage_cases_mvp258`**: un expediente por origen, representado por una huella SHA256 y UUID interno. Identifica la categoría `supplier_request`, `ai_supplier_request`, `buyer_tracking`, `supplier_ack` o `finalist`. Conserva referencias mínimas solo en el esquema privado (request, participante, HMAC de origen cuando aplica). RLS habilitado; acceso directo denegado incluso a service_role. Detecta `uncertain` sin ID y `leased` con más de 15 minutos, clasificados de forma separada.
- **`cotironda_piloto_scan_uncertain_mvp258(p_limit)`**: únicamente lectura de colas existentes y escritura del expediente privado. Deduplica con clave única, recorre el conjunto en tandas de 1 a 50 y prioriza casos nuevos. No genera nuevos intentos ni modifica `whapi_outbox` o los otros cuatro libros de salida.
- **`cotironda_piloto_list_uncertain_mvp258(p_limit)`**: proyecta una lista operativa acotada de UUID, categoría, razón, fecha y número de notas. No devuelve número telefónico, token de seguimiento, proveedor, identidad, request ID ni HMAC.
- **`uncertain_review_notes_mvp258`** y RPC `cotironda_piloto_note_uncertain_mvp258`: apuntes inmutables y deduplicados de revisión, con código cerrado y SHA256 de prueba archivada fuera de la tabla. Los únicos códigos admitidos son `awaiting_provider_evidence`, `manual_investigation_incomplete` y `operator_escalation_required`. **No existe un comando `delivered` o `retry`.**
- Todas las RPC de revisión usan `SECURITY DEFINER SET search_path=''`, con `REVOKE EXECUTE` a PUBLIC/anon/authenticated y `GRANT` a service_role. Los registros de revisión se preservan sin borrar evidencia histórica.

## Criterios técnicos

La suite PG17 con `ROLLBACK` verifica: cuatro tipos de caso positivos (incluido lease antiguo), cola nueva con deduplicación, rechazo de envío con ID conocido y lease joven, ausencia de datos identificatorios en la proyección, nota válida, nota inválida que intenta afirmar entrega, repetición idempotente, RLS/ACL y ausencia total de modificaciones de estados de envío.

La prueba es **sintética**. No asegura que Whapi conserve mensajes ni reconcilia un timeout real sin ID.

## Límites honestos de etapa 5

Una operación sin ID **no se puede declarar entregada** por inferencia. Requiere evidencia confiable obtenida del proveedor de transporte u operador con permisos y un procedimiento de conciliación documentado. Este módulo no hace llamadas a la API de Whapi ni envía avisos. Los expedientes se consultan mediante RPC interno, pero **todavía no se programó una notificación automática de vencimiento ni una interfaz de operador**. Queda pendiente validar por falla real de red, cuotas, retención y auditoría del recorrido de recuperación documental.

Esta entrega mejora la visibilidad y seguridad de la etapa 5 **sin declararla operativamente terminada**. Continuar luego con la memoria comercial aislada de la etapa 6.
