# Acta 469 — MVP335 v74 publicado en piloto (10/11/2026 ART)

**Orden del usuario:** «Publicalo». **Alcance explícito:** publicar exclusivamente webhook `cotironda-piloto-whapi` del proyecto Supabase `cotironda-piloto` (`ilggkalaafhtiysyzlmg`), sin alterar la base de datos, cron, Whapi ni la aplicación productiva. **Resultado:** publicado y verificado **v74 ACTIVE**, con fuente reproducible idéntica al candidato MVP335 auditado.

## Evidencia reproducible

- GitHub rama de desarrollo integra [PR #739](https://github.com/ProtectorRudo/Cotironda/pull/739), merge `25a5395f05efd19603c12b94c79679bf61fb5e0e`.
- CI de PR: **6/6 workflows exitosos**. MVP335: 19/19 tests propios + 13/13 MVP333 + 9/9 MVP332 + 37/37 regresiones = **78/78 casos**; tipado Deno correcto.
- Antes del deploy Edge Whapi **v73 ACTIVE** con **61 archivos**; huella exacta de `index.ts` `91481dfd1ec51843346d233dfe654e8f3ce0ef699364424b625fe68d05f24f95` y sin nombres duplicados.
- Se aplicó el reemplazo **solo de `index.ts`** indicado por `scripts/piloto/mvp335-no-confirmation-candidate.mjs`, verificando hash y anclajes únicos. Los otros **60 archivos** se copiaron íntegros de la versión 73. Huella SHA-256 de candidato de entrada: `3df77172138e27689123080335e65f2da111a14caac0b2a8034978435371f063`.
- La API de Supabase devolvió `cotironda-piloto-whapi`, `status=ACTIVE`, `version=74`, `verify_jwt=false` (previo, apropiado para webhook con autenticación propia).
- En una **segunda lectura independiente del deploy**, Supabase devolvió v74 ACTIVE, **61 archivos**, y la huella **exactamente** `3df77172138e27689123080335e65f2da111a14caac0b2a8034978435371f063`. El índice no contiene `COTIRONDA_PILOT_BUYER_AUTO_RELEASE_MVP306_ENABLED` ni el nuevo emisor de revisiones heredadas; sí conserva `equalSecret(webhookHeader,sec.webhookSecret)` y el 503 cuando la credencial no es válida.

## Estado real post-deploy (10/11/2026 02:34:43 ART)

- Tabla de entrada Whapi: **32** mensajes (invariable).
- Rondas: **6** (invariable); sexta ronda histórica continúa `draft`, con revisión heredada previa. No se intentó convertir ni reenviar esa ronda.
- Publicaciones automáticas: **0**; no se ha realizado una ronda nueva de extremo a extremo.
- Gate SQL `ai_auto_release_gate_mvp306.enabled=true` (prospectivo). Gates `ai_batch_gate_mvp314` y `ai_buyer_notice_gate_mvp315`: **OFF**.
- Trabajos de despacho `leased`/`uncertain`: **0**. Outbox `leased`/`uncertain`: **0**.
- No se hicieron cambios de tablas, migraciones, secretos, configuración del canal, lista de destinatarios, cron, recuperación diferida ni pagos; no se llamó Whapi, no se inició un nuevo pedido, no se envió WhatsApp.
- Los logs consultados **no muestran una nueva invocación de v74**: por lo tanto **no está demostrado** que la variable `COTIRONDA_PILOT_WEBHOOK_SECRET` sea válida en el nuevo runtime. El 503 previo de v73 sigue siendo un bloqueo pendiente. La nueva instrumentación puede diferenciar `missing` vs `invalid_length` en un próximo POST; no recupera secretos ni elimina autenticación.

## Criterios de éxito / no éxito

**Confirmado:** código desplegado = candidato validado; política de no pedir confirmación rutinaria para nuevas solicitudes; igualdad de cabecera secreta conserva su protección; gate SQL administra cada liberación, sin variable extra redundante. **No confirmado:** funcionamiento de Whapi inbound autenticado con secreto real, entrega de PDF a Ailín y Nahuel, aviso de seguimiento, presupuestos de proveedores, ranking y cierre. No comunicar «piloto 100%».

**Siguiente verificación operacional segura:** primero demostrar que una nueva invocación llega autenticada sin 503 `webhook_secret`. Si reaparece el problema, revisar si Supabase proporciona el secreto válido al worker y si Whapi envía la cabecera esperada, sin exponer el secreto en chats/logs ni sustituirlo por el token Whapi. No invitar al comprador a confirmar ni editar pedidos. **Nunca reintentar envíos inciertos**.

Véase [acta 468 — decisión y pruebas](468-mvp335-sql-only-sin-confirmacion-y-secretos.md).
