# Cotironda V2 — D016/P0 #838: aviso en el pedido y prueba de respuesta

**Estado 13/11/2026: CANDIDATO aislado en rama de desarrollo. NO integrado al webhook, NO instalado en Supabase, NO desplegado en Vercel, NO activo comercialmente.**

## Decisión funcional

El aviso viaja dentro del **mismo WhatsApp del pedido** (o caption, si el transporte admite el tamaño completo). La respuesta posterior de cotización podrá servir como evidencia solo si se verificó la adecuación legal/comercial de la aceptación por conducta. No se pide registro, confirmación ni otro mensaje.

Texto exacto candidato: «Cotironda compartirá tu presupuesto original y un análisis con el comprador de esta solicitud. Si respondés enviando tu cotización después de recibir este pedido, autorizás ese uso para esta solicitud. Podés pedir que dejemos de compartirlo escribiendo NO COMPARTIR por este WhatsApp.»

**Revisión jurídica pendiente** sobre aceptación por conducta y datos personales que puedan figurar en archivos PDF/Excel. No afirmar consentimiento legalmente suficiente sin ella.

## Cambios entregados

- Archivo src/server/v2-d016-aviso-original-proveedor.ts: añade aviso sin segundo WhatsApp, nunca recorta pedido, no altera original y genera solo una prueba preliminar.
- Versionado del aviso, SHA del cuerpo que se presume efectivamente enviado, ID Whapi del despacho, estado API aceptada, tiempos, identidad de ronda/proveedor/chat, enlace de respuesta y revocación.
- Rechazo de mensajes de tercero, reenviados, sin cotización, anteriores al aviso, posteriores al cierre, ambiguos, versión incorrecta, llamada Whapi incierta, o solicitud NO COMPARTIR.
- Únicamente identificadores opacos y tiempos en el resultado; nunca presupuestos, precios o credenciales.

## Seguridad / límites

El helper NO concede permiso para ver archivos. Sus parámetros deben proceder del backend y la evidencia se deberá cotejar transaccionalmente con despacho Whapi, registro inmutable del aviso, whapi_inbox, enlaces originales, revocación y RLS. Un estado api_accepted no prueba por sí solo recepción o aceptación. Las RPC actuales todavía exigen aceptación antes de invitar; NO se relajaron. El worker actual sigue exigiendo consentAt <= invitedAt.

## Pruebas

Comando local: node --experimental-strip-types --test tests/unit/v2-d016-aviso-original-proveedor.test.mjs.

Resultado en Node 22.16: 6/6 casos aprobados. Los tests comprenden aviso único, éxito estrecho, API incierta, SHA/cuerpo incoherente, versión, vinculación y cronología, opt-out, revocación, reenvío y ronda ambigua. Esto NO constituye una prueba de WhatsApp real ni E2E. GitHub Actions deberá ejecutar el mismo comando.

## Pendientes P0 antes de activar

1. Revisar jurídicamente el texto y aceptación por respuesta.
2. Incorporar en el envío existente el aviso + registro inmutable de versión/cuerpo/ID/hora/resultado Whapi; no cambiar el webhook v76 sin auditoría de huella.
3. Registrar respuesta por ronda y proveedor con evidencia auténtica de whapi_inbox y correlación, control de bajas, concurrencia y revocación; nunca aceptar un POST incierto.
4. Cambiar de modo prospectivo TODAS las RPC, descargas y el worker de comparación temporal a aviso enviado < respuesta autenticada < publicación, manteniendo aisladas las rondas históricas.
5. PG17 ROLLBACK con escenarios negativos, Deno, Node, Next y E2E en Preview protegido. Flags OFF hasta que el flujo completo funcione.
6. Resolver cuota Vercel sin eludirla y provisionar secretos server-only por gestor privado, solo piloto.

Referencias: Issue #838, https://github.com/ProtectorRudo/Cotironda/issues/838 ; plan maestro Issue #794, https://github.com/ProtectorRudo/Cotironda/issues/794 . El Preview READY actual tiene SHA 64b8573, no contiene este candidato.
