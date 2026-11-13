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


## Segundo incremento — ledger SQL y pruebas PG17 (13/11)

Se agregó el candidato SQL supabase/piloto/v2_d016_original_reply_proof_CANDIDATE.sql y fixture supabase/tests/ci/v2-d016-original-proof-pg17.sql. Este código **no está instalado en la base de piloto** y no cambia las RPC existentes de catálogo, descarga ni worker.

La máquina de estados deliberadamente falla cerrado:

- Reservar registro de versión+SHA del aviso **antes** del POST a Whapi, con proveedor, empresa/ronda, chat real, política V2 prospectiva y una sola reserva por ronda/proveedor.
- Confirmar aceptación de API **únicamente** cuando el despacho real asociado tiene el mismo identificador Whapi y la hora documentada es posterior a la reserva; un envío incierto no habilita la evidencia.
- Observar respuesta en whapi_inbox ligada a ai_supplier_links_mvp225, al proveedor, chat, SHA del original PDF/Word/Excel/imagen o texto; exigir enlace por respuesta al mensaje esperado o única ronda activa comprobable, sin ambigüedades, reenviados, bajas ni señales de NO COMPARTIR.
- Revocar por mensaje de texto auténtico del mismo proveedor y rondas, negando la evidencia incluso cuando ya se observó una respuesta. La validación del contenido textual NO COMPARTIR debe realizarse en servidor antes de llamar a revocar; el SQL sólo comprueba origen y procedencia.
- Las funciones privilegiadas son exclusivamente para service_role. RLS sin SELECT público, ninguna salida con bytes ni contacto. La respuesta verificada devuelve explícitamente verified_reply_not_authorization; **no reemplaza la autorización legal ni abre las RPC actuales**.
- PostgreSQL 17 sintético con BEGIN/ROLLBACK y dos controles: validación de reserva/envío, respuesta, SHA, suplantación, reenvío, duplicados, ACL/RLS, baja y revocación; base limpia al terminar. Workflow GitHub dedicado.

Este candidato todavía necesita auditoría de integridad del POST real, su orden de escritura y captación Whapi v76; además, verificación legal del mecanismo. Nunca habilitarlo sólo por haber pasado una CI sintética.


## Revisión normativa preliminar (Argentina, 13/11/2026)

La Ley 25.326 art. 5 exige consentimiento libre, expreso e informado, documentado por escrito o medio equiparable en los supuestos en que corresponda. Art. 11 establece requisitos específicos para la cesión de datos personales e identifica excepciones legales. La AAIP explica que la información debe detallar finalidad, destinatarios y responsable. **No está demostrado que enviar un presupuesto después del aviso configure por sí mismo un consentimiento expreso y documentado** para divulgar todos los datos personales que pudiera contener el original. Tampoco se debe presumir que toda oferta comercial requiere consentimiento adicional: revisar qué datos se comparten y si aplica una excepción contractual.

Fuentes: https://www.argentina.gob.ar/normativa/nacional/ley-25326-64790/actualizacion ; https://www.argentina.gob.ar/aaip/datospersonales/derechos ; https://www.argentina.gob.ar/normativa/nacional/70368/actualizacion .

**Criterio técnico permanente:** el estado verified_reply_not_authorization demuestra procedencia, NO consentimiento válido ni permiso de publicación. El paso de evidencia a autorización comercial debe ser explícito, trazable y revisado jurídicamente; no puede quedar oculto en la IA ni pasar a automático por defecto. Mantener facilidad de uso, integrando la comunicación y las condiciones claras en el intercambio o acuerdo comercial existente, sin obligar a editar un presupuesto.
