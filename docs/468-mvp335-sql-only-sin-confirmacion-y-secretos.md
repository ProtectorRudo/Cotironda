# Acta técnica 468 — MVP335: sin confirmaciones y diagnóstico seguro del webhook

**Fecha:** 09/11/2026 ART. **Autorización:** «Luz verde» (desarrollo y pruebas únicamente). **Estado:** candidato OFFLINE sobre Edge v72/v73, **NO publicado**, ningún secreto modificado ni WhatsApp enviado.

## Incidente reproducido con evidencia del piloto

- Arquitecto autenticado envió pedido de prueba el 09/11 22:12:36 ART. Fue archivado (inbox 32), IA interpretó **20 cemento CPC 50 kg + 3 bolsones arena + 2 piedra** y registró 3 rubros y 6 destinos (dos proveedores). Ronda sexta `e81307aa-d9c4-43ca-868c-780f2dade465` quedó `draft`, con `ai_buyer_review_mvp279.state=api_accepted` (confirmación heredada), **0** auto release, **0** jobs, sin seguimiento. No repetir ni intentar confirmar dicha ronda.
- SQL `ai_auto_release_gate_mvp306.enabled=true` desde 09/11 21:55 ART, pero Edge v72/v73 decide si usarlo según `Deno.env.get('COTIRONDA_PILOT_BUYER_AUTO_RELEASE_MVP306_ENABLED')==='true'`. La operativa de la reserva SQL nunca fue invocada cuando el valor era ausente o `True`, y el webhook cayó al antiguo aviso de confirmación. El operador no debe ser responsable de corregir casing para atender pedidos.
- Un pedido posterior del arquitecto, **10 bolsas cemento CPC 50 kg + 2 bolsones arena**, no ingresó en Supabase (32 inbox, 6 rondas); la invocación POST de Edge v73 a las 22:38:21 ART recibió **503**, con registro `cotironda_pilot_config_invalid: webhook_secret`. El usuario afirma que no cambió otras variables y que el secreto figura en el Dashboard. No atribuirle el fallo ni asumir token Whapi vencido. Ese error solo prueba que el `webhookSecret` obtenido por la Edge estaba fuera de los límites originales **32–256 caracteres**, no prueba si faltaba su valor en runtime o si era corto/largo. Una respuesta tardía al pedido previo no significa que el webhook actual esté sano.

## Cambio propuesto (solo el candidato MVP335)

**Fuente de verdad de publicación: gate PostgreSQL, no segundo secreto booleano.**

El `scripts/piloto/mvp335-no-confirmation-candidate.mjs` vuelve a generar exactamente el candidato de Edge MVP333 final (SHA-256 `91481dfd1ec51843346d233dfe654e8f3ce0ef699364424b625fe68d05f24f95`) y le aplica cambios con anclajes únicos; aborta si el origen cambia, sin tocar el manifiesto histórico MVP332.

En `emitirRevisionUnificada`, si la fuente corresponde al comprador auténtico, la IA Central está operativa y el control de revisión permite liberar, se llama **siempre** `liberarPedidoAutomaticoMvp306`. Su RPC `cotironda_piloto_ia_auto_release_mvp306` comprueba gate SQL con `activated_at`, autorización de comprador, renglones, cantidades, semántica, identidad del proveedor, destinatarios/consentimiento, y ausencia de revisión histórica; luego `cotironda_piloto_ia_publish_mvp222` valida una segunda vez. Solo con estado `publicado` se agrega al despacho `maxJobs=2` y al seguimiento posterior. Si SQL está OFF, falta permiso o hay un fallo de datos, **no envía nada ni pide CONFIRMAR COTI**. Si la reserva es incierta, responde error para conciliación; NO reintenta envíos Whapi. El circuito de confirmación recibido históricamente permanece disponible para no destruir rondas previas, **pero el webhook ya no emite nuevas revisiones de comprador**. Mensajes de error por falta de comprensión semántica son distintos de confirmar un pedido válido y permanecen condicionados por guardas.

