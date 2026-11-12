# Acta 525 — MVP357: reintento de solicitudes pendientes sin reenviar WhatsApps

**Fecha:** 12/11/2026. **Comando:** «Avanza y registra». **Entorno:** código en desarrollo; no modificar datos reales, no desplegar, no llamar WhatsApp ni crear cron activo. [Issue maestro #794](https://github.com/ProtectorRudo/Cotironda/issues/794), [PR #800](https://github.com/ProtectorRudo/Cotironda/pull/800), base PR #799.

## Objetivo comercial

El comprador no debe esperar indefinidamente porque un proveedor está ocupado con otra ronda. Tampoco debe recibir el mensaje «presupuesto recibido» cuando el archivo pertenece a otro arquitecto. En el piloto se impide temporalmente enviar 2 pedidos simultáneos al mismo comercio (MVP356). Esta decisión exige **despachar pendientes en cuanto su bloqueo desaparezca**, pero **sin duplicar** pedidos previamente aceptados o inciertos.

### Estado REAL leído directamente del piloto (solo SELECT; 12/11)

- Existe `cotironda-piloto-ai-batch` como Edge ACTIVE y el coordinador `continuarDespachoMvp314` de hasta dos trabajos por invocación. Los estados de la cola `ai_dispatch_jobs_mvp222` son **4 `api_accepted`; 0 `pending` y 0 `uncertain` al momento de la consulta**. Que la cola esté vacía ahora NO prueba reintentos futuros.
- Supabase tiene `pg_cron 1.6.4`, `pg_net 0.20.4` y Vault `0.3.1` habilitados. Los tres jobs `cron.job` existentes son cierre, recuperación documental y reconciliación IA; **ninguno invoca ai-batch**.
- Solo hay nombre de secreto Vault `cotironda_piloto_recovery_cron_v1`. **Los dos secretos independientes requeridos por MVP357 NO existen todavía. No se leyeron valores.**
- `public.cotironda_piloto_ia_next_batch_mvp314()` selecciona por `created_at` el primer `pending`, sin comprobar `hay_despacho_solapado_mvp356`. Una ronda bloqueada puede tapar la libre aunque la función claim luego la rechace.
- El Edge `cotironda-piloto-ai-batch` exige POST y doble autenticación (secreto privado y `apikey` admin del proyecto), además de 4 flags ambientales independientes y las autorizaciones del SQL. Rechazaba cuerpo HTTP de cualquier tamaño, mientras `pg_net.http_post` envía por defecto `{}` JSON.

Fuentes: RPC instaladas `next_batch_mvp314`, dos funciones claim y código Edge GitHub; Supabase cron/Vault inspeccionados sin secretos; [documentación oficial de cron](https://supabase.com/docs/guides/functions/schedule-functions) consultada.

## Cambio M357 (solo desarrollo)

1. **Selector sin hambre:** `supabase/piloto/mvp357_next_batch_skip_blocked.sql`. Conserva íntegra la función `next_batch_mvp314` del piloto; añade una sola condición `NOT hay_despacho_solapado_mvp356(j.request_id,j.supplier_key)`. Si una ronda está bloqueada, puede atender otra del mismo lote sin desactivar control ni contar un envío inexistente.
2. **Tick privado y acotado:** `supabase/piloto/mvp357_batch_retry_private_off.sql`: tabla con única fila `ai_batch_retry_gate_mvp357` `enabled=false` y fecha de activación NULL por defecto, RLS y revoke a anon/authenticated/service_role. Función `ai_batch_retry_tick_mvp357` en esquema privado, lock transaccional adicional contra dobles ticks; máximo una solicitud HTTP por más de 4 minutos; invoca `next_batch_mvp314` para verificar que realmente hay pendiente elegible, con cuota/consentimiento vigentes; si no, NO hace HTTP. Sin `INSERT` en ofertas ni reclamo de trabajo en cron; el lease sale solo del Edge+SQL existente.
3. **Dos secretos nuevos Vault, solo por nombre:** `cotironda_piloto_ai_batch_apikey_mvp357` y `cotironda_piloto_ai_batch_private_mvp357`. Son distintos de los secretos de recovery, **sus valores no están en el repo ni se leyeron**. La función no devuelve ni registra secretos; si faltan, `credentials_unavailable` y no llama HTTP. Preferir admin project-scoped `sb_secret_` en `apikey` sin header Authorization. El Edge requiere además un segundo secreto `x-cotironda-ai-batch-secret`.
4. **Cron de activación por archivo SEPARADO:** `supabase/piloto/mvp357_schedule_cron_ONLY_AFTER_AUTHORIZATION.sql`. Comprueba `pg_cron`, `pg_net`, Vault y que el nombre no exista antes de `cron.schedule(..., '*/5 * * * *', 'SELECT cotironda_piloto_privado.ai_batch_retry_tick_mvp357()')`. Programar este job NO activa el gate privado: queda OFF hasta autorización de publicación y smoke. La primera instalación no invoca ningún mensaje.
5. **Compatibilidad de solicitud:** el Edge existente acepta exclusivamente cuerpo vacío o JSON `{}`, después de autenticación dual. El lector nuevo limita a 2 bytes, rechaza JSON con comandos o IDs, y no muestra detalles.
6. **Verificación:** `tests/unit/mvp357-cron-batch-retry.test.mjs` + fixture `supabase/tests/ci/mvp357-scheduler-pg17.sql`, con mock de `net.http_post` que **solo almacena cuatro booleanos de verificación**, sin credenciales ni red real. Se prueba bandera OFF, falta de secrets, mismo proveedor bloqueado y otro libre, doble tick, `uncertain/api_accepted` nunca de nuevo, ronda cerrada, liberación al cierre, ACL y ROLLBACK. Deno revisa el Edge completo.

### Qué protege exactamente cada capa

- Cron = **reintenta llamar al servicio** cada cinco minutos, con gate y contador para limitar intentos; NO es un `retry` del HTTP Whapi anterior.
- `next_batch` = elige exclusivamente `pending`, nueva ronda válida, presupuesto y consentimiento elegibles; descarta temporalmente `pending` cuyos proveedores están ocupados por otra ronda.
- `claim_mvp314` = verificación transaccional final (lease con lock, presupuesto total y por comprador).
- `finish_mvp222` = `api_accepted` si Whapi devuelve mensaje verificable, `uncertain` ante error/time-out; **NUNCA** reintentar automáticamente estados `uncertain`. Si Edge cae tras lease, conciliación operativa privada antes de cualquier reenvío.
- Originales (MVP355) = siempre requieren vínculo Whapi+SHA+pedido; este scheduler NO «resuelve» archivos ambiguos.

## Riesgos que no se deben ocultar

**Seguridad de secretos:** la documentación oficial de Supabase advierte que `pg_net` almacena temporalmente headers y puede exponer la clave de llamada a roles de base que tengan inicio de sesión y permisos suficientes, aun si viene de Vault. Por eso **NO activar sin auditar roles/ACL de la cola net y evaluar credenciales de privilegio mínimo**; una clave `sb_secret_` con acceso total al proyecto es sensible. Una alternativa más segura futura podría ser una credencial exclusiva para invocar este Edge, sin permiso genérico a la Data API; exige modificar auth de forma acotada y pruebas de seguridad.

**Batch Edge**: la URL está fija al proyecto piloto, no se admite cuerpo de órdenes. No cambiar el encabezado de dos factores ni los flags ON/OFF. Ajustar `pg_net` no justifica publicar sin revisar permisos.

**Legado**: los claims nuevos excluyen despachos legados activos, pero el despachador legacy no adquiere este lock; debe estar apagado en nuevas rondas o ser protegido también. No activar MVP356/MVP357 antes.

**Escalabilidad**: el guard de una ronda por proveedor es un parche temporal de piloto, no estrategia nacional. En producción se necesitarán identificadores fuertes de solicitud, conversaciones y vínculo por mensaje y la posibilidad de cotizar concurrentemente.

## Checklist de salida

- [ ] Último SHA de PR #800 con PostgreSQL17 del scheduler PASS, Node PASS, Deno Edge PASS, Next.js/PostgREST/aislamiento sin regresiones.
- [ ] Verificar en base de staging/entorno descartable la existencia de roles y ACL de Vault/pg_net, el cron sin credenciales, y que no se activa con el gate OFF.
- [ ] Crear/rotar DOS secretos con privilegios adecuados mediante mecanismo autorizado SIN guardar valores en GitHub. Sin autorización `Publicalo`, este paso está pendiente.
- [ ] Confirmar scheduler que invoca Edge y `cron.job_run_details` (no contiene tokens), respuestas 200/503 y reintentos tras cierre, sin WhatsApp real en ensayo.
- [ ] Comprobar que el legacy no envía nuevas solicitudes y que SQL snapshots de functions `claim_mvp314`, `next_batch` no cambiaron antes de migrar.
- [ ] Solo en piloto aprobado: prueba con 1 comprador + 2 proveedores, dos mensajes originales asociados y seguimiento navegador; cierre, autenticación y descargas en etapas P3–P5.

**Estado de las etapas:** P0–P5 [ ] **pendientes**. CI positiva sería evidencia de una funcionalidad desarrollada, NO piloto publicado ni 100% del circuito.

**Próxima acción exacta para siguiente conversación:** cerrar auditoría de credenciales de mínimo privilegio y conviviencia legacy, luego preparar despliegue secuencial de SQL/Edge/cron con gate OFF al piloto bajo `Publicalo`; jamás habilitar descarga de originales sin Auth y consentimiento. Continuar desde [Issue #794](https://github.com/ProtectorRudo/Cotironda/issues/794).
