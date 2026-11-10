# ADR 352 — La ventana de prueba limita nuevos pedidos, NO respuestas pendientes

**Fecha:** 2026-11-05. **Ámbito:** EXCLUSIVAMENTE `cotironda-piloto`.

## Fallo detectado durante la ventana de 90 minutos

La configuración temporal de MVP229 bloqueaba todo el motor cuando
`expires_at` vencía, incluyendo la lectura de presupuestos de negocios.
Una ronda dura varios días; Ailín/Nahuel podían recibir el PDF mientras
la prueba estaba activa, responder luego y quedar sin asociación ni
evaluación. El guard de MVP228 impediría además que el lector heredado
lo asociara por error, dejando el archivo/mensaje en revisión sin salida.

## Cambio MVP230

Distinguir dos autorizaciones independientes:

- **CREAR NUEVAS RONDAS Y ENVIAR PDFs:** siguen requiriendo ventana
  vigente, buyer registrado, consentimiento, gates MVP226 y MVP222,
  transporte activado, catálogo y permisos originales. Vencimiento y
  apagado administrativo bloquean el camino inmediatamente.
- **RECIBIR UNA COTIZACIÓN PREVIA:** el RPC privado autoriza solo un
  proveedor del piloto con consentimiento vigente, entrada Whapi
  habilitada y un trabajo cuyo PDF esté registrado como
  `api_accepted`, con `finished_at`, invitación y ronda IA
  verificadas y `closes_at` futuro. Esto continúa funcionando
  aun cuando el ensayo expira o se apagan las dos puertas de nuevos
  pedidos. El RPC devuelve `state=reply_only` con
  `buyer=false`/`dispatch=false` y `quote_link=true`/
  `quote_analysis=true` únicamente en ese caso.
- `pending`, `leased` y `uncertain` no prueban un envío:
  impiden atribuir automáticamente una oferta o simular recepción.
- `index.ts` respeta el permiso específico `quote_link` para
  texto libre o documento y el permiso `quote_analysis` para
  presupuestos textuales, independientemente de `trialActive`.
  No se modifica cómo se verifica Whapi, HMAC, SHA, ronda inequívoca,
  cuotas ni el original.
- La nueva aceptación no inicia envíos ni despierta trabajos de
  despacho. Los mensajes de proveedor no reabren la prueba.

## Aceptación y seguridad

- PG17: buyer ON/OFF, vencimiento del ensayo, proveedor con PDF
  aceptado y proveedor ajeno, derechos SQL privados y transacción
  sintética ROLLBACK. Test unitario del puente Edge.
- SQL real de PILOTO: ensayo `BEGIN/ROLLBACK` y posterior lectura
  sin modificar datos históricos.
- Después de instalar, no alterar `activated_at`, `expires_at`
  ni los 3 gates existentes. Mantener los envíos exclusivamente
  bajo autorización de la ventana vigente.
- WhatsApp real: cuando un negocio responda más tarde, la oferta
  deberá estar vinculada a su ronda antes del comparador por rubros;
  nunca anunciar ranking con fuente o IVA dudoso.

## Pendiente

El lector IA de presupuestos del motor nuevo sigue procesando
**texto**; PDF, Excel, imagen/Word requieren unión documental
completa con lectura segura de originales. El cierre, descarga de
originales y ranking por canastas están pendientes de E2E real.
No declarar completados #529/#597.
