# MVP181 — Agradecimiento único en cotización recuperada, sin backfill

**04/11/2026 · #526 y #529 / P1-A · DESARROLLO, no desplegado.** Se apila sobre PR #556, sin tocar `main`, Whapi real, producción ni la función activa del piloto.

## Diagnóstico que origina el cambio
- `cotironda-piloto`, consulta solo lectura: **20 mensajes Whapi de entrada**, **4 cotizaciones de proveedores con archivo (3 PDF + 1 Excel)**, recibidas el **03/11/2026**, **4 con `supplier_evidence_mvp138` v9 `verified`**, pero `supplier_ack_mvp104` mantiene **0** registros.
- La Edge actual ya da las gracias cuando `supplierAckMode` se establece en el webhook síncrono. Su RPC de reserva `cotironda_piloto_reserve_supplier_ack_mvp104` exige que el mensaje tenga **menos de 15 minutos** y la cotización esté almacenada. En el camino diferido `recoverOneStoredDocument` puede registrarse el documento luego, pero **no hay llamada de agradecimiento**.
- Esto es una brecha de cobertura de rutas, **no prueba de que un WhatsApp anterior haya fallado**. No se reconstruyen ni envían mensajes para archivos del 03/11.

## Implementación propuesta
1. `supplier_deferred_ack_policy_mvp181` privada y con RLS, `enabled=false` por defecto. Un trigger fija `activated_at` con reloj del servidor en una activación eventual: no admite fechas manuales anteriores.
2. RPC `cotironda_piloto_reserve_deferred_supplier_ack_mvp181` (solo `service_role`) requiere simultáneamente: flag DB de inbound+outbound habilitado; ronda **creada después** de activar política, abierta y no vencida; mensaje recibido después de activar política; mismo HMAC de chat firmado que disparó la recuperación; proveedor consentido y no dado de baja; comprador consentido; invitación preparada; archivo privado almacenado con SHA coincidente y clasificación explícita `supplier_quote`. No devuelve teléfono, texto, contacto ni identidad. Reserva contra el **ledger existente con clave única `message_hmac`**: jamás dos acuses para el mismo mensaje.
3. `private-document-recovery.ts` agrega callback opcional `onSupplierReceipt` **solo cuando el documento se registró como cotización NUEVA** (`stored_unverified`), nunca por un duplicado. El trabajo de verificar el documento sigue incluso si falla el agradecimiento.
4. `supplier-deferred-ack.ts` realiza reserva antes de pedir a Whapi el envío del texto **«¡Gracias! Recibimos tu presupuesto. Lo estamos procesando en Cotironda.»**; registra `api_accepted` o `uncertain` y el identificador de entrega disponible. Si hay timeout o error incierto **no repite**.
5. El webhook de Whapi SOLO usa el envío diferido con ambas banderas habilitadas: `COTIRONDA_PILOT_DEFERRED_SUPPLIER_ACK_ENABLED=true` **y** la política DB activada. Ambas quedan **OFF / sin instalar**. El destinatario sale exclusivamente del evento Whapi autenticado que origina el mismo HMAC de chat; rechaza chats grupales y URLs. El webhook regular para presupuestos de texto o lectura inmediata permanece intacto.

## Prueba real, reversible y sin mensajes
Se ejecutó el SQL de propuesta en `cotironda-piloto` mediante `BEGIN ... ROLLBACK`. Verificó política inicial OFF, `anon`/`authenticated` sin ejecución de la RPC, token ficticio denegado y **cuatro presupuestos históricos rechazados tanto con política OFF como al simular activación ahora**. El trigger reemplazó una fecha de activación ficticia anterior por el reloj del servidor. Durante la prueba hubo cero ACK y cuatro documentos sin cambios; comprobación posterior: tabla y función `to_regclass`/`to_regprocedure` ausentes y ACK ledger sigue en 0.

## Pruebas y criterios de aceptación
- 12 pruebas unitarias: flag OFF, destinatarios no válidos, reserva duplicada o denegada, envío aceptado y registro, respuesta API no aceptada, timeout/resultado incierto, reconciliación fallida, política prospectiva, callback única en **PDF/Excel/imagen** y continuidad de recuperación si falla el ACK.
- CI de TypeScript/Deno, unitarias, PostgreSQL 17, PostgREST, sitio y Next.js, sin regresiones.
- Antes de activar: **nueva ronda posterior a la activación**, proveedores consentidos, recibir nueva cotización por PDF/Excel/imagen, probar ledger exactamente una fila por mensaje, reintento real del mismo Whapi ID sin duplicado y recepción en el dispositivo. Auditoría de costos/consentimiento/opt-out. No se ejecutará envío real a números históricos.
- El callback solo se dispara si el recuperador asíncrono procesa el documento en el contexto de un webhook firmado. **No constituye todavía un programador general de ACK por cron** ni garantiza que todos los documentos demoren menos que el cierre; ese caso necesita un worker posterior seguro y autorizado.
- No enviar ajustes de precio, contraofertas, ofertas rivales, datos de otros clientes ni ganadores.

## Reversión
La política DB ya está instalada SOLO en PILOTO y permanece apagada; NO activar es el estado por defecto. Ante un cambio futuro, desactivar primero el flag de Edge y la política DB; dejar los ACK ya emitidos en el ledger, nunca borrarlos para reintentar.

**Estado actualizado:** SQL instalado SOLO en `cotironda-piloto` con `enabled=false`; Edge `cotironda-piloto-whapi-mvp181-staging` v3 ACTIVE, 19 archivos, SHA de bundle `b11b8462c9c1b6f227ec598930a195adbb22b62848326e92eda8237ee1af7a16`. La Edge de WhatsApp real v45 con 18 archivos y SHA `1b9ffbe8c2085e40241557eeb872093c00291a334b1d5484118eb4d63c6b815a` permanece intacta. Smoke HTTP staging: GET 405, POST vacío o falso no firmado 200 `probe_only`, sin enviar nada. Verificación SQL persistente: 4 documentos históricos, 0 ACK, política OFF, anon/auth EXECUTE denegado, service_role autorizado, RLS ON, 0 retrospectivos. GitHub: **2.086/2.086 pruebas unitarias y 6/6 CI PASS** sobre el commit inicial del PR #557. No se publicaron ni activaron cambios del webhook ni producción. **Aún falta E2E de nueva ronda consentida, envío recibido y conciliación de reintentos.**

## Regresión de concurrencia y corrección

- Se detectó que esperar la respuesta de Whapi **antes** de auditar la fuente podía retrasar el PDF/Excel. `recoverOneStoredDocument` ahora inicia ambas tareas en paralelo y concilia el resultado del agradecimiento en `finally`, sin reintentos ni pérdida de fuente. Una prueba sincroniza explícitamente el inicio de ACK y verifica que la revisión documental ya avanzó mientras Whapi sigue pendiente.
- Primera ejecución Deno rechazó correctamente el uso de un HMAC `string|null` en una clausura asincrónica; se fijó una copia inmutable del HMAC validado antes de crear la tarea. La versión v3 del staging contiene esta corrección.
- La prueba inicial de concurrencia dependía de esperar un solo ciclo del event loop, antes del cálculo SHA del documento; se reemplazó por una señal real de inicio de la tarea. Ningún mensaje real salió por WhatsApp.
- Nuevo smoke HTTP de staging v3: `GET` respondió `405 method_not_allowed`, y `POST` sin firma `200 probe_only`. Consulta posterior: **política OFF, 4 ofertas históricas y 0 ACK**. La Edge activa sigue v45.
