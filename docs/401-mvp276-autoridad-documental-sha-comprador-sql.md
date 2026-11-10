# Decisión 401 — MVP276: autoridad SQL para comprador documental TXT/CSV

**Fecha:** 06/11/2026. Autorización «Luz verde»: implementar y probar en GitHub, **sin publicar** en `cotironda-piloto`, sin WhatsApp real ni gastos.

## Problema exacto

MVP275 verifica bytes originales TXT/CSV y construye una previsualización privada de IA Central. Sin embargo, cuatro funciones críticas de PostgreSQL **solo autorizaban `whapi_inbox.kind='text'`**: `ia_reserve_buyer_mvp226`, `ia_shadow_prepare_mvp221`, `ia_publish_mvp222` y `ia_ready_for_chat_mvp223`. No es aceptable cambiar el tipo de un mensaje documental, ni su SHA, ni falsificar texto extraído para pasar la autorización.

## Solución propuesta (sin activar)

`mvp276_comprador_archivo_txt_csv_autoridad_sha.sql` incorpora una función privada de autorización `fuente_original_documental_mvp276` y extiende **solo el predicado de la fuente** en los cuatro RPC existentes, conservando literalmente el resto del SQL y sus permisos, catálogo, zonas, capacidad, deduplicación e idempotencia.

El predicado documental comprueba nuevamente en PostgreSQL:

- mensaje original Whapi bajo el HMAC de chat/comprador, `kind='document'` y `processing_state='needs_review'`;
- empresa compradora existente y consentida, no revocada;
- `media_archive_mvp095` del mismo mensaje, chat, participante, `kind='document'`, estado `stored`, `finished_at` acreditado, ruta Storage interna fija y 10–4.096 bytes;
- MIME estrictamente `text/plain` o `text/csv`; PDF, imagen, DOCX/XLSX, DOC/XLS permanecen en revisión;
- SHA-256 del **binario original** guardado en el archivo, igual al SHA informado por el servidor y, antes de preparar/publicar/despachar, al SHA-256 del `p_original_text` literal. Si falla cualquiera, se deniega.

Las cuatro RPC originales mantienen intacta su rama de autorización para mensajes de texto. Sin nuevos permisos para `anon` o `authenticated`, sin transferir control del envío a la IA, sin eliminar límites o cuotas y sin activar filas de control. El helper privado solo puede ser ejecutado por `service_role`.

La restauración segura `mvp276_rollback_original_text_gates_MANUAL.sql` devuelve los cuatro RPC exactamente al contrato texto anterior y elimina el helper **solo con las puertas IA Central/despacho apagadas y sin rondas documentales abiertas**. No debe ejecutarse automáticamente.

## Verificación

1. Prueba de compatibilidad en **la base real `cotironda-piloto`** con `BEGIN`, `SET LOCAL lock_timeout`, `SET LOCAL statement_timeout`, las cuatro funciones extendidas, check de ACL contra roles públicos y `ROLLBACK`. Confirmado al final: helper **no persistido**, `central_off=true`, `dispatch_off=true`; sin WhatsApps ni rondas reales.
2. Archivo de regresión sintético PostgreSQL 17 `mvp276-buyer-media-sha-pg17.sql`: parte de la suite funcional de MVP226, conserva el flujo anterior y agrega comprador con archivo TXT genuinamente representado por bytes SHA, invitación y trabajos ficticios.
3. Casos negativos: hash o identidad incorrecta, archivo manipulado después de reservar y antes de publicar, MIME PDF no autorizado, revocación de consentimiento, prevención de duplicados y RPC públicas sin privilegios.
4. La integración de Edge `ai-central-buyer-media-mvp276.ts` utiliza la previsualización MVP275 como **filtro de bytes y semántica**, captura una sola vez el plan validado y lo entrega al broker transaccional `procesarCompradorCentralMvp226`; nunca vuelve a llamar al modelo para planificar ese mismo documento. El broker SQL comprueba el original nuevamente. Se agregan pruebas unitarias con errores, suplantación de HMAC y publicación condicionada.
5. **Dos banderas nuevas OFF por defecto**: `COTIRONDA_PILOT_BUYER_DOCUMENT_CENTRAL_ACTIVE_ENABLED` permite preparar una ronda desde fuente TXT/CSV realmente archivada; `COTIRONDA_PILOT_BUYER_DOCUMENT_CENTRAL_PUBLISH_ENABLED` autoriza intentar publicación y envío SOLO en conjunción con `trial.dispatch`, `sec.outbound` y las cuatro RPC de SQL. Con el modo activo no se ejecuta la preparación documental heredada en paralelo; con ambas banderas OFF se conserva el flujo anterior.

## Qué falta y qué NO se puede anunciar

La migración de SQL **no está instalada en el piloto**. El webhook publicado v54 está atrasado respecto de la rama de desarrollo; al actualizarlo será necesario revisar e instalar primero las migraciones anteriores pendientes, con un procedimiento autorizado de publicación. El respaldo pago sigue en plan B.

La conexión TXT/CSV al broker de IA Central está implementada y protegida por dos banderas OFF, pero **no instalada ni activada**. Quedan corroboración independiente de PDF/Excel/Word/imágenes del comprador, prueba E2E con ambos proveedores, reglas para aclaración de zona documental y verificación de costos y originalización antes de un piloto comercial. No anunciar Cotironda multiarchivo sin límites ni piloto comercial listo.

**Estado:** código en desarrollo; compatibilidad de estructura probada de forma reversible; ninguna publicación, ningún envío, ninguna compra, ningún E2E real.
