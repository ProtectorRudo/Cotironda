# Decisión 380 — Primero terminar las siete capacidades de IA Central

Fecha: 06/11/2026. Decisión del propietario: **cerrar las siete etapas de IA Central en desarrollo antes de continuar la publicación de la etapa 4 y las pruebas completas del piloto**. No extrapolar esta prioridad a permiso de activar envíos reales o producción.

## Estado verificable de las siete etapas

| Etapa funcional | Código y verificaciones presentes | Para declararla realmente terminada |
| --- | --- | --- |
| 1. Motor de decisiones | Módulos de lectura, doble comprobación, citas y ruteo por catálogo/consentimiento; PR #631, #635 y 336 fixtures sintéticos | Evaluación real de >=150 entradas contra el modelo, métricas de omisiones/falsos positivos/costos y casos multirrubro reales |
| 2. Asociación inteligente | Contratos de identificación y ledger de asociaciones ambiguas, pruebas con dos rondas simuladas | Dos rondas simultáneas reales con cita/corrección y cero asignaciones equivocadas |
| 3. Comprensión comercial | Verificadores económico/documental, OCR externo bajo triple permiso con cuotas, PR #632–#634 | Fotos y PDF escaneados reales autorizados, evidencia OCR completa y promoción auditada a ofertas solo cuando corresponda |
| 4. Comparación por rubro | Comparador MVP254/255, Edge→proxy→DOM con revocación, PR #635–#636; Edge PILOTO v18 publicada | Publicación Vercel correcta, rondas reales verificadas, validación de IVA/flete/stock/marca y de ofertas parciales |
| 5. Recuperación automática | Existía el worker acotado MVB127–132, con Vault, cron, SHA e idempotencia; **MVP256** inicia la mejora de selección segura | Políticas exhaustivas para API/WhatsApp, conciliación de estados inciertos, pruebas de caídas y deduplicación en todos los canales |
| 6. Memoria comercial | Contexto de conversación y ledger por archivo/ronda existen en varios módulos históricos | Contrato único de contexto aislado por empresa/WhatsApp/ronda, resumen verificable, TTL y cero mezcla entre compradores |
| 7. Supervisor autónomo | Cron y logs limitados en sistemas existentes | Motor de vigilancia, señales de desvío, escalamiento, presupuestos, auditoría y acciones únicamente con permisos del broker; pruebas de falla segura |

**Importante:** código integrado en desarrollo NO equivale a una etapa operativamente terminada. Se deja constancia de los dos estados en cada entrega, para evitar el falso «7/7».

## Secuencia aprobada

1. Completar la **5: Recuperación automática** sobre funciones existentes, sin desarrollar un sistema paralelo. Primero el control de error transitorio/permanente, después conciliación de resultados inciertos, protecciones por intentos, idempotencia y límites.
2. Completar la **6: Memoria comercial** anclada a identificadores acreditados, aislada por empresa, con vencimiento y cambios de versión.
3. Completar la **7: Supervisor autónomo**, con diagnóstico y seguimiento, pero **sin herramientas de escritura ilimitadas** o decisiones comerciales sin permiso.
4. Volver sobre las puertas técnicas pendientes de **1–4** y la auditoría de integración 1→7, sin desplegar el piloto antes de revisar que todas las suites estén verdes.
5. Recién entonces completar el piloto real de extremo a extremo, incluida publicación Vercel. El error previo `api-deployments-free-per-day` en Vercel no habilita usar otra cuenta o desplegar en producción.

## Primer cambio concreto: MVP256

La cola documental ya tiene limitación de tres intentos, identidad/consentimiento y SHA. Se detectó que una falla **permanente** podía dejar un `next_retry_at` y volver a ser seleccionada por las tres RPC del recuperador.

`supabase/piloto/mvp256_document_retry_policy_safe.sql` sustituye, en orden posterior a las migraciones previas, cuatro funciones existentes: guardar diagnóstico, reservar archivo, descubrir candidato por Whapi autorizado y elegir candidato por cron. Solo permite nuevo intento si la causa es explícitamente transitoria (`legacy_unclassified`, `api_rate_limited`, `api_server_error`, `api_unavailable`, `api_timeout`, `response_incomplete`). El resto —clave ausente, 401, 400, documento inválido, gasto suspendido, revisión de fuente— queda pendiente de intervención/revisión, nunca entra en bucle automático.

El segundo intento se difiere 9 minutos; el primer intento 3 minutos y la tercera falla termina la secuencia. Las consultas de reserva y scheduler comprueban también el motivo original aunque existieran registros históricos con `next_retry_at` futuro. Se conservan restricciones por participante y permisos `service_role`.

**Límites:** MVP256 cubre **únicamente recuperación documental**, no todos los estados `uncertain` de Whapi, ni notificaciones o finalistas. Por sí solo no cierra la etapa 5. La migración no se instalará en PILOTO mientras se desarrollan las siete etapas.

## Aceptación y verificación

- PostgreSQL 17 real transaccional: error permanente → sin reserva, error transitorio → backoff, reserva única, tres intentos máximos, privilegios por rol, rollback sin alterar datos reales.
- Tests Node contra contrato SQL y regresión del worker previo (sin llamadas OpenAI, Whapi ni Google).
- CI general y revisión de seguridad antes de fusionar en la rama de desarrollo; documentar commit/PR/resultados exactos.
- No modificar `main`, entorno PILOTO/producción, secretos, alias Vercel ni números reales.
