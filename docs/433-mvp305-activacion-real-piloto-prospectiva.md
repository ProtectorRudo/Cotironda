# Publicación y activación MVP305 — SOLO PILOTO

**Fecha:** sábado 07/11/2026 (Argentina).
**Autorización expresa:** «Obvio» ante la pregunta de activar en TODAS las NUEVAS rondas del piloto el revelado del nombre comercial de TODOS los proveedores invitados al cierre, avisándoles con el pedido y protegiendo los teléfonos.
**Código fuente fusionado:** [PR #700](https://github.com/ProtectorRudo/Cotironda/pull/700), squash commit `3fd7f72aed30bf2d4e73af5602548f1f0544449f`.
**CI antes de publicar:** 42/42 controles PASS, incluida la nueva regresión MVP305.

## Cambios publicados (solo cotironda-piloto)
- Supabase `cotironda-piloto`, proyecto `ilggkalaafhtiysyzlmg`:
  - `cotironda-piloto-whapi` **v69 ACTIVE**, anterior v68; se mantuvo `verify_jwt=false`, 58 módulos existentes y nuevo módulo `aviso-proveedores-cierre-mvp305.ts` (59 archivos).
  - `cotironda-piloto-document-recovery` **v32 ACTIVE**, anterior v31; se mantuvo `verify_jwt=false`. Se incorporó caption compartida, aviso de PDF y dependencia de fidelidad ya probada. El bundle de recuperación se reconstruyó desde los módulos existentes preservados, con rutas relativas normalizadas a `supabase/functions/`.
  - `cotironda-piloto-seguimiento` permanece **v25 ACTIVE**. No hay cambio de código de seguimiento respecto del ya publicado MVP303/MVP304.
- **No** se modificó Vercel para MVP305: la web del piloto ya publica la lista universal tras cierre y los contactos autorizados. Alias verificado en el despliegue anterior: `https://cotironda-seguimiento-vista-piloto.vercel.app/`.
- Los **tres caminos** de envío de pedido PDF (webhook normal, IA Central y recuperador) contienen exactamente la misma caption con el aviso de revelación. El PDF añade un pie corto. **No se creó un WhatsApp adicional** ni se cambió la lógica de envíos o reintentos.
- **No** se alteraron las claves, secretos, la configuración de WhatsApp, los proveedores, el costo ni los documentos anteriores. Whapi sigue con la prueba vencida, sin prueba de entrega real de este texto.

## Activación prospectiva comprobada
Operación SQL protegida, después de desplegar las dos funciones de pedido:

`cotironda_piloto_privado.all_supplier_reveal_activation_mvp303`
- `enabled=true`;
- `activated_at=2026-11-08 00:42:01.167001+00` (07/11/2026 **21:42:01 Argentina**).
- Predicado de la RPC de nombres: `requests.created_at >= gate.activated_at`, además de token del comprador, consentimiento, ronda cerrada y vencimiento.

Auditoría SQL posterior (2026-11-08 00:42:25 UTC):
- **5** rondas anteriores, **0** nuevas al momento de activar.
- **3** tokens históricos probados: 0 filtraciones (todos permanecieron `not_found` en la función de nueva revelación).
- **0** consentimientos específicos de divulgación de teléfonos, por lo que no aparece ningún número por defecto.
- `finalist_activation_mvp113=false`; **0** mensajes de finalistas antiguos; cron de cierre original sigue con 1 tarea activa.
- `anon` no puede ejecutar la RPC de nombres y `authenticated` no puede ejecutar la RPC privada de teléfonos.
- No se creó una ronda artificial, no se envió mensaje, no se alteraron importes ni adjudicaciones.

## Resultado comercial vigente
- Durante una ronda: presupuestos anónimos.
- Al vencer el plazo y quedar efectivamente `closed`: **todos los proveedores invitados a esa ronda nueva** y con consentimiento de participación vigente quedan identificados por nombre, hayan cotizado o no.
- El dato de contacto de cada proveedor solo aparece con `COTI CONTACTOS SI` autenticado, material cifrado verificado y sin revocación; no se expone el número del comprador.
- No hay revelación retroactiva, no se seleccionan dos ganadores, no se adjudica automáticamente.

## Lo que aún NO se pudo certificar
El período gratuito de Whapi está vencido: no se verificó la llegada de un PDF con la nueva caption por WhatsApp ni una ronda nueva E2E, ofertas reales, cierre y datos de contacto verdaderamente consentidos. El despliegue y la regla SQL **sí** están activos y verificados, pero el canal de transporte sigue siendo un requisito para la prueba integral.

**Riesgo conocido:** una invitación con estado `uncertain` puede no haber llegado; la etiqueta de negocio solo se muestra después de cierre en nuevas rondas y con consentimiento de participación vigente. El aviso en la misma invitación previene sorpresas cuando el canal funciona, aunque no sustituye la prueba de recepción.

Referencias: [decisión MVP305](432-mvp305-activacion-prospectiva-revelado-comercios.md), [revelado MVP303](429-mvp303-revelar-todos-proveedores-al-cierre.md), [contactos MVP304](430-mvp304-contactos-todos-consentidos-al-cierre.md).
