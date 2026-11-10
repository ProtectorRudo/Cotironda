# Decisión 400 — MVP275: puente documental del comprador hacia IA Central, solo lectura

**Fecha:** 06/11/2026. Autorización «Luz verde»: código + pruebas en desarrollo. **No** publicar ni encender banderas de Edge/Supabase, no mandar WhatsApps, no contratar infraestructura.

## Motivo verificado

La ruta actual `cotironda-piloto-whapi/index.ts` procesa textos del comprador mediante `procesarCompradorCentralMvp226`, pero un PDF/Excel/imagen/TXT entra por `plan_document_mvp098`, `record_agreement_mvp099` y `prepare_document_mvp099` (camino legado), **no por el broker de IA Central**. El SQL real de IA Central para compradores es exclusivamente de texto: `cotironda_piloto_ia_reserve_buyer_mvp226` exige `whapi_inbox.kind='text'` y `plaintext_sha256`, mientras que `cotironda_piloto_ia_shadow_prepare_mvp221` confirma el SHA del texto original archivado.

**Queda prohibido:** insertar un texto generado por IA como si fuese el contenido original de un PDF, alterar `kind` en PostgreSQL para pasar la validación, modificar una huella o reutilizar la reserva de texto para un archivo. El binario debe permanecer original y la autorización económica del documento debe ser una RPC separada.

## Primera entrega funcional (sin cambiar datos reales)

`ai-central-buyer-document-mvp275.ts` verifica **el SHA-256 de los bytes originales** de TXT/CSV descargados, el MIME, UTF-8 estricto, longitud acotada, ausencia de caracteres de control, y dos lecturas documentales independientes concordantes. Para cada renglón, comprueba que descripción, cantidad y unidad sean literales del **mismo renglón físico** de la fuente, en orden y sin usar la ubicación inventable del modelo como prueba. No completa una unidad ausente, no usa fragmentos de otro archivo, no convierte 2 en 20 y no admite pedidos documentales con más de 25 líneas verificables en esta ruta.

La fuente enviada al planificador es **exactamente el texto original de los bytes archivados**, no un texto reformulado por el modelo. Si la localidad no aparece literalmente, propone solicitarla; no la atribuye a la obra. Con dos lecturas contradictorias, hash inválido, archivo modificado, formato ilegible o falta de zona, **se abstiene**.

Tras esa comprobación, la función puede llamar al planificador IA Central y leer catálogos **solo mediante la RPC `cotironda_piloto_ia_catalogo_mvp220`**; rechaza por código cualquier RPC de escritura, adjudicación, despacho o publicación. El resultado **NO expone** texto, montos, nombres, rutas, proveedores, originales ni decisiones a la interfaz. Siempre devuelve `rondaCreada:false`, `whatsappEnviado:false`, `autorizacionPublicacion:false`.

La integración de Edge es **opt-in** mediante la bandera nueva `COTIRONDA_PILOT_BUYER_DOCUMENT_CENTRAL_PREVIEW_ENABLED=true`, que permanece OFF hasta una activación posterior, con el comprador autenticado y el gate de IA Central habilitado. La reserva documental preexistente sigue aplicando las cuotas de IA. Cuando se habilite la previsualización, el tramo de comprador **no** ejecutará la antigua preparación/las invitaciones en paralelo. Sin la bandera se conserva el flujo actual. La previsualización no activa seguimiento, mensajes ni cron; tampoco instala una función SQL nueva.

## Límites expresos

- **Solo TXT y CSV UTF-8** disponen hoy de una lectura independiente de contenido textual suficientemente estricta para esta prueba. PDF, Excel, Word e imágenes todavía quedan **en revisión, no enviados** en el camino nuevo. Nunca confundir dos lecturas de IA idénticas con una prueba del texto o celda de origen.
- Esto demuestra que un documento original puede alimentar al motor semántico **en una previsualización privada**, pero no implica que un documento pueda crear una ronda real. Faltan la RPC transaccional de autoría documental y su prueba PostgreSQL17 con Storage, el detector independiente para PDF/Excel/imagen y el circuito de envío bajo consentimiento.
- Los límites actuales de 25 renglones por lectura documental no permiten anunciar «archivos sin límite». Deben abordarse mediante paginación/lotes de origen verificados, no ignorando líneas.
- Costos: **ninguna llamada extra a IA por defecto** porque la nueva bandera está apagada. Al activarla en una prueba autorizada, se deben controlar llamadas y costos; la previsualización nunca elimina cuotas ni presupuestos.
- No hay respaldo recuperable de `cotironda-piloto`. La decisión del propietario es mantener infraestructura adicional paga en **plan B**; esto no anula el riesgo de pérdida de datos ni habilita un piloto comercial abierto.
- Divergencia real: Edge Whapi publicado v54 aún no incluye el procesamiento comercial documental MVP245 y el revisor de imágenes MVP251 de la rama; la función `ia_reserve_media_mvp245` no está instalada. No se debe desplegar este bloque de forma aislada suponiendo que la base está al día. Preflight previo con `BEGIN/ROLLBACK` verificó compatibilidad de MVP245, MVP248, MVP250 y MVP274, pero **ninguna fue instalada**.

## Pruebas/criterios de aceptación

1. TXT/CSV de obra gruesa y electricidad con fuente original SHA verificada, dos lecturas y planificación privada exitosa.
2. Negativa ante hash inválido, UTF-8 dañado, tamaño, PDF/Excel/foto sin lector independiente, cantidad 2 vs 20, unidad que aparece solo dentro de palabra técnica, localidad ausente, contradicción entre lecturas.
3. Verificar que el planificador no pueda llamar RPC alguna salvo lectura de catálogo, aun si una dependencia intenta escribir; no se generan solicitudes, PDFs, mensajes, contactos ni seguimiento.
4. Prueba de integración por inspección de rama: previsualización con bandera opt-in, bloque mutuamente excluyente respecto a `prepare_document_mvp099`.
5. Controles GitHub específicos y generales sin regresión. Integración solo a la rama de desarrollo.

**Siguiente paso tras esta entrega:** preparar en una PR separada la autorización documental de medios con verificación binaria real y transacción SQL que preserve HMAC de WhatsApp, contenido SHA original, consentimiento, unicidad, rubros y deduplicación; probar con PG17 y archivos sintéticos. Solo luego conectar PDFs/Excel a creación de rondas, y después hacer un E2E controlado con los tres participantes.

Estado: implementación de solo lectura; **no E2E, no respaldo, no publicación, no envío real.**
