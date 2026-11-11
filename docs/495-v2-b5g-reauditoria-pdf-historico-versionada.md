# Acta 495 — B5g: reauditoría privada de los PDF históricos, sin segunda IA

**Fecha:** 11/11/2026. **Autorización:** «Luz verde» para desarrollar y probar, no desplegar. **PR:** [#771](https://github.com/ProtectorRudo/Cotironda/pull/771) (sobre #770). Entorno destino eventual: **solo** `cotironda-piloto`.

## Problema real

B5d (publicado en piloto el 11/11) consumió correctamente dos PDF históricos y guardó 7 líneas (5 materiales, 2 notas) en `v2_source_review_b5d`. La versión B5d tiene procesamiento único `(source_hmac,processor_version)`, por lo que **no debe** reabrirse ni borrarse su ledger para incorporar B5f. Los totales y descuentos anteriores quedaron pendientes; la mejora B5f requiere volver a leer **los mismos bytes originales** y cotejarlos con un algoritmo más estricto sin pedir archivos ni otra transcripción de IA.

## Solución y seguridad

- La migración de **desarrollo** `supabase/piloto/v2_b5g_pdf_private_reaudit_versioned.sql` crea la tabla privada `v2_pdf_reaudits_b5g` vinculada por clave foránea compuesta al registro histórico exacto B5d; nueva versión `v2_b5g_20261111`, un solo claim por fuente/versión, sin alterar B5d, B2, ofertas ni sus originales.
- RLS activado y `PUBLIC/anon/authenticated` sin lectura ni ejecución de RPCs. Las funciones públicas `cotironda_piloto_claim_v2_pdf_b5g()` y `cotironda_piloto_finish_v2_pdf_b5g()` tienen `GRANT EXECUTE` **exclusivo** a `service_role`. Se repite el guard privado `v2_shadow_settings.enabled`, permisos del emisor no revocados, mismo SHA, mismo archivo, ventana y límite de dos por hora. Una fuente `linked_quote` **NO** entra en esta cola histórica.
- `reauditarPdfHistoricoB5g` lee el PDF del Storage privado, verifica tamaño y SHA de nuevo, usa **el candidato histórico existente** y aplica B5f con evidencia PDF.js y aritmética `BigInt`. **No recibe clave OpenAI** ni llama a modelos, no modifica listas de ítems ni imprime documentos. Resultado `sourceVerified=false`, `canRank=false`, `canRevealContacts=false`, `publishedOffers=0`, `outboundMessages=0` sin excepciones. Se guardan únicamente diagnósticos privados por línea.
- El handler Edge interno existente, protegido por **dos factores y rechazo a POST con cuerpo**, usa orden B2 → B5g → B5d. B5g se ejecuta si B2 no tiene pendientes; consume un original por tick, luego vuelve a B5d cuando se agota. No agrega cron, webhook ni enlace público. Un error desconocido falla cerrado.
- La geometría B5f está **AISLADA en la Edge V2** (`pdf-geometry-b5f.ts`) para no alterar el lector compartido del webhook ni su huella fija MVP332/MVP336. El código original `supplier-source-pdf-general.ts` fue restaurado literalmente (Git blob `d61f64e8b193b3e429e681bb9acd757efed48c45`). No hay cambios en WhatsApp.

## Pruebas

El ensayo Node del worker y Edge valida: PDF correcto, correspondencia de total único y descuento posicional, falta de total, fuente SHA cambiada, error de parser sin filtrar PII, claim inválido, flag OFF, respuesta duplicada, aislamiento B2/B5d y ausencia total de mensajes/publicación. PostgreSQL 17 en transacción con `ROLLBACK` prueba RLS, roles, duplicados, SHA, revocación, asociación `linked_quote` excluida, finalización y ledger anterior intacto. Deno verifica la Edge completa con dependencias de versión fija. CI específico inicial del PR #771: **53/53 pruebas Node, PG17 y Deno aprobados**. La batería general y el build deben verificarse con el commit final antes de declarar el cierre.

## Pendientes — no declarar piloto E2E

1. Confirmar en la rama y PR definitiva que todas las pruebas generales pasaron, y que el archivo compartido de WhatsApp sigue exactamente con el hash fijado.
2. Solo con autorización **«Publicalo»**: desplegar la migración y Edge B5g/B5f en `cotironda-piloto` con flag OFF, controlar los permisos, luego habilitar una ventana acotada para dos PDFs y apagar el flag; inspeccionar solo códigos privados. No reiniciar ledgers B5d.
3. Aun con columnas y total coincidentes, falta **certificar cobertura completa de todas las cifras/páginas, cargos, IVA, flete y equivalencias** antes de trasladar una candidata al ranking o a la vista del arquitecto.
4. Recuperar los 4 archivos vinculados (3 PDF y 1 XLSX) desde B5d y acreditar celdas XLSX; integrar los hechos fuente al comparador B6 y al seguimiento B7, cerrar el recorrido real de WhatsApp.

**Conclusión:** la relectura versionada puede comprobar mejor los PDF históricos sin contratar nuevos modelos ni involucrar a los proveedores, pero no da permiso para publicar precios ni adjudicaciones.
