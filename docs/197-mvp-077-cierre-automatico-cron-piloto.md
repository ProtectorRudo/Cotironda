# MVP-077 — Cierre automático real cada 5 minutos, sin WhatsApp ni contactos

**Fecha:** 02/11/2026. **Issue:** #366. **Entorno permitido:** proyecto Supabase **Cotironda Piloto** (ref `ilggkalaafhtiysyzlmg`) exclusivamente.

## Problema
MVP-076 agregó a la solicitud WhatsApp auténtica una fecha de cierre precisa, `2026-11-06 04:34:00.325945+00` (01:34 Argentina), y función privada de cierre atómico `public.cotironda_piloto_close_due_v1(25)`. Pero **ningún proceso la llamaba automáticamente**. Una fecha en la tabla no hace que un cronómetro dispare solo.

## Solución y seguridad
- `supabase/piloto/mvp077_safe_closure_cron.sql`: instala **Supabase Cron pg_cron 1.6.4** en el piloto aislado y crea **un solo job**, `cotironda_piloto_close_due_5min` con frecuencia `*/5 * * * *`. Ejecuta **únicamente** `select public.cotironda_piloto_close_due_v1(25);`.
- La función de MVP-076 solo cierra rondas `prepared` vencidas según reloj SQL y cancela invitaciones **pendientes**; jamás elige finalistas, revela contactos ni transmite por Whapi. Rondas futuras, canceladas o ya cerradas no cambian.
- No instalar `pg_net`, no introducir tokens ni llamadas HTTP, no ejecutar un sender o mensajes de seguimiento. La ejecución desde el motor SQL evita credenciales externas.
- Guarda que bloquea la instalación si falta el esquema/función de piloto o si la salida de WhatsApp estuviera activa.
- Instancia de job reconocible por nombre estable: reintentar `cron.schedule` con el mismo nombre actualiza el job, no duplica. SQL de reversión operacional: `select cron.unschedule('cotironda_piloto_close_due_5min');` — usar solo cuando se autorice desactivar el cierre; **no eliminar la extensión**, porque borraría todo su historial/jobs.
- Monitoreo lectura: `select jobid,jobname,schedule,active,command from cron.job where jobname='cotironda_piloto_close_due_5min';` y `cron.job_run_details` por `jobid`. La ejecución no expone identidades ni valores. **La hora de cierre real ocurre dentro de los 5 minutos posteriores al vencimiento**, no necesariamente en el segundo exacto; `closes_at` representa el plazo legal de recepción y Whapi bloquea mensajes posteriores.

## Pruebas
1. Simulación **real en Supabase Piloto**, `BEGIN; <migración>; aserciones; ROLLBACK;`: **PASS**. La extensión y el trabajo aparecen temporalmente en la transacción, sin jobs persistidos hasta aplicar la migración.
2. `tests/unit/mvp077-safe-closure-cron.test.mjs`: guardas estáticas de cron, SQL permitido, flags, ausencia de contactos/red/Whapi y existencia del procedimiento de apagado.
3. `supabase/piloto/mvp077_smoke_rollback.sql`: solo en PILOTO tras instalar. Crea una ronda ficticia vencida dentro de una transacción revertible; comprueba cierre una vez, replay 0, pedido real sin cambios, una única cotización original intacta, permisos `anon`/`authenticated` sin cierre, cero revelación y job único activo. Antes y después deben corroborarse las flags y el historial de cron.

## Lo que NO hace
**No permite anunciar dos ganadores todavía.** No hay snapshot económico confiable de la cotización de Ailín, ni segunda cotización de Nahuel, ni consentimiento específico recíproco verificable, ni registros de contacto cifrados ni outbox idempotente de ganadores. La planificación offline de MVP-076 no es autorización para exponer datos. El cron simplemente cierra el ciclo de recepción **sin revelar nada**. El comprador no tiene que hacer clic.

## Estado
Desarrollo en rama `feat/mvp-077-piloto-cron-close`. PR y CI deben completarse y luego se valida la instalación de cron y una ejecución real antes de declarar automatización funcionando.

## Instalación efectiva y auditoría posinstalación — 02/11/2026

- **GitHub Actions** último commit de código `81eeeeb379d8dcc93d4e516a768b2d9830ce47ca`: 5/5 PASS (unitarias, PostgreSQL 17, Auth PostgREST HTTP, verificación de sitio, build Next).
- **Supabase PILOTO** `ilggkalaafhtiysyzlmg`: migración `mvp077_safe_closure_cron` aplicada con `success=true`.
- **Tarea verificada**: `cron.job` contiene exactamente un job con `jobid=1`, `jobname='cotironda_piloto_close_due_5min'`, `active=true`, `schedule='*/5 * * * *'`, comando **único** `select public.cotironda_piloto_close_due_v1(25);`, ejecutado por rol `postgres`. Sin tráfico saliente.
- **Smoke SQL tras instalar** `supabase/piloto/mvp077_smoke_rollback.sql`: PASS (job único activo, estado de solicitud anterior inalterado, ronda sintética vencida cerrada exactamente una vez, doble ejecución no vuelve a cerrar, sin revelación/ganadores/mensajes, base sin nuevos datos de prueba).
- **Estado real**: 1 solicitud `prepared` del arquitecto creada `2026-11-02 04:34:00.325945+00`, cierre lógico `2026-11-06 04:34:00.325945+00`, 1 oferta original de Ailín. Flag `whatsapp_inbound_enabled=true`, `whatsapp_outbound_enabled=false`.
- **Historial de ejecución de cron**: `cron.job_run_details` aún sin filas al momento de la primera lectura inmediata posterior a la instalación; **job activado/registrado**, pero no afirmar todavía primera ejecución exitosa del scheduler. Verificar en la siguiente ventana de 5 minutos.

No se instaló `pg_net`, no se emitió ningún WhatsApp, no se filtró nombre ni teléfono de contactos, no se modificó producción, DEV histórica ni Te Hice Esto.

### Primera ejecución real de Supabase Cron — VERIFICADA

A las **2026-11-02 10:20:00.089469+00**, el scheduler registró en `cron.job_run_details` la primera ejecución real del job `jobid=1`, `runid=1`, **`status=succeeded`**, finalizada `2026-11-02 10:20:00.095817+00` (`return_message='1 row'`).

La lectura posterior verificó que:
- La ronda auténtica sigue `prepared`, sin cierre prematuro, `closes_at=2026-11-06 04:34:00.325945+00`, con **una** oferta existente.
- `integration_flags.whatsapp_outbound_enabled=false`.
- Historial `cron.job_run_details`: **1 ejecución, 1 éxito**.

**Conclusión verificada:** no solo figura programado; el scheduler REAL de Supabase ejecutó exitosamente la función de cierre sin modificar una ronda futura. No se observaron ni se autorizaron notificaciones de finalistas. Se requiere aún verificar cierre real de una ronda vencida por la tarea, y no puede proclamarse el ranking/lista de ganadores como terminado.