**Webhook secret: nunca aflojar autenticación.** Conserva el header `x-cotironda-webhook-key`, comparación de igualdad segura y `503` fail-closed sin secreto de entorno válido. En logs privados nuevos distingue solo `missing` vs `invalid_length`, conserva la línea `webhook_secret`, **sin imprimir valor, longitud, ID, usuario o HMAC**. No sustituye por Whapi token ni por valor público de DB, no cambia el control de entrada firmado. El secreto correcto debe estar tanto en el gestor de Supabase como en el remitente autorizado; su mera presencia nominal en UI no demuestra lectura en Edge. **Esta mejora no restaura por sí misma un secreto inválido.**

## Criterios de aceptación y pruebas

1. Fuente v73 pinned, manifest 61 archivos sin alteraciones; candidato determinista. Falla si el código activo difiere del SHA congelado.
2. Comprador + central + gate SQL ON con fuente íntegra -> aprobación/solo luego dispatch y aviso de tracking; no pregunta de confirmación.
3. Gate SQL OFF, comprador no autorizado, proveedor, fuente/catálogo dudosos -> retención segura sin mensaje `CONFIRMAR COTI` ni job; no abrir gate por inscripción.
4. Queda intacta continuidad de rondas anteriores y confirmaciones históricas; no reactivar ronda sexta con revisión ya registrada.
5. Secret ausente/corto/largo -> 503 antes de PostgREST, nunca una ruta pública alternativa; secreto en rango 32–256 no garantiza coincidencia de header (sigue verificación HMAC).
6. Pruebas normales y extremas: 19 casos MVP335 + regresiones MVP333, MVP332, MVP306/MVP313/MVP314/MVP315, análisis TypeScript Deno completo de candidato in-memory. **Pruebas ejecutadas y aprobadas:** 19/19 casos MVP335 + 13/13 MVP333 + 9/9 MVP332 + 37/37 regresiones MVP306/MVP313/MVP314/MVP315 = **78/78**. Deno validó tipado completo del candidato in-memory y los 6 workflows iniciales finalizaron exitosamente (sujeto al CI final del acta). SHA-256 final del candidato: `3df77172138e27689123080335e65f2da111a14caac0b2a8034978435371f063`.
7. No publicar con «Luz verde»: próximo deploy solo con «Publicalo» y comprobación de huellas / preflight real. No activar batch MVP314 ni diferidos MVP315. No activar reintentos inciertos.

## Ruta de recuperación de autenticación

1. Antes de cualquier nuevo envío real, comprobar en logs privados del runtime desplegado, **sin revelar valor**, si el secreto está `missing` o `invalid_length`. Esa diferenciación se obtendrá recién con un despliegue seguro de este candidato y una nueva invocación.
2. Si el secreto válido ya existe en un gestor de configuración seguro, **restaurar exactamente el valor correcto** a la Edge desde el canal autorizado y contrastar con el header de Whapi. Si no puede recuperarse, regenerar secreto fuerte y sincronizar ambas puntas una sola vez, **no bajar el mínimo de seguridad**. Las herramientas conectadas actualmente no dan acceso a valores de secretos, por lo que no declarar reparado sin una prueba real.
3. Con el webhook válido, hacer **una sola ronda nueva**; verificar inbox, lectura IA, 2 destinos, auto release SQL, jobs enviados, acuse Whapi, enlace, respuestas de proveedores y comparación; no tocar rondas anteriores ni pedir `CONFIRMAR COTI`.

**Impacto:** no cambios a datos del piloto, secretos, cron, Whapi ni producción en esta etapa. Fuente histórica en GitHub preservada como base inmutable. PR de desarrollo requerido.

Referencias: [PR #736](https://github.com/ProtectorRudo/Cotironda/pull/736) (MVP333), [PR #737](https://github.com/ProtectorRudo/Cotironda/pull/737) (MVP334), [PR #738](https://github.com/ProtectorRudo/Cotironda/pull/738) (publicación v72 / SQL gate), [Acta 467](467-mvp333-v72-mvp306-gate-publicacion-piloto.md).
