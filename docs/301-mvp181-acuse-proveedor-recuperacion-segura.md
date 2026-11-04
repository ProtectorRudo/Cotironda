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
- 11 pruebas unitarias: flag OFF, destinatarios no válidos, reserva duplicada o denegada, envío aceptado y registro, respuesta API no aceptada, timeout/resultado incierto, reconciliación fallida, política prospectiva, callback única en **PDF/Excel/imagen** y continuidad de recuperación si falla el ACK.
- CI de TypeScript/Deno, unitarias, PostgreSQL 17, PostgREST, sitio y Next.js, sin regresiones.
- Antes de activar: **nueva ronda posterior a la activación**, proveedores consentidos, recibir nueva cotización por PDF/Excel/imagen, probar ledger exactamente una fila por mensaje, reintento real del mismo Whapi ID sin duplicado y recepción en el dispositivo. Auditoría de costos/consentimiento/opt-out. No se ejecutará envío real a números históricos.
- El callback solo se dispara si el recuperador asíncrono procesa el documento en el contexto de un webhook firmado. **No constituye todavía un programador general de ACK por cron** ni garantiza que todos los documentos demoren menos que el cierre; ese caso necesita un worker posterior seguro y autorizado.
- No enviar ajustes de precio, contraofertas, ofertas rivales, datos de otros clientes ni ganadores.

## Reversión
No instalar y no activar es el estado por defecto. Si se instalara en PILOTO posteriormente, desactivar primero el flag de Edge y la política DB; dejar los ACK ya emitidos en el ledger, nunca borrarlos para reintentar.

**Estado al crear PR:** código y SQL en desarrollo. Sin Whapi real, sin nuevos contactos, sin datos de producción ni cambios a rondas existentes.
