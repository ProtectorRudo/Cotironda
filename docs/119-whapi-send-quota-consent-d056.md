# 119 — D056: autorización persistente, cupos y consentimiento de WhatsApp

**31/10/2026 · Issue #215 · rama apilada sobre D055/#214 · sólo PostgreSQL17 CI, sin producción.**

## Hallazgo y decisión

D055 exige una autorización de cupo/consentimiento, pero su puerto simulado por sí solo no prueba que dos trabajadores distintos no superen simultáneamente un límite. Más importante: **no alcanza con descontar cupo después de que D053 marcó el comienzo del envío**. Si una transacción se interrumpe entre ambos pasos, podría comenzar un mensaje sin autorización presupuestaria.

**D056 reserva cupo ANTES de confirmar el inicio, dentro de la misma transacción de D053.** Un trigger privado `BEFORE UPDATE OF send_phase` en D047 ejecuta la reserva cuando D053 cambia `not_started` a `in_flight`. Si no hay política, no hay consentimiento, cambió la revisión, falta presupuesto o se excede un límite, esa transición falla completamente: no se genera envío ni reserva.

## Qué se guarda

`supabase/sql/whapi_send_limits_atomic_d056.sql` agrega:

- `whapi_buyer_send_policies_d056`: política por **empresa compradora** (titular de la ronda) y canal, deshabilitada por defecto. Incluye máximo diario, máximo mensual, presupuesto mensual en **unidades internas conservadoras** y estimación fija por mensaje. Los proveedores siguen gratis: estos valores son topes de consumo de la plataforma, **NO facturas reales de Whapi, pesos ni tarifas confirmadas**.
- `whapi_send_reservations_d056`: ledger inmutable, una reserva por `job_id` D047, con empresa compradora, proveedor, ronda, revisión, canal/chat HMAC, día y mes local Argentina, unidades reservadas y versión de política. No contiene teléfonos, cuerpo, mensaje saliente en claro ni secretos. Indexado por empresa/canal/día y empresa/canal/mes.
- Trigger `whapi_guard_begin_send_d056`: valida sesión de ronda abierta, borrador vigente, contacto consentido y no dado de baja; bloquea `FOR UPDATE` la fila de política del comprador/canal para **serializar todos sus trabajadores concurrentes**, cuenta reservas existentes y rechaza superar cualquiera de los tres límites. El coste se cuenta aunque después haya timeout; **NO liberar reservas automáticamente al cancelar o ante estado `uncertain`**, ya que el proveedor podría haber procesado la llamada.
- `whapi_check_send_authorized_d056(job,channel,chatHmac)`: acceso privado y solo lectura para el último instante previo al transporte: exige reserva existente, `in_flight`, lease vigente, empresa de la ronda, chat/supplier/revisión correctos, política aún habilitada y contacto aún consentido y activo. Devuelve exclusivamente verdadero/falso; ninguna PII.
- `src/server/whapi-send-authorization-d056.ts`: adaptador server-only para la función `autorizarIntento` que D055 necesita. Deriva `chatHmac` **del destinatario real normalizado mediante el secreto HMAC D029 en memoria del servidor** y lo compara a través de la consulta SQL parametrizada. El número no viaja a PostgreSQL en claro, no se registran secretos, y cualquier error/mismatch deniega. No crea conexión SQL ni envía WhatsApp.

## Permisos

Rol propietario `cotironda_limits_writer_d056`: NOLOGIN, NOINHERIT, NOBYPASSRLS, políticas RLS para tablas referenciadas, y permisos restringidos a reservas. Una política `FOR UPDATE` permite únicamente bloquear la fila de política, con `WITH CHECK(false)` para impedir modificaciones desde este rol. El gateway sender D054 solamente recibe EXECUTE sobre `whapi_check_send_authorized_d056`; no puede provisionar, consultar el ledger, modificar límites ni realizar conciliación D053. No hay acceso por `anon`, `authenticated`, `service_role`, ni RPC pública.

Las políticas requieren **provisión por un administrador de infraestructura mediante un procedimiento separado y auditado** que aún no está construido; no se habilita automáticamente a ningún cliente o proveedor.

## Qué se prueba

`supabase/tests/ci/112_whapi_send_limits_atomic_d056.sql` ejecuta un PostgreSQL 17 real, datos ficticios en BEGIN/ROLLBACK: falta de política, política apagada, consentimiento, primer y segundo envío, timeout sin liberación de cupo, límite diario, mensual y monetario por separado, otra empresa compradora del mismo canal/proveedor sin cruzar contadores, baja después de `begin_send`, replays y ledger único. Los controles RLS/funciones se verifican antes de los datos.

`tests/unit/whapi-send-authorization-d056.test.mjs` verifica HMAC de chat igual al de D029, ninguna PII en argumentos SQL, denegación por respuesta inválida/SQL caído, allowlist y conexión con D054/D055 de transporte falso.

## Límites para un piloto real

**La reserva es una estimación conservadora, no mide el precio facturado por Whapi.** Debe calibrarse con los precios actuales y eventos de cobro del proveedor, conservar auditable la versión de tarifa y crear conciliación independiente que nunca permita sobregiros. D056 no introduce un sistema de facturación ni pagos del comprador; el plan previsto sigue sujeto a la validación económica.

Existe una carrera entre el último control SQL de D055 y el envío HTTP si llega una baja justo después: para minimizarla el futuro worker debe serializar la baja con la autorización final o mantener un mecanismo de cancelación; no declarar eliminación absoluta de la carrera. Ningún control de PostgreSQL puede probar que la empresa realmente consintió fuera de una fuente confiable: la verificación/consentimiento siguen siendo responsabilidad del onboarding seguro.

No se instalaron migraciones en Supabase DEV ni producción, no se vinculó Whapi real, no hay IA ni mensajes reales. El respaldo y restauración de DEV de #175 siguen bloqueando la aplicación comercial.

### Prueba real de concurrencia independiente

Además del ensayo SQL transaccional, `scripts/ci/whapi-pg/quota-d056-concurrency-seed.sql` crea **dos trabajos distintos de un mismo comprador/canal con cupo exacto de un mensaje**. `quota-d056-concurrency-e2e.mjs` abre **dos conexiones reales independientes** con login SQL de permisos mínimos y ejecuta simultáneamente `whapi_begin_send_d053` para ambos. Se exige exactamente una reserva y una denegación de cuota, sin permitir SELECT de tablas o `SET ROLE postgres`; GitHub vuelve a contar las filas finales de la base. Todo sin HTTP, Whapi ni IA. El bloqueo `FOR UPDATE` de la política es el punto de serialización verificable.
