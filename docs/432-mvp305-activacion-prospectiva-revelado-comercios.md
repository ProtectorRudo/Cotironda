# Decisión 432 — Activación prospectiva de identidad comercial al cierre

**Fecha:** 07/11/2026. **Autorización:** usuario confirmó explícitamente «Obvio» al consultarle si autorizaba revelar al comprador, al cierre, el nombre comercial de todos los proveedores invitados **para futuras rondas del piloto**, informándolo con la solicitud y sin revelar teléfonos sin consentimiento.

## Contrato y límites

- Ninguna ronda antigua se modifica: `all_supplier_reveal_activation_mvp303` restringe a `requests.created_at >= activated_at`; se comprobará con SQL antes y después de activar.
- Cotironda comunica **en el mismo documento PDF enviado por WhatsApp** (sin mensajes adicionales) que todos los proveedores invitados quedarán identificados comercialmente cuando venza el plazo y la ronda efectivamente cierre, hayan cotizado o no. No equivale a un «ganador» ni habilita contacto con el comprador.
- El aviso consta en la **caption de Whapi**, no en un segundo mensaje: debe existir idéntico en el envío normal del webhook MVP091, el envío IA Central MVP223 y el recuperador cron MVP149. El PDF agrega un recordatorio corto al pie de cada página para conservar la información aunque se reenvíe el archivo.
- Solo el comprador con un enlace de seguimiento válido puede consultar nombres desde el cierre. Los teléfonos requieren `COTI CONTACTOS SI` (MVP109) individual, autenticado y no revocado; **en el piloto hay 0 opt-ins**.
- No se alteran reglas de ranking: se identifica a todos los negocios invitados aunque no hayan cotizado, sin adjudicación. El planificador viejo de dos finalistas debe seguir OFF.
- Whapi sigue con prueba gratuita expirada: **no se envían mensajes** en esta publicación, ni se pagan suscripciones ni se rehabilita el transporte.

## Cambios de código (MVP305)

- `supabase/functions/_shared/aviso-proveedores-cierre-mvp305.ts`: texto fijo en español y caption compartida, sin pedir confirmaciones al proveedor.
- `supabase/functions/cotironda-piloto-whapi/index.ts`: dos rutas de envío comparten la caption (legacy/IA Central).
- `supabase/functions/cotironda-piloto-document-recovery/whapi-dispatch.ts`: mismo aviso en el recuperador cron.
- `supabase/functions/cotironda-piloto-whapi/request-pdf.ts`: pie del PDF con aviso breve de cierre.
- `tests/unit/mvp305-aviso-proveedores-al-cierre.test.mjs`: asegura los tres mensajes, PDF y restricción de contacto; CI ejecuta además regresiones históricas.

## Secuencia autorizada
1. Desarrollar en rama, pasar CI, revisar, fusionar a desarrollo.
2. Desplegar **únicamente** `cotironda-piloto-whapi` y `cotironda-piloto-document-recovery` conservando su configuración existente, sin tocar secretos ni activar transporte.
3. **Después** del aviso publicado, activar prospectivamente el gate de MVP303 con `activated_at=clock_timestamp()`, sin cambiar la política de WhatsApp, cron o el gate viejo.
4. Verificar SQL: una única fila habilitada; timestamp posterior a las solicitudes existentes; cero contacto con opt-in; sin nuevas invitaciones/mensajes ni rondas; Edge de seguimiento y web existentes funcionan.
5. Reportar límites: la simulación prueba los paths y la vigencia prospectiva. **Sin Whapi activo no puede certificarse entrega genuina del nuevo aviso**; cuando vuelva a estar operativo se necesita prueba real del mensaje, cierre, anonimato y contacto autorizado.

## Riesgo controlado
Una invitación cuyo envío resulte `uncertain` puede no haber llegado a destino. Aunque la regla de producto contempla invitar y revelar incluso si no respondió, el proveedor debe haber aceptado términos de participación claros; el aviso incorporado reduce sorpresas pero no demuestra entrega. Las identidades personales y teléfonos nunca se revelan por defecto. No inferir consentimiento de revelación de teléfono por el simple registro como proveedor.

Documentos anteriores: [política 429](429-mvp303-revelar-todos-proveedores-al-cierre.md), [contactos 430](430-mvp304-contactos-todos-consentidos-al-cierre.md), [publicación segura 431](431-publicacion-mvp303-304-piloto.md).
