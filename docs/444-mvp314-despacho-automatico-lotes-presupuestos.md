# Decisión 444 — MVP314: continuación autónoma por lotes con presupuestos atómicos

**Fecha:** 08/11/2026 (ART). **Autorización:** «Luz verde», **solo desarrollo y pruebas**. NO instalar, NO habilitar, NO agendar cron, NO publicar Whapi ni producción.

## Problema y objetivo

MVP313 permite resolver el destinatario cifrado por lease; el webhook de IA Central solo despacha 2 trabajos por evento del comprador. Una ronda con más proveedores puede quedar parcialmente distribuida hasta que llegue otro mensaje. **No corresponde pedirle un nuevo mensaje al arquitecto.**

MVP314 agrega un worker privado de dos trabajos por invocación, invocable después por un programador autenticado. Reutiliza exclusivamente trabajos pendientes ya publicados por MVP222, sin usar IA para elegir destinatarios ni recalcular materiales.

## Archivos

- `supabase/piloto/mvp314_ia_despacho_lotes_cupo_seguro.sql`: política OFF, cupos y claims atómicos, selector y observabilidad solo servicio. Exige MVP222, MVP307 y MVP313. Para el webhook autorizado, `ia_claim_mvp222` delega a `ia_claim_mvp314` **solo si el gate MVP314 está ON**. Cuando está OFF conserva su ejecución anterior. Así ambos caminos consumen el mismo cupo cuando se habilite.
- `supabase/functions/cotironda-piloto-whapi/ai-central-batch-mvp314.ts`: coordinador sin red; 2 jobs máximos por tick, un lease por paso. Si encuentra errores, presupuesto agotado o conciliación requerida, se detiene.
- `supabase/functions/cotironda-piloto-whapi/ai-central-dispatch-mvp223.ts`: claim RPC opcional tipado y resultado `limite_diario` sin alterar el camino heredado con gate OFF. Conserva PDF por proveedor, autorización de número, 2 validaciones, ID remoto, estado terminal.
- `supabase/functions/cotironda-piloto-ai-batch/index.ts`: Endpoint POST **separado del webhook**, requiere nueva clave privada `COTIRONDA_PILOT_AI_BATCH_SECRET` + service key del proyecto. Valida flags, canal, AES/HMAC y token antes del SQL/HTTP. Solo respuesta con conteos; jamás teléfonos.
- `tests/unit/mvp314-batch-dispatch.test.mjs`, `supabase/tests/ci/mvp314-batch-dispatch-pg17.sql`, generador de fixture y GitHub Actions: 1/2/5/20 proveedores, stop en cuota, serialización mediante lock SQL (sin ensayo de dos sesiones concurrentes todavía), revocación heredada MVP313, parcial/uncertain, privado y ROLLBACK.

## Presupuesto / seguridad

1. **OFF por defecto**: SQL `ai_batch_gate_mvp314.enabled=false`, Edge `COTIRONDA_PILOT_AI_BATCH_MVP314_ENABLED` distinto de `true` y ningún cron instalado. Solo rondas con trabajos **creados después** de `activated_at` son elegibles para el worker.
2. Valor inicial configurable por operador: **20 reservas diarias globales**, **8 reservas diarias por comprador**, y **máximo 2 por invocación**. Son *intentos/reservas*, no pesos ni costos facturados por Whapi.
3. Transacción del claim bloquea la fila única de política con `FOR UPDATE`, valida prueba de origen, comprador y proveedor vigentes, invitación, localidad y estado temporal; el snapshot y MVP313 revisan también el catálogo antes de enviar; selecciona `pending` con `FOR UPDATE SKIP LOCKED`; reserva simultáneamente cupo global y de comprador y cambia a `leased`. No hay HTTP dentro de SQL.
4. Un job `api_accepted`, `uncertain` o `leased` **no vuelve jamás a `pending` automáticamente**. Error remoto, timeout, pérdida de proceso o rechazo durante autorización no se retransmiten sin conciliación independiente. El monitor informa número de leases con más de 20 minutos, no los reprograma ni contiene PII.
5. Para resolver un número exige el paquete de MVP313 por `request_id, supplier_key, lease_token, chat_hmac, channel`; AES-GCM, SHA/HMAC y revalidación antes del POST. No usar `whapi_outbox` legacy ni divulgar comprador.
6. El worker **no acepta** request_id del HTTP ni parámetros de cliente. Solo consume la próxima fila elegible en SQL. Autenticación exige dos factores independientes, no sirve `anon`, y responder `401`/OFF corta antes de conectar a base o Whapi.

