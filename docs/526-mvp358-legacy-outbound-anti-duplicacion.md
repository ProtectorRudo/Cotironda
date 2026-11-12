# Acta 526 — MVP358: cierre de la vía heredada de despachos (SOLO DESARROLLO)

**Fecha:** 12/11/2026. **Autorización:** «Avanza y registra». **Revisión solo lectura del piloto; código y pruebas aislados en GitHub.** No se aplicó SQL, no se activó cron ni se enviaron WhatsApps.

## Decisión orientada al comprador

Cotironda NO puede asignarle a un arquitecto un presupuesto que pertenece a otra ronda ni enviar dos pedidos repetidos a un proveedor. Las fuentes de verdad deben ser `whapi_inbox` y `ai_supplier_links_mvp225` (MVP355), no una coincidencia de fecha. Se conserva el circuito sin pasos adicionales para comprador y proveedor.

## Hallazgo técnico verificado

En Supabase piloto sigue instalada `public.cotironda_piloto_claim_whapi_v1()`, que busca `whapi_outbox.state='pending'`, verifica `allow_next_pilot_send_mvp091` o `allow_document_send_mvp099`, bloquea el registro con `FOR UPDATE SKIP LOCKED` y produce un lease. **No posee `pg_advisory_xact_lock(7835634)` ni comprueba la exclusión de proveedor entre rondas.**

Las funciones del sistema anterior podrían producir un envío por fuera de MVP356 y también competir con IA Central para el **mismo** pedido/proveedor. La guarda MVP356 anterior excluía `other.request_id=t.id` y, por tanto, no detectaba un envío aceptado por la otra ruta *de la misma ronda*. En el piloto vivo el outbox tiene **5 `api_accepted` y 1 `cancelled`**, sin nuevos pendientes. Esto NO demuestra que la ruta legacy sea imposible de activar en el futuro; `integration_flags.whatsapp_outbound_enabled` es compartida con IA Central.

## Corrección propuesta en rama (MVP358)

- `supabase/piloto/mvp358_legacy_claim_same_lock_and_cross_lane.sql`: redefine, desde snapshot exacto leído del piloto, el `claim_whapi_v1` añadiendo **el mismo advisory transaction lock 7835634** que utilizan `claim_mvp222/mvp314`, y un filtro `NOT hay_despacho_solapado_mvp356(request,supplier)`.
- La guarda MVP356 se redefine conservando su flag privado **OFF por defecto**, presupuesto, `prepared`, períodos e identidad del proveedor, pero **sin excluir la misma ronda**. Así se detecta un `leased/api_accepted/uncertain` que llegó por la otra vía, incluso si era el mismo pedido.
- No se inventan confirmaciones, no se cambia el contenido del PDF, no se toca la base ni se revierte estado de mensajes anteriores. Se conserva la semántica del viejo claim y los checks comerciales existentes; ningún nuevo mensaje sale de esta función SQL.

### Criterios de aceptación

- [ ] PostgreSQL 17: dos compradores, dos proveedores; IA accepted en ronda 1 bloquea legacy en ronda 1 y 2; proveedor 2 independiente sigue; un legacy leased bloquea IA en misma ronda; un legacy accepted bloquea IA en misma ronda; cierre de ronda rival libera; segundo claim no duplica; guardia OFF mantiene comportamiento; rollback elimina esquemas/roles de prueba.
- [ ] Node estructural: mismo lock en las tres rutas, estado `pending` sin filtro permisivo, no SQL de red ni secretos.
- [ ] CI general: Next.js, unidad, PostgREST, aislamiento PG17 y pruebas MVP354–MVP357 sin regresiones. No afirmar éxito hasta verificar el SHA final.
- [ ] Antes de publicar: comparar de nuevo la definición **desplegada** de `claim_whapi_v1`; verificar cualquier lease legado vivo, estados `uncertain`, y no permitir que otro emisor fuera de esas RPC envíe al mismo proveedor. Solo desplegar en PILOTO con autorización expresa.

### Auditoría de Data API / pg_net (solo lectura)

Se confirmó por SQL que `anon` y `authenticated` tienen **USAGE** del esquema `net` y privilegio **SELECT** sobre `net.http_request_queue`; ese dato POR SÍ SOLO no prueba que PostgREST exponga dicho esquema a Internet. `current_setting('pgrst.db_schemas',true)` devolvió NULL en la sesión SQL y no fue evidencia de configuración. La documentación oficial indica que una extensión ajena a `public` solo es accesible por Data API si está incluida en «Exposed schemas»; **no se obtuvo el listado real de ese ajuste de este proyecto**. Por lo tanto, el ítem permanece **[ ] NO VERIFICADO** y es bloqueo de publicación del cron.

Supabase documenta el control de esquemas en [Using Custom Schemas](https://supabase.com/docs/guides/api/using-custom-schemas). No alterar a ciegas grants internos de `pg_net`: preservar workers y exponer únicamente dos credenciales `cron` limitadas al Edge, jamás una `service_role`.

### Alcance y continuidad

**Este parche es temporal, exclusivo del piloto.** No puede convertirse en la política nacional de Cotironda porque limitaría comercialmente un corralón a una ronda a la vez. Para producción: correlación inequívoca por mensaje y referencia de pedido, sin impedir licitaciones concurrentes.

**Entrega:** PR draft encima de [#800](https://github.com/ProtectorRudo/Cotironda/pull/800), que depende de #799, #798 y #797. `P0–P5` siguen pendientes. Al finalizar CI, actualizar [checklist #794](https://github.com/ProtectorRudo/Cotironda/issues/794), [plan maestro y relevo #796](https://github.com/ProtectorRudo/Cotironda/pull/796) y comentarios de handoff con SHA.

**Próxima acción de publicación:** obtener evidencia no ambigua de que `net` está fuera de los esquemas Data API del piloto, revisar el cron con flags OFF, preparar dos secretos app-scope y desplegar secuencialmente solo al recibir «Publicalo» para `cotironda-piloto`. Después ejecutar una prueba comercial auténtica 1 comprador + 2 proveedores + 2 respuestas asociadas + enlace navegador + cierre y originales protegidos. Nunca tomar el verde de CI como E2E.
