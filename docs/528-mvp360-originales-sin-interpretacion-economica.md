# Acta 528 — MVP360: descarga segura de originales independiente del parser económico

**Fecha:** 12/11/2026. **Autorización:** «Avanza y registra». **Estado:** PR [#802](https://github.com/ProtectorRudo/Cotironda/pull/802) en DESARROLLO, apilado sobre [#801](https://github.com/ProtectorRudo/Cotironda/pull/801). Ningún SQL aplicado a Supabase; no Edge/WhatsApp/Vercel publicado.

## Bloqueo comprobado en el código REAL

La función desplegada `public.cotironda_piloto_originals_private_mvp192` solo construía el catálogo desde `supplier_media_quotes_mvp098` y `supplier_evidence_mvp138`, con `verifier_version=9,state=verified,reason=covered`. Si el proveedor envía un original archivado pero no existe presupuesto procesado/validado V9, el comprador no puede descargarlo tras el cierre. Se aparta del objetivo comercial P0: *entregar el original auténtico sin que la IA de precios sea el bloqueo*.

### Cambio técnico MVP360

Se conserva el cuerpo original de `cotironda_piloto_originals_private_mvp192` y solo se reemplaza el origen de los registros del catálogo:

- Archivo inmutable `media_archive_mvp095` con `state=stored`, `storage_path` derivada del hash del mensaje, SHA de contenido, MIME/tamaño permitidos y archivo recibido por WhatsApp dentro de plazo.
- **Evidencia triple** como en MVP355: mismo `message_hmac`, proveedor, `request_id`, tipo, chat y SHA entre archivo, `whapi_inbox` y `ai_supplier_links_mvp225`. Métodos seguros: `quoted_whapi_id`, `single_active_round` y `prior_supplier_preamble`; NO se acepta asociación solamente semántica `semantic_unique_mvp291` ni un `request_id` provisional por coincidencia temporal.
- Proveedor efectivamente invitado y despacho `ai_dispatch_jobs_mvp222` `api_accepted` antes del mensaje; descartar conflictos no resueltos, ventanas simultáneas de otra ronda IA/Whapi legacy, reemplazos, correcciones posteriores y ofertas superadas.
- **Privacidad estricta:** la verificación de `auth.users` + `auth.sessions` + mismo teléfono del comprador + empresa/WhatsApp original permanece INALTERADA. También permanece la regla prospectiva `original_share_policy_mvp178` (activación previa a la ronda), consentimiento específico de cada proveedor `original_share_consents_mvp178` (mensaje probado, aceptado antes de la invitación, revocable), cierre real y UUID opaco del archivo. El catálogo es SERVER-ONLY; el HTTP sigue con Auth, no-cache, recomputación del SHA binario y registro `original_download_audit_mvp201`.
- No se exhiben contactos u originales durante la ronda; no hay URL pública ni `signedUrl`. Mostrar originales de no ganadores solo bajo condiciones aprobadas explícitas. No alterar rondas previas sin la política.
- **Alcance deliberado:** solamente documentos/imágenes de Whapi (PDF, XLSX, DOCX, imagen, etc.), no inventar una descarga de texto libre si el texto no tiene almacenamiento inmutable verificable propio.

La corrección no modifica parser, ranking, sus precios, comparadores ni el flujo WhatsApp. No modifica el endpoint de tracking anónimo.

## Comprobaciones reales de Supabase, SELECT únicamente

- `public.cotironda_piloto_originals_private_mvp192` actualmente usa tablas de presupuestos + V9 como entrada, verificado con `pg_get_functiondef`.
- La función pública `originals_private_mvp192` no permite EXECUTE a `anon` ni `authenticated`, solamente `service_role`; el endpoint HTTP mantiene ese contrato.
- Al consultar el piloto: **0 usuarios Auth, 0 consentimientos de originales vigentes, política `enabled=0`, 0 enlaces documentales con método fuerte, 1 enlace solamente `semantic_unique_mvp291`, 1 ronda preparada vigente**. Aunque se instalara el código nuevo, hoy NO correspondería entregar ningún original: no hay identidad, permisos ni vinculación fuerte.
- Sigue abierta la prueba del esquema `net` del Data API externo (MVP359). El preflight SQL 4/4 de despacho fue aprobado; no aplicar cron sin confirmación REST.

## Criterios de aceptación

- [ ] PostgreSQL17 con **SIN crear siquiera `supplier_evidence_mvp138` o `supplier_media_quotes_mvp098`**, pero con PDF realista archivado e inbox+proof fuerte: catálogo y documento autorizados. Todo dentro de transacción BEGIN/ROLLBACK, sin red.
- [ ] Restringe sin concesiones: usuario o sesión equivocados, ronda `prepared`, consentimiento revocado, hash adulterado, método semántico ambiguo, ronda IA solapada, archivo reemplazado. Ninguno abre descarga.
- [ ] Preservar `service_role` exclusivamente y comprobar que HTTP proyecta solamente los campos permitidos; no devolver el objeto privado `autorizacion` completo al cliente.
- [ ] Suite Node/Next/PostgREST/PG17 sin regresiones, y revisar CI del SHA final en PR #802.
- [ ] Antes de publicar: revalidar fuente SQL desplegada, política comercial y consentimiento prospectivo, identidad Auth del comprador y SMS OTP realmente configurados. Cero acceso retrospectivo a rondas viejas.
- [ ] Luego de `Publicalo en cotironda-piloto`: probar 1 arquitecto+2 proveedores y dos originales fieles por navegador tras cierre; verificar descarga y auditoría sin datos de otros compradores.

**No se declara P0, P1, P2, P3, P4 ni P5 terminado.** Una prueba sintética PG17 no certifica dos archivos reales ni entrega económica. Los originales no deben mostrarse por el token de seguimiento público.

## Relevo y siguiente paso

Fuente única [Issue #794](https://github.com/ProtectorRudo/Cotironda/issues/794), [plan maestro y estado PR #796](https://github.com/ProtectorRudo/Cotironda/pull/796), código [PR #802](https://github.com/ProtectorRudo/Cotironda/pull/802).

**Próximo paso operativo único:** tras la CI de #802, preparar un plan de publicación reversible y un ensayo controlado de comprador Auth + dos respuestas WhatsApp correlacionadas. No crear nueva ronda mientras exista una `prepared` vigente; no activar originales sin consentimientos ni el circuito REST de seguridad.
