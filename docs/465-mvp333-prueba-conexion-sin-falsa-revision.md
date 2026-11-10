# Decisión 465 — MVP333: prueba de conexión sin falsa revisión de IA

**Fecha:** 09/11/2026 ART. **Orden:** «Luz verde». **Entorno:** desarrollo exclusivamente, sin desplegar al piloto, sin activar gates y sin Whapi/IA reales. Incidente relacionado: Issue #733. Publicación anterior: Acta 464.

## Evidencia real, sin inferencias

El comprador autenticado envió el 09/11/2026 a las 20:50 ART el texto exacto de diagnóstico: «Hola Cotironda, prueba de conexión del piloto.». Su SHA-256 coincide con el texto y el evento fue archivado en el inbox privado con rol arquitecto, estado needs_review y sin request_id. El inbox pasó de 30 a 31; la Edge v71 recibió POST nuevos desde Whapi.

El webhook, canal, evento messages.post y cuenta Sandbox ya estaban configurados. No fue un fallo de entrega.

**Hallazgo nuevo:** para esa fuente hay una fila en ai_central_attempts_mvp226, estado review, motivo semantic_review_required; y otra en ai_buyer_review_notice_mvp286, estado api_accepted. Por tanto la IA trató una prueba como pedido inválido y aceptó enviar una notificación falsa. No crear ronda ni enviar PDF, pero sí aviso. La ausencia de nuevas filas en whapi_outbox no demostraba ausencia de avisos, pues hay registros independientes.

La revisión SQL confirma comprador con trial.state=active, buyer=true, dispatch=true, review send/confirm/release=true. El freno nuevo de auto-liberación sigue en las puertas MVP306, MVP314 y MVP315, todas OFF; y el interruptor Edge COTIRONDA_PILOT_BUYER_AUTO_RELEASE_MVP306_ENABLED requiere true. Valor secreto no legible desde el conector. Sin cambios en gates por esta tarea.

## Cambio propuesto y protegido

El manifiesto MVP332 es archivo inmutable (61 fuentes y SHA256). No se modifica el index.ts histórico de v71. El script scripts/piloto/mvp333-connection-check-candidate.mjs compara su fuente con el hash del manifiesto y construye EN MEMORIA el candidato de un solo archivo para un futuro v72, sin publicar.

- Solo reconoce como test la frase completa «Hola Cotironda, prueba de conexión del piloto.» con tolerancia a mayúsculas, tildes y espacios. Cualquier material anexado invalida el atajo.
- Se aplica exclusivamente al comprador autenticado que ya participa en IA Central; jamás a un proveedor.
- Mantiene almacenamiento cifrado, fuente firmada, deduplicación y binding del número. Después de registrar el evento ignora la clasificación del modelo, el aviso erróneo y cualquier publicación de ronda para ese mensaje.
- Los saludos generales y los pedidos en lenguaje libre, incluidos materiales, cantidades, marcas, variantes y zona, siguen el flujo normal. No limita vocabulario.
- No lee ni escribe secretos, no manda Whapi, no toca SQL real, no cambia producción ni Vercel.

## Pruebas

tests/unit/mvp333-pilot-connectivity.test.mjs verifica frase de prueba y falsos positivos, rol del comprador, hash original, importaciones preservadas, almacenamiento anterior al guard, salida sin código ni secretos y rechazo de fuentes/manifiestos alterados.

El workflow cotironda-mvp333-pilot-connectivity.yml debe comprobar además regresiones MVP332/MVP306/MVP313/MVP314/MVP315 y tipado Deno del candidato generado temporalmente. No ejecutar sin aprobación una publicación de código ni envíos.

**Criterios de aceptación:** overlay offline reproducible y tipado; pruebas y workflows verdes; sin cambios de base real. Un posterior «Publicalo» requiere verificar los 61 hashes ACTIVOS de v71 antes del deploy.

## Restante para el circuito 100%

1. Después de publicar el cambio, enviar UNA nueva prueba de conexión y verificar que quede en inbox sin nueva tentativa IA, aviso o ronda.
2. No pedir nuevas configuraciones Whapi ni permisos por ronda: recepción probada y canales vinculados.
3. El responsable manifestó que no rotará el token que apareció legible en captura. Esto no invalida la prueba entrante, pero supone un riesgo para futuras acciones salientes. No exponerse a nuevos destinatarios ni tratar ese token como seguro para producción.
4. Para iniciar ronda real: comprobar capacidad Sandbox y gates, habilitar el circuito prospectivo y verificar pedido, dos PDF, dos cotizaciones, artículos y totales anónimos, cierre de ronda y contactos autorizados. No afirmar 100% antes de E2E.
5. Mantener inalterados producción, Vercel, rondas anteriores y adjudicación manual; evitar paso CONFIRMAR COTI.

**Estado:** solo desarrollo. MVP333 no está desplegado.