## Criterios de aceptación

- [x] Código de coordinación y gates creado en rama separada, sin despliegue.
- [x] Tests unitarios y fixture PostgreSQL17 añadidos al PR.
- [x] Workflow específico MVP314: Node (10/10 más 9/9 heredadas), Deno y PostgreSQL17 sintético con ROLLBACK aprobados sobre commit `3816bc40`.
- [ ] Inspección de todas las rutas de claim y de salidas de envío contra presupuesto; test concurrente transaccional.
- [x] Verificada migración sintética ordenada MVP309–314 en PostgreSQL17 y ROLLBACK; **no** implica migración del piloto real.
- [ ] Revisar cuota real de Whapi, rotación de secretos, caller programado y errores.
- [ ] Publicación al **piloto exclusivamente** con orden «Publicalo», empezando con gate OFF.
- [ ] Habilitación diferenciada de cron/flags SQL/Edge y prueba real de 5+ proveedores, sin duplicados.
- [ ] Prueba E2E de comprador, cotizaciones, ranking por rubro y cierre; no afirmar realizado por CI sintética.

## Operación / activación futura (NO ejecutada)

Precondiciones: respaldo probado, contrato de WhatsApp vigente, MVP309–313 desplegados y cotejados, endpoint privado publicado con `verify_jwt=false` **y validación propia de doble factor**, secret distinto al de recuperación/finalistas, versión Edge aprobada, contador económico/Whapi revisado y ventana de prueba definida.

La periodicidad se decide y se configura *por separado*. Ningún SQL de MVP314 instala `pg_cron`, `pg_net` ni webhook. No exponer la clave `x-cotironda-ai-batch-secret` en un trabajo de `pg_net` con headers persistidos; usar un scheduler seguro con Vault o servicio privado y registro de eventos sin credenciales. El endpoint consume máximo 2 trabajos por tick. Se requieren ticks posteriores para rondas con 5 o 20 proveedores.

Para detener sin perder auditoría: desactivar primero el scheduler, luego el flag Edge de MVP314 y, mediante operación autorizada, SQL `enabled=false,activated_at=NULL`. Esta última operación significa que **nunca se reutiliza automáticamente una fecha vieja** para una nueva ventana. No vaciar ni resetear reservas, no reactivar `uncertain` ni `leased`, no reponer IDs de WhatsApp.

## Deudas explícitas

- El sistema de cuotas limita número de intentos, no costo real en pesos por WhatsApp, y no contrata ni habilita el servicio.
- El aviso/enlace de seguimiento al comprador en ciertas rutas aún puede depender del webhook. El envío autónomo a proveedores no prueba por sí solo que la notificación al comprador ocurra sin otro mensaje: exigir integración específica y E2E posterior.
- Falta una prueba E2E real en piloto. En fallos de preparación del documento el lease puede terminar `uncertain` sin HTTP: decisión conservadora para impedir duplicados.
- Los trabajos anteriores a la activación de MVP314 requieren revisión individual, no drenaje masivo. La cola heredada sigue separada.
- La legitimidad jurídica de la constancia del responsable MVP309 no equivale a evidencia WhatsApp; deben preservarse fuente, alcance y revocaciones.
