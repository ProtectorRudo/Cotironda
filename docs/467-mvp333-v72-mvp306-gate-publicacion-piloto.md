# Acta 467 — MVP333 publicado en v72 y liberación automática MVP306 activada en piloto

**Fecha de publicación y verificaciones:** 09/11/2026 ART. **Autorización:** «Publicalo», luego de «Luz verde» de MVP333 y MVP334. **Alcance exclusivo:** Supabase `cotironda-piloto`, ref `ilggkalaafhtiysyzlmg`, sin tocar producción, Vercel ni la cuenta gratuita de Whapi.

## Código publicado

- Punto de partida: Edge `cotironda-piloto-whapi` **v71**, ACTIVE, `verify_jwt=false`, 61 archivos. Se comprobó contra el manifiesto aprobado de MVP332 la huella SHA-256 de las **61 fuentes** antes del despliegue, sin drift.
- Candidato MVP333: generado por `scripts/piloto/mvp333-connection-check-candidate.mjs`, PR #736 integrado, **13 tests nuevos + 9 MVP332 + 37 regresiones = 59/59**, Deno check aprobado; GitHub confirmó exactamente la huella del fichero `index.ts` candidato: `91481dfd1ec51843346d233dfe654e8f3ce0ef699364424b625fe68d05f24f95`. Corresponde a la **última versión**, incluyendo la protección del lote formado exclusivamente por pruebas de conexión; no la huella anterior `60cce...`.
- Se publicó exclusivamente Edge `cotironda-piloto-whapi` **v72 ACTIVE**, 61 archivos, `verify_jwt=false`, sin cambiar Edge seguimiento v27 ni worker diferido v1, autenticaciones ni secretos.
- **Postcheck SHA-256: 61/61 fuentes verificadas**, el `index.ts` de v72 coincide con el candidato final anterior; el resto permanece idéntico al paquete v71. Un chequeo SHA intermedio usó accidentalmente una implementación local incorrecta y notificó falsos desajustes en 61 archivos; se corrigió y se repitió con el verificador que pasa el vector conocido `sha256("abc")` y los hashes congelados. Resultado final: **0 mismatches**.
- No se emitió ningún WhatsApp ni se abrió una ronda durante este despliegue; las 5 rondas anteriores y 31 entradas de inbox se conservaron.

## Control operativo habilitado

La RPC `cotironda_piloto_ia_auto_release_mvp306` fue inspeccionada **antes** de la habilitación. Solo autoriza rondas con `requests.created_at >= ai_auto_release_gate_mvp306.activated_at`, un comprador autenticado y vigente, pedido íntegro y rubros/destinatarios verificados, sin revisión anterior, sin datos personales incrustados y con proveedores contactables. No hace retroactividad sobre rondas antiguas.

La habilitación se ejecutó en **una transacción administrativa SQL** bajo sesión `postgres` con bloqueo de concurrencia, condiciones de 1 comprador + 2 proveedores activos, 3 canales vinculados, 3 permisos previos registrados, catálogos para ambos, IA Central y despacho heredado activos, cero trabajos inciertos, recepción de arquitecto menor a 24 h y MVP314/MVP315 apagados. **MVP306 quedó enabled=true, activated_at=2026-11-10 00:55:45.315899+00 (09/11 21:55:45 ART)**.

Postcheck SQL posterior: MVP306 true, MVP314 false, MVP315 false, 31 inbox, 5 rondas, 0 autoaprobaciones anteriores, 0 jobs pendientes o inciertos, 0 outbox inciertos, 3 autorizaciones previas declaradas por el propietario (1 comprador y 2 proveedores) registradas y Ailín/Nahuel contactables. No se alteraron permisos ni se crearon rondas.

## Lo que NO está verificado

La Edge exige además el secreto booleano de entorno `COTIRONDA_PILOT_BUYER_AUTO_RELEASE_MVP306_ENABLED` **igual a `true`**. Los conectores actuales no exponen los valores de secretos de Supabase, por lo cual el switch de runtime no se verificó y no se puede afirmar que la próxima cotización se publique sin revisión. No se creó un endpoint para revelar secretos ni se eliminó el kill switch. La cuenta Whapi Sandbox recibió un inbound real previo (09/11 20:50 ART), pero aún no hay una nueva petición real con v72 que confirme su funcionamiento.

El token de Whapi apareció legible en una captura anterior y el propietario decidió expresamente no rotarlo para esta fase: riesgo reconocido, sin exponerlo ni utilizarlo fuera del piloto. La mera aceptación de mensajes por API no demostraría entrega final. El inventario de catálogos (106 renglones: 86 curados, 20 pendientes, sin stock ni precios confirmados) habilita **evaluar** el ruteo, no promete que ambos proveedores serán pertinentes para cualquier artículo.

No se comprobó aún una ronda real desde v72 que incluya interpretación del pedido, hasta dos PDF enviados, respuestas en cualquier formato, partidas y totales preliminares anónimos, original descargable, plazo de cierre y contactos comerciales del cierre. **No declarar «100%» hasta ese recorrido**.

## Próxima prueba única y diagnóstico

Desde el WhatsApp **ya vinculado del arquitecto** enviar un pedido nuevo completo, no el antiguo comando CONFIRMAR ni el diagnóstico: «Hola Cotironda, necesito 20 bolsas de cemento CPC de 50 kg, 3 bolsones de arena y 2 bolsones de piedra. Entrega en La Plata.»; los rubros y proveedores se resuelven por catálogo y zona. Verificar nuevo `whapi_inbox`, fuente de IA, `ai_buyer_auto_release_mvp306`, `requests`, `ai_dispatch_jobs_mvp222`, aceptación de Whapi, `buyer_tracking` y el enlace recibido, en ese orden. Si el secreto Edge de auto-release no está habilitado, el flujo podría permanecer en revisión heredada: registrar exactamente ese diagnóstico y configurar solo el secreto necesario a través de un canal protegido, no reconstruir Whapi.

**Ante errores:** si no se publicó una ronda nueva, es seguro revisar el corte de nuevas solicitudes por el gate de prueba del comprador. Si ya hay ronda publicada, **no desactivar ciegamente MVP306** porque las funciones de continuidad pueden consultar su estado; mantener las respuestas de proveedores ya invitados, conciliar cualquier envío `uncertain` sin reenvíos. Prohibido abrir el worker MVP314/aviso MVP315 sin necesidad o tocar producción por este incidente.

Referencias: [PR #736](https://github.com/ProtectorRudo/Cotironda/pull/736), [PR #737](https://github.com/ProtectorRudo/Cotironda/pull/737), [Issue #733](https://github.com/ProtectorRudo/Cotironda/issues/733), [Acta 464](464-mvp332-publicacion-piloto-whapi-v71.md), [Decisión 465](465-mvp333-prueba-conexion-sin-falsa-revision.md), [Decisión 466](466-mvp334-preflight-dos-proveedores.md).
