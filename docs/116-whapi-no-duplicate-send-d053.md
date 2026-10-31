# 116 — D053: impedir reenvíos automáticos tras un envío Whapi incierto

**31/10/2026 · Issue #209 · solo PostgreSQL 17 CI descartable.**

## Hallazgo de auditoría

En D047, un trabajo reservado con `leased_until` vencido podía ser reclamado automáticamente por otro trabajador. Esto es correcto **si aún no comenzó la llamada HTTP**, pero es peligroso cuando el trabajador envió la respuesta y perdió la conexión antes de guardar el acuse: el proveedor podría recibir dos mensajes iguales.

**La política D053 prioriza evitar duplicados aunque eso implique dejar algunos mensajes sin reintentar automáticamente.** No existe aquí garantía de exactamente una entrega.

## SQL y contrato interno

`supabase/sql/whapi_no_duplicate_send_d053.sql` añade a la outbox D047 la columna `send_phase` con fases `not_started`, `in_flight`, `uncertain`, `accepted`, además de marcas de inicio, incertidumbre y huella HMAC de conciliación.

Los estados D047 siguen existiendo: cuando un envío está en fase `in_flight` o `uncertain`, el trabajo conserva temporalmente `status='leased'` por compatibilidad y por restricciones existentes. **Los consumidores deben mirar `send_phase`; `leased` solo no significa “seguro para reenviar”.**

1. `whapi_lease_reply_d047()` (actualizada) reserva solo trabajos con `send_phase='not_started'`. Un lease caducado sin inicio puede recuperarse dentro del presupuesto de intentos. Un trabajo `in_flight` **jamás** vuelve automáticamente a esa consulta.
2. `whapi_begin_send_d053(job,lease)`: revalida que la ronda, la revisión del borrador, el consentimiento y la BAJA sigan vigentes; marca `in_flight` **en PostgreSQL antes de hacer HTTP**. El futuro trabajador debe esperar el commit exitoso; si este paso falla, no puede transmitir. El `job_id` será la clave estable para idempotencia externa cuando el proveedor HTTP permita esta funcionalidad.
3. `whapi_record_send_outcome_d053(...)`: con token del lease exacto acepta un HMAC de ID saliente solo tras inicio de envío; un timeout o falta de acuse se marca `uncertain`, nunca como “mensaje no enviado”. Un acuse real debe ser comprobado por el broker futuro.
4. `whapi_sweep_uncertain_d053()`: si se cae el worker, los trabajos iniciados cuyo lease expiró se convierten en `uncertain` con `SKIP LOCKED`. No se transfieren a otro proceso para envío.
5. `whapi_reconcile_uncertain_d053(job,decision,ack,evidenceHmac)`: solo un gateway interno de confianza puede cerrar un trabajo incierto como **aceptado por transporte** (con ID HMAC verificado externamente) o **cancelado**; deliberadamente no expone “reintentar”. La evidencia HMAC se conserva para auditoría y un replay idéntico no cambia el resultado.
6. `whapi_finish_reply_d047()` deja de aceptar `p_accepted=true` de forma directa. Permite únicamente declarar un fallo conocido en preenvío, siempre antes de `begin_send`, con su backoff de reintentos.

El propietario de las funciones nuevas es `cotironda_reply_writer`, rol NOLOGIN/NOINHERIT/NOBYPASSRLS, con políticas RLS previas. El rol `cotironda_reply_gateway` es también NOLOGIN y tiene solo `EXECUTE`. No se expone nada a `anon`, `authenticated`, `service_role` ni al navegador. Sin teléfonos, texto, URLs ni secretos en el ledger.

## Pruebas

`supabase/tests/ci/111_whapi_no_duplicate_send_d053.sql` usa un PostgreSQL 17 real y empresas ficticias dentro de BEGIN/ROLLBACK. Comprueba: token erróneo, no aceptar acuse antes del inicio, `begin_send` una sola vez, no autorizar fallo pre-HTTP después de iniciar, caída con lease expirado, **ningún segundo claim automático**, conciliación por evidencia HMAC, replay idempotente, cancelación sin reenvío, backoff legítimo pre-HTTP, y BAJA entre reserva e inicio.

GitHub Actions aplica D053 **después** del ensayo D052, para mantener la evidencia de compatibilidad histórica y verificar que los trabajos previamente aceptados se marcan `accepted` sin inventar un origen verificado. Ningún dato del ensayo sale de PostgreSQL CI.

## Limitaciones y tareas pendientes

**No existe un emisor HTTP Whapi ni un worker desplegado en D053.** La prueba reproduce el cambio de estado y sus consecuencias, no un envío efectivo. SQL no puede demostrar que un acuse o una conciliación provengan de la API Whapi: el futuro broker deberá autenticar respuestas y registrar evidencia HMAC proveniente de fuentes confiables.

Queda una posible carrera entre `begin_send` y la ejecución HTTP si el proveedor se da de baja en ese intervalo; el futuro worker debe **revalidar inmediatamente antes de transmitir** y respetar la cancelación. Si el worker inicia la petición y luego pierde el acuse, requerirá conciliación con el proveedor del canal o decisión conservadora sin reenvío. No afirmar que hubo entrega ni lectura.

Una migración real necesitará auditoría de filas D047 anteriores, preparación de índices/locks y un procedimiento de rollback: D053 reemplaza semántica de funciones D047 y no puede aplicarse sin inspeccionar historial. **No se aplica en Supabase DEV ni producción**: respaldo/restore auténtico de DEV #175 sigue bloqueando D024–D053, sin integración de Whapi/IA y sin publicar ningún PR.
