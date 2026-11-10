# Decisión 445 — MVP315: aviso autónomo al comprador después de todos los despachos

**Fecha:** 08/11/2026, ART. **Autorización:** «Luz verde», solo desarrollo, pruebas y auditoría. **Sin publicar, sin activar cron, sin Whapi real ni producción.**

## Auditoría de dependencias (Supabase `cotironda-piloto`, consulta SOLO LECTURA)

Verificado directamente en el proyecto `ilggkalaafhtiysyzlmg` el 08/11/2026:
- Edge `cotironda-piloto-whapi` permanece **ACTIVE v70**, y `cotironda-piloto-seguimiento` **v25**. No se detecta función Edge `cotironda-piloto-ai-batch` instalada.
- `admin_channels_mvp312` **no existe**; `ia_recipient_packet_mvp313` **no existe**; `ai_batch_gate_mvp314` **no existe**.
- `ai_auto_release_gate_mvp306.enabled=false`; `ai_dispatch_gate_mvp222.enabled=true` (¡una parte de IA activa no significa envío autónomo habilitado!).
- Se requieren migraciones MVP309, 310, 311, 312A, 312B, 312C, 313, 314 y 315, siempre en ese orden, verificando primero las dependencias instaladas y la compatibilidad de funciones que `CREATE OR REPLACE` modifica. Que los CI sintéticos estén verdes NO reemplaza esa auditoría de despliegue.
- Whapi no está acreditado como disponible para nuevos envíos reales; una versión ACTIVE de Edge no valida el plan/cuenta de Whapi.

**Ninguno de estos datos fue modificado.** No inferir permiso para activar gates a partir de «Luz verde».

## Problema que se resuelve

MVP314 puede terminar de enviar invitaciones a 5, 20 o más proveedores durante ticks independientes, pero MVP289/MVP306 notificaban el seguimiento al arquitecto durante un evento del webhook. Si el último proveedor se despachaba en el worker sin un nuevo mensaje entrante, el cliente podía quedarse sin enlace.

MVP315 agrega **un aviso autónomo** ejecutado por el propio trabajador tras el procesamiento, incluso cuando no quedan trabajos nuevos en la cola. Es un único enlace privado con token aleatorio de 256 bits ya contemplado en MVP289/MVP212. No requiere `CONFIRMAR COTI`, no solicita permisos por ronda, y **nunca revela el contacto del comprador a proveedores**.

## Comprobaciones antes de enviar

1. GATE SQL `ai_buyer_notice_gate_mvp315` **OFF** y flag Edge `COTIRONDA_PILOT_BUYER_NOTICE_MVP315_ENABLED` **OFF** por defecto.
2. El pedido es de IA Central, preparado, prospectivo (nacido tras activación de MVP306 y MVP315), y su comprador tiene autorización de liberación automática vinculada a la fuente original.
3. **Todos** los trabajos de despacho de esa ronda están `api_accepted` con `whapi_message_id` verificable. No basta con dos proveedores; uno pendiente, `leased` o `uncertain` bloquea ese aviso.
4. No existe otro token de seguimiento para esa ronda. Se usa el mismo `buyer_tracking_mvp091` que el webhook, con restricción de unicidad.
5. El destinatario solo surge del canal cifrado `participant_channels_mvp109` con mensaje autenticado, o de `admin_channels_mvp312` respaldado por `admin_authorizations_mvp309` **del rol comprador y su alcance**, sin revocaciones. Fuentes contradictorias se bloquean. Nunca hay teléfono en SQL de salida, salvo sobre AES-GCM.
6. Edge descifra bajo AAD de la identidad del chat, recalcula HMAC y SHA del JID y verifica que coinciden, además de canal y ronda. **Antes del POST**, vuelve a consultar el token, vigencia, rol, permiso, estado de todos los despachos, y recupera/valida el mismo contacto cifrado.
7. `ia_issue_buyer_notice_mvp315` toma bloqueo `FOR UPDATE`, reutiliza `issue_auto_tracking_mvp306` (que bloquea el pedido y revalida todos los IDs) y reserva en la misma transacción **máximo 10 notificaciones diarias**. Si no se emitió token, no consume presupuesto.
8. Tiempo de red incierto, envío sin ID Whapi o revocación justo antes del POST: token queda en estado no reintentable automáticamente mediante el finalizador MVP091. Nunca publicar el número ni el token en logs.

## Componentes

- `supabase/piloto/mvp315_aviso_comprador_post_despacho.sql`: tablas privadas, SQL `buyer_packet`, `next_buyer_notice`, `issue_buyer_notice` y `authorize_buyer_notice`, todos RPC exclusivamente de `service_role`.
- `supabase/functions/cotironda-piloto-whapi/buyer-tracking-after-batch-mvp315.ts`: criptografía WebCrypto con fuente cifrada, verificación doble y envío único reutilizando MVP289.
- `supabase/functions/cotironda-piloto-whapi/buyer-tracking-confirmation-mvp289.ts`: mantiene ruta vieja intacta si no se pasa el nuevo RPC; acepta autorización revalidada y el issuer con cupo.
- `supabase/functions/cotironda-piloto-ai-batch/index.ts`: invoca el aviso **una vez por tick** independientemente de que haya pendientes, sin contaminar solicitudes a proveedores.
- Unitarios Node + fixture PostgreSQL17 sintético con todas las migraciones MVP309–315 en una transacción `ROLLBACK`; Deno Edge check. **Los destinatarios del test no son personas reales**.

## No resuelto / puertas de lanzamiento

- [ ] CI de este PR aprobado en el último commit; revisión de fallos.
- [ ] Prueba concurrente en **dos conexiones reales**, cuota combinada de webhook/worker y token exclusivo.
- [ ] Revisión de suficiencia de evidencia comercial para las altas `owner_statement`; revocación inmediata.
- [ ] Preflight comparando cada SQL con el esquema real y plan de reversión; backup verificable de Supabase antes de migrar.
- [ ] Publicación piloto de las migraciones y funciones solo con «Publicalo», gates SQL y Edge **OFF**, sin cron/Whapi.
- [ ] Programador interno seguro y pruebas piloto sin envíos; luego activación expresamente autorizada con cupos estrictos y Whapi habilitado.
- [ ] E2E completa: 1 comprador, 3+ proveedores, aceptación Whapi real, notificación automática, recepción/interpretación de cotizaciones, comparación económica por rubro, cierre, contactos comerciales autorizados y descarga de originales.
- [ ] Decidir tratamiento administrativo para trabajos `uncertain`: nunca reenviar a ciegas ni anunciar despacho completo.

## Nota de operación

Enviar automáticamente el enlace al comprador tiene un costo por mensaje y necesita que el servicio Whapi esté activo. Los límites 20 intentos globales/8 por comprador en MVP314 y 10 avisos globales en MVP315 son **techos de intentos**, no presupuesto monetario verificado. Los flags quedan apagados por defecto. `Luz verde` no habilita despliegue.
