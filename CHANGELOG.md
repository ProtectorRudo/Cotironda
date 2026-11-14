## 2026-11-13 — D016 P0: «NO COMPARTIR» global en Supabase PILOTO

**Migración real y verificada `20261114015943`** `cotironda_d016_global_original_optout_off_pilot_20261113`. La RPC privada de baja por SHA del texto de WhatsApp ahora revoca `v2_supplier_original_consents.revoked_at` **aunque el proveedor no tenga ninguna ronda**, además de invalidar los avisos anteriores; registra evento global privado/RLS y bloquea consentimientos retroactivos mediante trigger. No da de baja al proveedor ni modifica cotizaciones. 7 rondas/1 preparada preservadas, 0 consentimientos/avisos/respuestas/revocaciones/eventos reales, flags negocio/originales/cierre OFF, anon/auth sin acceso y llamada NULL sin efecto. [CI D016 43543664303](https://github.com/ProtectorRudo/Cotironda/actions/runs/43543664303) PG17 sintético con y sin ronda + replay + consentimientos posteriores + ROLLBACK: SUCCESS. [PR #845](https://github.com/ProtectorRudo/Cotironda/pull/845) DRAFT, sin merge, no despliegue Whapi/Next/producción. [Acta pospublicación](docs/PILOTO-D016-BAJA-GLOBAL-PUBLICADO-20261113.md).

## 2026-11-13 — D016 P0: originales con consentimiento previo Y evidencia WhatsApp (SQL PILOTO, OFF)

**Migración real `20261113232051`** `cotironda_d016_portal_original_evidence_download_guard_off_pilot_20261113` aplicada y verificada en `cotironda-piloto`. `responders_private` y `original_source_private` ahora requieren el consentimiento V2 preexistente MÁS un aviso y respuesta D016 verificables del mismo mensaje/proveedor/ronda/SHA, sin `NO COMPARTIR`; las auditorías de descarga y los análisis se bloquean vía `original_source_private`. **Postrelease:** siete rondas intactas, 1 preparada, 0 consentimientos registrados de originales, 0 avisos/evidencias/revocaciones, 0 sesiones, negocio/originales/cierre OFF, 2/2 RPC con guard, anon/auth negados. Fixture sintético PG17 comprobó PDF, texto, consentimiento revocado, hash falso, solo aviso, baja, ACL y ROLLBACK. [PR #844](https://github.com/ProtectorRudo/Cotironda/pull/844) DRAFT sin merge ni despliegue Whapi/portal; [acta real](docs/PILOTO-D016-ORIGINALES-PRUEBA-DOBLE-PUBLICADO-20261113.md). No se inventan consentimientos: la prueba positiva es exclusivamente sintética y faltan fundamento legal y E2E con WhatsApp real.

## 2026-11-13 — D016 P0: sesiones por WhatsApp solo para rondas V2, publicado en PILOTO (flags OFF)

Supabase `cotironda-piloto` migración real `20261113230828` `cotironda_d016_portal_buyer_session_prospective_only_pilot_20261113` aplicada y posverificada. Cinco RPC de ticket, canje, sesión y preparación de WhatsApp exigen negocio V2 activo y `requests.created_at>=activated_at`; apaga inmediatamente sesiones al deshabilitar la política sin dar acceso a rondas antiguas. Postrelease: **7 rondas preservadas, 1 preparada, 0 tickets y sesiones, 3 políticas V2 OFF, 5/5 RPC de servicio protegidas y 0 permisos de ejecución públicos**. Pruebas negativas reales denegadas; CI de canje privado y PostgreSQL 17 con rollback aprobada. [PR #843](https://github.com/ProtectorRudo/Cotironda/pull/843) DRAFT, sin merge; [acta verificada](docs/PILOTO-D016-SESION-PROSPECTIVA-PUBLICADO-20261113.md). **No** se habilitaron mensajes, downloads, Whapi, Vercel ni producción. Pendiente configuración de dos credenciales privadas del Preview y E2E real.

## 2026-11-13 — D016 P0: corroboración de cotizaciones MVP291 publicada SOLO en piloto (flags OFF)

Migración Supabase `20261113225548` `cotironda_d016_semantic_mvp291_proof_off_pilot_20261113` aplicada y verificada en `cotironda-piloto`: guard privado que corrobora en seis fuentes la resolución por doble lectura de IA de una ronda inicialmente ambigua, sin cambiar el documento original ni conceder consentimiento. Permite evidencia de procedencia `semantic_unique_mvp291` sólo con selección final, hash y fechas coherentes, aviso prospectivo y política de originales válida; no concede descarga. 7 rondas preservadas, 1 preparada; flags negocio/originales/cierre OFF; avisos/respuestas D016 nuevos 0, 0; asociación histórica única **1/1 corroborada** sin publicar originales. Fixture PG17 sintético y rollback SUCCESS [PR #842](https://github.com/ProtectorRudo/Cotironda/pull/842), aún DRAFT; webhook Whapi v76, Vercel y producción intactos. [Acta](docs/PILOTO-D016-SEMANTIC-MVP291-PUBLICADO-20261113.md).

## 2026-11-13 — D016 P0 #838: originales entrantes en Supabase PILOTO (evidencia, flags OFF)

Se aplicó y verificó la migración `20261113202332` `cotironda_d016_original_inbox_evidence_off_pilot_20261113` al proyecto `cotironda-piloto`: dos RPC privadas de `service_role` para correlacionar respuesta Whapi auténtica con único pedido y proveedor y revocar por «NO COMPARTIR» cotejando SHA original. SQL real: 7 rondas preservadas, 0 registros nuevos, políticas negocio/originales/cierre OFF, anon/auth sin permiso y pruebas inválidas denegadas. La salida queda exclusivamente como `verified_reply_not_authorization`: **no concede consentimiento legal ni acceso a presupuesto original**. [Acta](docs/PILOTO-D016-INBOX-ORIGINALES-PUBLICADO-20261113.md). [PR #841](https://github.com/ProtectorRudo/Cotironda/pull/841) DRAFT, sin deploy Whapi. CI Node, Deno (webhook generado sobre v76 inmutable) y PG17 con rollback OK. Faltan integración Edge real, fundamento legal, políticas prospectivas de lectura, sesión de arquitecto, secretos privados y E2E.

## 2026-11-13 — Cotironda D016 P0: lease del aviso de originales PUBLICADO en piloto (comercial OFF)

Supabase `cotironda-piloto` migración verificada `20261113194958`, `cotironda_d016_original_notice_lease_guard_off_pilot_20261113`: reserva de aviso sólo desde lease exacto MVP222 de ronda/proveedor, RPC anterior sin lease revocada a `service_role`; controles reales 7 rondas históricas preservadas, 0 registros, políticas negocio/originales/cierre OFF, acceso público denegado y respuesta con lease nulo denegada. **No** se desplegó Whapi ni portal, no se enviaron WhatsApps ni se habilitaron originales. [Acta](docs/PILOTO-D016-LEASE-GUARD-PUBLICADO-20261113.md). El código separado en [PR #840](https://github.com/ProtectorRudo/Cotironda/pull/840) conserva huella histórica MVP332/Whapi v76, agrega reserva/confirmación en el mismo PDF bajo flag OFF, con Node/PG17/Deno CI; falta observación de respuestas reales, revisión legal y E2E antes de activar.

## 2026-11-13 — Cotironda V2 D016 P0 #838: ledger de aviso publicado SOLO en Supabase PILOTO (flags OFF)

**Migración real `20261113192638` aplicada con éxito** a `cotironda-piloto`: tres tablas privadas RLS para aviso/ack/respuesta/revocación y cinco RPC exclusivas service_role. Guard previo: PG17, siete rondas históricas (una preparada), tres políticas V2 OFF y objetos inexistentes. Control posterior real: 7 rondas intactas, 0 avisos/respuestas/bajas, 3/3 RLS, anon/auth sin acceso, negativos SQL denegados. CI PG17 ROLLBACK y Node OK en [PR #839](https://github.com/ProtectorRudo/Cotironda/pull/839), que permanece DRAFT y sin merge. **No** se integró el envío Whapi, no se activaron políticas, IA, cron ni portal; SQL de evidencia NO equivale a consentimiento legal. La última Preview Vercel sigue en `64b8573`, no contiene la pantalla f985. [Acta con verificación real](docs/PILOTO-D016-ORIGINAL-LEDGER-PUBLICADO-20261113.md). [Plan #794](https://github.com/ProtectorRudo/Cotironda/issues/794), [bloqueo #838](https://github.com/ProtectorRudo/Cotironda/issues/838).

## 2026-11-13 — D016/P0 #838: evidencia de originales en el pedido (SOLO DESARROLLO)

Candidato de aviso dentro del MISMO WhatsApp de solicitud al proveedor y validación preliminar de la respuesta posterior: versión/forma íntegra del aviso, SHA, Whapi api_accepted, tiempos prospectivos, identidad/canal/ronda, cotización genuina, revocación y NO COMPARTIR. 6/6 pruebas locales Node; CI por PR pendiente. **No integrado al webhook/SQL, no habilita originales ni cambia políticas, no deploy ni envío.** Pendientes auditoría legal, registro inmutable y RPC con PG17, integración segura con v76, worker D016 y E2E. [Acta](docs/V2-D016-EVIDENCIA-RESPUESTA-ORIGINALES-20261113.md). [Issue #838](https://github.com/ProtectorRudo/Cotironda/issues/838).

## 2026-11-13 — Cotironda V2 D016: worker IA programado sin pg_net (SOLO DESARROLLO)

**No publicado, sin merge ni cron nuevo.** PR [#837](https://github.com/ProtectorRudo/Cotironda/pull/837) DRAFT (sobre PR #836). Auditoría del piloto identificó y corrigió un falso positivo: los privilegios nativos de `net.http_request_queue` no implican acceso desde las claves públicas a la Data API; la KB oficial de Supabase (2026-11-04) indica además que `REVOKE` como postgres no elimina grants del dueño `supabase_admin` y que cambiar los grants internos puede romper pg_net. **Se retiró la mitigación ACL**; `v2_d016_pgnet_acl_REVIEW_ONLY.sql` ahora aborta sin modificar permisos. No se hicieron cambios en la base.

**Nueva separación operativa:**
- `v2_d016_cron_ACTIVATE_ONLY_AFTER_PUBLICALO.sql` programa **solo cierre SQL** (5 min, dos días hábiles, 18:00 AR, calendario aprobado), sin `net.http_post` ni tokens.
- `.github/workflows/cotironda-d016-worker-piloto.yml` programa el worker IA por HTTPS directo GitHub → Edge (2 veces/hora, un documento/tick), **OFF por defecto**, con 2 secretos privados GitHub y validación estricta del proyecto PILOTO; schedule solo opera desde rama default tras merge. La programación puede retrasarse u omitirse; no prometer SLA. Presupuestar GitHub Actions e IA.
- `v2_d016_preflight_SOLO_LECTURA.sql` se ejecutó en Supabase PILOTO, **10 bloqueos reales**: políticas V2 OFF, calendarios aprobados 0, 1 comprador WhatsApp autenticado, 0 proveedores con consentimiento específico de originales V2 (no equivale a 0 proveedores registrados), RPC D016 no instaladas. No se detectó cron D016 antiguo por pg_net.
- Nuevas pruebas unitarias para cron SQL-only, GHA seguro y ACL incompatible retirada. Tests del PR, PostgreSQL17/Deno/Next se revalidan en el SHA HEAD luego de cada cambio.
- Plan maestro y estado V2 actualizados en rama `docs/cotironda-v2-unica-direccion-20261112`. [Runbook de prepublicación](docs/V2-D016-PREPUBLICACION-PILOTO-20261113.md).
- **Pendiente:** consentimiento prospectivo de originales, calendario oficial local, secretos backend aislados, SSO/Preview, autorización explícita `Publicalo` solo PILOTO y prueba comercial real WhatsApp/arquitecto/proveedores. Sin SMS ni activaciones automáticas.

## 2026-11-12 — V2-08: preflight POST-publicación y barreras Vercel (SOLO DESARROLLO)

PR #829 sobre #828. El primer despliegue parcial al PILOTO había dejado **9 funciones SQL V2 y 4 tablas privadas con política OFF**, más Edge PDF v1; el snapshot anterior de 0 funciones queda reservado como evidencia histórica. Nuevo `v2-readiness-piloto-postrelease-20261112.json` refleja la base real sin PII, **0 Auth, 0 consentimientos V2, Whapi v76 intacto** y no confunde Edge PDF activa con lectura habilitada. Auditoría de la **RPC REAL** de onboarding: 1 comprador Whapi elegible verificado, 0 SHA incorrectos aceptados; sin cuenta Auth creada ni SMS. Vercel proyecto `cotironda-portal-dev` sigue sin Git y con cuota Hobby de despliegues excedida (402). El guard `v2-release-readiness.mjs` agrega `portal_git_correcto` y `vercel_cuota`, pruebas de snapshot antiguo y nuevo y negativos; no publica aunque pasen los tests. [Acta de auditoría](docs/V2-08-AUDITORIA-POSTRELEASE-VERCEL-20261112.md). No cambios en Supabase/Vercel/Whapi ni envío de mensajes en este incremento.

## 2026-11-12 — Cotironda V2-07: bootstrap seguro del primer comprador (SOLO DESARROLLO)

Candidato de alta controlada de la primera cuenta Supabase Auth del arquitecto, sin registro público ni confirmación falsa de número. RPC solo service_role `cotironda_piloto_v2_bootstrap_buyer_check_private` verifica un único comprador real y consentido por canal Whapi original/huella SHA. `src/server/v2-07-primer-comprador-auth.ts` y CLI `apps/portal/scripts/v2-buyer-bootstrap.mjs`: `dry-run` por defecto; `--execute` requiere aprobación explícita de publicación PILOTO, source SHA fija, env Preview y `auth.users=0`. Usuario futuro se crea `phone_confirm:false`, pendiente de verificar SMS OTP real desde portal. Sin teléfonos, IDs ni claves en logs. PG17 fixture sintético con ROLLBACK + pruebas Node de comprador ajeno, contacto duplicado, revocación, cuenta preexistente, entorno incorrecto y falta de autorización. Preflight PR #827 actualizado para bloquear si **el proveedor SMS y OTP aún no fueron probados**. **Ninguna cuenta real creada, no SMS, no deploy, no E2E.** [Documento técnico](docs/V2-07-PRIMER-COMPRADOR-AUTH-20261112.md).

## 2026-11-12 — Cotironda V2-06: guard bloqueante antes del piloto (SOLO DESARROLLO)

PR #827 sobre #826. Agrega auditoría real SOLO LECTURA de Supabase PILOTO (PostgreSQL 17.11, Auth compradores 0, 0/8 RPC V2, 0 tablas V2, bucket privado OK), reconciliación Edge Whapi v76 y nombres de variables Preview de Vercel. Crea `scripts/piloto/v2-release-readiness.mjs` con dos fases **primer original** vs **piloto completo**, salida `BLOCKED` para estado real y `can_publish=false` incluso si pruebas sintéticas pasan. SQL inventario `v2_06_release_inventory_readonly.sql` es SELECT-only, sin PII ni secretos. Tests CI de modelo de amenazas (comprador sin Auth, consentimiento prospectivo, SHA release, Edge drift, ruteo, calendario, WhatsApp E2E). Documento [V2-06 preflight](docs/V2-06-PREFLIGHT-PUBLICACION-20261112.md). No despliega SQL, Edge, Vercel ni envía WhatsApps; `Publicalo` y prueba real siguen pendientes.

## 2026-11-12 — Cotironda V2-04c: PDF auténtico en análisis privado (SOLO DESARROLLO)

PR #826, apilado sobre #825: reutiliza **en Deno** el lector PDF posicional `readPdfPositioned` ya existente en Whapi, pero mediante una **función Edge aislada**; Next.js Node no importa directamente `npm:unpdf`. Los PDF originalmente almacenados, autenticados y permitidos por V2 viajan únicamente entre servidor Vercel y función PDF privada con secreto dedicado, SHA-256 binario comprobado en ambos extremos y SHA textual independiente. PDF con texto real (hasta 12 páginas) permite generar la guía del original sin alterar su archivo; escaneados o inconsistentes permanecen descargables y con análisis pendiente. Función PDF y portal quedan **OFF**, nuevos secretos no configurados, sin publicar ni enviar mensajes. CI incorpora pruebas Node de seguridad e integración y **Deno leyendo un PDF real válido** con `unpdf@2.1.0`, además de compilación Next.js y regresiones; pruebas de piloto real aún pendientes. Ver [acta V2-04c](docs/V2-04C-PDF-REAL-PRIVADO-20261112.md).

## 2026-11-12 — Cotironda V2-04b: original, guía IA y portal privado (SOLO DESARROLLO)

PR #825: integración privada de los originales asociados a cotizaciones reales a un comentario individual automáticamente solicitado por el portal autenticado. Tabla RLS `v2_original_analysis`, claim SQL por ronda+documento+SHA con lease/token únicos, hasta 3 intentos y reintentos con cooldown; original descargable aunque IA falle. Un RPC privado proyecta 2–4 observaciones y citas solo para archivos ya visibles por el comprador y con consentimiento V2 vigente. Endpoint POST en preview con release SHA exacta, flag OFF por defecto; lector seguro de TXT/CSV/Word/Excel sobre Storage con SHA binario comprobado; PDF/imagen y texto WhatsApp aún pendientes de integración. CI candidato comprobado **6/6 SUCCESS** SHA `e481315a07afec23e6acc9663fe45d397a3b2a44` (Node, PG17 con ROLLBACK, Auth, aislamiento, portal Next.js y sitio). **Sin despliegue, sin compradores Auth reales, sin mensajes ni E2E.** Acta [V2-04b](docs/V2-04B-ANALISIS-PERSISTIDO-PORTAL-20261112.md).

## 2026-11-12 — Cotironda V2-04: análisis individual citado, NO bloqueante (SOLO DESARROLLO)

PR #824: nuevo servicio server-only de guía individual de proveedor basada en SHA del texto y autorizaciones verificadas por llamador, con 2–4 observaciones asociadas a citas literales comprobables del original; números de observación deben constar en su cita, no se inventa IVA/flete, no usa rankings ni publicidad engañosa. Respuesta IA fallida, permisos inválidos, PII, montos inventados o evidencia no literal → análisis pendiente, original intacto. Tests Node con mocks y CI general **6/6 SUCCESS** SHA `f3f9a03cb75dc24bdcbd5a62ef4ab3ad3d7261f4`. Falta conexión recepción→extracción→worker/idempotencia→SQL→portal privado: el comprador V2 aún no ve análisis. Sin instalación en PILOTO, Auth real ni prueba E2E. [Acta](docs/V2-04-ANALISIS-INDIVIDUAL-EVIDENCIA-20261112.md).

## 2026-11-12 — V2-03b: originales verificables y portal buyer (SOLO DESARROLLO)
Se propuso fuente privada por documento autorizada contra V2-03a, copia SHA-256 exacta de Storage, sesión Auth vigente y revalidación tras I/O con auditoría SQL durable antes de entregar bytes. Ruta Next privada, acceso por teléfono autenticado para usuarios existentes (sin signup), pantalla de solo proveedores respondedores con análisis en preparación y descarga original. Kill switch previo OFF, preview SHA exacto. Tests Node y PostgreSQL 17 con rollback. **No instalado en PILOTO, sin usuarios Auth ni consentimientos V2 cargados, sin WhatsApps reales y sin E2E.** [Acta V2-03b](docs/V2-03B-DESCARGA-AUDITADA-20261112.md).

## 2026-11-12 — Cotironda V2-03a: catálogo privado de respondedores (SOLO DESARROLLO)

Se preparó un listado basado en prueba firme del original (inbox + SHA Storage + MVP225), Auth del comprador y consentimiento V2 prospectivo por proveedor, sin usar el filtro antiguo de ronda cerrada o verificación económica V9. Política OFF por defecto; API Next.js GET en preview con SHA pinning, sin descarga ni datos de invitados pendientes, proyección segura y pruebas PG17/Node sintéticas. **No hubo cambios en base PILOTO, WhatsApp, Storage, Auth real ni producción; no es portal terminado.** [Acta V2-03a](docs/V2-03A-RESPONDEDORES-SEGUROS-20261112.md).

## 2026-11-12 — Cotironda V2-02: adjuntos con referencia en caption (DESARROLLO)
Conservando el webhook histórico inmutable, se preparó overlay V2 (flag OFF) para que documentos PDF/Excel/fotos recibidos sin mensaje citado, pero con código en el caption Whapi, pasen una búsqueda de despacho verificado tras quedar archivados con SHA. RPC privada solo lectura exige emisor y original auténticos, consentimiento vigente y previo, invitación, único despacho acreditado y referencia inequívoca. MVP225 sigue asociando finalmente. Nuevos tests Node, Deno y PG17 con ROLLBACK. **Sin SQL ni Edge instalados, sin WhatsApps enviados, sin atribuir documentos históricos, sin E2E ni portal final.** [Acta V2-02 caption](docs/V2-02-CAPTION-ADJUNTOS-20261112.md).

## 2026-11-12 — Cotironda V2-02: prueba temporal de autorizaciones (SOLO DESARROLLO)
PR #816: el lookup por referencia exige consentimiento comprador/proveedor e invitación anteriores al despacho Whapi, además de consentimiento del proveedor anterior a su respuesta. Se agregaron pruebas sintéticas PG17 de autorizaciones tardías. Consulta solo lectura en cotironda-piloto: 4/4 despachos aceptados cumplen orden cronológico; 0 altas tardías observadas. Sin SQL aplicado, Edge desplegada, WhatsApp enviado ni E2E. Fuente vigente: PR #815 e Issue #794.

## 2026-11-11 — MVP355: contador documental exige origen firmado (SOLO DESARROLLO)
Se reforzó la RPC de MVP354 para que un archivo NO cuente solo por fecha/request_id preasignado. Exige misma fuente en inbox firmado + vínculo privado MVP225 con método `quoted_whapi_id` o `single_active_round` y SHA exacto, sin conflicto no resuelto; usa fecha real de recepción. PG17 incluye negativos y casos de dos proveedores/archivos, con ROLLBACK. [Acta 523](docs/523-mvp355-procedencia-documentos-recepcion.md); [Issue #794](https://github.com/ProtectorRudo/Cotironda/issues/794). Nada desplegado.

## 2026-11-11 — MVP354: recepcion de originales independiente de IA (SOLO DESARROLLO)
RPC privada de contador de medios recibidos con token de comprador, proveedor invitado/despachado, archivo SHA íntegro y ambigüedad entre rondas bloqueada; DTO seguro y tracking bajo flag OFF por defecto, sin precio, contacto ni descarga. SQL NO instalado, Edge NO publicado. Tests y criterios en [Acta 522](docs/522-mvp354-recepcion-documental-independiente.md). El plan de continuidad sigue en [Issue #794](https://github.com/ProtectorRudo/Cotironda/issues/794); no marcar P1/P2/P3 aprobados todavía.

## 2026-11-11 — MVP353: preflight detecta una ronda preparada vigente (SOLO DESARROLLO)
El control de preparación MVP334 ahora evita recomendar otra ronda cuando existe una `prepared` aún vigente: contador de rondas y despachos agregados sin identidad, validación de esquema y tests de mutación/falla cerrada. En la base real: 1 preparada con 2 despachos aceptados, 1 borrador, 0 ofertas nuevas; nuevo SQL solo lectura devuelve `preflight_sql_apto=false`. Sin tocar la ronda, sin publicación ni WhatsApp. [Acta 521](docs/521-mvp353-preflight-sin-ronda-duplicada.md).

## 2026-11-11 — MVP352: pista material y reevaluación única de PDF (DESARROLLO)
Se añadió la separación contextual de descuentos porcentuales explícitos al final de descripciones (`; Dscto. 22.4%`) sin alterar archivos, SHA, cantidades, unidades ni condiciones económicas. El modelo recibe solo pistas opcionales para dos comparaciones independientes; la puntuación y ACL de asociación permanecen estrictas. Una migración piloto candidata agrega ledger inmutable RLS y un **único** tercer reclamo sobre un documento que agotó MVP351 con estados exactos; no borra historial, no genera WhatsApps ni ofertas. Se incorporó PG17 sintético reversible, tests Node/Deno y procedimiento de publicación. **No instalado ni desplegado**, PR #792 sobre #791. El PDF real sigue sin oferta verificada hasta que una futura ejecución autorizada demuestre lo contrario. [Acta 520](docs/520-mvp352-pistas-materiales-reanalisis-unico.md).

## 2026-11-11 — MVP351 publicado en piloto, reintento ejecutado sin oferta verificable
Con `Publicalo` se aplicó exclusivamente a Supabase `cotironda-piloto` la migración `20261111213152_mvp351_reintento_fidelidad_y_rivales_historicos`. Auto-recovery pasó v12→v13 y Whapi v75→v76 preservando dependencias no modificadas. Se pausó y restableció el cron documental de 5 minutos. Los controles de RLS/ACL y el estado ACTIVE se verificaron. **Resultado funcional:** el reintento controlado sobre el documento real corrió una sola vez, quedó en revisión por `insufficient_material_evidence` y NO generó ofertas anónimas ni mensajes adicionales. Pendiente mejorar interpretación sin inventar unidades, certificar importes/condiciones, segunda oferta y cierre E2E. La versión de código desplegada corresponde a commit `fadf4411d6cf` (PR #791, aún draft/apilado), no a producción. [Acta 519](docs/519-mvp351-reintento-historico-controlado.md).

## 2026-11-11 — MVP351: reintento histórico auditado, rival cerrado solo como control (desarrollo)
Se diagnosticó en Supabase solo lectura que una fuente documental del proveedor fue archivada y quedó sin vincular, con dos rondas candidatas al momento de llegada, recuperación `review/archived_materials_disagree` y cero reintentos previos. Se añadió SQL de reintento único con ledger RLS de motivo/fechas originales, comparación contra rivales cerrados **después** de la recepción, marca `bind_allowed` y bloqueo de seleccionar rondas históricas. Tests Node, Deno y PostgreSQL17 sintético ROLLBACK preparados. **Sin cambiar Supabase real, Whapi ni Vercel, sin merge y sin certificar piloto E2E.** [Acta 519](docs/519-mvp351-reintento-historico-controlado.md).

## 2026-11-11 — MVP350: separar preparación de nueva ronda y evidencia E2E real (solo desarrollo)
Se actualizó el preflight MVP334 para admitir auto-release ON y no confundir falta de mensaje reciente con inseguridad para preparar la primera prueba. El evaluador E2E MVP300 detecta una ronda cerrada con ofertas incompletas y exige nueva prueba, sin recomendar esperar respuestas en una ronda vencida. SQL piloto real validado solo lectura (1 comprador + 2 proveedores contactables; WhatsApp/IA ON; 0 envíos inciertos; preflight de preparación apto). Tests Node y CI general; **sin activar ninguna ronda, migración, deploy o WhatsApp**. [Acta 518](docs/518-mvp350-ronda-nueva-preflight-y-e2e.md).

## 2026-11-11 — MVP349: correlación privada con permutación única de materiales (solo desarrollo)
La comprobación MVP348 ya no asume que las líneas de un PDF aparecen en el mismo orden en dos lecturas. Acepta exclusivamente la misma lista de descripciones/cantidades/unidades con asignación biyectiva **única**, sin cambiar el orden ni asociar precios a otras líneas. Datos ambiguos, duplicados, marcas y cantidades alteradas siguen bloqueados. Se agregaron regresiones sintéticas de corrección y seguridad. Sin replay, base real, WhatsApp, publicación o merge. [Acta 517](docs/517-mvp349-orden-unico-lecturas-materiales.md).

## 2026-11-11 — B7: no ocultar IVA/flete tras la primera fila PDF desconocida (desarrollo)
B5l ahora analiza todas las filas PDF.js pendientes y conserva el diagnóstico privado de mayor riesgo (fiscal/logístico, monetario/porcentaje, luego texto desconocido), sin aceptar datos arbitrarios ni modificar los flags de publicación. Cobertura histórica B5o aún 8/13 filas: no se tocó la base ni se hizo otra lectura. Pruebas Node + PDF.js Deno, CI PostgreSQL 17/Next.js. [PR #788](https://github.com/ProtectorRudo/Cotironda/pull/788), [Acta 516](docs/516-b7-auditoria-riesgos-filas-pdf-pendientes.md).

## 2026-11-11 — B5o revisión privada final (solo desarrollo)
Se preparó `v2_b5o_20261111`, en el ledger privado existente, para contrastar una sola vez el PDF histórico B5n con la corrección de nota comercial/condición idénticas. Claim por SHA/proveedor, primer bloqueo B5n `source_part_mixed` ordinal 4/5, ventana B4 de ocho minutos y autoapagado, sin nuevas tablas, claves, cron ni WhatsApp. PostgreSQL 17 ROLLBACK y pruebas Node/Deno/Next en CI. **No desplegado ni fusionado**; priorizar transición al piloto comercial tras resultado real. [PR #786](https://github.com/ProtectorRudo/Cotironda/pull/786), [Acta 514](docs/514-v2-b5o-comprobacion-final-y-salida-e2e.md).

## 2026-11-11 — B5o: no duplicar nota comercial como otra fuente PDF (desarrollo)
Se ajustó el verificador B5l para permitir que un renglón `commercial_note` sin importe y una condición comercial EXACTAMENTE idéntica refieran al mismo fragmento PDF.js comprobado. No habilita materiales, cláusulas monetarias, IVA no acreditado ni fragmentación libre, y sigue sin certificar totales o publicar ranking. Agregados tests Node y Deno con PDF sintético + PG17 rollback + regresión. Cambio exclusivamente en código y CI; no instalado en piloto, sin WhatsApps ni merge. [PR #785](https://github.com/ProtectorRudo/Cotironda/pull/785), [Acta 513](docs/513-v2-b5o-doble-referencia-nota-condicion.md).

## 2026-11-11 — B5n/B4: puente existente y relectura de un solo uso (desarrollo)
Se verificó que el cron ya autorizado invoca IA V2 a través del puente interno B4. Se preparó `supabase/piloto/v2_b5n_b4_one_shot_lease_window.sql` con ventana B5n de 8 minutos y desactivación del modo en la misma transacción del claim; preserva modos B4 ajenos, no crea credenciales, transportes o cron nuevos. Prueba PostgreSQL 17 ROLLBACK y Node. No instalado en `cotironda-piloto`, sin cambios en ofertas, mensajes ni producción. [PR #783](https://github.com/ProtectorRudo/Cotironda/pull/783), [Acta 511](docs/511-v2-b5n-b4-una-sola-ejecucion-sin-secretos.md).

## 2026-11-11 — B5n reingreso privado versionado (desarrollo)
Se agregó versión `v2_b5n_20261111` con SQL privado y worker que impiden reutilizar B5k/B5m como resultado nuevo. Requiere una única fuente histórica con subtotal B5m comprobado y 3/5 condiciones, SHA/proveedor intactos, cinco flags apagados antes de instalar. Pruebas PG17 ROLLBACK comprueban elegibilidad, denegación y no alteración del historial. **No se desplegó ni se ejecutó**; [Acta 509](docs/509-v2-b5n-replay-privado-una-sola-vez.md).

## 2026-11-11 — B5n (desarrollo, no desplegado)
Corrección acotada de atribución PDF.js: se ignora únicamente puntuación periférica al corroborar el texto **íntegro** de una condición. No se fragmentan celdas mixtas de materiales, IVA o flete; no se aprueba cobertura pública. Se agregaron pruebas Node, PDF.js real Deno, PG17 rollback y regresión. Caso histórico B5m permanece sin nueva relectura; datos y flags de Supabase piloto sin modificar. [PR #781](https://github.com/ProtectorRudo/Cotironda/pull/781), [Acta 508](docs/508-v2-b5n-puntuacion-pdf-condiciones.md).

## 2026-11-11 — B5m replay versionado (solo desarrollo)
Se preparó el reingreso privado del PDF ya procesado por B5k: conserva el registro anterior y habilita `v2_b5m_20261111` en la misma tabla RLS y RPC restringidas. Un claim antiguo o sin ambos bloqueos económicos/de cobertura es rechazado; no altera ofertas, WhatsApp, cron, Vercel ni base piloto. Test PG17 ROLLBACK y nueva CI. [Acta 506](docs/506-v2-b5m-replay-versionado-sin-perder-evidencia.md).

## 2026-11-11 — B5m: flete no cotizado y atribución de condiciones en fila compartida (SOLO DESARROLLO)
- PR #777 apilado sobre #776: en B5j se separa la coincidencia aritmética de renglones documentados del costo final no verificable cuando flete/IVA son ambiguos. Código fiscal sigue `fiscal_or_freight_ambiguous` y no autoriza publicar ni rankear.
- En B5l se atribuyen condiciones completas por fragmentos independientes PDF.js, incluso dentro de una fila material, con guardas contra mezcla con descripción, precios, IVA oculto y atribuciones duplicadas.
- Pruebas Node, PDF.js sintético real, PG17 rollback, regresión; ningún cambio Whapi/cron/Edge/SQL en piloto y no merge. Prueba real futura necesita replay versionado del PDF 2 ya diagnosticado. [Acta 505](docs/505-v2-b5m-subtotal-flete-y-atribucion-partes-pdf.md).

## 2026-11-11 — B5k + B5l publicados en piloto: relectura privada del PDF 2 (Acta 504)
- Migración `cotironda_v2_b5k_private_currency_source_with_b5l_20261111` instalada y Edge sombra `cotironda-piloto-v2-shadow` v8 ACTIVE con 23 archivos. Commit publicado `339330f88d7539d953f7eec239f236fa99eb0236`; PR #776 apilado, DRAFT y sin merge.
- UNA relectura histórica por canal interno pg_net: `uniform_dollar_symbol_iso_unstated`, 3/3 materiales con símbolo corroborado y aritmética individual; moneda ISO no acreditada.
- B5j detuvo conciliación en `fiscal_or_freight_ambiguous`: flete mencionado sin costo ni inclusión/gratuidad; B5l detuvo cobertura en `line_assignment_ambiguous` por condición que comparte fila material. Total final no certificado.
- Cinco flags SQL apagados al cerrar; RLS activo, auditorías B5d–B5j intactas, cero ofertas creadas y cero WhatsApps pendientes; sin despliegue de Vercel/producción/Whapi.
- Próximo: atribución precisa de condiciones en fila y flete no cotizado como condición a aclarar, sin inventar importes ni bloquear comparación de subtotales equivalentes. [Acta 504](docs/504-v2-b5k-b5l-publicacion-piloto-moneda-flete-cobertura.md).

## 2026-11-11 — B5l: censo conservador de cobertura del PDF original (SOLO DESARROLLO)
- PR #776 sobre B5k PR #775; módulo puro de atribución de todas las filas PDF.js originales con evidencia SHA y geometría previa.
- Detecta cargos y artículos omitidos (incluidos precios extra en la misma fila), IVA, flete, descuentos, condiciones no modeladas, páginas adicionales, ambigüedades, PDF escaneado y cláusulas no interpretadas.
- Integra códigos/contadores **sin precios/PII** en trabajador B5k ya previsto. Migración B5k aún sin publicar valida los nuevos campos con RLS y flag OFF. No se crea otro cron/Edge/cola.
- Incluso con filas visibles atribuidas, todas las banderas de certificación/publicación/ranking son FALSE. Pruebas Node, Deno PDF.js, PostgreSQL17 rollback y regresión [Acta 503](docs/503-v2-b5l-cobertura-negativa-original-pdf.md).

## 2026-11-11 — B5k moneda corroborada en original (SOLO DESARROLLO)
- PR #775 sobre #774: compara símbolos monetarios de cada precio unitario, total de renglón y pie con texto PDF.js SHA verificado. Distingue `## 2026-11-11 — B5k moneda corroborada en original (SOLO DESARROLLO)
- PR #775 sobre #774: compara símbolos monetarios de cada precio unitario, total de renglón y pie con texto PDF.js SHA verificado. Distingue  uniforme sin ISO de ARS explícito y bloquea USD/U$S/EUR/mezclas.
- B5j acepta evidencia de moneda original para matemática PRIVADA con cabecera IA nula, sin editar candidatos históricos; `source_verified` y todos los permisos públicos siempre false.
- Worker y ledger B5k seleccionan solo el PDF 2 B5j con `currency_ambiguous`, sin IA, con RLS/servicio, control SHA, cuota 1 y flag OFF. Edge exclusivo sin fallback.
- Pruebas de Node/Deno PDF.js/PG17 y regresión; sin merge ni despliegue al piloto. [Acta 502](docs/502-v2-b5k-moneda-directa-original-pdf.md).

## 2026-11-11 — B5j publicado solo en piloto: prueba económica REAL de 2 PDF (Acta 501)
- Aplicada migración privada B5j y Edge sombra V2 v7 desde código `e2e7dd5fe3779636f0be7c491517a2b143e46e16` (CI 6/6 aprobado), sin desplegar a producción ni integrar PR #774.
- Ejecutadas 2 reauditorías privadas: PDF 1 `grand_total_balances_private` (2 materiales, 3 condiciones, suma coincidente), PDF 2 `currency_ambiguous` (campo moneda general no especificado; hay `$` en 3 renglones extraídos, pero total no comprobado).
- V2/B5h/B5i/B5j apagados al finalizar. Cero ofertas nuevas, cero WhatsApps salientes, auditorías previas intactas, tabla B5j RLS cerrada. Ambos totales siguen no certificados ni rankeables.
- Próximo desarrollo sugerido: cotejo de moneda sobre original y cobertura integral, previo a nueva prueba WhatsApp E2E. [Acta 501](docs/501-v2-b5j-piloto-reconciliacion-real-dos-pdf.md).

## 2026-11-11 — B5j: conciliación económica determinista y privada (SOLO DESARROLLO)
- PR #774 sobre #773: cotejo exacto en centavos de materiales y descuentos con fuente PDF, cargos explícitos, IVA/flete informados o no informados sin suponer, y condiciones comprobadas contra el original.
- Nuevo ledger B5j de códigos y contadores sin precios ni PII, RLS y RPC servicio; modo Edge B5j exclusivo con flag OFF por defecto y sin fallback hacia IA/WhatsApp.
- Pruebas Node, PDF.js Deno, PostgreSQL 17 rollback, archivos SHA alterados, reintentos, condiciones contradictorias y diferencia de un centavo; integración WhatsApp sin cambios.
- No publicado ni integrado; incluso `grand_total_balances_private` conserva `source_verified=false`, `can_publish=false`, `can_rank=false`. Falta certificar cobertura económica completa. [Acta 500](docs/500-v2-b5j-conciliacion-economica-privada.md).

## 2026-11-11 — B5i PUBLICADO en `cotironda-piloto` (Acta 499)
- Migración `cotironda_v2_b5i_private_total_geometry_20261111` y Edge sombra V2 versión 6 publicadas desde commit de código `0a50796cd45d9cb5222d8cf5bb7c862cb13476f5`, únicamente en piloto.
- Dos PDF históricos procesados por canal interno autenticado: una cifra coincidente por documento, en celda debajo de materiales y alineada con columna de importes; sin etiqueta de total reconocida. No representa una certificación de importe final.
- B5d/B5g/B5h intactos, sin ofertas ni mensajes nuevos; RLS confirmado y `enabled`, `b5h_only`, `b5i_only` apagados al finalizar.
- PR #773 abierto y sin merge, producción sin cambios. Próximo: validación económica integral determinista (IVA, flete, cargos, descuentos y cobertura). [Acta 499](docs/499-v2-b5i-publicacion-piloto-diagnostico-geometria-real.md).

## 2026-11-11 — B5i, posición geométrica del total sin rótulo (solo desarrollo)
- Nuevo PR #773, apilado sobre B5h #772: analizador puro de posiciones PDF.js x/y, importes repetidos, columna de artículos y proximidad de IVA/flete sin inferencia de totales.
- Ledger privado B5i versionado y nuevo modo exclusivo OFF por defecto (RLS, SHA, cuota, idempotencia); no reabre B5h/B5g/B5d.
- Worker privado sin OpenAI, sin WhatsApp ni publicaciones; Edge fail-closed antes de la ruta normal. CI Node/Deno/PG17 rollback y regresión total.
- **No instalar ni publicar** sin autorización. Los dos totales reales permanecen `source_total_unverified`. [Acta 498](docs/498-v2-b5i-geometria-total-sin-etiqueta.md).

## 2026-11-11 — B5h PUBLICADO en Supabase piloto (Acta 497)
- Migración B5h instalada y Edge sombra V2 actualizada a v5 desde el commit de código `7d2b8fc8dd974e659ac91f89c8f0d976cc98bb39`, sin desplegar a producción ni integrar PR.
- Ejecutadas dos reauditorías privadas reales por cron/Vault existente, ambas `unlabeled_amount_found`: número coincidente presente, etiqueta de total no reconocida; la fuente NO está económicamente certificada.
- Modo exclusivo evitó fall-through: B5d y B5g intactos, 0 ofertas públicas nuevas, 0 mensajes pendientes. Ambos flags SQL apagados y verificados.
- Las cifras permanecen bloqueadas para ranking y comprador. Próximo B5i: localizar evidencia geométrica y contexto del importe. [Acta 497](docs/497-v2-b5h-publicacion-controlada-diagnostico-originales.md).

## 2026-11-11 — B5h: diagnóstico total PDF y modo exclusivo (SOLO DESARROLLO)
- PR #772: diagnósticos cerrados sin importes ni datos personales sobre los dos PDF B5g reales, cuyos totales siguen sin verificar.
- Nuevo trabajador SHA y ledger B5h privado con RLS, idempotencia, selección de los históricos y ningún mensaje ni ranking.
- Flag `b5h_only` apagado por defecto; ejecución exclusiva anterior a B2/B5g/B5d/IA, sin fall-through si la cola está vacía.
- CI Node/Deno/PostgreSQL 17 rollback y suite general; sin despliegue en piloto ni producción. [Acta 496](docs/496-v2-b5h-total-pdf-diagnostico-privado-exclusivo.md).

## 2026-11-11 — B5g: replay privado de PDF históricos por SHA (desarrollo)\n- Nuevo ledger y RPC versionados únicamente para reauditoría de 2 PDF B5d, con RLS, bloqueo de roles públicos, consentimiento, idempotencia y cupo dos/hora; sin repetir IA.\n- Reutiliza doble factor B3 y cron B4, prioriza replay antes que fuentes vinculadas; no cambia Whapi ni seguimiento.\n- Tests Node/Edge + PG17 ROLLBACK + Deno y [acta 495](docs/495-v2-b5g-reauditoria-pdf-historico-versionada.md), [PR #771](https://github.com/ProtectorRudo/Cotironda/pull/771). No desplegado.\n\n## 2026-11-11 — B5f: fuente PDF posicional y total sin suposiciones (desarrollo)\n- El lector PDF.js aislado de V2 conserva x/y de celdas; el lector Whapi con huella MVP332 queda intacto. Auditor B5f acepta un total único etiquetado sin $ o en fila contigua y prueba porcentajes por título de columna/descuento explícito, sin inferir tasas.\n- Aritmética BigInt de B5/B5d usa evidencia por SHA y reporta desacuerdos con IA en privado; sigue sin publicar/ordenar.\n- Nuevos tests de totales engañosos, IVA/flete, cabezales, montos y descuentos; [Acta 494](docs/494-v2-b5f-cotejo-total-y-descuento-pdf-posicional.md), [PR #770](https://github.com/ProtectorRudo/Cotironda/pull/770).\n\n## 2026-11-10 — B6: comparar solo cotizaciones verificadas (solo desarrollo)\n- Puente privado al adaptador MVP162 y comparador MVP118 existente; cobertura y opciones completas con hasta dos proveedores, sin enfrentar totales parciales.\n- Referencias de precio unitario neto solo en artículos idénticos con condiciones comparables; sin posición de ganador global ni contactos.\n- Corrección de vista del arquitecto MVP227: cuando el proveedor guarda silencio, no se agregan frases de IVA, flete ni pago.\n- Suite de pruebas nueva y regresiones MVP162/MVP227/MVP255 + motor; [acta 493](docs/493-v2-b6-comparador-verificado-y-vista-sin-supuestos.md), [PR #769](https://github.com/ProtectorRudo/Cotironda/pull/769).\n\n### B5e (sin desplegar) — fuente Excel independiente\n- Se conectó lector ZIP/XML de XLSX de Cotironda al worker B5d; SHA y cotejo privado de renglones/precios/filas omitidas.\n- Pruebas Node sobre XLSX ZIP sintético genuino, Deno y PostgreSQL17; no se confunden renglones coincidentes con certificado integral de celdas/fórmulas.\n\n## 2026-11-10 — B5d, reauditoría de originales y archivos vinculados (solo desarrollo)\n- Ledger independiente B5d privado y RPC service_role; reauditoría sin IA de B2; ingreso de archivos PDF/XLSX asociados con verificación de ronda e invitación.\n- Encadenamiento dentro de Edge sombra B3 tras cola B2 vacía, sin nuevos cron/secretos/WhatsApp.\n- Auditor de PDF y aritmética privados, Excel pendiente de celdas; no publicar/rankear.\n- Pruebas de Node, Deno Edge y PostgreSQL17 ROLLBACK; [acta 492](docs/492-v2-b5d-reauditoria-versionada-y-fuentes-vinculadas.md), [PR #768](https://github.com/ProtectorRudo/Cotironda/pull/768).\n\n## 2026-11-10 — B5c, integración privada de auditor PDF en worker (sin desplegar)\n- Inyección del lector posicional original PDF.js en la Edge sombra, sin afectar el portal Next.js ni WhatsApp.\n- Verificación SHA, cotejo por renglón y conciliación BigInt B5 en el worker; hallazgos neutrales almacenados solo en diagnóstico privado por artículo.\n- Detección conservadora de importes/condiciones omitidos y total original sin fila única; jamás habilita publicación o ranking.\n- Pruebas sintéticas nuevas y CI Node/Deno Edge completo; ver [Acta 491](docs/491-v2-b5-reglas-iva-flete-y-descuentos.md) y PR #767.\n\n## 10/11/2026 — B5 desarrollo: reglas IVA/flete explícitos y descuentos deterministas

- Nuevo auditor puro y privado V2 B5: **IVA y flete se omiten por completo si no se mencionan en la fuente**; IVA incluido/excluido/solo tasa son casos distintos, flete a convenir se guarda sin monto.
- Concilia descuento etiquetado de 22,4% en dos presupuestos Ailín en cálculo exacto con BigInt: redondea unitario efectivo antes de multiplicar cantidad; no infiere descuento del resultado, no convierte moneda ni publica.
- Se actualiza el prompt futuro para prohibir inventar «IVA no informado» o transporte por defecto. **Sin publicación**, sin cambios en Supabase ni Whapi. Pendientes: verificación independiente PDF original, Excel de Nahuel vinculado, ranking y seguimiento. [Acta 491](docs/491-v2-b5-reglas-iva-flete-y-descuentos.md), [Issue #766](https://github.com/ProtectorRudo/Cotironda/issues/766).

## 10/11/2026 — V2 PILOTO: recuperación real de 2 PDF privados y puente cron existente (NO E2E)

- Migración SQL B2 `20261110221810` + RPC de solo lectura B4, privadas con RLS; Edge `cotironda-piloto-v2-shadow` v2 y Edge `cotironda-piloto-auto-recovery` v12 que reutiliza cron Vault antiguo sin secretos/cron nuevos.
- Primera prueba POST rechazada con HTTP 413 por stream vacío de pasarela; guard corregido para permitir solamente cuerpo vacío, con CI Node/Deno/PG17 antes de publicar hotfix v2.
- **2 originales PDF de Corralón Ailín** releídos y guardados como `candidate_private` sin fuente verificada: 2 materiales/$469.042,52; 3 materiales + 2 notas/$392.850,58. Contenidos y totales coinciden con lecturas anteriores, pero la IA aún no acredita importes.
- Descuento de **22,4 %** presente en lectura archivada y texto literal de ambas cotizaciones, pero no como campo económico estructurado V2. No comparar totales de distinta cobertura ni confundir con Nahuel (Excel/PDF de Nahuel ya vinculados). Issue [#766](https://github.com/ProtectorRudo/Cotironda/issues/766) para fuente, descuentos, IVA/flete y planilla completa.
- **Cierre seguro:** flag SQL V2 OFF, 2 candidatos privados, 0 leases abiertos, 0 WhatsApps nuevos, 0 publicaciones económicas, 3 cron originales activos, historial MVP292 y documentos inalterados. [Acta 490](docs/490-v2-publicacion-controlada-piloto.md), [PR #765](https://github.com/ProtectorRudo/Cotironda/pull/765).

## 10/11/2026 — V2 B3: función Edge privada de invocación (SOLO DESARROLLO)

- Nuevo handler + adapter Supabase `cotironda-piloto-v2-shadow` para el worker de relectura V2 B2. Usa autenticación de doble factor ya existente (key de servicio + secreto de recuperación) y habilitación Edge de recuperación ya existente; solo el nuevo flag SQL V2 queda apagado por defecto.
- Solo POST sin cuerpo ni parámetros; selección de archivo por SQL privado, una sola fuente por ejecución; respuestas sin datos sensibles ni acceso al publicador, WhatsApp o ranking.
- Tests Node de seguridad HTTP modernos/heredados, Deno del bundle completo y PG17 ROLLBACK, sin ejecutar IA real ni cambiar Supabase. [Acta 489](docs/489-v2-b3-edge-privado-autenticado.md).

## 10/11/2026 — V2 B2: originales archivados con ledger privado versionado (SOLO DESARROLLO)

- Se crea en rama una migración aditiva con flag sombra desactivado, lease único por archivo/versión, RPCs privados con RLS y autenticación `service_role`, sin tocar registros históricos MVP292.
- Nuevo worker B2 descarga desde el bucket privado, corrobora SHA y tamaño antes del lector V2 B1 y solo persiste candidata privada no verificada con diagnóstico por renglón. Prohibido entregar al comprador o usar en ranking sin auditoría independiente.
- Auditoría solo lectura: 2 PDF ya archivados cumplen permisos e invitación entregada. No hay relectura real con V2 ni conexión a cron/Edge, y no se modificó Supabase/Whapi/Vercel. Pruebas sintéticas Node/Deno/PG17. [Acta 488](docs/488-v2-b2-archivo-privado-versionado.md).

## 10/11/2026 — Presupuestos V2 B1: lector multiformato privado (SIN PUBLICAR)

- Nuevo lector en sombra de PDF visual, imágenes, Word, Excel y texto, basado en SHA de bytes archivados y JSON Schema estricto: preserva literales sin completar unidades/precios/moneda/IVA/flete. Resultado **siempre privado/no verificable para ranking**.
- Excel/XLSX usa modo de la API con límite de 1000 filas/hoja; queda marcado `spreadsheet_requires_cell_audit` hasta implementar lector determinista de celdas. Respuesta truncada/modelo incompleto nunca representa publicación.
- Tests Node y Deno sintéticos con fetch simulado, sin consumo de API, Storage real, contactos o WhatsApp. No conecta todavía al trabajador vivo ni reprocesa los PDF históricos con lease consumido (Issue #759). [Acta 487](docs/487-v2-lector-multiformato-sombra.md) · [PR #762](https://github.com/ProtectorRudo/Cotironda/pull/762).

## 10/11/2026 — ADR 486: decisión propuesta para motor documental V2 (SIN PUBLICAR)

- Se documenta un rediseño **acotado** del tramo recepción de presupuesto → lectura fiel → validación por renglón → asociación de ronda → comparación. Se reutilizan WhatsApp, almacenamiento privado, autenticación, ranking por rubro y seguimiento; una línea dudosa no descarta las verificadas ni se suma al ranking.
- Se conservará el anonimato solo mientras dure la ronda y se revelarán todos los invitados al cierre, según las reglas ya aprobadas.
- La ruta histórica MVP292 de doble lectura y lease consumido permanece sin cambios en piloto; reintento seguro queda en Issue #759. Nueva línea de trabajo prioritaria Issue #760; contrato y evaluación sobre corpus antes del código de producción. [ADR 486](docs/486-adr-motor-presupuestos-v2.md).

## 10/11/2026 — MVP348: fidelidad de lecturas, telemetría y prevención de falsos bloqueos (SOLO DESARROLLO)

- Código: comparador conservador de alcance para correlación privada (solo diferencias inequívocas de formato, sin cambiar material, cantidad, unidad, orden ni precio) y motivos granulares de revisión compatibles con ledger existente.
- Operación verificada: **sí existen cron y secreto**; el cron documental activo invoca el auto-recovery v11 vía puente MVP293. Los logs muestran llamadas aceptadas; un PDF real de 3 líneas terminó en review/archived_materials_disagree, no en publicación. Otro PDF mantiene review/multiple_indistinguishable_rounds.
- No se cambió Supabase real ni sus credenciales; reintento de PDF ya consumido requiere futuro diseño auditado de una sola ejecución. Nunca pedir crear secret/cron sin inspeccionar el puente ni confundir accepted con offer published. [Acta 485](docs/485-mvp348-incidente-recuperacion-documental-y-cron.md).

## 10/11/2026 — MVP347 PUBLICADO en Supabase piloto (NO E2E completo) — FE DE ERRATAS

- Migración 20261110180847 aplicada: MVP336/346/347, guard SHA de tracking, Edge auto-recovery v11 activa y prueba HTTP sin credenciales 401, sin cambiar Whapi ni Vercel.
- **Corrección del diagnóstico original:** el cron cotironda_piloto_document_recovery_5min YA funcionaba y llamaba al worker por el puente interno; la variable COTIRONDA_PILOT_AUTO_RECOVERY_SECRET YA EXISTÍA (panel pidió reemplazarla; se canceló). No crear otro cron ni rotar secreto.
- El PDF de tres líneas se releyó a las 18:20 UTC y se retuvo por divergencia; todavía no hay ofertas MVP347. [Actas 484](docs/484-mvp347-despliegue-controlado-piloto-20261110.md) y [485](docs/485-mvp348-incidente-recuperacion-documental-y-cron.md).

## 10/11/2026 — MVP347: nueva vía de oferta anónima solo para revisión PDF comprobada (desarrollo)\n\n- Ruta MFA/SQL de publicación desde la candidata privada MVP346, con verificación de fuente PDF SHA-256, cobertura económica, aritmética determinista, consentimientos, privacidad y no duplicación. Se conserva el documento original y todos los dictámenes previos.\n- Overlay de seguimiento sobre definición real del piloto con guarda de fingerprint; integra ofertas revisadas al token del comprador y mantiene el anonimato durante la ronda. Sin cambios al portal; sin pagos, mensajes ni despachos automáticos.\n- Nuevas pruebas sintéticas de replay/MVP347, PG17 ROLLBACK y Deno; fuente real todavía no reprocesada. **No publicado**. [Acta 483](docs/483-mvp347-publicacion-revision-pdf-tracking.md).\n\n## 10/11/2026 — MVP346: candidata de interpretación económica privada (sin publicar)\n\n- El replay del PDF archivado puede contrastar la segunda lectura contra fuente independiente y aritmética de centavos. Cuando corrige precios pero no cambia materiales/cantidades, guarda **una candidata privada e inmutable** ligada a HMAC y SHA; conserva exactamente la propuesta original.\n- SQL nueva tabla + RPC con validación de permisos, plazo, identidad, integridad y cálculo, sin actualizar cotizaciones ni crear ofertas. Se agregó CI Node/Deno/PostgreSQL17 con pruebas sintéticas y ROLLBACK.\n- FALTA todavía la reconciliación económica validada como versión publicable y comprobar los datos del PDF real de Ailín. `Luz verde` no despliega. [Acta 482](docs/482-mvp346-candidata-economica-privada.md).\n\n## 10/11/2026 — MVP345: estado real de publicación tras recuperar PDFs (desarrollo)\n\n- Corregida la falsa señal de éxito del worker MVP292: `linked_private` solo cuando el replay confirma publicación; revisión económica, incertidumbre y archivo no elegible ya no figuran como presupuesto visible. La relación privada de ronda sí se conserva.\n- 5 escenarios sintéticos de publicación/revisión para no confundir correlación con oferta verificada; sin SQL real, OpenAI, Whapi ni despliegue. El PDF original necesita corrección económica independiente antes del E2E. [Acta 481](docs/481-mvp345-estados-correlacion-publicacion.md).\n\n## 10/11/2026 — MVP344: precios unitarios contradictorios del PDF, bloqueo explícito seguro

- Auditoría real solo lectura: el publicador SQL vigente MVP248 permite los 3 artículos (2 BIG BAG); cerramos sin merge #753, basado en una definición antigua. Total declarado del PDF = suma de 3 renglones, pero las 3 multiplicaciones precio unitario × cantidad no cuadran; no consta causa comercial explícita para asumir descuento/lista.
- El replay privado MVP292 ahora deja código `unit_price_source_recheck_required` cuando MVP103 devuelve `line_multiplication_mismatch`; **no publica**, no cambia precios y no manda WhatsApps. Se preservan controles de fuente y contabilidad determinista.
- 3 pruebas nuevas + 7 regresiones del worker histórico y typecheck Deno exitosos; sin SQL aplicado ni IA real. PR #754 apilado solo sobre MVP343 mínimo #752, no sobre etapa universal. [Acta 480](docs/480-mvp344-precios-contradictorios-pdf-fuente.md) / [Issue #750](https://github.com/ProtectorRudo/Cotironda/issues/750).

## 10/11/2026 — MVP343 mínimo: prioridad de circuito funcional (no publicado)

- Nuevo PR independiente #752 sobre MVP336 #742: preflight offline de recuperación única del archivo ya recibido, sin publicar MVP337–342.
- La contabilidad fina del costo de IA queda posterior al piloto; el gate conservador de un reintento, integridad del original y la auditoría económica permanecen. Ningún gasto real se calificó como cero.
- Ensayo sintético del worker MVP292 → relectura PDF → correlación MVP336 (15/2/1 vs 20/3) → revisión comercial sin forzar publicación. Pruebas de divergencia y duplicados, PG17 con ROLLBACK. [Acta 478](docs/478-mvp343-preflight-recuperacion-circuito-piloto.md), [Issue #750](https://github.com/ProtectorRudo/Cotironda/issues/750).

## 10/11/2026 — MVP336: corrección en desarrollo de asociación de PDFs sin unidades

- Primer documento de Ailín guardado en Supabase (08:19 ART), 3 líneas con cantidades literales 15/2/1; ronda nueva 15/2/1 vs anterior 20/3. Estado real `insufficient_material_evidence`, sin oferta publicada.
- Nuevo correlador versionado: tres coincidencias numéricas sin unidad con margen de seguridad; unidades ausentes continúan ausentes. Pruebas de casos ambiguos y envases incompatibles.
- Recovery privado de **una sola reevaluación** con SHA, identidad, despacho, lease, ledger del primer motivo y RLS; no WhatsApps ni publicación automática sin verificadores de fuente.
- Conservado sin modificaciones el módulo `MVP291` histórico y su manifiesto `MVP332`; candidato de overlay para v75 +1 fuente. Tests Node/Deno/PG17 sintéticos en PR #742.
- **Sin publicación en piloto ni producción**; CI y eventual despliegue bajo «Publicalo» pendientes. [Acta 471](docs/471-mvp336-correlacion-sin-unidad-reintento-privado.md).

## 10/11/2026 — Hito validado de piloto: pedido automático hasta 2 proveedores

- Auditada en Supabase la ronda real `aefe169e-7801-4efc-aabf-25cd134744eb`: ingreso desde arquitecto, 15 bolsas CPC 50 kg + 2 bolsones arena + 1 bolsón piedra, entrega La Plata; líneas, rubro y destinos correctos.
- **1** auto-release SQL, **0** confirmaciones del comprador, **2/2** envíos de solicitud aceptados por Whapi y enlace al arquitecto con recibo `read`. Ailín y Nahuel informados como receptores **por el usuario**, sin recibos de entrega instrumentados en la base.
- Webhook v75 activo; corte 07:18 ART: ronda preparada, **0 ofertas**, proveedores aún sin respuesta, **0 trabajos inciertos**. Son pendientes: recibir presupuestos, interpretarlos fielmente, publicación anónima, ranking comparable, cierre/revelaciones y rotación segura de credenciales expuestas.
- **Solo documentación GitHub; sin cambios a aplicaciones, tablas, WhatsApp, cron ni secretos.** [Acta 470](docs/470-hito-piloto-arquitecto-a-proveedores-20261110.md).

## 10/11/2026 — MVP335 publicado en piloto, Whapi Edge v74

- Publicado `cotironda-piloto-whapi` v74 `ACTIVE` en Supabase `cotironda-piloto`. Comparación criptográfica de 61 archivos del paquete, 1 índice modificado y digest exacto `3df77172138e27689123080335e65f2da111a14caac0b2a8034978435371f063` tras despliegue.
- Eliminada la dependencia redundante del secreto booleano `COTIRONDA_PILOT_BUYER_AUTO_RELEASE_MVP306_ENABLED` para no generar más `CONFIRMAR COTI`. Gate SQL MVP306 sigue siendo autoridad positiva de publicación, con comprobaciones de origen, comprador y proveedores.
- Conservado el secreto del webhook obligatorio y agregado diagnóstico interno `missing`/`invalid_length`. **El error 503 registrado en v73 no se considera recuperado** hasta probar nueva recepción firmada; sin reintentos, sin mensajes enviados, sin migraciones. Snapshot postdeploy: 32 inbox, 6 rondas, 0 publicaciones automáticas, 0 envíos inciertos. [Acta 469](docs/469-mvp335-v74-publicacion-verificada-piloto.md).

## 09/11/2026 — MVP335: candidato de corrección, SOLO desarrollo

- Evidencia real: sexta ronda correctamente interpretada y roteada a dos proveedores, pero `draft` con revisión WhatsApp de comprador; solicitud posterior no capturada debido a 503 `webhook_secret` del Edge v73. No atribuir la falla al cliente ni a la caducidad del token Whapi sin evidencia.
- Overlay MVP335 verificable sobre código Edge v73 de SHA-256 fijado: el único habilitador positivo de liberación pasa a ser PostgreSQL MVP306, sin variable adicional de auto-release y sin emitir nuevas solicitudes `CONFIRMAR COTI`. SQL sigue validando consentimientos, calidad, destinatarios, activación prospectiva; históricos conservados.
- Diagnóstico del secreto distingue `missing` vs `invalid_length` únicamente en logs protegidos; jamás registra valor, longitud o números, y conserva autenticación del header y 503 fail-closed. No recupera por sí solo un secreto realmente incorrecto.
- Tests MVP335, regresiones MVP332/MVP333/MVP306/MVP313/MVP314/MVP315 y Deno check CI en nueva rama; **ningún deploy ni cambios de datos**, requiere «Publicalo» para piloto y nueva prueba E2E. [Acta 468](docs/468-mvp335-sql-only-sin-confirmacion-y-secretos.md).

## 09/11/2026 — Publicación efectiva de MVP333 y activación prospectiva MVP306 (piloto)

- Publicado en Supabase `cotironda-piloto` el webhook Whapi de **v71 a v72**, con el candidato final de MVP333 (SHA-256 de `index.ts`: `91481dfd1ec51843346d233dfe654e8f3ce0ef699364424b625fe68d05f24f95`). **61/61 fuentes cotejadas postdeploy**, sin cambiar el canal Whapi, producción, seguimiento ni worker diferido.
- Activado únicamente SQL `ai_auto_release_gate_mvp306` con barrera prospectiva 09/11 21:55:45 ART, tras verificación atómica de 1 comprador + 2 proveedores con canales y permisos, catálogo, estado de IA y cero despachos inciertos. Sin rondas nuevas ni envíos causados por la activación.
- Batch MVP314 y buyer notice diferido MVP315 permanecen OFF. Postcheck: 31 inbox históricos, 5 rondas previas, 0 autoaprobaciones y 0 trabajos inciertos.
- Sigue **sin verificarse** valor del secreto Edge de auto-release ni un circuito real nuevo completo. Token Whapi de captura anterior sin rotar por decisión del propietario, riesgo del piloto. [Acta 467](docs/467-mvp333-v72-mvp306-gate-publicacion-piloto.md).

## 09/11/2026 — MVP334 (desarrollo, no publicado)

- Confirmado sobre Supabase real con SQL exclusivamente SELECT el preflight del circuito mínimo de 1 comprador + 2 proveedores: canales y permisos 1+2, 106 renglones de catálogo (86 curados, 20 pendientes), cero despachos inciertos, recepción comprobada, nueva liberación MVP306 y lotes/avisos MVP314/MVP315 OFF.
- Auditoría de código: webhook v71 ya permite despacho inmediato de hasta 2 invitaciones y seguimiento postenvío; **la primera ronda no necesita el worker de lotes ni el aviso diferido**. La activación posterior deberá centrarse en MVP306, tras publicar MVP333 y verificar secret/cupo del Sandbox.
- Nuevo SELECT read-only y evaluador puro sin envíos, 22 pruebas nuevas, 13 MVP333, 9 MVP332 y 37 regresiones: **81/81 aprobadas** en CI específico; sin mutar piloto ni pagar servicios. Riesgo de corte del gate MVP306 durante ronda activa documentado. [Decisión 466](docs/466-mvp334-preflight-dos-proveedores.md).

## 2026-11-09 — MVP333 (solo desarrollo)

- Corroborado el recorrido de la prueba «Hola Cotironda, prueba de conexión del piloto.»: inbox del arquitecto y POST Whapi OK; IA Central entró en revisión genérica y emitió un aviso de revisión api_accepted, sin crear ronda.
- Preparado candidato offline de corrección: solo la frase completa de diagnóstico del comprador, no pedidos de materiales ni texto libre, queda archivada sin activar modelo, aviso falso o ronda; historial immutable de MVP332 intacto.
- **59/59 pruebas específicas aprobadas** (13 nuevas, 9 MVP332, 37 regresiones 306/313/314/315), Deno check aprobado. No se tocó Supabase/Whapi/Vercel, ni se habilitaron MVP306/MVP314/MVP315. [Decisión 465](docs/465-mvp333-prueba-conexion-sin-falsa-revision.md).

## 09/11/2026 — Publicación acotada a piloto del webhook MVP332

- Reemplazada la función de WhatsApp en Supabase `cotironda-piloto` de v70 a v71, ACTIVE: 61/61 fuentes cotejadas con SHA-256. Sin cambios a producción, Whapi, Vercel ni otras Edge.
- Registradas 3 autorizaciones previas informadas por el dueño (1 comprador y 2 proveedores) con referencia administrativa, respetando bajas y sin falsas firmas WhatsApp; Ailín y Nahuel pasan el check de contacto comercial.
- Postguard: 0 jobs inciertos, 5 rondas y 30 mensajes inbox preservados; auto-release, lotes y avisos al comprador siguen OFF hasta verificar token/estado Sandbox y recepción entrante nueva. No se ha ensayado un circuito E2E real. [Acta 464](docs/464-mvp332-publicacion-piloto-whapi-v71.md).

## 09/11/2026 — MVP332: preparación de ruta Whapi de punta a punta (desarrollo)

- Leído en Supabase el código LIVE del webhook v70, con 60 archivos. Comparado 60/60 con GitHub: 57 idénticos y 3 actualizados; se agrega 1 módulo nuevo de destinatarios dinámicos. Paquete candidato total 61.
- Manifiesto SHA-256 de 60 fuentes en servicio y 61 candidatas; auditor offline con control estricto del grafo, tests sintéticos y CI. SQL de preflight agregado y probado solo lectura contra cotironda-piloto.
- Detectados bloqueos reales: 0 entradas recientes en inbox, 0 consentimiento vigente de teléfonos de proveedores, gates MVP306/314/315 OFF, 0 cotizaciones IA verified; falta Whapi AUTH/cupo/token renovado verificados y E2E. Sin despliegue, mensajes, pagos ni cambios de Supabase. [Acta 463](docs/463-mvp332-piloto-e2e-bundle-whapi-preparacion.md).

## 09/11/2026 — MVP331: Sandbox Whapi gratuito y diagnóstico sin envíos (desarrollo)

- Confirmada documentación oficial de plan gratuito Developer Sandbox, 5 chats mensuales y control separado del estado del canal.
- Nuevo script sin envíos, sin wakeup, sin cambios en la cuenta: verifica canal AUTH, ID esperado, URL/modo/evento del webhook y cupos, no divulga tokens ni chat IDs. Suite de pruebas sintéticas Node22 y CI.
- Supabase piloto auditado solo lectura: Webhook Edge v70 ACTIVE, ruta autónoma MVP306/314/315 apagada, 30 entradas históricas y una reciente; canal Whapi no comprobado en vivo, sin publicación ni E2E. [Decisión 462](docs/462-mvp331-whapi-sandbox-gratis-preflight.md).

## 09/11/2026 — MVP329: operador con sesión MFA y autorización empresarial (desarrollo)

- Se reutiliza el control real de Supabase `operator_session_mvp267` (Auth AAL2 + sesión no revocada) y se prepara la tabla privada de autorizaciones específicas por empresa, ronda y operador, sin alta automática.
- RPC autenticada que entrega un ticket temporal aleatorio de un solo uso y RPC service_role que lo consume y valida nuevamente la autorización; el actor de la auditoría privada se deriva del Auth user real persistido.
- Biblioteca interna MVP329 conectada a la custodia AES del MVP328, sin ruta HTTP, original en navegador, publicación, llamadas IA, envíos Whapi ni promoción económica; pruebas PG17 y Node con datos ficticios. [Decisión 460](docs/460-mvp329-operador-mfa-permisos-empresa-ticket.md).
- **No publicado en piloto** y ningún operador real enrolado.

## 09/11/2026 — MVP328: recuperación cifrada y registro de evidencia (desarrollo)

- Preparados SQL de lectura exacta de última fuente y registro privado append-only con ACL cerrada, RLS, idempotencia y bloqueo de UPDATE/DELETE/TRUNCATE; no incluye aprobación económica.
- Biblioteca interna que comprueba AAD AES-GCM, SHA-256 del original, vigencia de la fuente, pedido asignado y cotejador MVP327; solo devuelve estado y registra hashes de evidencia, sin exponer el original.
- Pruebas PG17+Node22 con datos sintéticos; faltan adaptador real de autenticación del operador y su autorización por empresa, archivos no textuales y validación E2E. **Sin publicar ni alterar la ronda histórica.** [Decisión 459](docs/459-mvp328-custodia-cifrada-y-registro-auditable.md).

## 09/11/2026 — MVP327: auditoría determinista de fuente textual, desarrollo

- Nuevo módulo puro que exige fuente textual íntegra y SHA-256, ronda y último mensaje consistentes, estado histórico `review`, evidencia literal de cantidades, unidad, moneda y precio, y reconciliación del total declarado. Reutiliza guardias económicas MVP225/241/242/244 sin introducir interpretaciones nuevas.
- Un cotejo positivo solo genera candidato para **auditoría independiente**; jamás modifica el original ni habilita publicación, adjudicación, ranking o envío automático.
- Pruebas con fuentes ficticias (precios alterados, cargos adicionales, IVA, parcialidad, múltiples totales, versión antigua). 0 uso de IA, WhatsApp, SQL real o deploy. [Decisión 458](docs/458-mvp327-cotejo-original-textual-sin-reproceso.md).

## 09/11/2026 — MVP326: estado real de revisión comercial publicado en piloto

- SQL `20261109164501`: nueva RPC token-gated `cotironda_piloto_ia_review_status_mvp326`, permisos denegados para `anon/authenticated`, verificado con token inválido y la ronda existente (1 terminal review, 0 processing, 0 verified).
- Supabase Edge seguimiento `cotironda-piloto-seguimiento` **v27 ACTIVE** (bundle de 34 fuentes enviado); Whapi v70 y batch v1 intactos, no cron ni envíos automáticos.
- Proyecto Vercel aislado de seguimiento: preview READY `dpl_Fawg4YtKtEE4oXnypRH6mYdPowCq` commit `2a5ecdd357e0` asignado a los dos aliases del piloto, incluido host de enlaces privados del arquitecto.
- Datos y protecciones intactos: 3 participantes, 5 rondas, 7 originales, 0 trabajos inciertos, MVP306/314/315 OFF. [Acta 457](docs/457-mvp326-publicacion-piloto-estado-comercial.md). HTTP/E2E desde navegador todavía no verificado y cotización histórica sigue en revisión.

## 09/11/2026 — MVP326: etapa real de revisión comercial en seguimiento (desarrollo)

- Nueva proyección privada token-gated por fuente actual: `requieren_revision`, `en_proceso`, `verificados`, sin importes ni identificadores; RPC exclusiva de service role y validación doble en Edge/proxy.
- La página deja de presentar una lectura económica terminada en `review` como trabajo «esperando verificación», con mensaje claro y sin exigir reenvío automático al proveedor.
- Regresión PostgreSQL17 sintética y tests DOM/proxy/privacidad; procedimiento de conciliación manual con evidencia, sin reintentos AI ni alteración de revisión histórica. [Decisión 456](docs/456-mvp326-estado-real-y-salida-segura-revision.md).
- **No aplicado a Supabase piloto ni publicado en Vercel con esta «Luz verde».**

## 09/11/2026 — MVP325: publicación técnica de vista anónima en Cotironda piloto

- Migración SQL `20261109130018`: RPC MVP227 y MVP303 de etiquetas anónimas estables reemplazadas de forma transaccional y verificadas por hashes, ACL y flags. Sin modificaciones en datos de prueba ni ampliación de acceso.
- Edge privada de seguimiento v25→**v26 ACTIVE** con código MVP322 y paquete de 33 archivos enviado. API de lectura lista 30: verificación completa de archivos empaquetados pendiente; HTTP real no verificado.
- Vercel piloto exclusivamente: alias `cotironda-seguimiento-vista-piloto.vercel.app` movido a preview READY `dpl_APjHh976TX7GD2KB3Esrz3YUxgGD`, SHA `9ab239ebc76d`, sin nuevo build ni cambio del proyecto principal.
- Verificación postpublicación: gates OFF, 0 jobs inseguros, Whapi v70, 3 participantes, 5 rondas y 7 originales; 0 registros de IA Central `verified`, por lo que la prueba E2E de nuevas tarjetas requiere cotización real futura. [Acta 455](docs/455-mvp325-publicacion-piloto-preliminar-sin-envios.md).

## 09/11/2026 — MVP324: auditoría de dependencias Edge seguimiento, sin despliegue

- Comprobados 29 archivos reales de Edge seguimiento v25 frente a GitHub: 28 idénticos; el único `index.ts` diferente es estrictamente la adición MVP322 y coincide byte a byte con la fuente previa al retirar esa adición.
- Nuevo gate Node22 solo lectura con manifest obligatorio de 33 archivos (incluye 3 dependencias transitivas antes omitidas), blob SHA1 fijo del `index.ts` previo, import graph recursivo y pruebas negativas para evitar un despliegue incompleto o cambiante.
- Sin cambios en Supabase piloto, Vercel web público, Whapi, envíos, cron ni producción. [Acta 454](docs/454-mvp324-preflight-bundle-seguimiento-sin-despliegue.md).

## 09/11/2026 — MVP323: corregir etiquetas anónimas cambiantes (solo desarrollo)

- Las RPC de presupuesto al comprador MVP227 y proveedores al cierre MVP303 calculan ordinales estables según la primera verificación privada de cada proveedor, conservando el número ante nuevas respuestas o correcciones en revisión.
- Se parte de las definiciones exactas del piloto y se protege el reemplazo por hash SHA256; no se modifican contratos de privacidad o flete/IVA.
- Nueva prueba de ambas RPC reales en PostgreSQL17 sintético comprueba 2→3 proveedores, retención de número, revisión no acreditada, cierre, permisos y ROLLBACK. Sin SQL en piloto ni WhatsApp. [Decisión 453](docs/453-mvp323-numeracion-anonima-estable.md), [Issue #720](https://github.com/ProtectorRudo/Cotironda/issues/720).

## 09/11/2026 — MVP322: vista preliminar anónima de importes por artículo (desarrollo)

- Añadida proyección de precio de renglón verificado y suma por presupuesto anónimo, con cantidades de cobertura asignada y condiciones originales. No confundir subtotal parcial con total final ni ordenar por sumas de coberturas distintas.
- Triple barrera de revalidación (dominio, Edge token privado, proxy Vercel con suma BigInt), tarjetas web móviles que se limpian al revocar y mantienen texto completo original disponible más abajo.
- Nuevos test MVP322, regresiones 227/255/299 y CI offline. No Whapi real, IA, SQL, deploy, cron ni producción. [Decisión 452](docs/452-mvp322-preliminar-anonimo-en-vivo.md).

## 09/11/2026 — MVP321: publicación controlada en cotironda-piloto (sin envíos)

- Aprobación expresa del operador «Publicalo» para instalar en piloto con switches de salida OFF, aceptando riesgo de no haber respaldo real.
- Migración `20261109042724` (`cotironda_piloto_mvp309_315_preparacion_sin_envios`): nueve scripts MVP309–315 tras comprobar 14+3 huellas y ausencia de jobs inseguros. Comprobado: funciones/gates presentes pero MVP306, MVP314 y MVP315 OFF; 3 participantes, 5 rondas y 7 originales conservados.
- Supabase Edge `cotironda-piloto-ai-batch` v1 ACTIVE, 11/11 archivos iguales a GitHub. Whapi Edge v70 y seguimiento v25 no cambiados, sin cron ni llamada WhatsApp.
- Sin respaldo real, sin activación de mensajes, token Whapi mostrado en una captura previa sin rotar y sin prueba E2E. [Acta 451](docs/451-mvp321-publicacion-piloto-sql-y-worker-inactivos.md).

## 08/11/2026 — MVP318: camino gratuito de respaldo y restauración comprobable (solo desarrollo)

- Supabase piloto: 94 tablas propias, 0 usuarios Auth actuales y 7 archivos privados Storage; solo lectura, sin exponer registros ni contactos.
- Script local Bash/WSL para exportación cifrada con age (roles, esquema, datos y originales), hash y validación de proyecto estricto; no ejecutado con datos reales.
- CI PostgreSQL17 sintético de backup personalizado y restauración en otra base, conservación de datos/funciones/permisos y rechazo de archivo truncado. No credenciales Supabase, no WhatsApp.
- [Decisión 448](docs/448-mvp318-resguardo-local-gratuito-y-restore-ci.md). **Ningún respaldo real restaurable verificado aún; sin publicar.**

## 08/11/2026 — MVP317: ensayo de migración atómica y rollback sin respaldo (solo desarrollo)

- La base piloto real pasa el preflight de roles MVP310: 3 participantes, 1 comprador, 2 proveedores, 0 incompatibilidades, 3 restricciones históricas existentes. Lectura exclusiva.
- En PG17 sintético, 9 migraciones MVP309–315 en una transacción; fallo inyectado en medio y chequeo de rollback integral, privilegios, huellas SHA y gates OFF. No conecta al piloto ni a WhatsApp.
- [Decisión 447](docs/447-mvp317-ensayo-transaccional-sin-respaldo.md). La ausencia de respaldo restaurable sigue siendo un riesgo real: un ROLLBACK no deshace una instalación ya confirmada. **Sin publicar.**

## 08/11/2026 — MVP316: preflight, guardias y prueba de concurrencia (solo desarrollo)

- Preflight read-only coteja 14/14 huellas SHA de RPC MVP311 y versión del claim heredado MVP222; reporte solo estados y contadores, sin PII.
- Guard SHA previo al primer DDL de MVP309, MVP312C y MVP314: abortar ante drift para no pisar contactos comerciales ni webhook existentes.
- Ensayo de dos sesiones PostgreSQL17 **aprobado en CI** con datos ficticios y cupos diarios compartidos para invitaciones y aviso al comprador, sin contacto Supabase real.
- Plan de migración MVP309–315, verificación de respaldos y restauración aislada documentado. **No se ha verificado respaldo de datos reales ni contratado Whapi. No publicar con Luz verde.** [Decisión 446](docs/446-mvp316-preflight-respaldo-concurrencia-publicacion.md).

## 08/11/2026 — MVP315: aviso autónomo al comprador después del despacho (solo desarrollo)

- Trabajador privado MVP314 complementado con un aviso único y seguro de enlace al arquitecto, sin requerir otro mensaje de WhatsApp. Exige todos los trabajos con aceptación Whapi e ID para la ronda.
- Nuevo paquete de comprador cifrado, HMAC y SHA, autorización y revalidación antes del HTTP, reutilizando tokens únicos MVP289/306, con límite SQL de 10 avisos diarios y sin reenvíos inciertos.
- Auditoría read-only del piloto y script de preflight: varios componentes MVP309–315 no instalados; Whapi Edge v70, MVP306 OFF. Test Node WebCrypto y PostgreSQL17 sintético con ROLLBACK; sin publicar ni activar.
- [Decisión 445](docs/445-mvp315-aviso-autonomo-comprador-preflight.md) · [PR #710](https://github.com/ProtectorRudo/Cotironda/pull/710).

## 08/11/2026 — MVP314: continuación de solicitudes por lotes (solo desarrollo)

- Nuevo trabajador Edge privado, apagado por defecto, que puede continuar hasta dos trabajos por invocación sin esperar nuevos mensajes del comprador.
- Cupos atómicos PostgreSQL para intentos diarios globales y por comprador; al habilitar MVP314, el webhook existente comparte el mismo presupuesto. Trabajos anteriores a la activación y resultados inciertos no se reenvían automáticamente.
- Pruebas de 1/2/5/20 destinatarios y fixture PG17 con rollback incorporados al [PR #709](https://github.com/ProtectorRudo/Cotironda/pull/709). Sin despliegue, programación automática ni prueba Whapi real. [Decisión 444](docs/444-mvp314-despacho-automatico-lotes-presupuestos.md).

## 08/11/2026 — MVP313: destinatarios cifrados por lease (solo desarrollo)

- IA Central deja de necesitar los dos números de la allowlist cuando se active expresamente el modo dinámico, que por defecto permanece apagado.
- SQL privado entrega exclusivamente sobre cifrado al trabajador con lease vigente, rol real, consentimientos y gates; Edge descifra con AES-GCM, valida HMAC/SHA y revalida antes del HTTP.
- Cola histórica preservada y no drenada en modo dinámico; se mantienen envíos limitados a 2 por evento y no se simulan nuevos permisos.
- Pruebas Node/PG17 con rollback, sin modificar el piloto. [Decisión 443](docs/443-mvp313-destinatarios-dinamicos-cifrados.md).

## 08/11/2026 — MVP312: vínculo WhatsApp administrado cifrado (solo desarrollo)

- Un alta de comprador/proveedor puede integrar en una operación administrativa el permiso previamente declarado y un número protegido por HMAC/AES-GCM. No se envían códigos de consentimiento ni se crean mensajes simulados.
- Nuevo registro SQL privado, inmutable, revocable por baja administrativa; bloquea duplicados de números y cruces de identidad. El contacto comercial del proveedor se incorpora al paquete cifrado tras cierre y comprador legítimo; teléfono del arquitecto permanece oculto.
- Pruebas Node de criptografía y PostgreSQL17 sintético con ROLLBACK. Sin modificar Supabase real, Whapi ni la lista fija de 2 receptores. El despacho dinámico queda pendiente. [Decisión 442](docs/442-mvp312-canal-whatsapp-admin-cifrado.md).

## 08/11/2026 — MVP311: multiidentidad real en 14 RPC del webhook (solo desarrollo)

- Auditadas 17 RPC antiguas con participantes fijos. Corregidas explícitamente las 14 referenciadas por la versión actual de WhatsApp y preservadas las 3 antiguas de finalistas, sin reabrir contactos recíprocos.
- Migración con huellas SHA-256 de baseline, fallando cerrada ante cambios imprevistos; roles, HMAC y permisos `service_role` conservados. Prohibida también la transferencia de una ronda entre compradores verificados.
- Pruebas PostgreSQL17 sintéticas con reversión completa y Node; sin cambios en piloto, producción, cron ni Whapi. [Decisión 441](docs/441-mvp311-rpcs-multiidentidad-sin-reabrir-finalistas.md).

## 08/11/2026 — MVP310: altas múltiples administradas (solo desarrollo)

- Eliminación controlada de tres restricciones históricas (único arquitecto y dos proveedores) y comprobación por rol real antes de crear una ronda.
- Alta privada del responsable con referencia única, registro automático de la declaración MVP309 y revocación efectiva; sin fabricar respuestas WhatsApp ni permisos por cada cotización.
- Nuevas pruebas sintéticas PostgreSQL17 con ROLLBACK y suite Node. Ningún cambio al piloto ni a producción.
- Limitación pendiente: vinculación cifrada segura del teléfono de nuevas personas, sin confirmaciones de autorización repetidas. [Decisión 440](docs/440-mvp310-altas-multiples-administradas.md).

## 08/11/2026 — MVP309: declaración de permiso previo por administrador (solo desarrollo)

- Diseñada constancia privada e inmutable por participante/rol, con base declarada por responsable y fuente, sin pedir mensajes de autorización repetidos.
- Conserva el circuito WhatsApp ya autenticado; previene publicación del teléfono del arquitecto, duplicados y reactivaciones tras revocación.
- Pruebas PostgreSQL17 sintéticas y Node. **No migrado ni publicado en cotironda-piloto**, no activa nuevas rondas.
- [Decisión 439](docs/439-mvp309-autorizacion-declarada-administrador.md).

## 07/11/2026 23:33 ART — Publicación en cotironda-piloto (MVP306–308)

- Instaladas las migraciones MVP306, MVP307 y MVP308 (identificadores Supabase 20261108023237, 20261108023255, 20261108023314). Webhook `cotironda-piloto-whapi` actualizado de v69 a **v70 ACTIVE**; 60 fuentes, tres archivos nuevos/cambiados comparados con GitHub.
- Aceptación inicial única por comprador/proveedor, RLS y roles de servicio validados; bloqueo de intercambio de teléfono del arquitecto vía finalistas antiguos, revelado comercial solo consentido al cierre.
- **Gate automático MVP306 OFF**; 2 rondas históricas abiertas preservadas; 0 consentimientos comerciales vigentes y 0 rondas creadas automáticamente. E2E WhatsApp real aún pendiente. Ni producción, ni `main`, ni Vercel, ni cron modificados.
- Ver [Acta 438](docs/438-mvp306-308-publicacion-verificada-piloto-v70.md) con auditoría y pasos pendientes.

## 07/11/2026 — MVP308: consentimiento único completo al alta (desarrollo)

- Registro versionado y verificable de condiciones en el mismo WhatsApp de incorporación, con alcance diferenciado por rol comprador/proveedor y sin confirmaciones por ronda. Datos personales del arquitecto nunca compartidos.
- Bloqueadas las 3 RPC antiguas de divulgación de datos de finalistas y el comando de alta antigua sin términos. Mantiene bases históricas sin crear permisos retroactivos.
- Incluye ensayo PostgreSQL17 con rollback, Node, Deno y CI. **Todavía sin desplegar**, sin WhatsApps reales, sin activar gates. [Decisión 437](docs/437-mvp308-autorizacion-unica-por-rol-y-privacidad.md), [PR #702](https://github.com/ProtectorRudo/Cotironda/pull/702).

## 07/11/2026 — Decisión 436: una sola aceptación inicial, ninguna autorización por ronda

- Política para todos los roles: aceptación única, informada, versionada y verificable al incorporarse, suficiente para todas las operaciones habituales que fueron expresamente informadas. El sistema no pide autorizaciones ni confirmaciones al comprador/proveedor por cada solicitud; sólo aclara datos esenciales.
- Revelación comercial de proveedores al cierre con base habilitante acreditada; la permanencia de usuarios históricos NO acredita consentimiento retroactivo a nuevos usos de sus teléfonos. Nunca se comparte automáticamente identidad personal ni contacto del arquitecto.
- Decisión de producto registrada sin código, sin cambios en gates, sin SQL ni publicación. [Acta 436](docs/436-politica-autorizacion-unica-al-incorporarse.md).

## 07/11/2026 — MVP307, desarrollo: autorización comercial en el mismo alta del proveedor

- Una sola frase autenticada `COTI ALTA <código> CONTACTOS SI`, con advertencia de divulgación comercial visible antes de aceptar y revocación `COTI CONTACTOS NO`. Transacción SQL vincula alta, original cifrado, contacto, consentimiento y fuente SHA/HMAC. La autorización antigua sigue siendo válida si se acredita individualmente.
- IA Central recibe catálogos sólo de proveedores consentidos cuando se habilite la liberación prospectiva MVP306, con revalidación al despacho, prevención de colisión de etiquetas y comprobación al cierre sin divulgar al arquitecto.
- Código, migración y ensayos Node/PG17 en [PR #702](https://github.com/ProtectorRudo/Cotironda/pull/702); pendiente verificar CI/E2E antes de cualquier publicación. **Sin despliegue ni mensajes reales.** [Decisión 435](docs/435-mvp307-alta-unica-consentimiento-y-ruteo.md).

## 07/11/2026 — MVP306 en desarrollo: cotización automática sin confirmación del comprador

- Se definió que el arquitecto no aprueba cada lista por mensaje: el broker de IA Central prepara la ronda y SQL valida fuente, cantidades, rubros, catálogo, zona y consentimiento antes de liberar despacho. Se conservan auditoría, protección del original y deduplicación.
- En nuevas rondas, al cierre el comprador podrá identificar a todos los proveedores invitados y disponer de sus contactos comerciales verificables, autorizados una sola vez al alta. **Nunca** se expone contacto o identidad personal del arquitecto al proveedor.
- Nueva propuesta con gate prospectivo OFF y autorización automática SHA/HMAC/SQL inmutable; rutas texto, ciudad y documento; seguimiento privado automático. CI unitario y PostgreSQL17 sintético pendiente de confirmación; aún faltan onboarding de consentimiento y filtro de proveedores antes del enrutamiento.
- **Solo rama de desarrollo:** PR [#702](https://github.com/ProtectorRudo/Cotironda/pull/702). No hubo despliegue, WhatsApp ni consumo de IA. [Decisión 434](docs/434-mvp306-sin-confirmacion-y-contactos-proveedor.md).

## 07/11/2026 — MVP305 activado prospectivamente en cotironda-piloto (publicación real)

- PR #700 fusionado y **42/42 CI verdes**. Whapi Edge v69 y recuperación v32 ACTIVE, con caption uniforme en 3 sender y aviso en PDF; seguimiento v25 vigente.
- `all_supplier_reveal_activation_mvp303.enabled=true` desde 07/11/2026 21:42 ART. Cinco rondas previas excluidas; tres enlaces históricos probados sin revelar empresas. No hubo mensajes nuevos, costos Whapi ni cambios de producción comercial.
- Teléfonos solo con opt-in específico: hoy 0. Finalistas viejos desactivados, cierre por cron existente activo. Falta E2E auténtico con canal WhatsApp operativo.
- [Auditoría 433](docs/433-mvp305-activacion-real-piloto-prospectiva.md).

## 07/11/2026 — MVP305: aviso a proveedores y activación de regla para rondas nuevas

- El usuario autorizó el modo: al cierre se identifican todos los proveedores invitados, y los contactos siguen con opt-in propio.
- Caption unificada en los 3 caminos de envíos PDF Whapi (normal, IA Central y recuperación), más pie del PDF para que el proveedor sea informado antes de cotizar.
- Preparación de activación prospectiva de MVP303: jamás tocar solicitudes anteriores; no reactivar Whapi ni notificaciones de dos finalistas.
- [Decisión 432](docs/432-mvp305-activacion-prospectiva-revelado-comercios.md).

## 07/11/2026 — MVP303/MVP304 publicados solo en piloto (compuerta de revelado OFF)

- Instaladas migraciones SQL en `cotironda-piloto`; funciones privadas de nombres/comunicación postcierre, solamente `service_role`, probadas sin acceso anon/auth.
- Edge `cotironda-piloto-seguimiento` v25 ACTIVE y web Vercel del piloto desplegada en el commit `6ab1632581ca054b985a309cf71a9b85ac2831d0`, READY, HTML/JS HTTP 200, GET de API 405.
- `all_supplier_reveal_activation_mvp303` OFF y sin activación retroactiva. 0 opt-ins de contactos, 0 mensajes de finalistas, planificador viejo OFF. Whapi sigue sin reactivación.
- No certificado E2E genuino. [Reporte 431](docs/431-publicacion-mvp303-304-piloto.md).

## 07/11/2026 — MVP304: contactos consentidos de todos los proveedores al cierre (SIN PUBLICAR)

- Implementado puente privado read-only de todos los contactos post-cierre con consentimiento autenticado individual y criptografía AES-GCM+HMAC.
- Edge/Proxy/Web muestran opción de WhatsApp solo para proveedores con consentimiento vigente; el resto mantiene nombre y estado. No hay top dos, adjudicación ni WhatsApps salientes.
- Pruebas sintéticas PG17 y WebCrypto en CI; no se cambiaron datos ni secrets de piloto; Whapi sigue sin servicio activo.
- [Decisión 430](docs/430-mvp304-contactos-todos-consentidos-al-cierre.md).

## 07/11/2026 — MVP303, política comercial corregida: revelar TODOS los proveedores al cierre (SIN PUBLICAR)

- Se reemplazó la política de hasta dos finalistas por la revelación de identidad de todos los proveedores invitados, una vez vencido el plazo y cerrada la ronda. Nunca antes. No es adjudicación ni comparación económica.
- Nueva RPC propuesta con token privado, consentimiento, cierre, activación prospectiva OFF; incluye estados de respuesta, revisión y envío no confirmado, más alias de oferta verificada cuando existe. NO revela teléfonos ni contactos sin consentimiento propio.
- Reducidor Edge y whitelisting independiente del proxy Vercel, vista móvil para lista sin máximo de dos, pruebas sintéticas de privacidad y PostgreSQL17 con rollback.
- La optimización económica con hasta dos proveedores no selecciona quién se identifica. [Decisión 429](docs/429-mvp303-revelar-todos-proveedores-al-cierre.md).

## 07/11/2026 — MVP302, puente privado IA Central a finalistas (SOLO DESARROLLO)

- Nueva RPC propuesta `cotironda_piloto_ia_finalist_sources_mvp302(uuid)`, service_role-only, sin escrituras ni envío, para última fuente verificada, cierre y consentimientos.
- Selector TS privado de alternativas anónimas por cobertura de 1-2 proveedores, sin selección automática, precios ni datos de contacto en el resultado.
- PG17 efímero simula ronda cerrada con dos proveedores, corrupción de SHA y opt-out; transacción se revierte. No se publica SQL ni se activan finalistas. Falta adjudicación manual autorizada e E2E real con Whapi activo.
- [Decisión 428](docs/428-mvp302-puente-ia-finalistas-privado.md).

## 07/11/2026 — MVP301, finalistas offline (NO PUBLICADO)

- Planificador determinista privado de cobertura de 1-2 proveedores, con validación real de importes MVP225; sin sumas engañosas, envío de WhatsApp, contactos, ganadores ni gastos.
- Tests sintéticos de plan, cobertura, cierre y rechazo de precios sin respaldo; CI conjunta con la ronda simulada MVP284.
- Auditoría SQL read-only del piloto: 0 ofertas IA Central verificadas, 1 revisión, 0 planes de finalistas; funciones v196 instaladas pero sin dependencia del ledger v227. Queda pendiente puente seguro y aprobación humana, por lo que E2E NO está certificado.
- [Decisión 427](docs/427-mvp301-finalistas-offline-ia-central.md).

## 07/11/2026 — MVP300 (solo desarrollo y auditoría real de lectura)

- Testigo SQL read-only en piloto: IA/Whapi/dispatch ON; una ronda confirmada, 2 despachos `api_accepted` con ID, 1 proveedor que respondió, 1 revisión privada, 0 ofertas verificadas/visibles. No acredita dos respuestas ni el cierre/contactos E2E.
- Clasificador determinista de etapas que rechaza certificación E2E por contadores de base o CI; tests sintéticos anti-PII y no WhatsApp, con regresión del circuito MVP284 y de MVP299.
- No hay despliegue de MVP300, consumo de IA, mensajes o cambios de base. [Acta 426](docs/426-mvp300-testigo-e2e-piloto-solo-lectura.md).

## 07/11/2026 — Publicación verificada MVP298 + MVP299 solo en Cotironda piloto

- Autorización «Publicalo» aplicada solo a Supabase `cotironda-piloto` (Whapi **v68**, seguimiento **v24**, **84 migraciones**) y Vercel **cotironda-seguimiento-vista-piloto**; el alias estable del seguimiento del comprador se reasignó y verificó a `dpl_FoY1XhAXg5hWVjxmfYQnh6NEYjWc` (commit `55bba473`, estado READY).
- RPC nueva `public.cotironda_piloto_ia_pending_coverage_mvp299(text)`: sólo `service_role` puede ejecutarla; prueba de token inválido y ronda válida sin respuestas nuevas aprobada. No exhibe fuente, importe, identidad ni ranking.
- Módulos Edge cotejados byte a byte con Github y CI de desarrollo: MVP298 14/14; MVP299 27/27 y 34/34 focalizados. Históricos: una revisión privada, cero ofertas IA verificadas; sin relectura, mensajes, cambios de cron ni secretos.
- Vercel informó build completo y READY; **sin smoke HTTP externo desde esta sesión**, ni ronda E2E real. No afecta el portal principal ni el branch `main`. [Acta 425](docs/425-mvp299-separacion-respuestas-sin-precio-comparable.md).

## 07/11/2026 — MVP299 (PR #692 fusionado solo a desarrollo; 27/27 CI y 34/34 pruebas específicas, sin publicar)

- Nuevo resumen privado de fuente interpretada **sin precio comparable** (lista cerrada de motivos seguros). Una fuente no conciliada o atribuida de forma insegura permanece en revisión invisible.
- RPC opcional service_role + DTO estricto + Edge + proxy Vercel + pantalla por rubro, sin revelar identidad, fuente, precios, contactos o adjudicación.
- Pruebas sintéticas Node/Deno/PG17/JavaScript; sin desplegar ni reenviar IA/WhatsApp. Ver [decisión 425](docs/425-mvp299-separacion-respuestas-sin-precio-comparable.md).

## 07/11/2026 — MVP298 (desarrollo, no desplegado)

- MVP225: cotejo de doble lectura por hechos económicos verificables, no glosas ni spans alternativos de citas igualmente fundadas.
- Tres pruebas sintéticas nuevas: glosa/cita de moneda equivalente; IVA sustentado por distintas citas; cambio literal del importe unitario rechazado.
- Sin SQL, WhatsApp, despliegue, llamadas OpenAI, producción o reanálisis histórico. Detalles y límites: [decisión 424](docs/424-mvp298-acuerdo-economico-doble-lectura.md).

## 2026-11-07 — MVP297: diagnóstico privado de revisión semántica (solo desarrollo)

- Se conserva el primer motivo verificable de una futura revisión comercial: estructura, cita textual, moneda, IVA/flete/pago, cargos monetarios omitidos, mapeo de artículo, segunda lectura inválida, discrepancia entre dos lecturas o indisponibilidad del modelo. Sólo códigos de una allowlist, sin fuente ni importes, dentro de la tabla privada ya existente.
- Se preservan los resultados económicos, privacidad, cuotas, estado de publicación y decisión de cero reintentos de IA; no se modifica piloto ni producción. El motivo exacto del evento histórico de Nahuel no fue persistido y **no se inventa retrospectivamente**. Ver [Decisión 423](docs/423-mvp297-diagnostico-privado-revision-semantica.md).

## 2026-11-07 — Publicación piloto MVP295 y corrección MVP296

- **Solo `cotironda-piloto`**: PR [#686](https://github.com/ProtectorRudo/Cotironda/pull/686) integrado (13/13 CI), migración 82 y seguimiento v23; PR [#687](https://github.com/ProtectorRudo/Cotironda/pull/687) integrado (12/12 CI), migración 83 y worker privado v8. `main`, producción, Whapi v66 y cron documental v31 intactos.
- El texto histórico de Nahuel está ligado por correlación semántica única; una cola adicional permite interpretarlo económicamente con IA Central solo si están activos los 3 controles consentidos, la autorización en BD, consentimiento del comprador/proveedor, HMAC/SHA, invitación realmente enviada, vigencia y cuota/registro de llamadas. Antiguo análisis sin medidor desactivado; MVP295 instrumenta MVP264 y registra versión comercial.
- Primera oferta verificada de IA Central podrá aparecer por rubro aunque `can_open` legacy sea falso. Datos de Ailín todavía indistinguibles quedan en revisión privada, sin adjudicación automática.
- Seguridad publicada comprobada: RLS y ACL restrictivas en SQL, Edge con doble autorización y prueba HTTP sin credenciales `401`, archivos comparados con GitHub. **El resultado final del cron y la aparición de una oferta económica verificada siguen pendientes de auditoría E2E**. No declarar precio, ranking ni publicación comercial antes de ver las filas reales.
- Registro de alcance: [decisión 421](docs/421-mvp295-continuidad-cotizacion-comercial-vinculada.md) y [decisión 422](docs/422-mvp296-activacion-controlada-recuperacion-comercial.md).


- **Prueba real 16:45 UTC:** el cron procesó la fuente histórica de Nahuel una vez; quedó `ai_supplier_linked_replay_mvp295=review` y `ai_supplier_review_mvp227=review/semantic_review_required`, 2 llamadas de modelo con 3.503 tokens observados. No se publicó precio ni ranking; cero reintentos. El documento de Ailín sigue en revisión ambigua. La causa específica de la revisión semántica no se registra aún; no inventar una.

## 2026-11-07 — MVP295: de vínculo histórico a oferta comercial segura (desarrollo)

- Auditoría piloto **solo lectura**: proveedor Nahuel respondió texto y la fuente fue vinculada automáticamente, pero no llegó a la revisión comercial; proveedor Ailín envió documento ambiguo que permanece privado. Cero publicaciones desde esas fuentes; existe una versión previa independiente de Ailín.
- Corrección propuesta en rama: excepción de antigüedad de 7 días SOLO para textos ya auto-vinculados de forma única y consentidos, cola de interpretación idempotente, cupo 6/día, uso medido de IA Central MVP264, fuente/versiones inmutables, cero WhatsApps.
- Se elimina la dependencia circular de `tracking.can_open` para que una primera oferta IA segura pueda abrir el seguimiento por rubro. Precios no verificados no se publican.
- **NO publicado en Supabase**. [Decisión 421](docs/421-mvp295-continuidad-cotizacion-comercial-vinculada.md).

## 2026-11-07 — Publicación controlada MVP291/MVP292 en cotironda-piloto

- Integrado [PR #683](https://github.com/ProtectorRudo/Cotironda/pull/683) mediante commit `b2dac7378c323f5f368f1da808664d00fab7f480`, **31/31 CI**.
- Aplicadas tres migraciones privadas (total 81), webhook Whapi `v62 ACTIVE` y recuperador interno `v1 ACTIVE` con JWT obligatorio. RLS y RPC de nuevo módulo verificados: 0 permisos de ejecución para anon/auth.
- Las nuevas rutas de atribución y recuperación necesitan activación explícita de secretos de Edge que este conector no administra; no se instaló scheduler ni se ejecutó backfill real. Sin E2E real no afirmar automatización comercial cerrada.
- Evidencia, límites y pasos de habilitación: [entrega 418](docs/418-mvp291-mvp292-publicacion-piloto.md). Producción intacta.

## 2026-11-07 — MVP292 texto de proveedores e históricos (SOLO desarrollo)
- Incorporada interpretación de mensajes libres de proveedor por doble lectura con citas literales de materiales, cantidades y unidades, excluyendo precios para asignar identidad de ronda.
- Implementado broker de SQL privado para texto con el motor de atribución MVP291, consentimientos, HMAC, SHA, despacho anterior y una asociación atómica; revisión económica comercial independiente.
- Agregados registro de recuperación histórico de fuentes cifradas y documentos originales, cuotas y worker interno segregado de WhatsApp, con secreto independiente, gates OFF y cero envíos. Pruebas Node/Deno/PG17 sintético con ROLLBACK en PR #683; sin publicación ni E2E real. Decisión docs/417.

## 2026-11-07 — MVP291, correlación autónoma (desarrollo)
- Sustituido el enfoque descartado de elección manual del proveedor (PR #682) por la correlación de ofertas documentales mediante dos lecturas IA Central + cuantificación determinista y despacho previo acreditado.
- En caso inequívoco, SQL service_role vincula un único pedido, fuente/archivo SHA y auditoría atómicamente. Si existen dos candidatos indistinguibles, retiene sin enviar aclaraciones ni publicar precios.
- Incluye PG17 sintético con rollback, contratos Node, RLS y flags OFF. Sin cambios en piloto real/producción. [Decisión 416](docs/416-mvp291-correlacion-automatica-sin-friccion.md), PR #683.

## 2026-11-07 — MVP289 (solo desarrollo)
- Corrige la ausencia de confirmación y enlace privado tras `CONFIRMAR COTI`: el bloque nuevo se ejecuta después de despachos aceptados y se reutiliza el seguimiento existente sin nuevas invitaciones.
- Nueva RPC privada, idempotente, token único por ronda, registro de entrega Whapi y comando seguro `SEGUIMIENTO COTI` para rondas históricas confirmadas sin enlace. Pruebas Node y PG17 con rollback; no publicar sin autorización y verificación.
- Decisión: [414](docs/414-mvp289-confirmacion-y-enlace-seguimiento.md); Issue #679.

## 2026-11-07 — MVP288: evidencia original para descripciones comerciales, cantidades legibles y corrección ligada (desarrollo)

- Preservación de presentaciones literales de la fuente verificada: «20 bolsas de cemento CPC de 50 kg», «3 bolsones de arena», sin truncar ni inventar medidas.
- Vista de revisión y PDF proveedor comparten unidad contextualizada y formato exacto de cantidad (20, 3, 1.25) sin ceros decimales innecesarios.
- Corrección por WhatsApp con referencia `CORREGIR COTI <código>: <pedido completo>`: nueva revisión vinculada al pedido anterior; el código de la revisión anterior caduca en la misma transacción y no autoriza despachos. Sin mutación de ofertas originales.
- Tests Node y PostgreSQL 17 acumulativo con rollback; PR de desarrollo, no publicado en piloto. Ver decisión 413 e Issue #677.

## 2026-11-07 — MVP287: segundo mensaje recibido, validación semántica y comprobantes de Whapi

- Fuente del comprador coincidente por SHA256 con ejemplo recomendado; su lectura IA fue bloqueada por `lecturas_discrepan_en_articulo`, sin ronda. Se aceptarán subcitas literales solapadas del mismo artículo y unidades de conteo equivalentes sin convertir cantidades, presentaciones ni rubros.
- Whapi había registrado un aviso como `api_accepted` con ID pero **sin evidencia delivered/read**. Se extiende el RPC de estados privados para avisos al comprador con validación de ID, HMAC, destinatario y precedencia; no retransmite.
- Revisión de transporte: `sent:false` o fallo declarado por API nunca se considera aceptado aunque haya HTTP 200. Nuevas pruebas Node y PG17. Ver decisión 412 / Issue #675.

## 2026-11-07 — MVP286: comprador sin respuesta por fallo semántico IA Central (desarrollo)

- Incidente real: Whapi recibió el mensaje del arquitecto a las 03:11 AR; IA Central finalizó en `review/semantic_review_required` antes de consultar catálogos; 0 rondas y 0 revisiones de comprador. No se puede recuperar la causa HTTP exacta anterior porque el código la ocultó y la traza de uso no fue persistida.
- OpenAI: clasificación segura de fallas de autenticación, cuota, 400, 5xx, timeout y estructura, sin almacenar texto, tokens, respuestas ni credenciales. El broker registra un motivo allowlisted en SQL.
- Aviso de fallo al comprador: reserva SQL privada con permiso y cuota de 2/24h, idempotencia por mensaje, 10 min, reconocimiento de Whapi ID verificable y estado `uncertain` sin reenvío si falta. No crea invitaciones ni cotizaciones.
- Pruebas Node y PostgreSQL17 transaccionales en CI; ningún intento de retransmisión del mensaje del 03:11. Pendiente de publicación solo en PILOTO y prueba real de un nuevo pedido. Ver decisión 411 / Issue #673.

## 2026-11-07 — MVP285: activación controlada de cotironda-piloto (sin gastos)

- Ensayo en base real PostgreSQL 17 de 21 migraciones MVP245–280, rollback verificado, luego instalación atómica (73 migraciones incluyendo resguardo interno). Gate operador SQL adicional instalado (74 migraciones), probado en laboratorio PG17 y solo service_role.
- Resguardo interno dentro de Supabase: 63 tablas/244 filas, 132 rutinas y 431 constraints/triggers, RLS y ACL privadas. No equivale a backup externo ni restaura archivos Storage.
- WhatsApp Edge v55/v56/v57 ACTIVE. Nuevo gate operator SQL controla revisión, confirmación y publicación de comprador; variables explícitas false siguen vetando envío. Integración activa sólo para el comprador y los dos proveedores consentidos, prueba sin expiración corta.
- Cero mensajes reales enviados por la instalación. Seguimiento, cotización de proveedores, ranking y notificaciones finales **pendientes de E2E con nuevo mensaje real**. Cuotas de costos intactas; tres crons preexistentes sin cambios. Ver decisión 410.

## 2026-11-06 — MVP284: E2E integrado sintético + despacho Whapi sin ID (solo desarrollo)

- E2E PostgreSQL17 en una transacción: comprador con 3 rubros, revisión íntegra, confirmación de un solo uso, 3 PDFs de proveedores, 2 respuestas correlacionadas, proyección anónima y sin ranking engañoso; prueba modo continuo de recepción de respuestas tras apagado de nuevos pedidos y rollback integral.
- Adaptadores TypeScript de Edge probados juntos con RPC y Whapi simulados; regresiones existentes de cierre/finalistas y capacidad 12x30 ejecutadas separadamente sin redes.
- Corrección: respuesta Whapi aceptada pero sin identificador válido pasa a `uncertain`, sin reenvío; MVP280 endurece el RPC de finalización de despacho. IDs ausentes ya no marcan entrega API aceptada que no pueda correlacionarse.
- Sin alteración de la base piloto, Edge, Vercel, cron, secretos, WhatsApps ni costos. **Aún falta dump fiel PG17 y prueba real antes de publicar.** Ver decisión 409 / Issue #669.

## 2026-11-06 — MVP283: instalación acumulativa PG17 sintética (solo desarrollo)

- Implementado un único ensayo SQL que instala sucesivamente las **21 migraciones MVP245–280** en un mismo esquema PostgreSQL17 sintético, con rollback integral. CI acumulativo PASS.
- Se corrigieron dos diferencias en el bootstrap de prueba (faltaban comprobantes históricos MVP119 y columnas de `media_archive_mvp095`); contrastadas contra catálogo real, **sin modificar** `cotironda-piloto`.
- Inventario estructural real auditado solo lectura: 63 tablas privadas, 428 columnas, RLS habilitado en las 63, 20 funciones privadas y 112 funciones públicas Cotironda. El esquema sintético NO reproduce la totalidad de esas estructuras.
- Se añadió bloqueo de CI para conexión local PG17 y [decisión 408](docs/408-mvp283-coinstalacion-pg17-y-fidelidad-esquema.md). **Sigue pendiente el ensayo sobre un dump completo de solo esquema antes de `Publicalo`.** Nada publicado ni gastos.

## 2026-11-06 — MVP282 corrección de vencimiento de aprobación comprador y prueba de 21 SQL

- Detectada una carrera real en PostgreSQL17: dos lecturas de reloj podían dejar `expires_at` unos microsegundos más tarde que `created_at + 24h`; constraint impedía emitir revisión. MVP279 y MVP280 ahora usan un único `issued_at` para ambas marcas temporales.
- Agregada aserción exacta de 24 horas en fixtures PostgreSQL 17 de MVP279 y MVP280; sus dos workflows específicos y el ensayo de 11 fixtures MVP282 aprobaron tras corregir.
- Preflight read-only ejecutado en `cotironda-piloto`: 19/19 dependencias examinadas presentes; sin migraciones instaladas ni cambios de estado.
- **Riesgo residual explícito:** estas pruebas verifican cobertura modular de 21 SQL, no su instalación acumulativa sobre schema-only de MVP239; pendiente antes de publicar.

## 2026-11-06 — MVP282: ensayo integrado por cobertura (solo desarrollo)

- Se vinculan los 21 SQL de MVP281 con 11 pruebas PostgreSQL17 ya existentes, verificando imports, BEGIN/ROLLBACK, aislamiento y ausencia de salida externa. Nuevo workflow de ejecución secuencial de los once fixtures y pruebas adversariales de conexión.
- Precisión de auditoría: 11 fixtures rollback independientes **no demuestran** instalación simultánea de 21 SQL sobre esquema completo de piloto; queda bloqueada toda afirmación de publicación. Decisión 407 e Issue #665.
- No se modificó Supabase PILOTO, Edge, Whapi, cron, Vercel ni costos.

## 2026-11-06 — MVP281: preflight de integración segura de IA Central (solo desarrollo)

- Issue #663: manifiesto de 21 SQL candidatos MVP245–280, verificado en orden sin migraciones manuales, rollback ni cron supervisor.
- Nuevo preflight SQL de solo lectura ejecutado sobre `cotironda-piloto`: 9 componentes inspeccionados, 0 instalados; los 4 gates apagados, 0 despachos inciertos y 3 cron históricos activos.
- Test Node y workflow de integridad del manifiesto, decisión 406 y plan escalonado de publicación futura. **No se instalaron migraciones ni se desplegó Edge/Vercel; no se enviaron WhatsApps y no se generaron cargos nuevos.**
- CI de MVP280 aprobado en GitHub; Vercel devuelve chequeos fallidos por límite de builds, sin ampliar plan. Falta una autorización `Publicalo` y E2E real antes de considerar el piloto operativo.

## 2026-11-06 — MVP280: confirmación única del comprador en texto, TXT/CSV y PDF/Office (solo desarrollo)

- La IA Central prepara rondas `en sombra` para texto, continuación de localidad, TXT/CSV y PDF/DOCX/XLSX; todas las rutas de publicación directa del webhook están deshabilitadas. El comprador revisa antes de generar invitaciones, mediante un único código firmado, no «sí» genérico.
- Nueva fuente SQL `fuente_revisable_mvp280` corrobora el texto original de WhatsApp, SHA del TXT/CSV almacenado o doble SHA de PDF/Office, identidad, consentimientos y existencia del objeto privado. Los cuatro gates SQL de publicación, búsqueda, reclamación y PDF exigen la misma confirmación y revalidan la versión completa.
- Switches `COTIRONDA_PILOT_BUYER_REVIEW_SEND_ENABLED`, `..._CONFIRM_ENABLED`, `..._RELEASE_ENABLED` y `..._REQUIRED_ENABLED`, todos OFF por defecto. Confirmaciones fuera de la IA, sin pérdida de materiales, sin enviar WhatsApps por un cambio de código.
- PG17 sintético con tres fuentes, tests Node, Deno y regresiones, rollback manual conservando auditoría y decisión 405. **No hubo despliegue, nuevos gastos ni envío real; backup contratado continúa en Plan B.**

## 2026-11-06 — MVP279: revisión explícita comprador por WhatsApp (solo desarrollo)

- Un pedido binario comprobado por IA Central queda en sombra hasta que el comprador apruebe una versión exacta de **todos** los materiales, cantidades, rubros y zona; el SHA incluye además destinos y fuentes originales. Código aleatorio de un solo uso y respuesta WhatsApp firmada vinculados a la versión, sin aceptar «sí» genérico.
- Previsualización de la lista completa para comprador (no precios/identidad de proveedores), sender Whapi con una única reserva y sin reenvío tras resultado incierto. Confirmación y liberación a proveedores tienen banderas independientes, todas OFF por defecto.
- Las RPCs de publicación, selección, reclamación y PDF rechazan binarios sin aprobación válida, incluso si un servidor intenta saltarse el webhook. PG17 adversarial, Node+Deno, rollback manual que conserva evidencias y documentación decisión 404.
- **Sin despliegue ni envío de WhatsApps reales; respaldo pago en plan B, prueba E2E y costos reales pendientes.**

## 2026-11-06 — MVP278: origen PDF/DOCX/XLSX autorizado por doble SHA (solo desarrollo)

- PostgreSQL: atestación privada de original binario y texto derivado con dos SHA-256, versión de lector y cantidad completa de artículos acreditados; revalidación de Storage, HMAC, comprador y consentimiento en las cuatro puertas SQL de IA Central.
- El bridge Edge usa la lectura independiente MVP277 y pasa el texto derivado al broker, sin convertir un archivo en mensaje `kind=text`; documento solo puede quedar en **ronda en sombra, no envío ni publicación** hasta confirmación del comprador.
- Pruebas adversariales PostgreSQL17/Node/Deno, rollback manual conservando tabla de evidencia y documentación decisión 403. Despliegue, crons, WhatsApp y consumo real sin cambios; infraestructura de backup pago sigue Plan B.

## 2026-11-06 — MVP277: verificación independiente de originales PDF/DOCX/XLSX comprador (solo desarrollo)

- Lectura de PDF con posiciones reales de texto, y Office OpenXML con controles ZIP/CRC/hojas ocultas/fórmulas, reutilizando lectores existentes.
- SHA-256 de bytes originales + doble lectura documental: prueba cantidades y unidades en su misma línea física; rechaza 26+ líneas, hojas escaneadas, cifras extra, materiales omitidos y fuentes alteradas.
- Bandera Edge opt-in `COTIRONDA_PILOT_BUYER_BINARY_CENTRAL_PREVIEW_ENABLED`, inicialmente OFF, que produce **solo previsualización privada**; no crea rondas ni mensajes.
- Pruebas sintéticas Node y PDF real generado con Deno/unpdf, documentación decisión 402. La RPC MVP276 sigue limitada a TXT/CSV; no hay autorización PDF/XLSX/DOCX para enviar, ni E2E real.
- Sin migraciones, despliegue, cron, WhatsApp o gastos nuevos. Respaldo pagado en Plan B.

## 2026-11-06 — MVP276: autoridad de fuente documental TXT/CSV para IA Central (desarrollo)

- Extiende cuatro funciones SQL de reserva, staging, publicación y despacho, preservando la ruta de texto, con un helper privado que verifica origen Whapi + participante consentido + original Storage cifrado + MIME + SHA binario exacto.
- Prueba transaccional `BEGIN/ROLLBACK` de la migración sobre PostgreSQL 17 de `cotironda-piloto`: compatibilidad y ACL comprobadas, helper no persistido, flags IA/despacho OFF.
- Rollback manual a las cuatro funciones originales con precondiciones de ningún pedido documental abierto y puertas IA desactivadas.
- Conexión de TXT/CSV al broker `procesarCompradorCentralMvp226` con plan semántico reusado una sola vez (sin repetir IA), preservación SHA del original, idempotencia y flags independientes para staging/publicación OFF por defecto.
- Suite PostgreSQL 17 con compradores ficticios y pruebas adversariales Node/Deno; documentación decisión 401. **No se instaló en PILOTO, no se desplegó Edge ni se enviaron WhatsApps.**

## 2026-11-06 — MVP275: puente comprador documental IA Central (solo lectura)

- Diagnóstico seguro de compradores con TXT/CSV: comprueba bytes originales SHA-256, UTF-8 estricto, dos lecturas idénticas y cantidades/unidades/descripciones literales por fila antes del planificador semántico.
- El planificador solo puede invocar lectura privada de catálogo; la previsualización no escribe rondas, no envía WhatsApps ni suplanta el texto de un archivo en SQL.
- Bandera Edge opt-in `COTIRONDA_PILOT_BUYER_DOCUMENT_CENTRAL_PREVIEW_ENABLED` inicialmente OFF; al usarla no corre simultáneamente el preparador documental legado. PDF/Excel/fotos sin evidencia independiente quedan en revisión.
- Tests sintéticos y CI específica, documentación en decisión 400. **No se instaló ni activó en PILOTO, no se creó respaldo real y no se realizó E2E**.

## 2026-11-06 — MVP274: modo de piloto continuo, sin costos nuevos (solo desarrollo)

- Decisión 399: respaldos ZIP e infraestructura de ejecución privada a plan B; sin gastos nuevos. El objetivo inmediato es probar Cotironda de punta a punta con sus 3 participantes consentidos.
- Ampliación segura del gate temporal MVP229: además de ventanas de hasta 4 horas, puede mantenerse indefinidamente en modo piloto SOLO mediante futura activación explícita `expires_at=NULL`; la instalación deja `enabled=false`.
- La RPC conserva las protecciones MVP230 de respuestas de proveedores previamente invitados, allowlist, consentimiento, ACL exclusiva `service_role` y las puertas separadas de IA Central y despacho.
- Se conservan cuotas y límites reales de capacidad: **sin vencimiento temporal no implica uso ilimitado de IA/WhatsApp**. PG17 sintético con rollback y restauración manual del modo previo.
- SQL, Edge, WhatsApp y producción **sin cambios reales**; prueba E2E y estrategia de copia recuperable siguen pendientes.

## 2026-11-06 — MVP273: ensayo aislado de recuperación de ZIP móvil (solo desarrollo)

- Nuevo replay estricto de TAR Storage descifrado: SHA-256 y tamaño físico de cada objeto versus índice, encabezados USTAR, rutas, padding, orden y cola, sin escribir documentos en claro.
- Comando de comprobación del ZIP age que valida Storage por streaming y SQL cifrado en PostgreSQL17 efímero Docker, con `--network=none`, sin puertos, rootfs readonly, tmpfs, swap/logs deshabilitados, limpieza obligatoria.
- Pruebas adversariales con TAR y ZIP age reales **de archivos ficticios**; CI para PostgreSQL 17 Docker real solo sobre tablas sintéticas, y regresiones generales.
- El replay nunca afirma restaurar Supabase gestionado: `restore_verified:false` y descarga Android pendiente. **Sin acceso a datos reales, sin despliegue ni costos nuevos**. Decisión 398.

## 2026-11-06 — MVP272: verificación age real de ZIP móvil (desarrollo)

- Nuevo auditor local y desconectado `audit-pilot-mobile-ciphertext-mvp272.mjs` para los seis archivos age de ZIP MVP269; verifica SHA externo, nombres exactos, manifiesto, permisos, identidad age y autenticidad de descifrado sin escribir texto claro.
- CI dedicada con cifrado real age sobre datos sintéticos, claves incorrectas, ciphertext alterado, ZIP adulterado y ausencia de afirmaciones falsas de restauración.
- Se impide la ejecución con credenciales Postgres/Storage, en CI productiva, Vercel y carpetas inseguras. **No hubo copia auténtica ni restore del piloto, y no se habilitó una descarga móvil.** Decisión 397.

## 2026-11-06 — MVP271: comando privado para ZIP cifrado de todo el piloto (desarrollo)

- Exportador SQL PostgreSQL 17 **solo cotironda-piloto** con URL fijada a la referencia de Supabase, snapshot compartido para datos y esquema, cifrado age en streaming y limpieza segura ante fallas.
- Proceso único que reúne cinco piezas SQL y el TAR cifrado de Storage MVP270, sella el manifiesto MVP269 y entrega un único ZIP de ciphertext con SHA-256 sin generar enlaces públicos.
- Se impide sobrescribir salidas y borrar ZIP de otra operación; fuente reservada con mkdir exclusivo; no CI, Vercel, otras instancias, ni exportaciones en texto claro.
- Pruebas sintéticas de snapshot, conexión a proyecto equivocado, recuperabilidad del destinatario, composición ZIP y situaciones adversas. **No se hizo extracción real, validación de restore ni publicación.** Decisión 396.

## 2026-11-06 — MVP270: exportador cifrado de Storage para respaldos móviles (desarrollo)

- Exportación pasiva **solo PILOTO** de objetos de buckets privados a `storage_objects.tar.age`, mediante descarga autenticada, TAR de rutas opacas y cifrado streaming age. Nunca guarda PDFs/Excel/imágenes descifrados en disco.
- Inventario antes/después, hash individual y cantidad exacta de bytes, límites explícitos, prevención de SSRF/redirecciones, errores de permisos, truncamientos y limpieza al fallar.
- Seguridad: host Supabase hardcodeado, identidad age comprobada, credenciales solo del host privado y bloqueo expreso de CI/Vercel/Windows; Node tests sintéticos y workflow propio.
- No es backup completo ni restore verificado; **aún faltan extracción PostgreSQL para PILOTO, ejecución real privada, restore y enlace móvil**. No se tocó el PILOTO ni producción.

## 2026-11-06 — MVP269: paquete ZIP móvil de respaldo cifrado (solo desarrollo)

- Creador de un único ZIP que incluye exclusivamente cinco exportaciones SQL previamente cifradas con age y una exportación también cifrada de bytes de Storage; no descifra ni expone contenido.
- Manifest SHA-256, comparación real ZIP ↔ fuente, permisos 0700/0600, rechazo de enlaces, rutas inseguras, CI/entorno público, archivos inesperados, componentes ausentes, cambios concurrentes y sobrescrituras.
- Reconocimiento explícito: fuente real, cobertura Storage y restauración **NO acreditadas**. La copia real y el enlace privado aún no existen; plan de extracción/restore/entrega en decisión 394.
- Supabase `cotironda-piloto` verificado en solo lectura: 3 rondas, 1 bucket privado, 6 objetos (302.406 bytes reportados por metadatos). Sin modificación de SQL, Vercel, WhatsApp o producción.

## 2026-11-06 — MVP268: preflight real y reproducible de activación del piloto (solo lectura)

- Consulta nueva de diagnóstico SIN efectos secundarios en `cotironda-piloto`: PostgreSQL 17.11; cuatro gates OFF, 0/12 objetos MVP256–267 instalados, tres cron preexistentes activos, 0 usuarios Auth y sin salida `uncertain` en los dos ledgers observados.
- Informe separado de **precondiciones técnicas para preparar instalación** frente a evidencia operativa faltante; nunca declara WhatsApp E2E, MFA real ni permiso de publicación. No confundir cinco `api_accepted` con entrega.
- Contratos Node y ensayo PostgreSQL17 reversible de configuración conservadora/insegura, sin escribir en el proyecto conectado. Decisión 393.
- **Solo desarrollo:** sin instalar migraciones, modificar flags, activar cron, publicar Vercel ni enviar WhatsApps.

## 2026-11-06 — Etapa 7 / MVP267: operador de IA Central con sesión Auth vigente y MFA

- Vinculación única y privada de operador interno con usuario Supabase Auth exclusivo del PILOTO; ninguna alta automática. Un token con sesión ausente/revocada, JWT ajeno, cuenta anónima, operador inactivo o sin AAL2 no obtiene permisos.
- Cuatro RPC de `authenticated` que resuelven al operador desde `auth.uid()` y `auth.sessions` — no aceptan UUID de operador entregado por el cliente — y reutilizan bitácora MVP265 y conciliación de consumo desconocido MVP266.
- Backend Next.js privado con clave publicable y JWT del propio operador (sin `service_role`), endpoints para alertas, tokens, revisión de casos y gasto incierto. Gate Preview por SHA, origen y entorno, apagado por defecto, respuestas privadas y no-store.
- Pruebas PG17 reversibles, contratos Node/HTTP y documento de decisión 391. **Solo desarrollo; no se creó operador Auth real, ni se migró PILOTO, ni se publicó Vercel, ni se activó cron/WhatsApp.**

## 2026-11-06 — Etapa 7 / MVP266: gasto OpenAI desconocido no expira a las 24 horas

- Auditoría integral de las siete etapas IA Central con separación entre código en desarrollo y criterios operativos sin acreditar; decisión 390. **No declarar 7/7 ni piloto E2E** por pruebas sintéticas.
- Corregida la reserva de IA: un consumo `unmetered` o `reserved` sin revisión bloquea nuevas llamadas del participante incluso después de 24 horas. La cuota de llamadas/tokens observados sigue siendo móvil y verificable.
- Revisión humana futura mediante RPC interna y operador previamente habilitado, con evidencia SHA, idempotencia, límite diario y prohibición de liberar una reserva reciente. Conservar estados desconocidos, sin fabricar costos ni tokens. Tabla privada RLS, `service_role` exclusivo y sin operadores activos por defecto.
- Pruebas PG17 reversibles y contrato Node. **Solo desarrollo; no hay migración aplicada a PILOTO, backend de operador autenticado, cron, mensajes nuevos o publicación.**

## 2026-11-06 — Etapa 7 / MVP265: protocolo privado de incidentes con operador

- Bitácora de `acknowledge`, `investigate`, `escalate`, conciliación manual y revisión posterior a resolución, por señal y episodio. Un operador deshabilitado o sin inscripción no puede registrar acciones; una nota nunca modifica la fuente ni da por entregado un WhatsApp.
- Cola privada de operatoria con umbrales orientativos de 30/120 minutos, identificación de falta de acuse, historial idempotente de evidencia SHA256 y separación de reaperturas. Proyección sin teléfonos, importes, fuente ni nombres.
- Controles RLS/ACL y RPC `service_role`, sin consola ni autenticación humana aún. Pruebas PostgreSQL 17 reversibles, contrato Node y decisión 389. **Solo desarrollo; sin alertas externas, cron ni mensajes activados.**

## 2026-11-06 — Etapa 7 / MVP264: contabilidad de tokens OpenAI y freno de incertidumbre

- Registramos conteos `usage` realmente reportados por Responses API sobre una reserva IA Central acreditada, separando mensajes de comprador/proveedor. Incertidumbre HTTP, timeout o respuesta sin `usage` jamás equivale a consumo cero.
- Tope privado por participante: 24 llamadas/24h y 200.000 tokens observados/24h, bloqueo de llamadas futuras si el consumo previo es desconocido, HMAC/fuente/consentimiento/rol validados y medición única por llamada. Tabla RLS y RPC `service_role`; sin texto, respuesta ni ID opaco sin hash.
- Bandera `COTIRONDA_PILOT_AI_USAGE_TRACE_ENABLED` **OFF por defecto** en las rutas del comprador y proveedor. No se conoce aún costo monetario verificado ni hay conciliación contra factura: `monetary_cost=null`.
- Pruebas PG17 reversibles y Node; decisión 388. **Solo desarrollo; sin instalar PILOTO, cron o envíos.**

## 2026-11-06 — Etapa 7 / MVP263: vigilancia interna programable y alertas sin duplicados

- Supervisor SQL preparado para ejecutarse en intervalos de 15 minutos, **desactivado y sin cron instalado por defecto**. Política privada de máximo 1–96 ejecuciones por día UTC, bloqueo para concurrencia y resumen sin identidades por bloque de 15 minutos.
- Siete tipos de incidencia deduplicados por clave, con seguimiento de observaciones, resolución y reapertura. Historial agregado de ejecuciones con retención de 30 días; proyección privada `service_role`.
- Ningún envío, adjudicación, modificación de presupuestos ni llamadas externas/LLM; sin costos monetarios supuestos. Script de activación cron separado y **MANUAL, no ejecutado**.
- Pruebas PG17 reversibles y Node, decisión técnica 387. Solo desarrollo; no activado PILOTO ni producción.

## 2026-11-06 — Etapa 7 / MVP262: supervisor privado, solo lectura

- Incorporado un diagnóstico privado de IA Central con señales deterministas sobre mensajes inciertos, leases vencidos, presupuestos en revisión, documentos recuperables, expedientes sin ID y memoria próxima a vencer. Severidad `ok`/`attention`/`blocked`, sin identificadores personales ni importes.
- **Sin cron, avisos salientes, adjudicación, reintentos automáticos ni modificaciones del negocio.** Las sugerencias del supervisor son códigos para revisión humana; los costos se dejan explícitamente sin acreditar.
- Tests SQL PostgreSQL 17 reversibles y contratos Node, decisión 386. Solo rama de desarrollo, no publicado PILOTO o producción.

## 2026-11-06 — Etapa 6 / MVP261: versiones de fuentes comerciales sin mezclar precios

- Versionado privado e idempotente de cada nueva respuesta asociada a la ronda y proveedor, con secuencia de HMAC/SHA y estado económico `verified` o `review`. No mezcla correcciones incompletas con importes anteriores ni modifica el presupuesto histórico.
- Broker del proveedor integrado tras guardar la evaluación económica, con bandera `COTIRONDA_PILOT_QUOTE_VERSIONS_ENABLED` **OFF por defecto**. Mensajes viejos o fuera de orden pasan a conciliación, sin reenviar WhatsApp ni repetir lectura de IA.
- Pruebas PG17 reversibles y contratos Node, decisión 385. **Solo desarrollo; no se publicó PILOTO.**

## 2026-11-06 — Etapa 6 / MVP260: memoria como guardia de contexto de proveedor

- IA Central puede consultar un snapshot privado por fuente/ronda/proveedor, cruzar sus rubros y cantidades de artículos con el pedido original y bloquear una lectura de IA si la memoria contradice el alcance SQL. No introduce precios, marcas ni condiciones de la memoria en la cotización.
- La memoria solo se actualiza luego de guardar una cotización en estado `verified`; el guardado idempotente de evidencia y la conciliación de respuestas inciertas no reanalizan presupuestos ni reenvían WhatsApps. Dos rutas del webhook llevan bandera `COTIRONDA_PILOT_COMMERCIAL_MEMORY_ENABLED` **OFF por defecto**.
- RPC service_role-only, PG17 transaccional y pruebas Node, ADR384. **Solo desarrollo; sin cambios en PILOTO o producción.**

## 2026-11-06 — Etapa 6 / MVP259: memoria comercial verificada y aislada

- Contexto privado por ronda y participante, respaldado por la fuente original del pedido o una revisión verificada del presupuesto del proveedor. Guarda referencias de procedencia con SHA, no texto de conversación, teléfonos ni importes.
- Snapshots frescos de localidad y cobertura por rubro limitada al catálogo del proveedor; la cotización anterior deja de figurar como actual cuando existe una revisión más reciente. Vencimiento máximo de 14 días tras cerrar la ronda, sin superar 30 días desde registro; bajas revocan lectura/escritura.
- Pruebas de aislamiento y revocación PG17 reversible, CI Node, ADR383. Solo desarrollo, no publica la memoria ni la conecta aún a respuestas automáticas.

## 2026-11-06 — IA Central etapa 5: expedientes de Whapi sin ID MVP258

- Scanner privado de salidas inciertas sin ID Whapi y leases antiguos de cinco colas, con expedientes únicos, fechas y diagnóstico limitado. Sin reenvíos ni cambios de estado de mensajes.
- RPC internos de consulta y evidencia de revisión manual con SHA256, códigos cerrados y controles RLS/ACL; nunca certifica entrega sin prueba externa. Test PostgreSQL 17 reversible, contrato Node y decisión 382. **Solo desarrollo.**

## 2026-11-06 — Etapa 5 / MVP257: conciliación pasiva de Whapi incierto

- Se implementó evidencia privada de comprobantes `statuses.post` autenticados para envíos que siguen `uncertain`, con ID de Whapi y destinatario HMAC exactamente vinculados a un único outbox; el orden de estados no puede retroceder ni se permite reenviar automáticamente.
- Diagnóstico agregado de envíos inciertos con/sin ID y leases antiguos. Estados `uncertain` y `leased` permanecen inalterados y no se autoriza reenvío de WhatsApp.
- Pruebas PG17 reversibles con colisiones de ID, destinatario equivocado, estados repetidos y revocación de evidencia; regresión de webhook MVP119. Solo desarrollo; decisión 381.

## 2026-11-06 — Prioridad: completar siete etapas IA Central; MVP256 recuperación documental

- Se estableció priorizar el cierre verificable de las siete capacidades de IA Central antes de más publicaciones parciales del piloto. Estados y pendientes en decisión 380.
- MVP256 reemplaza cuatro funciones SQL del recuperador existente para **bloquear reintentos automáticos de errores permanentes**, permitir solo causas transitorias, aplicar intervalos de 3/9 minutos y detener la tercera falla. Mantiene SHA, cuota, invitaciones, consentimiento y acceso restringido.
- Prueba PostgreSQL 17 reversible y regresiones Node contra worker previo. Solo desarrollo; **no** se instala en PILOTO ni toca WhatsApp, Vercel, producción ni los mensajes de clientes.

## 2026-11-06 — MVP255: comparador por rubro en seguimiento privado (solo desarrollo)

- Integrado el comparador de cobertura MVP254 en la misma consulta verificada por token de IA Central MVP227, sin abrir otra vista ni convertir resúmenes en fuentes económicas falsas. Solo cobertura mínima por **artículos con importe cotejado**; hasta dos presupuestos anónimos y sin ranking por totales parciales.
- Proxy Vercel con lista blanca y verificación de rubros, ofertas y artículos; UI de comprador en la página actual, usando `textContent`. Revocación, cambio de token o falla de red borran la nueva sección junto con las ofertas privadas.
- Contrato CI Edge→proxy→DOM con escenarios parciales, condiciones incompatibles, permisos, PII y revocación. Decisión 379. **No desplegado en PILOTO ni producción.**

## 2026-11-06 — MVP254: corpus de contratos 1–3 e inicio de etapa 4

- Nueva suite de 336 escenarios sintéticos de contrato (224 formulaciones de siete rubros y 112 mutaciones adversariales), más pruebas de rondas simultáneas, ruteo y seis proveedores; **no equivale** a 150 respuestas reales de IA ni a E2E WhatsApp.
- Comparador privado por rubro sobre evidencia económica MVP225: cobertura separada de precio comprobado, opciones complementarias de hasta dos presupuestos anónimos, condiciones homogéneas indicadas y cero ranking global o adjudicación.
- Sin conexión nueva al navegador ni publicación; solo desarrollo. Control CI y decisión 378.

## 2026-11-06 — MVP253: autorizaciones y presupuesto OCR por original

- Nueva política privada por defecto OFF, sin consentimientos precargados y con límite cero, que exige consentimiento externo específico del comprador y proveedor, ronda e identidad correctas, doble lectura y cuotas mensuales antes de enviar originales a Cloud Vision.
- Reserva única por archivo/HMAC con token, unidades y presupuesto estimado; resultado guardado como estado privado, confianza y hash del texto OCR, sin importes ni PII. Revocación posterior bloquea el resultado positivo.
- Tests PostgreSQL 17 reversibles y regresión Node de lectura OCR simulada. No se habilitan nuevos precios públicos, WhatsApps, Google real ni producción. Decisión 377.

## 2026-11-06 — MVP252: OCR independiente para imágenes y PDF escaneados, en recuperación privada

- Se implementó un lector independiente opcional de Google Cloud Vision con JWT de cuenta de servicio en secretos, SHA de original, confianza mínima, límites de tamaño/páginas y llamadas HTTPS fijas.
- Cotejador visual contrasta las dos lecturas de IA Central con texto OCR completo mediante las reglas de líneas, cantidades, precios, extras y condiciones. El diagnóstico permanece **privado, no publica ni rankea**.
- Integración solo en recuperador con dos flags apagados por defecto y sin demorar el webhook principal. Faltan consentimiento externo, control de costo, procedencia SQL y E2E autorizado antes de habilitarlo.
- Tests sintéticos sin Google real; decisión 376. Ninguna modificación de PILOTO o producción.

## 2026-11-06 — MVP251: revisión segura de presupuestos fotografiados

- Las imágenes JPEG/PNG/WebP recibidas por Whapi ahora tienen diagnóstico explícito en ingreso y recuperación: MIME/firma/hash, coherencia entre dos lecturas, PII y diferencias económicas. Conserva todo en el ámbito privado.
- Una fotografía visualmente coherente NO pasa a fuente independiente verificada: nunca autoriza publicar, rankear ni revelar contacto. Los PDF escaneados siguen pendientes de corroboración visual independiente.
- Pruebas Node 22 y decisión 375; solo desarrollo, sin despliegues ni envíos.

## 2026-11-06 — Integración de desarrollo IA Central etapas 1–3 (contrato unificado)

- MVP250 (#630) integrado en la rama de desarrollo; marcas comerciales de material delante del rubro conservan filtros de PII, SHA, permisos y doble lectura.
- Prueba offline inter-etapas: dos lecturas de pedido multirrubro → ruteo autorizado → asociación de dos rondas → ofertas parciales con importes comparables por artículo; impide inventar precio o ignorar un flete.
- Nuevo gate CI que agrupa contratos Node y 12 pruebas PostgreSQL 17 reversibles; decisión 374.
- Sin cambios en Supabase/Whapi/Vercel, sin producción. Aún falta confirmar CI de la integración y E2E real de fotos/escaneos y dos rondas.

## 2026-11-06 — MVP250: marcas comerciales reconocidas en documentos multirrubro

- El publicador privado de presupuestos acepta algunas marcas comerciales conocidas delante de la categoría del material: «Sinteplast Hidrofugo», «Alba Pintura», «FV Grifería», etc. No acepta encabezados con nombres arbitrarios ni elimina controles de CUIT, WhatsApp, correo, razón social o URL.
- Preserva la validación por SHA, la doble lectura, los totales, el consentimiento y el anonimato. Descripciones con marcas desconocidas quedan para revisión. Pruebas PostgreSQL 17 y decisión 373. Solo desarrollo.

## 2026-11-06 — MVP249: PDF con flete, descuentos y pallets sin unitario

- El cotejador PDF independiente reconoce renglones de cargos sin cantidad ni unidad cuando realmente figuran así en el original, sin inventar precios unitarios. Rechaza importes que faltan, cifras de flete no justificadas, documentos escaneados y datos personales.
- Sigue respetando el verificador de original, dos lecturas, autorización SQL por proveedor/ronda y la publicación anónima. Corpus de regresiones y decisión 372. Solo desarrollo, sin enviar WhatsApps ni publicar piloto/producción.

## 2026-11-06 — MVP248: publicador comercial multirrubro con privacidad intacta

- Amplía la admisión de descripciones documentales de un pequeño diccionario de corralón a familias de pintura, electricidad, sanitarios, construcción en seco, ferretería y extras comerciales, sin habilitar texto arbitrario ni borrar controles de PII.
- El publicador MVP107/MVP135 conserva asociación por ronda, SHA binario, doble lectura, cálculos, privacidad y consentimiento. PostgreSQL 17 en transacción reversible y ACL del esquema privado. Solo desarrollo; no aplicado al piloto.

## 2026-11-06 — MVP247: cargos y descuentos sin datos unitarios ficticios

- El puente de documentos corroborados reconoce cargos de flete con solo total, descuentos sin cantidad y pallets sin cargo. Ningún renglón extra se descarta porque no tenga columnas propias de materiales; se preserva literal en la lectura comercial sin inventar precio unitario o cantidad.
- Se mantiene la exigencia de fuente SHA y autorización del publicador privado. Pruebas de integridad y decisión 370. Solo desarrollo, sin despliegue ni mensajes.

## 2026-11-06 — MVP246: sin publicación documental acreditada no hay lectura económica IA Central

- El puente de archivos MVP245 queda condicionado a la publicación anónima **ya aprobada y persistida** por el verificador legado MVP107; cobertura textual sola es insuficiente. SQL vuelve a exigir la misma fuente/empresa/ronda/SHA, dos lecturas concordantes, importes balanceados y consentimiento vigente. El finalizador repite la guarda antes de guardar cualquier precio.
- Mejora de lenguaje libre: las notas comerciales pueden incluir varios renglones de IVA/flete/pago, conservándose íntegras.
- Test PG17 adversarial sobre documentos no publicados, lecturas divergentes, importes discordantes, comprador revocado y eliminación de evidencia entre reserva/cierre. Doc 369. **Solo desarrollo; sin alterar piloto, producción, WhatsApps ni permisos activos**.

## 2026-11-06 — MVP245: integrar archivos corroborados al mismo motor IA Central (solo desarrollo)

- El documento del proveedor ya archivado y con SHA binario verificado pasa del lector privado existente al análisis comercial IA Central **solo** cuando su fuente PDF/Excel/Word/TXT obtuvo cobertura independiente de cada renglón e importe. No se promocionan fotografías ni formatos que carecen de prueba original.
- Un nuevo RPC privado enlaza media+SHA+proveedor consentido+invitación Whapi+misma ronda, reserva con cuota y guarda el resumen anónimo en la tabla que ya consulta el comprador por rubro. Se reutiliza el finalizador MVP227 preservando texto y se comparten los mismos cálculos y proyección sin contacto.
- Entrada documental fail-closed ante dos lecturas divergentes, números no sustentados, fuente no verificada, imagen escaneada, duplicación o timeout. Flags adicionales OFF, sin desplegar piloto/producción ni enviar WhatsApps. Pruebas PG17/Node y decisión 368. La etapa 3 queda ABIERTA hasta E2E real y cobertura de imágenes.

## 2026-11-06 — MVP244: detectar líneas monetarias omitidas del presupuesto (etapa 3)

- Una cotización interpretada ya no puede acreditarse económicamente si el original muestra un importe explícito en materiales, pallets, flete o descuento que no aparece en las líneas citadas. Se comparan frecuencias de importes literales y se detectan duplicados inventados.
- El total global recapitulativo permanece en la fuente original sin duplicarse como artículo. Un importe no representado bloquea la verificación y requiere revisión, conservando líneas, cobertura y precios previamente cotejados.
- Nueva verificación en doble lectura MVP225 y calificador directo, suite MVP244 y decisión 367. **Solo desarrollo**, sin SQL, mensajes WhatsApp ni publicación.

## 2026-11-06 — MVP243: diagnóstico de presentaciones nominales (etapa 3)

- IA Central preserva alternativas de proveedores aunque cambien envase y marca: 20 bolsas × 50 kg vs 40 × 25 kg, envases de 5 L, y bolsones con m³ explícitos. Su peso/volumen nominal se coteja en BigInt con datos LITERALES del proveedor, sin deducir bultos del precio, ni sustituir la acreditación técnica ni activar ranking.
- Si una oferta contiene exclusivamente alternativas sin importes homogéneos no se marca verificada económicamente. Las demás líneas exactas conservan su comparabilidad por artículo y rubro.
- El diagnóstico se almacena solo en resumen privado MVP227, con banderas `comparableTecnico=false` y `comparableEconomico=false`; no expone compradores, originales, ganadores, WhatsApps ni contactos. Nuevas pruebas/CI y decisión 366. **Solo desarrollo: no desplegar piloto/producción ni enviar mensajes.**

## 2026-11-06 — MVP242: IVA, flete y pago con evidencia semántica (etapa 3, desarrollo)

- Las dos lecturas de IA ya no pueden acreditar IVA, flete o pago con cualquier cita que aparezca en el texto: una verificación determinista exige que la cita y la fuente respalden exactamente el mismo estado comercial.
- Reconoce frases libres habituales: con IVA, sin IVA, más IVA, flete incluido/aparte/a convenir, pago contado/transferencia/crédito. Datos omitidos se conservan como `no_informado`, sin añadir impuestos ni inventar entrega.
- Condiciones contradictorias o múltiples opciones quedan en revisión, conservando todas las líneas y extras. Se refuerza también el comparador invocado directamente. Pruebas y ADR 365; sin SQL ni Whapi ni despliegue al piloto.

## 2026-11-06 — MVP241: evidencia determinista de moneda y cantidad (etapa 3, desarrollo)

- La lectura comercial IA Central deja de convertir el signo ambiguo `$` en ARS; exige indicación explícita de ARS/USD y cita literal válida. Una fuente con ambas monedas pasa a revisión, no a un comparador global.
- El cálculo exacto por línea exige que la cantidad conste en el original incluso cuando el total y el unitario parezcan reconciliarse aritméticamente. Ningún número deducido del precio se atribuye al proveedor.
- La cotización conserva cobertura, artículos, importes y extras en revisión cuando falta evidencia. Tests MVP241 y regresiones MVP225/227, decisión 364. **Sin activar WhatsApp ni publicar piloto/producción; etapa 3 abierta.**

## 2026-11-06 — MVP240: smoke real de etapa 2 sin envíos ni datos de prueba persistentes

- Ejecutado directamente en `cotironda-piloto` un control transaccional `BEGIN/ROLLBACK` con HMAC ficticios. Verifica las seis RPC de asociación/aclaración: todas rechazan fuentes no autorizadas; permisos públicos denegados, RLS y tres gates OFF.
- La inspección real de triggers de `invitations` demostró que insertar dos rondas ficticias podría activar automatismos de despacho. Queda expresamente prohibido usar esa vía como prueba inocua; los casos sintéticos complejos continúan en PG17 aislado.
- El piloto conserva tres rondas históricas y no recibió nuevos mensajes desde el 05/11/2026. Etapa 2 integrada técnicamente pero no cerrada sin E2E con WhatsApps reales y autorizados. Docs/363; sin cambios de producción.

## 2026-11-06 — Etapa 2 IA Central: integración MVP236-239 en piloto (sin WhatsApps)

- Cuatro migraciones SQL instaladas en `cotironda-piloto` y Edge Whapi **v54 ACTIVE** con 37 archivos, código coincidente con la rama de desarrollo. Los PR #614 y #617 están integrados; los PR #615/#616 quedaron incluidos y cerrados sin duplicar cambios.
- Atribución por envíos Whapi acreditados, registro privado de ambigüedades, continuidad segura de aviso y archivo, y aclaración mediante cita exacta del pedido original. Comprobados RLS, ACL, no-reintentos y controles de salida.
- **25/25 controles de GitHub Actions SUCCESS** en el commit integrado de etapa 2. Comprobación SQL: tres gates privados OFF; rondas históricas conservadas, cero mensajes, cero despachos, cero nuevas asociaciones IA.
- **La implementación técnica en piloto está completa.** No declaramos terminada la validación operativa hasta un E2E real con dos rondas y proveedores, según decisión 362. Producción sin cambios.

## 2026-11-06 — MVP239: aclaración segura de presupuestos ambiguos (etapa 2)

- El proveedor puede contestar citando el mensaje ORIGINAL del pedido Whapi, sin volver a enviar el presupuesto. Una RPC vincula un único documento o texto pendiente al pedido exacto del mismo proveedor, sin seleccionar por similitud ni confundir el mensaje de aclaración con una oferta nueva.
- La pregunta automatizada se reserva una sola vez y está sujeta a cuota, consentimiento y bandera independiente **apagada por defecto**; los resultados inciertos no se reintentan. Tabla privada, idempotencia, pruebas PostgreSQL 17 y ADR 361.
- Cambio inicialmente en desarrollo; sin WhatsApps reales ni publicación en producción. Validación integral pendiente.

## 2026-11-06 — MVP238: aviso de proveedor + archivo posterior (etapa 2, desarrollo)

- Un mensaje breve como «Te paso el presupuesto» se registra como **aviso de adjunto**, no como cotización ni como motivo de respuesta automática. Solo si el aviso está inequívocamente asociado a una invitación Whapi aceptada, el siguiente archivo almacenado y verificado puede consumir esa referencia.
- Vínculo por HMAC/SHA, mismo proveedor y chat, máximo diez minutos, sin mensajes ni invitaciones intermedias, una sola fuente por aviso. Un aviso conflictivo bloquea el fallback a otra ronda durante 24 horas para evitar mezclar presupuestos.
- Migración SQL privada, integración del webhook, pruebas Node y PostgreSQL 17, ADR 360. **Sin publicar en piloto o producción; no se activan controles ni se envían WhatsApps. Etapa 2 abierta.**

## 2026-11-05 — MVP236: asociación de presupuestos por despacho acreditado (etapa 2, desarrollo)

- El enlace de respuestas IA Central ya no considera candidatas las rondas LEGACY preparadas que nunca tuvieron un envío `api_accepted` con ID de Whapi y fecha anterior a la respuesta. El criterio evita ambigüedades artificiales y mantiene el bloqueo cuando existen varias solicitudes realmente enviadas. Cotizaciones citadas conservan vínculo exacto y cotejo de remitente; mensajes duplicados no se reinsertan. CI PostgreSQL 17 con casos adversarios y decisión 358. Complemento MVP237: ledger privado de mensajes no vinculados/ambiguos, una entrada por HMAC, sin precios ni contactos; decisión 359. **Sin despliegue ni WhatsApps; etapa 2 abierta.**

## 2026-11-05 — MVP235: recuperador compatible con localidad reanudada (piloto)

- Detectada condición de carrera: un pedido antiguo reanudado por MVP233 conserva su fecha original; el cron MVP230 podía confundir una reserva nueva con una operación abandonada.
- Corregida conciliación para usar la fecha más reciente entre creación y enlace de reanudación, sin borrar historial ni alterar otros estados de proveedor o despacho.
- Migración SQL versionada, regresión PostgreSQL 17 con rollback y decisión 357. **Aplicado únicamente en Supabase piloto:** migración `piloto_mvp235_recuperacion_segura_zona`; PG17 y preflight remoto aprobados, cron activo. WhatsApp y tres gates siguen OFF; E2E real pendiente.

## 2026-11-05 — MVP234: interpretar respuestas naturales de localidad (solo desarrollo)

- IA Central reconoce frases como «La entrega es en City Bell», «Es en Berisso» o «La obra queda en Tolosa» sin guardar esas expresiones como localidad ni crear un segundo pedido. El RPC MVP233 mantiene el vínculo único al mensaje firmado, el contexto original y los controles de autorización; documentos y respuestas de proveedores quedan intactos. Pruebas adversarias y regresión en workflow propio, ADR 356. **Publicada exclusivamente en piloto:** migración MVP233 + Edge Whapi v53. Tres controles privados OFF, sin WhatsApps, con continuidad E2E pendiente. Producción sin cambios.

## 2026-11-05 — MVP233: localidad posterior sin repetir el pedido (desarrollo)

- IA Central retoma el único pedido previo `needs_zone` después de un mensaje de localidad del mismo comprador. SQL privado enlaza fuente HMAC y respuesta atómicamente dentro de ventana y gates, vuelve a corroborar originales cifrados SHA y realiza doble lectura semántica. La ronda resultante conserva el original inmutable; no duplica invitaciones ni envía mensajes fuera de los permisos de despacho. Agregados tests Node y PostgreSQL 17 (rollback), docs/355. **No publicado en piloto ni producción; E2E real pendiente.**

## 2026-11-05 — MVP232: respuestas de rondas IA tras cierre de gates (desarrollo)

- Corrige clasificación del proveedor en webhook: el permiso SQL `quote_link` para un PDF `api_accepted` sigue en IA Central aunque se apague el control de nuevas rondas. Mantiene la asociación segura y la revisión de presupuestos dentro de la ronda, sin reactivar nuevos pedidos o envíos. Regresión `mvp232-proveedor-tras-gates`, ADR 354; solo rama/PR, sin despliegue ni WhatsApps.

## 2026-11-05 — IA Central (decisión 340; desarrollo, sin publicación)

- Aprobado rediseño semántico: dos lecturas OpenAI Responses con evidencias literales verificables, ruteo de rubros sobre proveedores autorizados y asociación inequívoca de cotizaciones a ronda; sin diccionarios cerrados para material. Nuevo contrato de herramientas/seguridad, pruebas de jerga y omisiones.
- Seguidor comprador: proyección por rubro validada en Edge→proxy→DOM, agrupando materiales de obra gruesa, pintura, electricidad, construcción en seco, sanitarios, ferretería y otros; preserva todos los originales/partiales y nunca suma totales incompatibles.
- Elaborado nuevo plan de seis fases y criterios de salida en docs/340. **Sin reemplazar webhook publicado, sin enviar mensajes, sin publicar producción o piloto**. Checklist #529 permanece abierto.

## 2026-11-05 — MVP212 (solo desarrollo): URL real de seguimiento del comprador

- Corregido origen del enlace privado emitido por Whapi: ahora apunta al alias estable de Vercel del proyecto de seguimiento, no al endpoint JSON Supabase con redirect a preview antiguo. La Edge previa conserva redirect de enlaces históricos al alias estable; token permanece en fragmento y el navegador usa POST mismo origen.
- Validada propiedad/alias Vercel READY vía conector, añadidas pruebas seguridad/token y no reenvíos. Sin despliegue, sin WhatsApps nuevos, sin cambios de estado en ronda, producción ni `main`. docs/337.

## 2026-11-05 — MVP211 (desarrollo): primera capacidad integrada del seguimiento 12×30

- Auditoría solo lectura en Supabase PILOTO: pedidos 200 renglones posibles, originales de proveedor hasta 25 cada uno, rondas reales actuales 3 ítems/2 ofertas como máximo. Detectado límite artificial 10/25 en SQL privado, TS y Vercel. Nueva migración propuesta, sin instalar: seleccionar 12 documentos v9 por ronda con 30 artículos solicitados, conservando cada original de hasta 25 líneas.
- Capacidad alineada en diagnóstico, cobertura, referencias por artículo, alternativas completas, pares, proxy y página; límite de respuesta 512KiB con fallo total y no truncamiento. Prueba PG17 aislado y pruebas unitarias 12×30, fuentes faltantes, autorización, revocación y casos 13/31, sin WhatsApps ni cambios en PILOTO. MVP185/210 mantiene límite monetario anterior y se oculta sin ranking falso en casos grandes. docs/336; P0-H sin cerrar.

## 2026-11-05 — MVP210: comparador de materiales conectado al comprador (solo desarrollo)

- Nuevo adaptador de fuente v9 a comparador MVP185 desde el seguimiento privado al cierre: verificaciones de texto público/etiqueta, SHA, descuentos, unidades y canasta de uno o dos, sin contactos ni adjudicación. Vercel y DOM recalculan subtotales de materiales con BigInt en vez de confiar en el importe enviado por Edge.
- Los valores explícitos `AR$`/`US$`/`U$S` ahora atraviesan las proyecciones MVP186/204, proxy y pantalla; `$` ambiguo continúa bloqueando el cálculo. Pruebas del circuito real anonimizado, manipulaciones y revocación. No se modificó SQL, Whapi, producción ni PILOTO. docs/335.

## 2026-11-05 — MVP209, planificación autónoma de cierre (solo desarrollo)

- Auditoría de Supabase PILOTO solo lectura: cron de cierre activo con 890 corridas exitosas y ninguna ronda vencida, 0 planes, 0 cron de finalistas, activación OFF. pg_cron, pg_net y Vault compatibles; falta secreto exclusivo plan-only.
- Separada en la Edge la autenticación de planificación de la credencial completa de avisos: plan_only termina ANTES de Whapi/contactos incluso si flags de envío están habilitadas. Propuesto cron seguro de solo planificación cada 5 minutos con Vault, preflight SQL y smoke PG17 sin HTTP real con rollback. Sin cambios al PILOTO desplegado ni mensajes. Documentada decisión de consentimiento de alta sin fricción para nuevas cuentas. Docs/333/334.

## 2026-11-05 — MVP208 (preflight reales solo lectura + CI rollback)

- Auditada directamente la base PILOTO sin modificación: PG17, Auth, roles, digest y columnas de las cuatro migraciones de originales compatibles (0 errores), 0/7 objetos privados instalados, 0 usuarios Auth y tres rondas preparadas, ninguna vencida a la fecha.
- Nuevos reportes SQL pre/post instalación de solo lectura, sin HMAC ni teléfonos, que detectan dependencias/instalación parcial y después aseguran política OFF, RLS y ACL estricto. CI PG17 sintético extendido para ejecutar ambas comprobaciones dentro de su rollback; tests de seguridad y documentación docs/332. No hubo despliegues, mensajes ni descargas.

## 2026-11-05 — MVP207 (solo desarrollo)

- Nuevo acceso autenticado a originales PILOTO en Next.js mediante OTP SMS para comprador preaprovisionado, sin autorregistro y sin secretos en navegador. Se reutilizan catalogo, descarga, consentimiento y auditoría de las rutas privadas existentes. Contrato público y pruebas adversariales de UUID, JWT, fuentes manipuladas, bloqueo Preview y aislamiento Auth DEV.
- **Sin despliegue ni SMS enviados.** En PILOTO aún no hay Auth users ni migraciones de originales activas: #525/#528/#529 abiertos. docs/331.

## 2026-11-05 — MVP206 (desarrollo, sin desplegar)

- Prueba end-to-end de contratos buyer v9 (dos rondas anonimizadas MVP199, cuatro fuentes, diez líneas) conectando MVP175/180/186/189/194/204 con `buyerView` Vercel y DOM del seguimiento, con revocación y casos hostiles. Corrige orden de referencias por etiqueta visible en MVP186, no por orden HMAC de SQL; etiquetas duplicadas bloqueadas. Distingue fallos de prueba física frente a fallos puramente económicos. No es E2E real por WhatsApp ni implica publicación. Docs/330, P0-G abierto.

## 2026-11-05 — MVP205 (desarrollo, sin desplegar)

- Comparador MVP185: moneda ARS/USD acreditable directamente de importes originales v9 solo con marcadores explícitos consistentes en unitarios, renglones y total. Contradicciones o `$` ambiguo bloquean la comparación; si hay fuente externa, se exige que no contradiga el documento. Mantiene todas las advertencias IVA/flete/stock y ningún efecto de despacho. Docs/329.

## 2026-11-05 — MVP204 (desarrollo, sin desplegar)

- El seguimiento del comprador obtiene un panel por oferta anónima con cobertura de importes acreditados y estados de IVA/flete/pago desde el documento fuente verificado, sin formularios nuevos. Edge→Vercel→DOM vinculados por texto aprobado, contrapesados contra RPC económica MVP180; invalidación por revocación.
- Moneda continúa **sin acreditar** en las cuatro cotizaciones reales del piloto; ni `$` aislado ni silencio sobre IVA producen un total fiscal o ranking económico. Documentación y tests en docs/328. Sin cambios en SQL/WhatsApp/producción.

## 2026-11-05 — MVP203 (desarrollo, sin desplegar)

- Seguimiento comprador: orientación de cobertura al cierre derivada del MVP189 anónimo y previamente cotejado. Una o dos opciones individuales inequívocas o una pareja complementaria única, siempre sin orden de precio; situaciones ambiguas no eligen dos arbitrariamente. Se conservan todas las ofertas y sus parciales.
- Proxy y UI repiten la comprobación, ocultan la propuesta alterada y limpian al revocar token. Pruebas de permisos, opciones múltiples, incompletos, tokens y datos privados. Ningún despliegue, WhatsApp, contactos ni descargas.

## 2026-11-05 — MVP202 (desarrollo, sin publicar)

- Comparador económico: cobertura sin truncar de hasta 200 proveedores y 100 artículos, pareja exacta con máximo 25 líneas flexibles y suspensión explícita de toda clasificación de pares si el costo global excede presupuesto. Ofertas individuales completas permanecen visibles sin puesto ni orden por precio.
- Nuevas pruebas de 50 líneas forzadas/flexibles, 120 proveedores×50 artículos, 12 proveedores/66 pares, condiciones comerciales ausentes y topes explícitos. **No se desplegó en PILOTO ni producción.** Docs/326, #532 abierto.

## 2026-11-05 — MVP201 (solo desarrollo, sin despliegue)

- Auditoría persistente privada para descargas de originales del comprador: RPC `service_role`, control cruzado SHA/tamaño/vigencia desde MVP192 y denegación de bytes si no se puede registrar; evento de preparación de respuesta, no confirmación de descarga final.
- Pruebas de caso válido, bases inaccesibles, bytes falsos, ACL y sesión revocada (Node + PostgreSQL17 aislado). Ningún efecto en WhatsApp, `main`, PILOTO ni producción. Docs/325, #525.

## MVP200 — originales privados condicionados a fuente v9 e invitación vigente (05/11/2026, solo desarrollo)
- SQL de catálogo MVP192 refuerza cruce exacto con verificador documental v9 `verified/covered` para cada presupuesto, invitación en estado `prepared` y bloqueo ante edición posterior. No exige ser recomendado: incluye TODOS los originales autorizados. PG17 aislado nuevo prueba instalación secuencial de políticas/Auth/catálogo, consentimiento individual, PDF/Excel, sesión, fuente errónea, vencimientos y revocaciones; workflow y tests unitarios nuevos. No se modificó el piloto, producción, WhatsApp, Vercel ni datos reales; política originales aún inexistente en PILOTO. docs/324 y #525.

## MVP199 — regresión con estructura real de 4 presupuestos v9 anonimizados (05/11/2026; solo desarrollo)
- Nueva fixture anónima de 2 solicitudes con 4 presupuestos originales v9 y 10 líneas comerciales conciliadas del piloto real: no conserva identificadores reales, contactos ni texto de chat. Testea los mismos JSON de entrada del diagnóstico privado MVP172 y del selector MVP196, parser económico argentino y rechazo ante versión/archivo alterados. No cambia datos reales del piloto, Whapi, producción ni `main`; SQL/Edge v196 todavía sin publicar. docs/322.

## MVP198 — ronda cerrada sin cotizaciones no bloquea finalistas (04/11/2026, SOLO desarrollo)
- Auditoría solo lectura de la base PILOTO confirmó una solicitud sin ofertas antes de dos con documentos v9. SQL propuesta ahora excluye ronda vacía del selector, continúa ante documentación incompleta, cuenta omitidas y no pierde rondas verificadas posteriores; verificación de invitación actual `prepared` antes de plan y de despacho/revelación. PG17 aislado incluye ronda vacía, inválida y válida y prueba cancelación de invitación; unitarios y documentación. No deploy, main, WhatsApp ni contactos. docs/321.

## MVP197 — planificación fuente v9 sin Whapi y revalidación de revocaciones (04/11/2026; solo desarrollo)
- El worker de finalistas ya puede planificar por RPC privada aun con mensajes OFF y sin secretos Whapi/AES/HMAC: la barrera de despacho es independiente. Lógica plan-only extraída a función testeable, con resultados anónimos acotados, sin red ni efectos de comunicación. SQL propuesto MVP196 refuerza permiso de fuente antes de cola/contactos mediante relectura expediente, confirmación de consentimientos, hash y última versión. Nuevas pruebas de selección/errores/mocks y orden de barreras. Sin deploy/activación/envíos. Docs/320; #523/#528/#529 siguen abiertos.

## MVP196 — reemplazo de selector literal por fuente documental verificada (04/11/2026, SOLO desarrollo)
- Nuevo `seleccion-finalistas-v9-mvp196.ts` utiliza diagnóstico técnico de fuente v9+SHA, cantidad física y ledger de descuentos cotejado para distinguir una/two ofertas completas o parejas con aporte exclusivo; todas las ofertas quedan en vista, sin ranking ni adjudicación, y casos ambiguos no generan plan. SQL propuesto (NO instalado) para rondas nuevas cerradas, revalidar bindings HMAC/SHA al proveedor, insertar plan y marcador inmutables y rechazar planes anteriores antes de notificar. Worker finalistas integrado a RPC nueva, sin invocar selector literal MVP159; envío Whapi gate OFF por bandera independiente. Tests unitarios de dos rondas y seguridad. No deploys, producción, main, contacto ni descarga. docs/319.

## MVP195 — equivalencia 25/50 kg y 5 L, conciliación obligatoria de descuentos (04/11/2026, SOLO desarrollo)
- `precios-cotizados-sin-iva-mvp185.ts` incorpora prueba privada de presentaciones comerciales de cemento gris e hidrófugo, apoyada en MVP174 y fuente v9/SHA/posición, para comparar el subtotal de materiales de **cantidades físicas iguales aunque cambie número de envases**. Advertencia específica; no ranking final, stock, IVA, flete o adjudicación. Reconciliación determinista adicional de precio unitario posdescuento y total original en misma página/fila para todas las líneas. Caso de regresión: 310.359,22 material completo vs oferta parcial con hidrófugo sin litros no acreditados. Sin SQL/Edge/Whapi/main/producción. docs/318.

## MVP194 — vista de cobertura con importes originales por oferta y parejas al cierre (04/11/2026, SOLO desarrollo)
- Integrados Edge existente, proxy Vercel y DOM de seguimiento para mostrar ofertas anónimas con cantidad de renglones de precio fuente verificados y, solo tras cerrar, parejas complementarias que reúnen importes para cada artículo. Fuente única MVP186 token-verified, validación independiente y whitelist en proxy, revocación limpia. Sin sumar importes o afirmar IVA/flete/stock, no hay ranking final ni contacto, envío, original descargable o adjudicación. Tests de 2 compradores, incompletos, fuente alterada y navegador. Sin publicación SQL/Edge/Vercel, main ni producción. Docs/317.

## MVP193 — bolsones de áridos m³ nominal en comparación preliminar (04/11/2026, SOLO desarrollo)
- El motor MVP185 reutiliza el cotejador MVP164 y el contrato privado de fuentes MVP165 para convertir 1 bolsón de áridos = 1 m³ nominal cuando hay cotejo de pedido, original v9/SHA, página/fila, presentación y familia/cantidad compatibles. Desbloquea referencias de material sin inventar unidad escrita, IVA, stock ni costo de entrega; advierte a cada opción. Pruebas de oferta individual, dos proveedores parciales, capacidad/diferencias/pallet y negativas. PILOTO: 4/10 líneas fuente big_bag y 10/10 unidades no explícitas; **no está probado ranking real**. No SQL, Edge, web piloto, WhatsApp, main o producción. Docs/316.

## Portal originales: rutas Next.js PILOTO con barreras completas, solo DESARROLLO (04/11/2026)
- Conexión Auth PILOTO independiente del portal DEV; rutas protegidas de catálogo íntegro y descarga por ID opaco; normal user JWT validado por `getUser(jwt)` y comprobación MVP191, servicio privado MVP192 con `buyerKey` exclusivamente servidor, almacenamiento SHA/revocación MVP190, 8 MiB. Habilitación OFF y pin exacto SHA de deployment Preview, tests negativos y positivos sintéticos. No hay OTP/Auth usuario PILOTO ni ruta habilitada ni descarga real; tampoco Vercel, WhatsApp o `main`. Docs/315, #525/#529.

## Originales — conexión privada de identidad, catálogo y descarga (04/11/2026, SOLO desarrollo)
- Nuevo adaptador servidor `src/server/originales-piloto-conexion-segura.ts`: vincula Auth y sesión PILOTO al RPC autenticado MVP191, consulta MVP192 con servicio privado, proyecta lista segura de **todos** los documentos consentidos y deriva descarga a MVP190 con SHA de bytes y doble revalidación post-I/O. Crea pruebas de acceso positivo simulado, aislamiento, cambio de sesión, revocación, fuente cambiada, falta de consentimiento, archivo adulterado y flag OFF. No crea endpoint ni despliega SQL/Supabase/WhatsApp/producción; #525/#529 abiertos. Docs/314.

## Seguimiento — aislamiento al cambiar token privado (04/11/2026, solo desarrollo)
- Corregida transición segura entre enlaces de distintas rondas en una misma pestaña: borrado inmediato, rechazo de respuestas antiguas, recuperación de token revocado solo mediante hash nuevo y ausencia de consultas con token inválido. Se agregaron seis pruebas de carrera, revocación, pérdida de conexión y privacidad. Sin despliegue ni WhatsApp. Docs/313; #528/#529 siguen abiertos hasta E2E real.

## MVP192 — Catálogo de originales por ronda y proveedor consentido (04/11/2026, solo desarrollo)
- Selector SQL server-only para enlistar TODOS los originales vigentes de proveedores con consentimiento específico de ronda prospectiva, con vínculo Auth PILOTO/WhatsApp, cierre, archivo inmutable SHA, última versión y anti-duplicados. Detalle interno único para MVP190. Proyección pública de lista blanca sin SHA, ruta, nombres de proveedores, contactos, totales ni URLs. Ensayo PostgreSQL de migración transaccional con rollback. Sin usuarios Auth, política, endpoint ni publicación. Docs/312; #525 abierto.

## MVP191 — Vínculo de Auth con contacto WhatsApp verificado (04/11/2026, desarrollo)
- Prepara RPC booleana con sesión JWT Auth PILOTO actual, teléfono OTP confirmado y contacto privado de Whapi, sin nuevas tablas ni revelar identidad/archivo, bloqueando rondas históricas por política OFF y fecha de activación. MVP190 ahora exige comprobar ese vínculo **antes y después** de leer Storage. Prueba reversible REAL en PostgreSQL del piloto: no autenticado denegado, ACL y política OFF, ROLLBACK comprobado; no se instalaron funciones ni se crearon Auth users. Docs/311; #525 sigue abierto.

## MVP190 — Transporte de originales protegidos con verificación de bytes SHA (04/11/2026, solo desarrollo)
- Nuevo manejador HTTP fail-closed, sin endpoint abierto ni despliegue, para descargar documentos PDF/Excel/Word/imagen auténticos con sesión/empresa y consentimiento documental específicos, evidencia vigente y lectura privada de Storage. SHA-256 de bytes reales y segunda verificación de revocación tras I/O; headers privados, sin URL pública ni PII. Se cierra además el caso de consentimiento anterior a ronda/política. Falta puente de identidad Auth PILOTO, selector privado/almacenamiento y E2E nuevo. Docs/310, #525.

## MVP189 — Combinaciones comerciales de hasta dos proveedores después del cierre (04/11/2026, desarrollo)
- Nuevo módulo fuente verificada v9 que proyecta combinaciones de cobertura uno/dos proveedores **sin dinero, puestos ni ganadores** y preserva todas las ofertas parciales. Solo con enlace del comprador autorizado tras cierre y doble guardia privado de seguimiento/cobertura/economía; saneamiento adicional Edge/Vercel/UI, revocación y anonimato. Suite de combinaciones y seguridad. No implementa IVA/flete/stock final, no despliega piloto ni WhatsApp. Docs/309.

## MVP188 — Prueba reproducible y rollback de activación de precios (04/11/2026, desarrollo)
- Script SQL de solo lectura comprueba los dos enlaces buyer, cuatro originales v9, correlación exacta de las ofertas, cinco artículos, conciliación de diez líneas a centavos y permisos service_role, sin PII. SQL nuevo y versión previa de rollback se instalaron temporalmente con BEGIN/ROLLBACK en cotironda-piloto, comprobando ausencia de cambios permanentes. No SQL instalado, Edge/Web desplegados, WhatsApp ni finalistas. Docs/308, #529/#528.

## MVP187 — Comprador ve el material y ambas cantidades (04/11/2026, desarrollo)
- Extiende proyección MVP186 del comprador con nombre, unidad y cantidad **del pedido**; cantidad literal de cada oferta solo cuando el importe de origen está auditado. Evita presentar dos subtotales de presentaciones diferentes como si fueran equivalentes. Validación repetida en dominio, proxy y navegador, sin PII de proveedor ni HTML interpretado. Tests de regresión, XSS, revocación, cantidades divergentes y whitelist. No despliegue. Docs/307.

## MVP186 — Referencias de importe por artículo con seguimiento privado sin formularios (04/11/2026, desarrollo)
- Se reutiliza selector de fuente privado MVP172/MVP175 y doble guardia de IVA/resumen MVP180; vínculo inequívoco de texto anónimo aprobado con la fuente v9. Componente Vercel muestra importes originales por artículo, presentaciones y salvedades sin generar puestos de ranking, contactos, stock, flete ni WhatsApps. La RPC MVP172 requerirá agregar una clave privada `publicText` y probar su instalación reversible antes del despliegue. Docs/306; issues #529/#535/#525.

## MVP185 — Convención para presupuestos que no mencionan IVA (04/11/2026, desarrollo)
- Por regla comercial del usuario, el silencio IVA se presenta como **precio cotizado sin IVA solo para comparación de materiales**, sin inventar tasa fiscal. Módulo offline de comparación orientativa: fuentes v9+SHA, descuentos conciliados, cobertura de hasta dos proveedores, canasta completa, monedas separadas, sin líneas extra ocultas; no modifica ranking final MVP118 ni adjudica. Copia de seguimiento piloto explica convención sin desplegar. Pruebas con importes ficticios y fallos seguros. Docs/305.

## MVP184 — Base IVA por renglón, sin doble conteo (04/11/2026, desarrollo)
- El contrato de `TerminosAuditados` exige `tratamientoIva` comprobado, incluido/excluido. Cotizaciones con precio SIN IVA concilian su base original y el comparador calcula el bruto final con la tasa acreditada; IVA incluido se concilia contra bruto. Faltantes o inconsistencias quedan visibles sin comparar. Cuatro regresiones; no SQL, Supabase, Vercel ni producción. Docs/304, issue #535.

## MVP183 — Usar cotizaciones parciales corroboradas para una canasta completa (04/11/2026, desarrollo)
- PR #560 conserva renglones verificados de cada oferta parcial, con faltantes explícitos. El comparador existente evalúa canasta completa de hasta dos proveedores, sin comparar subtotales de parciales. Tres regresiones propuestas; no alterar Supabase, WhatsApp, dominios ni producción. Docs/303, issues #535/#524.

## MVP182 — Seguimiento económico visible SOLO PILOTO (04/11/2026)
- PR #558 MERGED por squash únicamente a rama de desarrollo, 39/39 blobs idénticos al HEAD MVP181 y 2.087/2.087 unitarias y 6/6 CI PASS; PR previos #550/#552–#557 cerrados como SUPERADOS sin merge individual. Preview Vercel READY existente `dpl_9merKhfKMDACowaQqtsLyPc3XRoJ` probada por HTTP, cuatro archivos frontend idénticos a integración.
- Edge privada buyer v12 ACTIVE SOLO en `cotironda-piloto`, staging económico v2, 9 archivos, paquete igual. GET redirección a nueva vista económica, GET query 400, POST token falso not_found. SQL 2 enlaces, 4 ofertas visibles, 2 resúmenes económicos, 0 finalistas/avisos, 0 ACK, 0 usuarios web. No producción/WhatsApp/originales alterados. Falta prueba E2E con tokens del comprador; docs/302.

## MVP181 — ACK diferido de archivos del proveedor, sin retroactividad (04/11/2026, desarrollo)
- Recuperación documental opcional puede agradecer una vez después de registrar una cotización nueva PDF/Excel/imagen, con reserva SQL por mensaje y reuso de ledger de entrega; respuesta Whapi incierta terminal, sin renegociación de importes. Política DB inicialmente OFF, activación con reloj servidor y flag Edge independiente, ambas sin habilitar. SQL real BEGIN/ROLLBACK y posterior instalación SOLO en PILOTO con política OFF: 4 presupuestos históricos bloqueados y 0 ACK. Edge staging v1 (19 archivos) ACTIVE, webhook de WhatsApp activo v45 intacto; HTTP GET 405 y POST no firmado probe_only, sin envíos. 11 pruebas agregadas; 2.086/2.086 unitarias y 6/6 CI PASS. Docs/301, issue #526.

## MVP180 — Resumen económico anónimo para el comprador (04/11/2026, desarrollo)
- SQL privado service_role-only con token buyer y comparación exacta multiconjunto de ofertas habilitadas contra fuente v9/SHA, sin revelar nombres ni precios normalizados. Prueba BEGIN/ROLLBACK en PostgreSQL 17 PILOTO: 2 resúmenes/4 ofertas; IVA 4 sin informar, flete 3 no informado + 1 a convenir, stock 4 sin corroborar; RPC luego instalada SOLO en PILOTO con permisos anon/auth revocados y service_role habilitado; Edge económica en staging (9 archivos) con smoke GET/POST falso aprobado. Frontend y proxy preparados en PR; nueva Preview Vercel bloqueada por cuota 402, sin publicar UI. No WhatsApp/contactos/originales modificados. Docs/300.

## MVP178 — Precondición privada de originales al cierre (04/11/2026, desarrollo)
- Política inicialmente OFF, consentimiento individual con prueba de mensaje y revocación, barrera no retroactiva y preflight SQL solo service_role, sin URLs/documentos ni cambios a WhatsApp. Ensayo real BEGIN/ROLLBACK PostgreSQL 17 PILOTO y confirmación de ausencia de tablas/función después. 8 pruebas nuevas, 2.058/2.058 unitarias PASS. Docs/298, PR #554.

## MVP177 — Resultados de cierre no excluyentes (04/11/2026, desarrollo)
- Nueva sección de cierre del comprador: conserva todas las ofertas habilitadas, muestra cuántas de las recibidas están visibles, advierte pendientes y no elimina parciales ni obliga a comprar recomendados. Respeta revocación, ausencia de autorización y conteos desconocidos; pruebas sintéticas de 4 y 30 ofertas y estados de privacidad. Sin acceso a originales, ranking, base, WhatsApp o producción; ver docs/297.

## MVP176 — Cobertura en el frontend real de Vercel del PILOTO (04/11/2026, solo desarrollo)
- Se endureció el proxy `/api/estado`: salida mínima de datos del comprador, jamás entrega ofertas, cobertura o contactos sin `can_open=true`, solo finalistas tras cierre, y conserva exactamente el texto verificado de cada presupuesto; sumadas 7 pruebas de privacidad. Frontend: convención BIG BAG/bolsón nominal de áridos sin confirmaciones artificiales y prueba adicional. **2.044/2.044 unitarias PASS** en GitHub. Reintento Preview rechazado 402 `api-deployments-free-per-day`; no se publicó ni se modificó Supabase/Whapi/producción. Docs/296.
- Identificado error de publicación: HTML viejo servido desde `piloto/seguimiento-web`, mientras el código de cobertura MVP175 estaba solo en `site/seguimiento`. Solución en desarrollo agrega sección de cobertura a la carpeta realmente desplegada, conserva las cotizaciones originales en tarjetas y limpia todos los datos privados en revocación/falla. Edge/Supabase y Whapi intactos. Rechazado el atajo Edge HTML (re-escrito text/plain por Supabase, PR #551 cerrado). Vercel Preview nueva pendiente de cuota 402 y prueba navegador; docs/296.

## MVP175 — Resumen seguro de cobertura en seguimiento del comprador (desarrollo)
- Nuevo selector privado por hash del enlace comprador, con validación independiente de consentimiento, revocación y vencimiento, service_role-only. Edge de seguimiento existente reduce fuentes MVP172/174 a conteos agregados y UI de Cotironda muestra alternativas, envases no acreditados, no evaluados y diferencias; sin precios, ranking o identidad. Smoke PostgreSQL 17 con BEGIN/ROLLBACK y POST-instalación SOLO en cotironda-piloto: 2/2 rondas, 4 ofertas, 5 artículos; anon/auth denegados, token falso not_found; 0 mensajes/finalistas. **2.028/2.028 unitarios y 6/6 GitHub CI PASS**. Docs/294; Edge de seguimiento y web del comprador todavía NO desplegadas ni publicadas.

## MVP174 — Despliegue staging v2 y auditoría real SQL (04/11/2026)
- Edge `cotironda-piloto-round-preview-staging` v2 ACTIVE, 10 archivos, solo piloto; 401 sin token y con token falso. Consultas SQL de solo lectura confirman 9 coincidencias de cantidades nominales y 1 presentación sin litros acreditados entre los 10 cruces. Auditoría: 4 originales v9, 4 registros económicos, 0 cron/outbox/finalistas; recuperador v25 intacto. **2.011/2.011 pruebas PASS y 6/6 GitHub CI PASS.** No se ejecutó HTTP autenticado v2 por bloqueo de controles de seguridad para uso del token Vault; ranking fiscal/contactos siguen OFF. PR #549 y docs/293.

## MVP174 — Cotejo de cemento e hidrófugo por presentación acreditada (desarrollo)
- Agrega pesos de bolsas y litros por envase al diagnóstico privado de fuentes verificadas. Si falta la presentación, registra `presentacion_sin_acreditar` sin descartar oferta. 8 tests nuevos, 2.008/2.008 unitarios y 6/6 GitHub CI PASS. PR #549, docs/293. Staging sigue en v1: herramienta bloqueó la actualización; WhatsApp y ranking intactos.

## MVP173 — Diagnóstico real de dos rondas mediante backend privado (PILOTO 04/11/2026)
- RPC privada instalada en cotironda-piloto (anon/auth sin EXECUTE); Edge staging v1 solo lectura con Vault, sin cron ni afectar recuperador v25. HTTP 401 sin token; dos llamadas reales HTTP 200: 2/2 rondas, 4/4 ofertas, 5/5 artículos, 4 alternativas comerciales razonables en áridos, 6 cruces aún sin cotejo genérico (NO incompatibles). 2.000/2.000 unitarios PASS y 6/6 CI GitHub, ranking, finalistas, mensajes OFF. Docs/292, PR #548.

## MVP173 — Diagnóstico privado ejecutable para una ronda real (desarrollo)
- Edge staging separada de recuperación/Whapi. Token Vault obligatorio y RPC solo service_role; payload UUID, retorno estadístico sin originales, SHA, importes ni contactos. Integra SQL MVP172 con adaptador flexible TS. 14 pruebas específicas + Deno check. Docs/292; no rank ni finalistas.

## MVP172 — Unión de fuente real y diagnóstico privado de ronda (desarrollo)
- SQL service_role read-only cruza pedido original, todas las ofertas, v9 vigente, fuente MVP163 y evidencias económicas MVP168. Ensayo REAL en PostgreSQL 17 piloto con BEGIN/ROLLBACK: 2/2 rondas, 4/4 cotizaciones, 5/5 artículos, revocación de acceso público y ranking OFF; sin instalar RPC. Diagnóstico TS anónimo reutiliza adaptador MVP170/171 y mantiene precios finales/contactos/WhatsApp desactivados. Docs/291, issue #535.

## MVP171 — Equivalencias comerciales flexibles para todos los rubros (desarrollo)
- Las descripciones genéricas del proveedor ya no excluyen automáticamente oferta con especificación no excluyente: la fuente lleva `comercial_razonable`, con advertencias en cobertura y opciones offline. Áridos nominales 1 m³/BIG BAG; marca de hidrófugo flexible salvo exigencia; motor catálogo reutilizable para cemento, electricidad, pintura y más, sin validar unidades o atributos peligrosos por suposición. Docs/290 y pruebas de regresión. Sin despliegue de piloto ni ranking real.

## MVP170 — Cruce de presentaciones de áridos con pedido y fuente (solo desarrollo)
- Integración en el adaptador documental MVP162: enlaza hechos privados de BIG BAG/bolsón MVP163 con cantidades y descripciones del pedido mediante MVP164. Separa volumen nominal y variedad técnica, no inventa unidad, stock, IVA ni ranking. 19 nuevas pruebas; consulta SQL de piloto: 10 unidades ausentes, 4 BIG BAG fuente. Docs/289.

## MVP168 — Registro económico probado e instalado en PILOTO (04/11/2026)
- PostgreSQL 17.11: schema/RPCs de MVP168 ensayados `BEGIN/ROLLBACK`, migración aditiva aplicada SOLO a `cotironda-piloto`; smoke reversible PASS, ACL/RLS verificados. Edge de staging v1 ACTIVE con JWT y sin cron, recuperador actual v25 intacto; 0 hechos económicos reales y 0 WhatsApp/finalistas. Auditoría docs/287. No producción, sin activar ranking, no E2E PDF real.

## MVP168 — Integración de lector privado con evidencia económica (solo desarrollo)
- El recuperador ahora comparte lector de bytes con SHA para prueba MVP163 y nueva auditoría privada MVP166+167 de PDF/Excel/Word/TXT, con registro SQL append-only/RLS propuesto, callback opt-in OFF y pruebas E2E sintéticas. No se ha instalado SQL ni desplegado Edge en Supabase; ranking, originales, contactos y Whapi intactos. Docs/286, issue #535.

## MVP167 — Auditoría de condiciones IVA, flete y pago desde fuente (solo desarrollo)
- Módulo independiente lee declaraciones acreditadas por SHA de archivo y página/fila sobre IVA, flete y pago, detecta conflictos y distingue tasa sin base, costo adicional vs incluido y modalidades alternativas. No acredita neto fiscal/stock/plazo/mínimo, no produce precio comparable ni ranking. 22 pruebas nuevas; docs/285, Issue #535. Sin SQL, piloto, WhatsApp ni producción.

## MVP166 — Auditoría de descuentos por documento y renglón (solo desarrollo)
- Nuevo módulo puro para comprobar tasas comerciales por renglón PDF/Excel, cantidad, precio de lista y total con BigInt y evidencia de localizador, SHA y versión vigente. Calcula precio comercial descontado pero declara IVA aún no acreditado y ranking inhabilitado; 14 pruebas. Documentación docs/284, #535; sin piloto, base, WhatsApp ni producción.

## MVP165 — Puente de bolsones a contrato económico (solo desarrollo)
- MVP162 admite una prueba separada de presentación de áridos ligada a item/línea/SHA y descripción auténtica del pedido. MVP164 valida familia, variedad y 1 m³ nominal por envase antes de permitir unidad m³ al comparador. El IVA, descuento neto, stock, flete y pago siguen siendo requisitos independientes; documentos sin evidencia permanecen visibles sin ranking. Tests específicos y docs/283; #535. Sin migración, WhatsApp, contactos ni producción.

## MVP164 — Bolsón/BIG BAG de áridos ≈ 1 m³ nominal comercial
- Regla comercial argentina del proyecto: un bolsón estándar de árido es 1 m³ nominal, con tamaño expreso prioritario. Se distingue variante genérica de arena fina/piedra partida, sin asumir IVA/flete/stock ni alterar documentos. Módulo puro y tests; propuesta privada en PILOTO; docs/282, Issue #538. No adjudica.

## MVP163 — Segunda lectura de unidades y condiciones desde fuente PDF/XLSX
- Auditoría privada append-only de originales fuente-verificados v9, con unit literal separado de producto, presentaciones BIG BAG, pistas de términos, localizadores y SHA; no inventa m³/IVA/flete ni activa ranking. Recuperador un archivo por tick. Issue #536, docs/281. PILOTO aislado.

## MVP162 — Contrato documental fuente para costos comparables
- Reutiliza el comparador existente mediante adaptador offline con SHA de fuente, todas las líneas originales, unidades/cantidades literales, equivalencia técnica independiente, términos comerciales/IVA explícitos y cálculo exacto de importes. Si faltan datos, PDF permanece visible pero sin ranking. Issue #533; docs/280. Sin cambios a Whapi/DB/producción.

## MVP161 — autorización previa para originales de todos los candidatos
- Puerta pura y fail-closed por comprador, empresa, ronda cerrada, consentimiento anterior a invitación, fuente privada SHA y no retroactividad. Sin activar descargas ni tocar producción. Issue #525, docs/279.

## MVP160 — plan maestro y recomendaciones económicas sin adjudicación
- Issues #524–#529 ordenados por prioridad. Añadido recomendador puro sobre comparador existente; hasta dos proveedores por opción completa, nunca rankings entre condiciones divergentes, sin desempates inventados ni PII. Descarga de TODOS los originales consentidos al cierre queda prevista, sin liberar documentos previos. Docs/278. Solo rama de desarrollo.

## MVP159 — finalistas de PDFs verificados sin falsas equivalencias
- El plan de cobertura acepta fuente verificada v9 y fuente histórica, invalidando correcciones pendientes, manteniendo comparación estricta y avisos finalistas apagados. Issue #521, docs/277. Solo PILOTO.

## MVP158 — Seguimiento móvil legible y hora de 24 horas
- Total e ítems por tarjeta con transcripción original; aviso BIG BAG sin equivalencia presunta; fecha límite en Argentina 16:30 y no 04:30. Issue #519, docs/276. Solo PILOTO.

## MVP157 — Descuento en columna PDF con verificación independiente v9
- Contrastar sufijo Dscto de la IA con porcentaje y aritmética fuente original sin exigirlo como texto pegado al producto; evidencia append-only v9, status comprador sin ampliar permisos. Issue #517, docs/275. Solo piloto.

## MVP156 — Asociación contextual con evidencia multirrubro y cantidades
- PDF de proveedor con nombres abreviados de materiales podrá asociarse a ronda única si hay ≥2 familias distintas y cantidades exactas. La pertenencia no prueba equivalencia comercial. Issue #515; docs/274. Solo PILOTO.

## MVP155 — archivos de proveedores sin cita, atribuidos automáticamente con evidencia
- Con varias rondas, cotejar todos los materiales con catálogo real y atribuir solo a solicitud única; preservar extras, precios y originales. Issue #513, docs/273. Solo piloto.

## MVP153 — Vista de seguimiento del PILOTO sin HTML crudo
- Recupera el diseño y las pruebas de MVP146 sobre la base actual de Cotironda: micrositio estático y API de seguimiento en Vercel PILOTO, con GET 302 de Supabase habilitado solo después de probar el despliegue. Issue #497, PR #498 sustituida por PR nueva basada en código actualizado. Sin producción.

## MVP152 — Interpretación IA libre con evidencia y catálogo real
- Evita segundo parser rígido cuando el modelo extrae con evidencia corroborada, todas las cantidades cubiertas y zona/catalogo reales. Issue #509, docs/271. Sin cambios en producción.

## MVP151 — Asociación por respuesta al PDF original en WhatsApp
- Presupuestos de proveedor vinculados al mensaje citado, incluso entre rondas simultáneas; documentos sin identidad de ronda quedan conservados sin atribución inventada. Issue #507, docs/270.

## MVP150 — Pedidos naturales sin límite artificial de 8 renglones
- Texto/IA/SQL alineados a la capacidad de 25 renglones del PDF actual; más formatos claros de materiales y unidades, controles de fuente intactos. Issue #505, docs/269. Solo piloto.

## MVP149 — Recuperación autónoma de PDF a proveedores en PILOTO
- Despacho seguro de pendientes con cron ya autenticado, claim+HMAC+PDF fuente y ledger sin duplicados ni reintentos de resultados inciertos. Issue #503, docs/268. No afecta producción.

## MVP148 — Envío PILOTO por solicitud autenticada y catálogo curado
- Reemplazo de la ventana única del viejo MVP091, manteniendo 1 comprador y 2 proveedores, con evaluación determinista por cada línea/familia y consentimiento vigente. Issue #501, docs/267. Sin secretos ni llamadas Whapi en migración.

## MVP147 — Mensajes completos del comprador sin falsos faltantes
- La lista clara con saludo y encabezado no queda bloqueada por `ask_material`: fast-path seguro del parser local, sin borrar líneas desconocidas. Solo piloto, Issue #499, docs/266.

## MVP145 — Encabezados comerciales PDF frente a condiciones verificadas
- Revisión v8 append-only. No confundir metadatos de tabla, correo y ceros con condiciones omitidas; precios, IVA, flete, plazos y descuentos permanecen exigidos. Solo piloto. Ver docs/264 e Issue #488.

## MVP144 — Aclaraciones PDF acreditadas sin imponer orden de extracción
- Verificador v7 de texto comercial original reordenado y descuento visible en presentación Cotironda. Sin ocultar cargos, números ni negaciones; sin tocar producción. Ver docs/263 e Issue #488.

## MVP143 — PDF total sin etiqueta reconocida, con evidencia matemática
- Corrige bloqueo PDF Ailín cuando importe único y suma exacta acreditan el total; verificación v6 append-only. Documento docs/262. Solo PILOTO.

## MVP142 — Presupuestos reales: hojas Excel vacías y total de contado en PDF
- Verificación v5 de fuente original, preservación de cifras y notas, pruebas adversarias. Solo PILOTO. Ver docs/261 y #488.

## MVP141 — Lectura real de PDF y XLSX en PILOTO
- PDF: total literal único separado de la etiqueta respaldado por suma exacta; XLSX: filas vacías autoconclusivas; comprobación v4 append-only. Ver docs/260 e Issue #488.

## MVP140 — Lectura de múltiples hojas Excel y totales PDF contiguos (desarrollo)
- Revisión de fuente v3 append-only con retrocompatibilidad del seguimiento, detección de cargos sin símbolo monetario y pruebas ZIP/PDF. Sin despliegue de producción; ver docs/259. Issue #488.

## MVP139 — Mejoras source PDF/XLSX v2 (piloto)
- Comprueba descuento explícito en columna separada con centavos exactos; admite planillas formateadas y cacheadas, nunca ejecuta fórmulas. Conserva auditoría v1 y source SHA, sin publicación no verificada. Issue #488.

## MVP138 — Fuente original económica y publicación sin fricción (piloto)
- Revisión unificada de documentos archivados sin exigir doble coincidencia de metadatos ni multiplicación sin descuentos; proyección anónima inmutable, IVA no supuesto y token comprador conservado. Issue #488.

## MVP137 — Clasificación contextual de documentos de proveedor por identidad verificada
- Evita que Excel con precios y total de proveedor consentido se trate como solicitud de comprador. Solo routing privado y source checks intactos, sin migración SQL. Rescate de archivo antiguo se conserva separado en issue #485.

## MVP-136 — rescate autónomo de Excel proveedor mal clasificado (desarrollo)
- Reclasifica borradores con precios, proveedor e invitación comprobados, originales SHA256 y auditoría inmutable. Solo cotización recibida, sin ranking. Issue #485.

## MVP-135-B — las aclaraciones también requieren prueba de fuente
- Verificación bidireccional de notas comerciales en PDF y TXT/CSV. Una cláusula inventada o importe extra camuflado se retiene. Prueba reversible de proyección en PostgreSQL con source-gates conservados.

## MVP-135 — aclaraciones completas de proveedores (desarrollo, 03/11/2026)
- Extraer y conservar precios de lista/contado, flete, pallets retornables y demás condiciones en el presupuesto propio, sin renombrar importes ni pedir reconfirmación. PDF con cantidad decimal sin unidad literal y evidencia independiente. El ranking económico sigue bloqueado con incertidumbre. Issue #482.

## MVP-134 — conciliación autónoma de PDFs retenidos, solo privada (desarrollo)
- Cron diagnostica el PDF original de cotizaciones retenidas sin pedir reenvíos, no saltea doble lectura ni publica presupuestos sin respaldo. Issue #480.

## MVP-133 — cotejo de borradores reales sin rechazos artificiales (03/11/2026)
- Admite condiciones y evidencia multilínea y descripciones amplias en borradores PRIVADOS sin relajar reglas de publicación. Issue #478. La ronda no publica propuestas sin fuente verificada.

## MVP-132 - cron documental autónomo con Vault (desarrollo, 03/11/2026)
- Recuperación automática sin permisos repetidos ni reenvíos, token generado en Vault y verificador RPC exclusivo de service_role. Respeta baja, cuota, plazo y privacidad. Issue #476, despliegue solo a PILOTO tras pruebas.

## MVP-131 — recuperación de archivos sin mensaje WhatsApp posterior (DEV, 03/11/2026)
- Worker Edge aislado service-to-service con autenticación por clave secreta, bandera OFF y RPC de selección privada solo para service_role. Reusa recuperación MVP128, archivo original, doble lectura y auditoría económica, sin enviar WhatsApp.
- Issue #473. Pendiente: CI, SQL smoke aislado, autorización de despliegue PILOTO y verificación del PDF original de Ailín. No tocar producción.

## MVP-130 — cotejo PDF multicolumna, fuentes y varios folios (03/11/2026)
- Lector `unpdf@2.1.0` (PDF.js serverless) pinneado para evidencias de texto posicionado sobre el original privado, después del verificador de PDF simple. Límite de páginas/tiempo/memoria y falla cerrada para escaneos, OCR oculto, filas largas o ilegibles.
- Cobertura por renglón y por importe como multiconjunto exacto; prohíbe omitir cargos, fletes, pallets, IVA, condiciones, subtotales, números y total del presupuesto real. Si algo no está respaldado por la fuente, se mantiene en revisión privada.
- Pruebas sintéticas de dos páginas, IVA, costos extra, cambios de precio, subtotal/total no conciliado y escaneo, documentación en docs/249. Issue #468. Sin declaración de lectura real de Ailín hasta verificarla.

## MVP-128 — recuperación privada de PDF histórico sin reenvío (03/11/2026)
- Worker dedicado `private-document-recovery.ts` descarga solo el original en Storage, verifica SHA256/tamaño/MIME y vuelve a ejecutar dos lecturas independientes con las puertas de lectura, fuente y aritmética ya existentes. Nunca envía invitaciones ni publica PDFs sin verificación determinista.
- La cola segura solo identifica una fuente elegible con consentimiento, ronda abierta, HMAC de mensaje y cuota; `legacy_unclassified` preserva la incertidumbre del error del piloto inicial. Reserva con bloqueo de fila, espera mínima y tope de tres intentos.
- Corre en segundo plano mediante `EdgeRuntime.waitUntil` después de un webhook Whapi auténtico, sin pedir reenvío. SQL smoke sobre el PDF real de Ailín PASS + ROLLBACK (sin ejecutar IA), tests con fuente sintética y casos hash/adulteración/doble lectura. Issue #466, docs/247.
- No afirmar que el archivo de Ailín ya fue recuperado hasta registrar una propuesta real. El diseño PDF general con fuentes/tablas sigue siendo una mejora posterior.

## MVP-127 — fallos documentales observables y capacidad real de 25 líneas (03/11/2026)
- PDF real de Ailín (12.725 bytes) correctamente guardado y asociado a la ronda, pero sin borrador ni presupuesto validado. El webhook ocultaba toda excepción de la lectura; no hay evidencia de PDF defectuoso.
- Salida OpenAI 7.000 tokens (antes 2.300), respuesta hasta 50 KB, PDF high-detail y timeout 40s; clasificación redacted HTTP/timeout/cuota/JSON y persistencia privada por archivo mediante RLS. Al menos una lectura válida se conserva como borrador SIN presentarla como doble corroboración.
- RPC de propuesta admite hasta 40 KB de JSON validado para documentos de hasta 25 renglones. Pruebas nuevas y SQL smoke BEGIN/ROLLBACK PASS; se mantiene bloqueada cualquier publicación/ranking sin auditoría determinista de fuente. Issue #464, docs/246.
- Pendiente: relector seguro del original histórico y extractor PDF general para tablas/fuentes; NO se atribuyó el fallo al proveedor ni se declaró automáticamente su oferta válida.

## MVP-126 — vinculación voluntaria de cuenta web con WhatsApp ya verificado (03/11/2026)
- Dos tablas privadas RLS con desafío de 96 bits, SHA256, 10 minutos de vencimiento, límites de emisión, uso único y revocación; autenticación confirma que la sesión real sigue viva en `auth.sessions`.
- El webhook Whapi interpreta exclusivamente `VINCULAR <código>` tras autenticación e inbox cifrado. SQL exige mismo chat/participante con consentimiento, texto original corroborado por SHA256, rol y sesión vigente, sin crear cotizaciones ni pasar por IA.
- Nueva RPC `cotironda_piloto_my_rounds_mvp126`: comprador solo sus solicitudes y conteos no verificados; proveedor solo sus invitaciones y sus versiones de presupuesto, sin precios ni contactos ajenos.
- Ensayo real transaccional contra Supabase PILOTO con dos cuentas Auth sintéticas, comprador y proveedor, rechazo de código incorrecto/chat ajeno/replay y sesión cerrada: PASS + ROLLBACK, sin cuentas ni rondas persistidas. CI y publicación de funciones quedan sujetos a aprobación y auditoría. Issue #462, docs/245. **Sin acceso comercial activo: Auth PILOTO sigue vacío y SMTP no habilitado para terceros.**

## MVP-125 — unificar seguimiento y futuro acceso en cotironda.com (03/11/2026)
- Decisión de producto: una sola plataforma cotironda.com; WhatsApp sigue siendo el canal principal, y compradores/proveedores podrán consultar su historial desde cuentas propias.
- Primer bloque implementado en `site/seguimiento/` (HTML/CSS/JS) con Vercel rewrite same-origin `/api/seguimiento` hacia la API segura de Supabase, fragmento privado sin logs, CSP/noindex/no-store y anonimato hasta aprobación. Contratos y tests de seguridad en `tests/unit/mvp125-*`.
- Auditoría: PILOTO tiene **0 usuarios Auth**, la cuenta DEV es otra Supabase y no se puede presentar como acceso comercial. Vinculación OTP/código de WhatsApp y RLS por empresa **pendientes**, documentadas en docs/244, Issue #460.
- Despliegue de Vercel bloqueado por cuota 402 el 03/11; el sitio real no se ha sustituido ni se redirigió el enlace viejo. GO requiere HTTP 200 HTML y POST real verificados antes de conectar cotironda.com.

## MVP-124 — seguimiento HTML en frontend público aislado (03/11/2026)
- Incidente real: Chrome mostraba HTML literal del enlace privado de Supabase. Causa confirmada: Edge en dominio compartido transforma `text/html` a `text/plain` (límite oficial de la plataforma).
- Nuevo frontend responsive versionado `apps/seguimiento-piloto`, CSP y noindex estrictos, JavaScript sin dependencias externas que lee token exclusivamente de fragmento y consulta por POST la API proxy de Vercel. Proyección autorizada anónima; finalistas únicamente tras cierre y aprobación.
- Tests de seguridad, permisos y privacidad; Issue #458, docs/243. Proyecto Vercel aislado creado pero **despliegue bloqueado por cuota 402 api-deployments-free-per-day**. La Edge antigua sigue activa sin redirección hasta contar con destino accesible, para no romper los enlaces ya enviados. No se habilitan finalistas ni mensajes adicionales.

## MVP-123 — resolver ReferenceError tras link y habilitar cola PDF a proveedores (03/11/2026)
- Incidente del piloto real: el arquitecto recibió link y la ronda quedó preparada, pero los dos PDF permanecieron pendientes; el webhook produjo dos HTTP 503 con `ReferenceError` luego de enviar enlace.
- Se corrigió el cierre prematuro del ciclo de mensajes: el agradecimiento al proveedor vuelve a estar dentro de su ámbito y el despacho `dispatchTwo` permanece una vez al final. Tests de regresión de scope/ACK/reclamo idempotente, docs/242 e Issue #456.
- Prueba SQL reversible en PILOTO con ambas invitaciones reales: claims y permisos PASS, 2 artículos en cada snapshot PDF, tercer claim vacío; **ROLLBACK**, estados `pending=2, leased=0`. La entrega real requiere despliegue de Edge y confirmación de Whapi, no inferir de tests.

## MVP-122 — contexto de localidad para pedido de texto WhatsApp (03/11/2026)
- Hallazgo real del piloto: el comprador envió materiales, recibió la pregunta de zona y respondió «Entrega: La Plata»; ambos mensajes se guardaron pero no se creó una ronda. Causa: existía contexto solo para documentos, no para textos.
- Añadidas RPC de fuente original autenticada y correlación única, descifrado privado AES-GCM/validación SHA256 en Edge, parseo independiente con la zona de respuesta, creación idempotente de ronda e invitaciones; sin llamar al modelo otra vez para reinterpretar el primer pedido.
- Ensayo en PostgreSQL PILOTO con los dos mensajes reales en transacción **PASS + ROLLBACK** (2 artículos y proveedores según catálogo), sin nuevos WhatsApps. Issue #454, docs/241. **No se acredita todavía E2E físico.**

## MVP-120 — ensayo integral reproducible y corte seguro del piloto (03/11/2026)
- Runner seguro de 15 etapas SQL y cuatro escenarios sintéticos con SAVEPOINT/ROLLBACK independientes, bloqueo de transacciones embebidas y digest SHA256 del bundle. Solo prepara SQL reversible: no conecta a DB, no instala ni envía WhatsApp. Tests de regresión, docs/239, Issue #451, PR #452.
- Verificación puntual en Supabase PILOTO PG17.11 con migraciones temporales y fixtures MVP112/MVP115/MVP117/MVP119: **PASS, clean_rollback=true**. Persisten tres participantes y dos originales de Storage sin modificación, 13 puertas pendientes. Sin respaldo externo restaurable, Edge nueva ni prueba 1+2 real: **NO-GO comercial**.

## MVP-119 — confirmación real de entrega WhatsApp (02/11/2026)
- Implementados eventos directos `statuses.post` de Whapi con autenticación, canal, destinatario HMAC y coincidencia exacta del mensaje previamente aceptado; `sent: true` **no** equivale a `delivered`. Los estados de grupos `statuses.put` no se cuentan como entregas directas.
- Libro de evidencia privado, con RLS, ID Whapi solo en SHA256, estados monotónicos y protección contra suplantación, duplicados, respuestas tardías y mensajes desconocidos. Se retiene por primera vez el ID de los avisos de agradecimiento al proveedor y enlace al comprador, además de los envíos documentales y finalistas.
- Ensayo PG17 SQL integrado de 3 envíos simulados + eventos `sent/delivered/read`, suplantación, duplicado y rechazo de retroceso: **PASS ROLLBACK**; pruebas de parser TS y Edge, docs/238, Issue #449. Sin instalación ni mensajes Whapi reales. La publicación completa sigue **NO_GO** hasta despliegue autorizado y prueba con 3 teléfonos.

## MVP-118 — comparador económico exacto a 25 artículos sin explosión combinatoria (02/11/2026)
- Motor económico offline extendido de 8 a 25 artículos con solución por mitades y búsqueda de mínimos, hasta 2 proveedores y 10 ofertas. Conserva cálculos enteros BigInt, IVA/flete/minimos separados, condiciones de pago, cobertura y ofertas parciales, sin falsos puestos por totales incomparables.
- Tests contra oráculo de fuerza bruta en 150 casos, pruebas extremas 25 artículos / 10 proveedores, mínimos y falta de IVA/pago/flete. Documento docs/236, Issue #447, sin integración económica en vivo mientras no exista verificación documental completa de condiciones.
- Sin modificación permanente de Supabase, despliegue ni WhatsApp real. **NO_GO** para piloto completo por las 13 puertas nuevas pendientes y la prueba externa 1+2.
- Auditoría real de corte: script `mvp118_release_db_gate.sql` confirma 13 componentes privados, RLS/roles, guardia OFF y 25 artículos. Ensayada en Supabase PILOTO con toda la pila SQL: **PASS + ROLLBACK** (`all_rolled_back=true`, `previous_limit_kept=true`). Docs/237 y test de contrato. Edge vigentes Whapi v33/seguimiento v7 y worker de finalistas ausente; Vercel DEV READY no corresponde al PR nuevo. Ninguna versión publicada.

## MVP-117 — pedidos documentales hasta 25 artículos con PDF multipágina (02/11/2026)
- Se amplió de 8 a 25 ítems el camino documental completo de despacho: acuerdo privado doble lectura, distribución por catálogo, aclaraciones de números de línea, guardias de envío y cobertura de cierre. Cada proveedor recibe un PDF de 1–4 páginas con TODOS sus materiales y cantidades, nunca un archivo cortado por la página o por el mensaje WhatsApp.
- `mvp117_upgrade_document_25.sql` prepara la actualización incremental de las RPC y restricciones ya instaladas en PILOTO; las pruebas reales de PostgreSQL con 9 y 25 artículos, filtro por proveedor y tokens/leases se ejecutaron **PASS y ROLLBACK**, sin envíos ni cambios persistentes.
- Tests Node de 9/25/26 materiales, numeración, XRef y privacidad; docs/235, Issue #445. Se conserva el tope real de IA de 25 líneas/3 MiB y el `NO_GO` comercial/Whapi hasta desplegar el circuito autorizado y probarlo con tres teléfonos.

## MVP-116 — bloquear condiciones económicas omitidas del original (02/11/2026)
- Corregido el cotejo de importes de TXT/CSV/Office/PDF simples: cada ocurrencia monetaria se cuenta, incluso duplicados del mismo valor. Cualquier IVA, flete, entrega, pago, stock u otra aclaración no representada en el renglón original bloquea la publicación automática, y el TOTAL no puede incorporar letra chica silenciosa.
- Nuevo motivo privado `uncovered_terms` en SQL MVP106 y lector de originales; el documento sigue archivado sin ranking ni exposición engañosa. Test Node con duplicados de flete, precio repetido, letra chica y casos correctos; docs/234, Issue #443. Sin migración instalada, despliegue ni WhatsApp real. Ranking económico definitivo permanece NO_GO.

## MVP-115 — dos proveedores parciales juntos cubren el pedido sin comparación engañosa (02/11/2026)
- En el cierre SQL de PILOTO se agregó la modalidad `two_supplier_combination`: solo con presupuestos originales verificados y sin importar totales parciales entre sí, reconoce cuando dos negocios cubren artículos distintos que juntos completan el pedido. Los artículos y cantidades se contrastan 1:1; ninguna cantidad individual se divide ni se inventan equivalencias.
- Mensajes a cada negocio y vista del arquitecto ahora diferencian claramente una **solución conjunta de dos ofertas parciales** de dos alternativas completas independientes; no proclaman precios ganadores ni exponen teléfonos ajenos. Siguen vigentes consentimientos 1+2, cierre de 96h, RLS y outbox sin duplicados.
- Dos ensayos PostgreSQL 17 PILOTO con 3 escenarios y flujos de cierre/contactos **PASS ROLLBACK** (`fully_reverted=true`); tests Node de mensajes y privacidad. Docs/233, Issue #441. **Sin instalación, publicación ni WhatsApps reales.**

## MVP-114 — PDF simple con comprobación de fuente original (02/11/2026)
- Lector seguro y acotado de PDF original (1 página, 1 stream textual ASCII y fuente estándar), con soporte FlateDecode. Compara líneas, precios, flete y total contra la fuente; PDF escaneado, con imágenes, tablas u operadores no interpretados permanece en revisión privada. Integrado a doble IA, aritmética exacta y proyección anónima, no habilita ranking por sí solo.
- Pruebas Node con PDF binario y xref para valor correcto/manipulado/faltante/escaneo/múltiples páginas; ensayo en PostgreSQL 17 PILOTO en transacción **PASS ROLLBACK**, ninguna migración instalada. Docs/232, Issue #439. La publicación y el ensayo con teléfonos reales siguen bloqueados hasta superar todos los criterios docs/223.

## MVP-113 — blindaje de activación para no contactar rondas viejas (02/11/2026)
- Auditoría de pre-lanzamiento: el worker de finalistas podía volver a recorrer cierres históricos al activar los envíos. Añadido guardia privado `finalist_activation_mvp113`, OFF por defecto y sin permisos API, con fecha de activación explícita: queue, cron, claim, authorize y revelación de contactos del portal bloquean rondas anteriores.
- Dos ensayos SQL integrados PostgreSQL 17 PILOTO **PASS** con `ROLLBACK`: apagado, exclusión de histórico, fecha ficticia controlada, mensaje único, consentimiento, revocación, apertura y cierre. Pruebas Node de regresión, docs/231, Issue #437. Ninguna tabla instalada, ningún envío, ninguna activación ni deploy.
- Sigue NO_GO para E2E real: falta fusionar e instalar la pila completa, cotejar PDF/fotos y Office complejo, ranking de costos comparables y WhatsApp 1+2 en el entorno piloto autorizado.

## MVP-112 — ronda conectada del arquitecto a dos proveedores hasta avisos y consentimiento (02/11/2026)
- Ensayo INTEGRADO real en PostgreSQL 17 del piloto (MVP101–MVP110 en una sola transacción): 1 arquitecto, 2 proveedores, presupuestos documentales ficticios con flete/total, proyecciones anónimas en vivo, cron de cierre con fecha 96h inmutable, cobertura completa vs parcial, contacto consentido, vista privada finalistas, outbox de 3/2 mensajes sin duplicados, revocación. **PASS con ROLLBACK comprobado**; ningún WhatsApp enviado ni dato persistente.
- Nuevo `mvp112_readiness_readonly.sql`: auditoría REAL contra base instalada devuelve **NO_GO, 12 puertas ausentes**. Edge antigua y nuevo worker sin desplegar. Test unitario de contrato `mvp112-full-circuit.test.mjs`, docs/230 e Issue #435. Se mantiene NO_GO hasta instalar/aplicar migraciones en piloto autorizado y validar documentos PDF/foto, ranking y 3 teléfonos reales. No hay despliegue ni merge.

## MVP-111 — cotejo determinista del original Word/Excel Office OpenXML (02/11/2026)
- DOCX con párrafos simples y XLSX con una hoja de celdas literales pueden contrastarse contra bytes reales ZIP, CRC32, Deflate y XML; se cotejan importes/renglones con MVP-106 y se publican anónimos solo si MVP-107 también valida doble lectura, suma exacta, consentimiento y privacidad. Fórmulas, estilos monetarios ambiguos, encabezados, datos ocultos, tablas complejas e imágenes no autorizan publicación.
- Tests Node generan archivos Office ZIP reales y ensayan precio alterado, hoja extra, fórmula, fila oculta, archivo corrupto y teléfono. PostgreSQL 17 PILOTO migraciones 101–110 y smoke MIME Word/Excel con reversión **PASS**; docs/229, Issue #433. No desplegado; PDF/fotos y otras complejidades pendientes.

## MVP-110 — aviso bilateral de finalistas por WhatsApp, con reserva de envío (02/11/2026)
- Se desarrolló outbox at-most-once de 1 aviso al arquitecto + hasta 2 proveedores completos, posterior al cierre real de 4 días. Envía datos reales únicamente si arquitecto y todos los proveedores habilitaron revelación de contactos y sus números cifrados coinciden con chat autenticado. Revalida consentimiento antes del HTTP.
- Worker Edge protegido por secreto exclusivo y bandera apagada por defecto; descifra solo en memoria, verifica AES-GCM AAD y chat HMAC, envía texto Whapi y registra resultado api_accepted/uncertain sin reintentar a ciegas. GH cron cada 5 minutos condicionado a variable y secretos, sin ejecución por defecto.
- SQL PG17 PILOTO reversible PASS (3 avisos únicos, replay, revocación, leases, token del comprador, revelación de contactos solo al cierre). Portal privado muestra los contactos tras cierre/consentimiento, descifrando solo en Edge, apagado por defecto. Node AES/HMAC y contrato, docs/228, Issue #431. Sin migraciones instaladas, despliegue ni mensajes reales. Falta probar E2E.

## MVP-109 — resguardo cifrado de contactos y autorización para revelación bilateral (02/11/2026)
- WhatsApp captura el número autenticado de comprador/proveedor en AES-GCM con AAD de chat, sin teléfono legible en Supabase; HMAC y hash vinculados al mensaje de origen. Cambio de identidad bloqueado.
- El usuario autoriza una sola vez el contacto posterior al cierre mediante el comando WhatsApp COTI CONTACTOS SI, revocable con COTI CONTACTOS NO; nunca se interpretan como cotizaciones. Snapshot privado solo con datos cifrados, después del cierre y del plan de finalistas, revalidando a todas las partes.
- PostgreSQL 17 real con ensayo reversible consentimiento triple, replay, cambio de identidad y revocación PASS; docs/227 e Issue #429. No hay mensajes de cierre todavía, no instalado ni desplegado.

## MVP-108 — cierre con hasta dos alternativas de cobertura completa (02/11/2026)
- SQL del piloto identifica, después del vencimiento REAL, hasta dos proveedores cuyas cotizaciones TEXTUALES originales ya fueron verificadas y publicadas anónimamente y cumplen 100% de los materiales por descripción, cantidad, unidad y rubro de forma única. Una oferta parcial no compite por su total menor y una nueva versión pendiente invalida la anterior.
- Registra solo plan privado idempotente/RLS; evita adjudicaciones, ranking por precio engañoso, datos de contacto y envío WhatsApp. Estado «dos alternativas completas» NO implica «dos precios más bajos» cuando faltan IVA/flete/pago comparables.
- Ensayo PG17 de dos rondas sintéticas (ambos completos vs uno parcial) con reloj del servidor, plazo inmutable, ROLLBACK PASS; docs/226, Issue #427, tests Node. No desplegado.

## MVP-107 — primera publicación anónima automática de presupuesto de proveedor (02/11/2026)
- Con fuente TXT/CSV simple cotejada contra bytes, dos lecturas IA concordantes, suma exacta, consentimiento y categorías/piloto autorizado, Cotironda genera una proyección con TODOS los conceptos y literal total declarado, incluidos pallets, bolsones, flete y descuento. No expone nombre/telefono/contacto; bloquea documentos no confirmados o con riesgo de privacidad.
- El enlace de seguimiento incorpora estas proyecciones automáticas a las ofertas textuales previamente aprobadas, mostrando solo la ÚLTIMA versión por proveedor; nueva cotización no revisada oculta la previa. Token privado, sin ranking ni finalistas.
- Smoke PostgreSQL 17 PILOTO de migraciones 101..107 y ronda sintética end-to-end **PASS con ROLLBACK**. Tests Node, docs/225, Issue #425. No instalado ni publicado.

## MVP-106 — comprobación independiente de archivo textual del proveedor (02/11/2026)
- El receptor Whapi incorpora cotejo determinista contra bytes originales de TXT/CSV (líneas, descripciones, cantidades, importes, descuentos, flete, embalajes, IVA y total) después de doble lectura IA y control económico, con rechazo de faltantes y datos de contacto.
- Registro privado e inmutable de resultado por HMAC/SHA256; PDF/imagen/DOCX/XLSX siguen sin prueba independiente; nunca se autoriza oferta, publicación, ranking o contacto a partir de este resultado. PostgreSQL 17 con migraciones 101..106 y ensayo reversible PASS. Tests Node, docs/224, Issue #423. No desplegado.

## MVP-105 — presupuestos anónimos revisados en vivo (02/11/2026)
- El enlace privado del comprador muestra la proyección revisada y anonimizada de cada presupuesto **durante** la ronda, actualizada por el navegador cada 45 segundos, sin revelar comercio, contacto, fuente cruda ni posiciones económicas anticipadas. El contador distingue archivos pendientes y cotizaciones recibidas.
- El servidor devuelve solo anonymous_offers_mvp091 ya aprobado, atado a la última versión de cada proveedor; una revisión posterior sin aprobar oculta la versión vieja; tokens revocados y rondas canceladas no revelan nada. Se filtran patrones evidentes de contacto y se inserta todo como textContent, no HTML.
- SQL real en Supabase Piloto **PASS** en una única transacción con datos ficticios y ROLLBACK; docs/222, Issue #421. La aprobación automática del contenido, fidelidad contra archivo, ranking y revelación de finalistas siguen pendientes.

## MVP-104 — mensajes de inicio/recepción del circuito WhatsApp (02/11/2026)
- Corregido el faltante del enlace de seguimiento para pedidos originados en foto/PDF y para documentos completados por localidad o unidades: el token se emite únicamente al crear ronda y queda asociado a su archivo original autenticado, no al mensaje de aclaración. El texto confirma recepción y que Cotironda reunirá cotizaciones.
- Acuse breve y único al proveedor cuando se guardó una cotización textual o el original documental con recibo pendiente de fidelidad; ledger SQL privado, HMAC, consentimiento, invitación, vencimiento, protección de duplicados y entregas inciertas sin reintentos ciegos. Medios se vinculan por archivo archivado, aunque `whapi_inbox.request_id` sea nulo.
- Prueba PostgreSQL 17 real y reversible de ambos caminos (texto y PDF), privacidad, enlaces y anti-replay PASS; sin instalación, WhatsApps reales ni producción. Docs/221, Issue #419.

## MVP-103 — cálculo económico privado y exacto de presupuestos documentales (02/11/2026)
- Tras dos lecturas concordantes, el receptor prepara una auditoría determinista que comprueba importes literales, multiplicación cantidad × precio unitario, descuentos, pallets/bolsones/flete y total declarado, sin sobreescribir la cotización original.
- Los importes inequívocos se normalizan exclusivamente a centavos enteros; `$ 7.000` aislado sigue como ambiguo. El estado interno distingue `balanced`, `difference`, `needs_review`, pero **no autoriza ranking ni prueba fidelidad física al PDF**.
- RLS privada, hash SHA256, consentimiento/ronda/proveedor, ledger idempotente, cero envíos y cero exposición económica. Nueve escenarios PG17 reversibles PASS; docs/220, Issue #416. No instalado ni publicado en producción.

## MVP-102 — cotejo independiente de dos lecturas de presupuesto proveedor (02/11/2026)
- Whapi ahora usa también la segunda lectura documental de cada proveedor, ya realizada, para cotejarla con el espejo privado MVP-101: todos los renglones, cantidades, unidades, precio unitario, total de línea, descuentos, IVA/cargos literales y total declarado. Las diferencias quedan como `needs_source_review`; una coincidencia estricta es `model_readings_match` sin afirmar fidelidad al archivo original.
- Ledger privado RLS, fuente SHA256, identidad de proveedor/ronda, consentimiento, detección de replay y motivo categórico sin importes/PII. Ausencia de segundo resultado bloquea la comprobación. Jamás crea `offer_versions`, rankings ni finalistas.
- 14 casos sintéticos de PostgreSQL 17 en Supabase Piloto bajo `ROLLBACK` PASS, tests de contrato Node, docs/219, Issue #414. Sin instalación permanente de SQL, producción ni WhatsApps.

## MVP-101 — espejo privado de todos los renglones de presupuesto documental (02/11/2026)
- La recepción de un archivo de proveedor mantiene el original privado SHA256 y ahora registra atómicamente cada renglón del borrador IA con su orden, cantidades, precios literales, evidencia y dudas, **sin descartar pallets, bolsones, flete, descuentos ni extras**.
- El total declarado se conserva literal aun si es inconsistente; idempotencia por HMAC, RLS estricta y transcripción inmutable. Los documentos históricos sin espejo no se hacen pasar por recuperados.
- Estado exclusivo `awaiting_fidelity_check`: no es cotejo contra el PDF/foto, no crea oferta verificada ni habilita ranking, exposición a comprador o finalistas. Docs/218, Issue #412, SQL smoke reversible y tests unitarios. Sin producción.

## MVP-100 — respuestas contextuales del arquitecto para completar unidades/arena/localidad (02/11/2026)
- Whapi pregunta una sola vez lo indispensable de un documento corroborado, recibe unidades y tipo de arena por número de renglón y localidad en un mensaje, asocia todo al original privado por HMAC sin modificar cantidades ni propuesta IA.
- Si los datos son suficientes, reanuda promoción MVP-099 y el despacho por proveedor sujeto a consentimiento. En caso contrario mantiene la solicitud pendiente; sin reenvío, sin confirmaciones por línea.
- SQL rollback real y tests unitarios, docs/217. No habilita producción ni ranking/cierre completos.

## MVP-099 — despacho por proveedor desde documentos originales (02/11/2026)
- Dos lecturas paralelas de archivo, cotejo estricto y consenso privado antes de promoverlo a solicitud. Si faltan localidad, unidades o cobertura, no inventar ni enviar.
- Solicitud documental conserva todos los ítems y original privado SHA256; cada proveedor recibe solo su subconjunto por categoría y zona (texto y PDF), con autorización Whapi revalidada al reclamar y enviar. Compatibilidad con ronda piloto anterior.
- Prueba transaccional reversible de ofertas parciales 2/1 ítems, consentimiento retirado, duplicados, RLS y discrepancia de IA; documentado en docs/216. No equivale a cierre/ranking E2E.

## MVP-098 — plan de distribución por artículo y recibos de presupuesto en archivo (02/11/2026)
- Borradores IA de archivos archivados se convierten en un plan por renglón con unidades literales, cantidad, evidencia y motivos de bloqueo. Cobertura por proveedor/catalogo/localidad sin fingir stock ni cotizaciones válidas. La imagen real contenía 10 Cemento, 2 Arena y 288 Huecos del 12, sin unidades ni ciudad.
- Presupuesto de proveedor enviado como archivo queda asociado a la única invitación activa, con original SHA256, total declarado literal, extras visibles en la fuente y estado `awaiting_fidelity_check`; nunca reemplaza ni modifica `offer_versions`.
- RPCs privados, idempotentes, sin despacho y ensayos SQL rollback + tests; ver docs/215. No habilita aún ronda documental, ranking o finalistas.

## MVP-097 — menos cupos arbitrarios y zona contextual de documentos (02/11/2026)
- La segunda imagen real del arquitecto se archivó y OpenAI propuso 3 renglones, sin zona ni unidades explícitas; no hubo ronda nueva ni envíos a proveedores.
- Configuración de salvaguardas privadas amplias y ajustables en Supabase (500 archivos, 100 lecturas documentales, 200 consultas IA texto, 100 respuestas por contacto/24h), sin límite comercial de 2 archivos/día. Persisten controles de permisos, integridad, duplicados y costo.
- Documentos válidos sin localidad consultan una sola vez por WhatsApp y una respuesta de localidad se vincula al original sin reenviarlo. No se convierte extracción ambigua en oferta ni se simula ranking. SQL smoke ROLLBACK y pruebas unitarias; docs/214.

## MVP-096 — resultado de IA auditable (02/11/2026)
- La primera prueba real de FAQ por WhatsApp quedó autenticada (16:27 ART), reservó 1 intento IA y no creó ronda; antes no había prueba de respuesta del modelo.
- Ledger de intentos con código éxito/fracaso/intención/decisión y sin respuestas crudas ni PII, prueba SQL transaccional reversible y autorización exclusiva para service_role. No reejecutar mensajes históricos.
- Wire de resultado en Edge; la validación de API y costos queda para próximo mensaje real posterior al despliegue piloto.

## MVP-095 — originales de archivos y propuestas documentales privadas (02/11/2026)
- Archivo entrante Whapi autenticado por ID: descarga acotada y firma de contenido, conservación íntegra en Storage privado Supabase (3 MiB), SHA256 y estado irreversible `stored`/`uncertain`; límites 8 archivos por contacto/día y asociación unívoca a ronda. No URLs arbitrarias ni exposición pública del original.
- Propuesta documental OpenAI Responses JSON estricto sobre PDF, DOCX, XLSX, imagen y texto, límite 2 lecturas/contacto/día y salida únicamente `review_required`. Sin autorizaciones automáticas de despacho, cálculo ni finalistas a partir del resultado de IA.
- Seguimiento diferencia `received_count` de presupuestos verificados frente a `files_pending_review` de archivos de negocios. Migra solo a PILOTO tras CI/SQL smoke. `docs/212-mvp-095-archivos-originales-y-borradores.md`.
- `integration_flags.media_archive_enabled_mvp095` y `COTIRONDA_PILOT_DOCUMENT_AI_ENABLED` quedan apagados por defecto hasta habilitación y prueba real controlada. No se cambiaron secretos, producción ni dominio.

## MVP-094 — Intérprete IA operacional de WhatsApp, respuestas breves y verificables (02/11/2026)
- Adaptador real de OpenAI Responses (JSON Schema estricto, `store:false`, sin herramientas, límites de tokens/caracteres y timeout) para clasificar mensajes de compradores autorizados. **Deshabilitado por defecto hasta configurar clave/flags privados y medir costos**.
- Las respuestas de Cotironda son textos comerciales fijos, breves y auditables, no textos inventados por el modelo. Saludos y consultas fuera del alcance no producen mensajes. Pedidos con evidencia insuficiente quedan en revisión, nunca despachos parciales no verificados.
- Guardas SQL privadas de 12 interpretaciones por comprador/24h, una por mensaje HMAC, consentimiento/rol obligatorios, 5 respuestas/24h y un único intento de envío Whapi sin reintento incierto; smoke PG17 transaccional y pruebas con API mock.
- El ranking económico, comprensión binaria de archivos y revelación de finalistas siguen pendientes de integración; ver `docs/211-mvp-094-ia-operacional-whatsapp.md`.

## MVP-093 — Ingreso flexible de pedidos y fuentes cifradas (02/11/2026)
- Instalado en PILOTO `MVP-092b` para que al comenzar una ronda nueva se cancelen únicamente invitaciones anteriores del mismo proveedor sin borrar sus presupuestos y sin crear pedidos ficticios.
- Parser WhatsApp con saludos y múltiples representaciones de cantidad/unidad, ubicación y fecha. Pruebas positivas y adversarias; envíos parciales bloqueados.
- Fuente media (PDF, Excel, Word, imágenes): guarda un manifiesto cifrado del ID/mime/caption en Whapi inbox, **sin fingir que el contenido fue leído**. Extracción de archivos binarios, IA real y verificación independiente pendientes.
- Contrato IA estricto `ai-contract.ts`: sin fuente comprobable, unidades y evidencias consistentes nunca se autoriza distribución.
- Migración PILOTO `mvp093_preserve_buyer_requested_delivery_note` instalada con autoensayo reversible: fecha de entrega explícita se guarda y pasa al PDF de solicitud; no supone fecha para otros pedidos.
- Documentación de límites y siguientes puertas de seguridad en `docs/210-mvp-093-ingreso-flexible-e-ia-documental.md`. No se modificaron Vercel, main ni producción.

## MVP-091 — Solicitud PDF y seguimiento privado con embargo hasta cierre (02/11/2026)
- Generador PDF determinista de 1–8 artículos con localidad y vencimiento, sin frases sobre IVA, fletes, adicionales ni descuentos; transporte Whapi `/messages/document` desde snapshot SQL confiable con lease único.
- Registro de enlace de seguimiento por WhatsApp con token aleatorio de 256 bits, SHA256 privado y URL con fragmento: recuento actualizado sin precios, originales ni identidades antes del vencimiento. Solo se publican al cierre ofertas previamente revisadas y anonimizadas.
- Nueva ventana limitada a un pedido real de arquitecto y dos proveedores del piloto, SQL RLS, pruebas adversarias y `mvp091_smoke_rollback.sql`. **No equiparar código listo con envío real** ni cierre con ranking de finalistas; ver `docs/209-mvp-091-pdf-y-seguimiento-privado.md`.

## MVP-089 — Única invitación Whapi a Nahuel, limitada y con formato correcto (02/11/2026)
- Gate de una sola autorización temporal por ronda/proveedor en esquema privado PILOTO, con dobles verificaciones de consentimiento, vencimiento, familia de artículos, zona y fuente; sin confirmar listas genéricas ni activar envíos.
- Traducción de cantidades y unidades del pedido al mensaje «20 bolsas», «5 litros» sin alterar originales, y operador condicionado a `pending`.
- Smoke PostgreSQL reversible, regresiones y procedimiento de activación/reversión documentado en `docs/208-mvp-089-primer-envio-acotado.md`. El backend existente no comunica finalistas ni entrega presupuestos al comprador todavía.

## MVP-077 — Cierre automático PILOTO (02/11/2026)
- Nuevo job Supabase Cron cada 5 minutos para ejecutar exclusivamente la RPC privada de cierre D076 con no envíos y no revelaciones. Migración, smoke rollback, test de seguridad y documentación en docs/197. El ranking y WhatsApp a finalistas siguen pendientes.

## MVP-076 — 4 días por defecto y anonimato previo al cierre (02/11/2026)
- Contrato 4 días por omisión (antes 5), 3–7 días explícitos en ruta legacy.
- SQL piloto: vencimiento privado, cierre idempotente y guards Whapi para no registrar/enviar ofertas fuera de plazo; los finales no comparten contactos por cerrar.
- Módulos offline para lista de artículos/precios anónimos y plan de WhatsApps de contacto mutuo solo de finalistas comprobados. Sin cron, envío, ranking real ni divulgación. Ver docs/196.

## MVP-075 — Auditoría conservadora de presupuestos WhatsApp en texto (02/11/2026)
- Nuevo módulo offline que conserva fuente literal y hash, identifica renglones extra/cargos/descuentos, IVA/flete y solo concilia importes explícitos inequívocos con BigInt.
- Caso real de ensayo con $180.000/$35.000/TOTAL $215.000: las cifras permanecen literales, sin ranking por ambigüedad.
- Sin cambios en Supabase, WhatsApp, Vercel ni producción. Ver docs/195.

## MVP-074 — No invitar si el proveedor ya cotizó (02/11/2026)
- Corregida cola privada PILOTO: responder a una solicitud cancela solamente la invitación aún pendiente del mismo proveedor y pedido; se conservan los estados inciertos y el texto del presupuesto original.
- El claim y la autorización previa a Whapi impiden solicitar de nuevo cuando ya hay una cotización.
- Migración y prueba SQL con rollback; sin habilitar envíos ni cambios a producción. Ver docs/194.

## MVP-073f — cierre de riesgos del piloto (01/11/2026)
- Receptor Supabase Edge v3: ninguna solicitud parcial si el texto contiene renglones no reconocidos.
- Migración `mvp073f_outbox_buyer_consent_guard` aplicada: BAJA comprador, cancelación y expiración bloquean claims y autorización de envío.
- SQL smoke reproducible de BAJA y lease con rollback pasó. Sin WhatsApp real ni cambios en DEV/producción.

## MVP-073 — receptor Whapi Supabase piloto (01/11/2026)
- Edge Function piloto desplegada v2; receptor validado por estructura/código, secreto HTTPS, canal y chat; AES-GCM y claves HMAC en variables privadas pendientes.
- RPC de inscripción por código de un solo uso, BAJA, inbox y presupuestos en versiones fieles, outbox con leasing y estados inciertos sin reenvíos ciegos.
- Migraciones 073/073b/073c/073d aplicadas solo en piloto. SQL smoke comprador/proveedor y outbox reales con ROLLBACK aprobados. Whapi real OFF.
- Documentación de configuración segura y límites de extracción/ranking: docs/193.


## MVP-072 — base PostgreSQL piloto aislado instalada (01/11/2026)
- Migración independiente `mvp072_pilot_private_runtime_and_seed` aplicada en Supabase piloto Free; cero cambios a DEV histórica y Te Hice Esto.
- 3 participantes ficticios; 51+51 renglones idénticos, sin precios/telefonía. 41 familias curadas y 10 retenidas por negocio. Tablas privadas RLS; 0 permisos web; 0 WhatsApps; presupuestos inmutables y antirreplay.
- SQL E2E transaccional real: 2 destinatarios en La Plata, 0 en Berisso, originales inmutables, mensaje duplicado rechazado; rollback confirmado.
- Nuevos test y docs/192. Pendiente identidad/consentimiento/Whapi E2E.

# Registro de cambios

## MVP-071 — pantalla integrada de ensayo un arquitecto y dos corralones
- Nuevo recorrido `/probar/tres-telefonos`: ambos negocios con catálogo de 51 productos iguales, zona y pedido, dos presupuestos literales con extras y cargos intactos, sin ranking económico no verificable.
- Tests de tres participantes, filtro zona, retención de originales y prevención de falsa adjudicación. Sin envíos ni persistencia real.
- Ruta de integración WhatsApp y respaldo obligatorio #175 en docs/191. No afectar proyectos de otros negocios ni pagar ramas.


## MVP-070 — 51 materiales iguales para ambos corralones en demo
- Mismo listado ficticio, amplio y sin precios, desde una sola fuente de código en los dos cuadros de `/probar/catalogos`; cada proveedor puede editar su lista en la simulación.
- Taxonomía D015 ampliada en 22 familias específicas, v2 y snapshot Edge sincronizado; negativas para no confundir ladrillos, hormigón celular ni cementos especiales. Pruebas de reparto igualitario y filtro por zona.
- **Sin persistencia de catálogos ni Whapi real**; fuentes, limitaciones y gates en docs/190.


## MVP-069 — carga CSV/TXT de negocios y selección simulada por catálogo
- Pantalla móvil `/probar/catalogos` con dos listados locales en CSV/TXT; parser conservador de seis familias curadas, desconocidos y duplicados pendientes. Ignora precios; catálogo preliminar no equivale a producto activo en backend.
- Pedido con localidad; consultas solo para negocios cuya familia reconocida coincide y que declaran esa zona. Pruebas adversarias sin red.
- **No se registra información en DB ni se conecta Whapi.** XLSX/PDF real y backup+restore #175 siguen pendientes. Docs/189.


## MVP-068 — lista privada de 3 participantes Whapi (solo rama)
- Receptor Preview D083 exige 1 HMAC comprador y 2 HMAC proveedores, distintos y configurados únicamente en secretos privados; valida número remitente + rol antes de consulta SQL, manteniendo autorización y consentimiento por empresa.
- Pruebas con números completamente ficticios y cuarto número bloqueado. Ningún número real, token ni clave se incorpora a GitHub ni a CI. No se despliega ni se registran contactos en Supabase.
- Mantiene abiertos backup #175, SQL comercial/alta telefónica, Preview actualizada y ensayos con WhatsApp real. Docs/188, Issue #349.


## MVP-067 — corrección de ruta del webhook Whapi y preflight (en rama)
- Se alinea MVP-041 con la ruta Next real `/api/integraciones/whapi`, rechazando la antigua `/api/whapi/webhook` y evitando falsos positivos de configuración. El auditor local usa `COTIRONDA_WHAPI_WEBHOOK_SECRET`, el mismo nombre que el receptor D083; no agrega secrets ni HTTP.
- Se documenta piloto 1 arquitecto + 2 corralones propios y gates para solicitar números. Aún sin Whapi conectado, SQL DEV, backup auténtico, portal Preview reciente ni mensajes reales. Docs/187, Issue #347.


## MVP-066 — WhatsApp central exige recepción de comprador y proveedor (solo rama)
- La ruta Preview D083 activa contrato obligatorio de doble rol; D027 rechaza con 503 si falta resolver, persistir o registrar BAJA para comprador o proveedor. El receptor antiguo solo-proveedor conserva compatibilidad sin activar el flag.
- Nuevo test de rutas por número verificado, rechazo de no registrados y rol dual; sin secretos ni teléfonos reales. Reglas integrales en docs/186 e Issue #345.
- **Sin despliegue ni Whapi vivo**: faltan alta verificada de teléfonos compradores, backup/restore DEV #175, presupuestos completos visibles en portal, interpretación de archivos y divulgación real de finalistas.


## MVP-065 — prototipo móvil WhatsApp-first de 4 participantes (simulación)
- Nueva página `/probar/whatsapp` integrada a la portada y `/probar`, experiencia móvil en 5 momentos, sin adjudicación ni confirmaciones. Usa parser natural MVP-058/MVP-028 para 1 arquitecto y 3 comercios ficticios por catálogo.
- Presupuestos originales íntegros, pallets/bolsones/total literal intactos, correcciones simuladas como versiones sin reemplazo, cobertura parcial honesta y dos proveedores máximo. No infiere IVA/flete ni ranking económico.
- Navegador sin acceso a Whapi/Supabase, sin token visible ni guardado; no hay webhook real ni despliegue. Suite Node de 9 casos de integridad y UI Next build; #175/#339 pendientes. Docs/185.

## MVP-064 — vínculo original cifrado D093 al recibo económico D060 (laboratorio)
- D093 crea una vinculación inmutable por channel/message y offerVersion contra el mensaje íntegro cifrado del inbox D028; SHA256 texto fuente, SHA256 ciphertext, conteo de renglones/bytes y posición/hash del TOTAL literal. No almacena texto comercial en claro.
- La RPC D093 llama a D060 y guarda evidencia en el mismo COMMIT; replay idéntico mantiene versión y fuente distinta falla. Sin grants directos anon/auth/service_role; PostgreSQL17 prueba total, replay, rollback y versiones. **El worker privado D062 requiere ahora D093 y rol D092 exclusivo de ese RPC.** Aún falta vista comprador íntegra y archivo original binario. #175 y #339 abiertos; docs/184.

## MVP-063 — Regla obligatoria: presupuesto original íntegro, incluidos extras y TOTAL (desarrollo)
- Auditoría confirmó brecha: el pipeline D061/D063/D060 y la vista MVP014 solo incluyen artículos que pidió el comprador, no pallets, bolsones vacíos, extras ni TOTAL del proveedor. **Aún no es fiel de punta a punta**.
- Nuevo módulo puro `presupuesto-original-fiel-mvp063.ts`: espejo de cada línea textual original sin borrar/reordenar, tokens de importes literales, SHA-256 fuente, TOTAL declarado extraído solo con evidencia explícita unívoca, sin sustituirlo por cálculos. Clasificación aparte sin eliminar líneas ni atribuir extras por conjetura.
- Vista de cotizaciones muestra advertencia explícita sobre extras/total todavía ausentes. AGENTS y docs/183 incorporan regla de negocio y puertas para persistencia/versiones D093, archivos originales y UI íntegra. Tests de pallets, bolsones, descuento, flete, total distinto, ambigüedad y no omisiones. Sin tocar DB ni Whapi reales.

## MVP-062 — Respuestas por WhatsApp → ofertas verificables, sin confirmación extra (código)
- Se compuso D062 cola durable + D061 AES-GCM/alcance + D063 precio textual explícito + D060 ledger de presupuestos/versiones. Cota de 2 trabajos por tick; sin enviar mensajes, sin inferir precios ni IVA.
- Nueva ruta privada Preview `/api/integraciones/whapi/cotizaciones`, nueva SQL D092 (tres logins sin contraseña, SET ROLE único por cola/lectura/escritura) y driver TLS Session PG17. CI con errores, reprocesos y precios ambiguos.
- Sigue apagado: Supabase DEV #175, catálogos y contactos, Whapi, cron y archivos/IA pendientes. Docs/182, Issue #337.

## MVP-061 — Conexión privada del emisor Whapi de invitaciones (sin activación)
- Reutiliza sender D070 + transporte Whapi D055 + destinatario cifrado D068 en `POST /api/integraciones/whapi/enviar`, protegido por secreto exclusivo y doble flag Preview, un trabajo por tick, número en allowlist explícita de 1–3 comercios.
- Nuevo D091: LOGIN sin password/NOINHERIT y gateway con solo seis RPC; driver Postgres.js con sesión nueva y autocommit por RPC antes de HTTP, TLS CA y proyecto DEV, cierre al finalizar.
- CI pruebas HTTP/Whapi mock, duplicados, revocación, BEGIN incierto, SQL allowlist y PG17. Pendientes #175 recuperación DEV, enrolamiento 4 teléfonos, Whapi y cron. Nunca se activó envío real. Docs/181.

## MVP-060 — Ejecutar cola de pedidos desde HTTP privado (sin habilitación)
- Ruta Node Preview `POST /api/integraciones/whapi/procesar` autenticada con secreto propio, sin body, alcance máximo de 3 trabajos; el cliente no puede seleccionar empresa/ronda/canal. Nunca envía WhatsApp.
- Driver Postgres.js reutilizado, cinco conexiones por rol D090 sin herencia/direct-table rights, CA TLS y sesión reservada, cierre garantizado ante error, criptografía D029 reutilizada; 5 URLs privadas y usuario técnico distinto por puerto.
- Test CI Node y PostgreSQL17 con rol propio; SQL instalado únicamente en laboratorio CI. Backup real #175, cron, credenciales, Whapi y catálogos reales pendientes. Docs/180, issue #333.

## MVP-059 — Worker de pedido comprador WhatsApp compuesto (sin publicar)
- Se conectaron los módulos D082 (cola durable), D077 (lectura AES y respuesta de localidad), D073 (texto WhatsApp), D081 (ronda idempotente) y D071 (match/invitaciones) sin nuevas RPC ni llamadas de red.
- Puertos SQL separados con lista cerrada por rol y parámetros, pruebas de pedido completo, falta de zona, fallo tras COMMIT/retry, revocación, AES y apagado. Sin WhatsApp enviado.
- Pendiente: base DEV recuperable #175, catálogos/consentimiento real, ejecutor por cron, envío controlado y lectura de presupuestos. Docs/179 y Issue #331.

## MVP-058 — Lista natural de WhatsApp sin obligar al comprador a usar un formato
- D073 normaliza exclusivamente separadores evidentes de lista dentro de un mensaje para D028: cantidades+unidades reconocidas, `Entrega:` y `Plazo:`; evita incluir el punto final en la localidad. No usa IA ni reescribe el parser del portal.
- Pruebas del pedido natural de 20 bolsas cemento, 10 litros hidrófugo, 5 litros látex, además de decimales, IVA/plazos, sin zona y descripciones dudosas (sin envío).
- No activa Whapi ni trabaja con contactos de producción; #175 y SQL comercial remoto aún pendientes. Docs/178, Issue #329.

## MVP-057 — Receptor Whapi Preview con driver SQL real (código, sin desplegar)
- El POST de Next D083 ya inyecta un driver Postgres.js 3.4.9, sesión reservada y cerrada por request, TLS con CA/hostname, project DEV y usuario técnico D085. Con credenciales ausentes conserva error seguro, sin conexión ni envíos.
- D089 crea LOGIN técnico sin contraseña, NOINHERIT, con SET ROLE solo D084; pruebas PG17, Node y Next. Se bloqueó integridad en npm lock.
- Falta instalar SQL/rol DEV de forma recuperable, cargar los 4 contactos/catálogos, conectar workers/IA, cotizaciones, envíos y revelar finalistas. No se activó Whapi ni Vercel producción.

## MVP-056 — Ensayo comercial consolidado WhatsApp → tres comercios (sin desplegar)
- PostgreSQL17 CI: 1 arquitecto, 2 corralones, 1 pinturería, pedido de cemento/hidrófugo/látex para La Plata, ronda de 5 días. Verifica matching por catálogo concreto y ubicación y que cada negocio reciba solo su alcance; reintentos no duplican invitaciones.
- Verificados 0 proveedores/catalogo/empresas reales cargados en Supabase DEV (solo lectura). Documento operativo docs/176, Issue #325.
- Sin envío Whapi, sin conectar API IA real, sin modificar Supabase DEV/producción ni usuarios OFI.

## MVP-055 — Canal WhatsApp central reutilizando aprendizaje de OFI (desarrollo)
- Verificado repo privado `ProtectorRudo/ofi` rama `ofi-v2`: distribución por remitente verificado sobre un único canal Whapi; se adopta el diseño, nunca las credenciales ni datos.
- Añadido test multiproveedor/comprador D083 con un solo número central, replay sin duplicados, identidad cifrada y rechazo de remitentes ilegítimos. Cotironda no impone límite artificial de 5 chats (solo Sandbox Whapi aplica ese cupo).
- Documentado onboarding Whapi, límites reales, costos por canal, cinco conversaciones piloto y bloqueo de ruta 503; docs/175, issue #323.
- No se conectó ni contrató Whapi, no se modificó OFI, Supabase DEV, DNS, main ni producción.

## MVP-054 — Reloj de cierre y finalistas anónimos por rubro (sin publicar)
- SQL D086 transiciona rondas por hora del servidor con lock y rol privado; recupera programadas vencidas sin doble cierre.
- Módulo puro de finalistas por rubro utiliza motor D039/D022, no mezcla parciales ni revela datos; pruebas PG17/Node, Issue #321 y docs/174.
- No hay cron, conexión WhatsApp, disclosure ni instalación real en DEV/producción.

## MVP-053 — Plazo comercial WhatsApp de 3–7 días, default 5 (sin publicar)
- Se corrigió el vencimiento de 2 días que D081 tenía fijo. El arquitecto puede indicar una línea opcional de plazo, conservada al preguntar localidad; sin línea son 5 días corridos.
- Node/SQL rechazan 2, 8 y directivas duplicadas; cierre se calcula con reloj PostgreSQL y duración forma parte del replay idempotente.
- D066 añade fecha límite local argentina al mensaje específico de cada proveedor, sin revelar identidades. Pruebas Node/PG17 y docs/173, Issue #319.
- Sin cambios en Supabase DEV, Whapi real, main ni producción; cierre finalistas/contactos sigue pendiente.

## MVP-052 — Identidad SQL restringida para receptor Whapi (rama de desarrollo)
- D085 prepara sesión PostgreSQL dedicada con comprobación de login/effective role y `SET ROLE` D084; limita a seis RPC existentes y cierra conexión en error.
- Tests para cuenta administrativa equivocada, SQL arbitrario, aridad, errores y cierre. Issue #317 / docs/172.
- No introduce `pg`, credenciales, webhook activo, migraciones DEV ni producción. #175 continúa bloqueando recepción real.

## MVP-051 — Preflight y cierre de conexiones del receptor WhatsApp (DEV, sin publicar)
- D083 rechaza Content-Type y Content-Length inválidos antes de abrir PostgreSQL; D027 sigue comprobando tamaño real de cuerpo.
- Puerto SQL D030 permite cierre opcional; D083 lo libera incluso ante errores, sin provocar reenvío cuando ya hubo persistencia.
- Pruebas de regresión de rechazo sin SQL, liberación y secretos no expuestos. Issue #315 y docs/171. Sin conectar Whapi ni alterar Supabase DEV/main.

## [Sin publicar] — Etapa 01 / Seguridad y registro
- Esquema multiempresa propuesto y RLS probadas en PostgreSQL 17 efímero mediante GitHub Actions.
- Registro SQL atómico de organizaciones, propietarios y proveedores; datos privados e idempotencia persistente por usuario y solicitud.
- Pruebas con A/B, usuario suspendido, rol miembro y acceso anónimo, incluido intento de escritura ajena.
- Tests de alta duplicada, cambio de payload, rollback ante usuario inexistente y dos solicitudes simultáneas.
- **50 pruebas unitarias** y pruebas reales SQL verificadas en CI. La versión final de ese conjunto aún no está integrada a main.
- Pendiente: Supabase Auth real, backend HTTP, rate limits, interfaz y Supabase aislado de desarrollo.

## Etapa 00 — Documentación
- Documentación de visión, reglas, arquitectura, clasificación, mensajería, ranking y seguridad.

## Sitio preliminar público
- Vista informativa con simulación ficticia en https://cotironda.vercel.app. NO habilita licitaciones, WhatsApp ni pagos.

## [Portal de registro en desarrollo - PR #8]
- Login y alta Next.js con cookies Supabase SSR y validación de sesión contra Auth cuando exista un proyecto exclusivo.
- API fail-closed: origen, contenido/tamaño, usuario verificado, campos, errores sin secretos.
- Cuota SQL de 5 altas nuevas por usuario/24h con bloqueo por actor; reintentos anteriores permitidos.
- 64 tests unitarios, PostgreSQL 17 con pruebas SQL y build de Next.js aprobados; producción sin modificaciones.

- Vista previa aislada y protegida en Vercel `cotironda-portal-dev`; build READY sin credenciales ni registros activos.

## [Seguridad de portal - PR #10]
- Cierre por defecto de sesiones, formulario y POST cuando falta el proyecto exclusivo o no coincide el origen/DB.
- Protección SSR contra caché compartida y reenvío de cabeceras de cookies renovadas.
- 77 tests unitarios, PostgreSQL/RLS, build Next y prueba HTTP real aprobados; sin activación productiva.

## [Conexión a Supabase — desarrollo, 29/10/2026]
- Viralio se pausó sin borrado para liberar un cupo gratuito (puede reanudarse).
- Proyecto Supabase exclusivo `cotironda-dev` creado en São Paulo, costo cotizado USD 0/mes.
- Migración inicial `20261029105736_initial_identity_catalog` aplicada en desarrollo; nueve tablas con RLS y cinco rubros.
- Pruebas reales de aislamiento por organización y registro idempotente aprobadas y revertidas, sin filas de prueba persistentes.
- Historial versionado en GitHub; continúan pendientes Supabase Auth en portal y E2E.

## [Seguridad backend sin privilegios administrativos — desarrollo]
- Rol `cotironda_app` creado en Supabase dev como NOLOGIN/NOINHERIT/NOBYPASSRLS.
- RLS explícitas permiten sólo lectura e inserción mínimas para registrar empresa/propietario/perfil; sin UPDATE, DELETE, acceso a productos, contactos ni Auth.
- Ejecución SQL `register_company` autorizada al rol propio y revocada a `service_role`.
- Migración 20261029111731 aplicada, registrada y probada en PostgreSQL de CI y Supabase real; fixtures revertidos.
- Portal rechaza conexiones con usuario `postgres` o `service_role`; el registro continúa deshabilitado.

## [Registro exclusivamente por función — desarrollo]
- Migración `20261029112947_execute_only_registration` aplicada y versionada.
- Revocados SELECT/INSERT directos del rol de API sobre empresas, membresías y solicitudes.
- Alta permitida solo por función privada de propietario NOLOGIN, sin BYPASSRLS; nueva suite SQL contra PostgreSQL y Supabase real.
- 79 unit tests, Next build y prueba SQL en CI aprobados; **sin activar usuarios reales ni publicar backend**.

## [Etapa 01 — JWT y doble bloqueo, desarrollo]
- Cuarta migración aplicada a Supabase dev: `20261029120021_jwt_bound_registration_locked`.
- RPC usa identidad derivada de JWT PostgREST, sin parámetro `user_id`; se revocó el camino privado legado.
- Interruptor adicional en PostgreSQL `registration_settings.enabled=false` impide altas por llamada directa.
- Retirados adaptador `pg`, dependencias SQL y variables `DATABASE_URL` del portal; lockfile regenerado en CI.
- Pruebas PostgreSQL, CI y Supabase real aprobadas, con fixtures revertidos.
- Advertencia Supabase `authenticated_security_definer_function_executable` pendiente de resolución. E2E Auth y correo confirmado siguen bloqueantes; sin producción.

## [Sin publicar — PR #18: correo confirmado y eliminación del WARN]
- Migración `20261029122708_invoker_verified_email_hook` aplicada en `cotironda-dev` y versionada.
- RPC pública pasó a `SECURITY INVOKER`; ejecución privilegiada relegada a función privada con propietario sin LOGIN/BYPASSRLS.
- La nueva función privada exige claim firmado `cotironda_email_verified=true`; su ausencia o valor falso bloquean el alta, incluso si la bandera de BD se habilita.
- Custom Access Token Hook `SECURITY INVOKER` obtiene confirmación de `auth.users.email_confirmed_at`, ignorando `user_metadata` manipulable. Hook no activado aún.
- Tests de correo sin confirmar, anónimo, falta de claim, repetición, permisos, RLS y rollback aprobados en CI y en Supabase dev.
- **Supabase Security Advisor: 0 WARN** tras aplicar la migración, queda solo observación INFO intencional.
- Sin activación de registros ni despliegue comercial; E2E real de Auth Hook/JWT, límites de tasa y cookies siguen pendientes.

## [Sin publicar — E2E de autenticación real, PR #20]
- Runner seguro `apps/portal/scripts/auth-real-smoke.mjs` para validar con dos cuentas de prueba JWT firmados, claim de confirmación, RPC y bloqueo SQL sin registrar empresas.
- Preflight estricto: sólo `cotironda-dev`, clave publicable, bandera específica para permitir llamadas Auth y dos cuentas distintas; nunca usa service_role.
- 9 pruebas unitarias nuevas de preflight y payload que no permite persistir datos ni con DB abierta accidentalmente.
- Procedimiento de habilitación del Auth Hook y desactivación ante errores; WAF rate-limit examinado como capa futura, no activado por costos y cobertura incompleta.
- Los tests reales con credenciales todavía no se ejecutaron. Doble bandera de registro desactivada, producción sin cambios.

## [Sin publicar — PR #22, prueba adversarial de JWT]
- Test E2E preparado: cambia el sujeto de un JWT legítimo sin modificar su firma y comprueba rechazo real en PostgREST, no solo en SQL.
- Nueve pruebas nuevas evitan falsos positivos por errores de negocio o doble bloqueo; nombre inválido impide persistencia.
- CI verifica sintaxis del runner E2E, sin enviar credenciales ni solicitudes Auth.
- Firma real, expiración y revocación aún pendientes de E2E con el hook activado; sin producción ni registros.

## [Sin publicar — PR #24: sesión actual comprobada]
- Sexta migración `20261029130907_session_revocation_and_verified_user` aplicada y versionada en Supabase dev.
- Alta exige session_id JWT y existencia de auth.sessions del mismo usuario; correo actual confirmado, no-anónimo, no-borrado y no-suspendido.
- Helper booleano exclusivamente privado; AUTH no expuesto y sin permiso de ejecución por clientes; funcion pública INVOKER sin modificación de firma.
- Pruebas PostgreSQL y Supabase reales reversibles, incluidos token sin session_id, sesión revocada, vencida y usuario suspendido. Sin producción ni usuarios reales.

## [Sin publicar — preparación de cuota y sesiones reales, Issue #27]
- El portal ya no concede intentos incondicionales: guardia HTTP fail-closed mientras no exista límite distribuido integrado en la RPC.
- Verificación estructural adicional de claims de sesión firmada; el runner E2E comprueba cierre de sesión local y no ignora fallos de signOut.
- Pruebas unitarias de no persistencia con limitador ausente y de cableado real de la ruta de Next.js.
- **Sin nuevo rate limiter ni prueba real de revocación**: estos controles siguen bloqueantes. Sin cambios SQL ni producción.

## [Sin publicar — PR #30: cuota SQL atómica de intentos]
- Migración oficial 7 `20261029140422_registration_attempt_rate_limiter` aplicada solo en cotironda-dev después de ensayos SQL reversibles.
- Cuota persistente de 20 solicitudes autenticadas por usuario/60 minutos, incluida denegación de negocio; RPC directa protegida incluso sin Vercel.
- Contador SQL atómico con saturación, RLS privada y respuestas estructuradas; no se revierte el consumo al rechazar una petición.
- Tests PostgreSQL con 40 conexiones (8 simultáneas), 20 aceptadas para validación y 20 bloqueadas; no hubo empresas creadas por esa prueba.
- **108/108 tests unitarios** y cuatro GitHub Actions verdes. Supabase Advisor 0 WARN/ERROR, 0 usuarios/empresas/sesiones/cuotas persistidas.
- **Bloqueantes vigentes:** Auth Hook auténtico, JWT/refresh/cookies E2E, verificación de HTTP 429 real y defensa contra abuso multi-cuenta/IP. Portal sigue fail-closed y producción intacta.

## [Sin publicar — PR #32: contrato HTTP 429 del SDK]
- Corregido el adaptador del registro para leer `PostgrestResponse.status`: 429 real deja de depender de `PostgrestError.status`, códigos o mensajes arbitrarios.
- CI ejecuta la librería auténtica `@supabase/supabase-js` con un `fetch` simulado, verificando 429/403/200 y ausencia de reintentos sin tráfico real.
- 109/109 pruebas unitarias y cuatro CI verdes. No hay nuevas migraciones ni cambios de Auth y el portal permanece fail-closed.
- Continúa pendiente el HTTP real PostgREST con JWT auténtico, las sesiones reales y la prueba de cookies.

## [Sin publicar — Recuperación de aislamiento del portal, Issue #33]
- Recuperado selectivamente el guard de PR #26: la configuración del portal de desarrollo solo acepta `cotironda-dev` y bloquea `VERCEL_ENV=production`.
- Nuevas pruebas que rechazan URL/ref de otro Supabase coherentes entre sí y validan Preview, Development, Production, flag apagado y permisos de configuración.
- No se alteró la cuota SQL de PR #30 ni el manejo del 429 de PR #32. No hay nueva migración, cambios a Auth ni producción.
- Detectado riesgo de autodespliegue: proyecto `cotironda` de Vercel está enlazado a GitHub. Integración de PR en `main` **no autorizada** hasta confirmar barreras de despliegue.
- Informe y lista de PR apilados: `docs/30-integracion-aislamiento-portal.md`.

## [Sin publicar — PR #36: prueba HTTP de cierre en Vercel Production simulado]
- Nueva prueba de Next.js real (segundo build completo) con `VERCEL_ENV=production` y flag de registro `true`, con URL correcta de `cotironda-dev` y clave pública ficticia sólo para CI.
- Preflight positivo de Preview evita falsos positivos por configuración inválida. En Production se exigen páginas sin formulario y POST de alta 503 sin conexión a Auth ni SQL.
- No se tocó Supabase/Vercel ni se fusionó main; el guard no sustituye barrera de despliegue. Ver `docs/31-production-guard-http-ci.md`.

## [Sin publicar — PR #39: reconstrucción segura desde migraciones]
- Nuevo ensayo CI PostgreSQL 17 desde cero usando las siete migraciones SQL versionadas, sin atajos por `schema.sql`.
- Test de integridad del historial y equivalencia del SQL efectivo de migración 1 con el esquema declarativo.
- Hallazgo: la limpieza concurrente borraba un usuario con sesión hija todavía existente, violando FK. Corregido el orden (sesión → usuario) y agregado check final de 0 datos sintéticos.
- Base real Supabase, GitHub `main` y Vercel producción sin modificaciones. Ver `docs/32-reconstruccion-migraciones.md`.

## [Sin publicar — Hook Auth habilitado y test de permisos con rol limitado]
- El propietario habilitó en `cotironda-dev` el Custom Access Token Hook configurado con `cotironda_private.email_verified_access_token`. Comprobación remota SQL read-only ante UUID inexistente devolvió claim false (NO es un JWT firmado real).
- Se agregó test PostgreSQL del hook como `supabase_auth_admin` emulado: verificado/no confirmado/anónimo/inexistente, preservación del `sub` e independencia de metadata editable.
- El runner manual Auth E2E usará `signOut({scope:'global'})` para limpiar sesiones de **cuentas exclusivamente de ensayo**. JWT anteriormente emitido puede permanecer válido hasta exp; revocación por SQL Auth real no probada.
- Registro comercial y plataforma productiva no habilitados. No se crean usuarios ni empresas; falta prueba E2E real con cuentas dedicadas y contraseñas privadas.
- Ver `docs/33-auth-hook-rol-e2e.md` y `docs/24-auth-e2e-seguridad.md`.

## [Sin publicar — Primer E2E Auth/JWT auténtico en Chrome, 29/10/2026]
- El propietario ejecutó el diagnóstico local de Auth con dos cuentas exclusivas de `cotironda-dev`. La captura muestra login confirmado, claim de JWT verdadero, identidad reconocida por `/auth/v1/user`, RPC denegada por interruptor SQL, JWT con `sub` adulterado rechazado explícitamente por autenticación, cuenta pendiente bloqueada y logout global aceptado.
- Auditoría del HTML ejecutado: SHA-256 `26c803472222efb274e94056e7a35dd5f453a822abe7cb659f432bc40f940f5f`. Se verificó qué condiciones exige cada resultado verde. **No se suben las credenciales ni el HTML al repositorio público**.
- Verificación independiente posterior (SQL read-only en `cotironda-dev`): dos usuarios Auth (uno confirmado, uno pendiente), uno con login registrado, cero sesiones, organizaciones, membresías y cuotas persistidas; `registration_settings.enabled=false`.
- Sigue sin probarse expiración legítima, cookies SSR/refresh, revocación efectiva de access token preexistente y HTTP 429 real sobre PostgREST. No representa habilitación comercial.
- Documentación `docs/34-auth-jwt-navegador-real.md`. Ningún merge, ningún despliegue, ningún cambio Auth adicional en este commit.

## [Sin publicar — PR #43: contrato de cookies y refresh SSR]
- Contrato automático del `@supabase/ssr` real: login simulado, cookie SSR, lectura en segunda request, renovación de access/refresh tokens, aislamiento entre visitantes y eliminación de cookies tras logout simulado. Todo con `fetch` local falso, sin usuarios ni claves reales.
- Probado **`proxy.ts` de Next.js**: frente a JWT ficticio vencido, renueva en Auth simulado, transmite `Set-Cookie` con `SameSite=Lax` y exige `Cache-Control: private, no-store`. Flag false no hace requests Auth.
- `getClaims` NO verifica revocación en servidor; `getUser` se prueba como control independiente. Se ajustó import `next/server.js` para ejecución del módulo Proxy también en Node ESM.
- La CI Next ejecuta el contrato antes de typecheck y los dos builds. Sin migraciones, cambios remotos, merge ni despliegue.
- Evidencia, alcances y riesgos restantes: `docs/35-ssr-cookies-refresh-proxy.md`.

## [Sin publicar — PR #46: revocación estructurada tras migración 7]
- Auditoría detectó que el test histórico 80 esperaba excepciones, mientras la RPC actual devuelve `registration_status='session_invalid'` después de la séptima migración.
- Se preservó el test 80 en su punto histórico y se añadió `93_revoked_session_status.sql`, ejecutado **en ambos jobs** de PostgreSQL después de migración 7.
- Siete escenarios de JWT simulado: faltante, revocado, sesión nueva válida, idempotencia, sesión vieja tras nuevo login, ajena y vencida. Se exige estado y columnas exactas, ningún alta por rechazos y cuota por usuario.
- Ejecución completa dentro de ROLLBACK sobre fixture CI. Sin cambios a las siete migraciones, Auth real o producción. `docs/36-revocacion-sesiones-rpc-actual.md`.

## [Sin publicar — PR #48: E2E HTTP de Next en Preview con Auth ficticio]
- Se sumó tercer `next build` y smoke HTTP del servidor real Next.js en `VERCEL_ENV=preview`, con bandera de portal activada **solo dentro de GitHub Actions**.
- Interceptor CI en proceso Next bloquea fetch remoto externo y suplanta exclusivamente endpoints Auth esperados. La cookie SSR la genera `@supabase/ssr` instalado, con JWT de firma intencionalmente falsa.
- Contrato: /ingresar tiene formulario, /alta anónimo redirige, /alta con cookie sintética validada por Auth falso presenta formulario, cookie adulterada y POST anónimo denegados, origen ajeno 403, POST con sesión simulada 503 `limite_no_disponible`, y `no-store`.
- Supabase dev, Auth Hook, permisos, migraciones y entorno público sin modificar; registros comerciales permanecen deshabilitados.
- Ver `docs/37-preview-http-auth-aislado.md`; siguen pendientes revocación de JWT auténtico y cookies HTTPS reales, registro y 429 seguro.
\n## [Sin publicar — Auditoría de dominio y Storage de la Etapa 01]\n- Confirmado en Vercel: proyecto `cotironda` (demo) y `cotironda-portal-dev` (desarrollo) separados. Dominio `cotironda.com` adquirido por propietario en Hostinger, aún sin configurar hacia Vercel; se propuso `www` como canónico y apex como redirección al momento de `Publicalo`.\n- Revisión DNS read-only y procedimiento de conexión/HTTPS/rollback sin tocar Hostinger, Vercel, Auth o producción: `docs/38-dominio-hostinger-vercel.md`, Issue #49.\n- Auditoría Supabase dev read-only: **0 buckets y 0 policies en storage.objects**. Se identificó Storage privado como brecha pendiente y se definió contrato de RLS, uploads y retención para Issue #50; ver `docs/39-storage-privado-pendiente.md`.\n- Tests de dominio/origen estricto: HTTPS, coincidencia exacta, corte Production, origin CSRF previo a Auth. No es conexión DNS ni prueba real de despliegue.\n
## [Sin publicar — PR #52: Storage privado de borradores compradores]
- Octava migración `20261029183835_storage_private_buyer_drafts.sql`: bucket `cotironda-buyer-drafts` privado, 10 MiB, seis MIME; rutas canónicas con UUID y dos políticas RLS específicas para comprador activo, owner/manager al subir.
- Sin políticas de escritura anónima, UPDATE, DELETE ni publicación; los archivos de proveedores/ofertas requieren controles diferentes.
- Nueva emulación de Storage **solo en CI** y prueba adversarial transaccional 94: dos empresas, miembros, suspendidos, no miembros, proveedor, anónimo, paths maliciosos y operaciones prohibidas. Actualización de manifiesto de migraciones a ocho, sin modificar las siete históricas.
- No hay upload ni malware scanning, ni expiración de JWT de Storage comprobada con Auth real. Registro comercial permanece cerrado; ver `docs/40-storage-borradores-privados.md`.

- **Verificación remota de Storage (dev):** aplicada octava migración registrada por Supabase con versión `20261029183835`, después de corregir incompatibilidad con tabla gestionada `storage.objects` (se retiró ALTER TABLE redundante). Bucket privado y dos políticas reales confirmados en pg_policies; 0 objetos/empresas, flag registro=false. Nunca se alteró el owner del servicio ni se usaron credenciales de Storage.

## [Sin publicar — PR #54: validación previa a carga y contrato HTTP Storage]
- Módulo determinista `src/domain/borradores-storage.ts`: 10 MiB, MIME de bucket privado, firmas PDF/JPEG/PNG/WEBP, inspección conservadora de ZIP Office con directorio central, rutas UUID y rechazo de paquetes sospechosos. **No sustituye antivirus ni aprobación de documentos reales**.
- Adaptador de Supabase `apps/portal/lib/storage/borradores.ts`: `upload(upsert:false)` y `download` autenticados por RLS sin exponer URLs públicas ni secretos; no conectado a UI.
- Tests unitarios de documentos inválidos, macros, ZIP, extensiones y paths; contrato HTTP con SDK real y `fetch` falso, validación FormData y bloqueo 403 de rutas ajenas sin acceder a la red.
- Documentación `docs/41-storage-preflight-http-contract.md`, Issue #53, PR #54 draft. Registro y producción cerrados, sin archivos ni empresa de prueba.

## [Sin publicar — PR #56: prueba RLS Storage en Supabase real, reversible]
- Se incorporó `supabase/tests/manual/10_storage_rls_dev_rollback.sql`, que ejecuta una transacción única sobre las tablas gestionadas de `cotironda-dev`: empresas/membresías ficticias, lectura/escritura cruzada A/B, downgrade miembro, suspensión y usuario anónimo. **Todos los cambios se revierten**.
- La ejecución SQL remota devolvió `0` organizaciones, `0` membresías, `0` objetos del bucket y `registration_enabled=false`. Las dos cuentas de ensayo se seleccionan internamente sin exponer IDs ni emails; no hay HTTP ni JWT firmado.
- `tests/unit/storage-live-rollback-safety.test.mjs` impide quitar ROLLBACK o introducir DDL/COMMIT/cambios Auth por accidente. Ver `docs/42-storage-real-db-rollback.md`.
- Pendientes: E2E HTTP Storage real con miembro de empresa, antivirus, revocación access token y 429 remoto; sin merge ni deploy.

## [Sin publicar — PR #58: RLS de Storage comprueba revocación Auth por sesión]
- Se corrigió el acceso de borradores privados tras `signOut`: antes RLS verificaba membresía pero no `auth.sessions`; ahora migración 9 `20261029202610_storage_session_revocation.sql` agrega función privada `storage_session_active()` que valida claims de request, sesión existente, identidad actual y estado de usuario. Sólo `authenticated` puede ejecutar el guard; `anon`/service_role no.
- Tanto `SELECT` como `INSERT` de `cotironda-buyer-drafts` usan el guard además del aislamiento por empresa. Se conserva ausencia de UPDATE/DELETE, políticas anon y acceso público.
- Tests CI `95_storage_session_revocation.sql` y fixture histórico 94 actualizado; reconstrucción de 9 migraciones. Hubo un error inicial de expresión regular UUID con un grupo adicional, **detectado por CI y corregido** antes de instalar.
- Aplicado y validado SOLO en `cotironda-dev` con versión registrada por Supabase `20261029202610`. Test manual `11_storage_revoked_session_rollback.sql` real, con Auth sessions y organizaciones ficticias en `ROLLBACK`: sesión vigente permitida, correo no confirmado, sesión revocada y antigua tras login nuevo denegadas, nueva sesión aceptada, not_after vencido denegado; 0 datos persistidos.
- Aún falta E2E HTTP firmado y antivirus, retención/backup y consolidación de PR. Ver `docs/43-storage-session-revocation.md`.

## [Sin publicar — PR #60: bloqueo de uploads directos sin antivirus]
- Hallazgo: el módulo preflight de PDF/Excel/Word/imágenes corre del lado cliente, por lo que no evita que alguien llame a Storage API con un fichero manipulado y MIME declarado permitido. RLS de sesión/membresía no inspecciona bytes.
- 10ª migración elimina solamente la policy INSERT `cotironda_buyer_drafts_insert_manager`, mantiene SELECT privado con guard Auth; `subirBorrador()` falla localmente sin red con `carga_pendiente_revision_servidor`.
- Nuevo test 96: owner autenticado conserva lectura y **no** puede hacer INSERT; sesión revocada tampoco lee. Los tests históricos 94/95 se ejecutan antes de migración 10 en ambos recorridos CI.
- No se implementó escáner, cuarentena ni endpoint de ingreso. Ver `docs/44-storage-upload-fail-closed.md`; no habilitar carga comercial.

- **Supabase real de desarrollo:** 10ª migración aplicada con versión oficial `20261029211609`; `pg_policies` confirma **solo SELECT** por sesión vigente y empresa, sin escrituras. Test SQL manual 12 sobre tablas reales: lectura permitida, INSERT denegado, lectura revocada; ROLLBACK y 0 objetos/organizaciones/sesiones. No se hicieron uploads HTTP ni se abrió registro.

## [Sin publicar — PR #63: cuarentena privada y registro de ingestión idempotente]
- Migración 11 `20261029213755_private_quarantine_ledger.sql` aplicada exclusivamente en `cotironda-dev`: nuevo bucket `cotironda-upload-quarantine` estrictamente privado, 10 MiB y seis MIME, **sin RLS para clientes**. El bucket de borradores conserva solo lectura privada y sesiones verificadas, **sin INSERT**.
- Tabla privada `cotironda_private.document_intake_jobs` sin privilegios de usuarios, RLS activa, service_role con SELECT/INSERT/UPDATE pero no DELETE. Dedupe por empresa e idempotency key, máximo 10 MiB, estados de workflow y trigger de transiciones. `approved` exige veredicto limpio, versión de scanner, hora de análisis y hash SHA-256. No es garantía de análisis real hasta conectar scanner.
- Tests `97_quarantine_ledger.sql` en 2 jobs PostgreSQL 17, 11 migraciones; test manual `13_quarantine_ledger_dev_rollback.sql` en Supabase real pasó y dejó 0 jobs, 0 empresas y 0 archivos. Sin datos comerciales ni Auth nuevo. `tests/unit/quarantine-ledger-safety.test.mjs` bloquea regresiones.
- Hallazgo de arquitectura: Functions Vercel limitan el body a 4,5 MB frente al bucket de 10 MiB. Signed upload URLs de Supabase duran 2 horas sin nueva Auth. No emitirlas antes de resolver acceso a cuarentena, idempotencia, expiración, revocación y limpieza. Ver `docs/45-cuarentena-ledger-documentos.md`.
- Todavía no existe antivirus, worker, backend de carga, promoción, cola ni borrado programado. No habilitar archivos reales.

## [Sin publicar — Issue #68: auditoría read-only de puerta de Etapa 01]
- Consulta SQL reproducible de 17 controles de registro, sesiones, RLS/Storage, Auth Hook y permisos ejecutada con **17/17 PASS** en `cotironda-dev` usando solo lectura, sin cambios a la base ni a producción.
- Contrato unitario verifica que el script no incluya DDL/DML y que los controles fail-closed sigan presentes. Ver `supabase/tests/manual/14_etapa01_guardrails_readonly.sql` y `docs/47-etapa01-readiness-auditoria.md`.
- Auditoría Security Advisor: **1 WARN** de protección de contraseñas filtradas deshabilitada y **2 INFO** intencionales por RLS de tablas privadas sin policies. Siguen pendientes HTTP 429 real, JWT revocado por HTTP, cookies HTTPS reales, consolidación de PR. Registro y uploads deshabilitados.


## [Sin publicar — PR #71: PostgREST HTTP real, cuota y revocación en CI]
- Nuevo workflow aislado sobre PostgreSQL 17 con las **11 migraciones reales** y PostgREST Docker v12.2.12 por digest; JWT HS256 firmados con secreto aleatorio y temporal exclusivo del runner. Sin Supabase remoto ni credenciales reales.
- Contraste de extremos vía HTTP verdadero: denegación anónima, firma JWT alterada, expiración, 20 rechazos que consumen cuota y **HTTP 429 en el intento 21**, JWT todavía firmado con sesión revocada responde **HTTP 403 session_invalid**, login nuevo no revive JWT anterior y cuotas separadas. Todos los nombres de empresa son inválidos por diseño; **0 empresas creadas**, cleanup verificado.
- **5/5 workflows SUCCESS y 142/142 unitarias** sobre commit probado `4e50478480134b9de15b7de539e2dd1e6ff39659`. HTTP PostgREST: https://github.com/ProtectorRudo/Cotironda/actions/runs/40969448761
- No confundir este E2E HTTP con un JWT auténtico Supabase Auth: faltan prueba remota de logout/429 y SSR HTTPS con cookies. No hay cambios al proyecto Supabase real, main, Storage ni producción. Ver `docs/48-postgrest-real-http-ci.md`.


## [Sin publicar — PR #73: RLS multiempresa probada con HTTP verdadero]
- Fixture PostgreSQL CI con 2 proveedores y 4 personas ficticias: propietarios A/B, lector A y manager suspendido; peticiones GET/POST/PATCH/DELETE a PostgREST. Se verificó con SQL que los accesos negados no afectan filas, que el propietario modifica lo propio y que `user_metadata` falsa no eleva permisos.
- Se corrigió **únicamente** el helper `auth.uid()` simulado de CI para leer JWT JSON tal como la versión oficial de Supabase. 146/146 unitarias y 5 workflows GitHub SUCCESS en PR #73, sin datos reales ni publicación. Ver `docs/49-tenant-isolation-http-ci.md`.

## [Sin publicar — PR #75: cierre experimental de acceso comercial tras logout]
- Consulta read-only en `cotironda-dev` detectó **17 de 23** policies comerciales para `authenticated` sin guard de sesión vigente; las 6 restantes son del registrador con guard específico. Se creó Issue #74.
- `supabase/tests/ci/100_session_rls_hardening_draft.sql`: propuesta que agrega un guard `AND` en USING/WITH CHECK a las 17 policies de cliente, preservando los predicados y permisos anteriores. **SOLO se ejecutó en CI efímera, NO es migración oficial y NO se aplicó a Supabase dev.**
- PostgREST real: JWT firmado revocado no puede leer ni escribir, nueva sesión no revive el antiguo; limpieza y registro apagado confirmados. **149/149 unitarias y 5/5 workflows SUCCESS** en HEAD `5197d44c8bdf48557c9c9632ebeefa0164283868`. Ver `docs/50-session-aware-rls-ci.md`.
- Pendiente: migración formal generada por CLI, tests de 12 migraciones, revisión de rendimiento/seguridad, Auth Supabase genuino y cookies HTTPS. Sin merge, despliegue o cambios a producción.


## [Sin publicar — PR #77: migración 12 de sesión vigente en RLS comercial]
- Supabase CLI 2.122.0 generó el archivo base y la migración final endurece 17 policies authenticated en siete tablas sin ampliar roles/acciones ni modificar las seis policies del registrador; falla cerrado ante discrepancias de inventario, permisos o registro abierto.
- GitHub CI pasó reconstrucción incremental/histórica **12 migraciones**, pruebas PostgREST reales con JWT sintéticos, y 150 unitarias; correcciones del manifiesto a 12 y de un test que suponía cero sesiones en fixtures incrementales.
- **Aplicada solo en `cotironda-dev`** mediante migración Supabase; backend registró versión `20261029234236`. Archivo local y referencias CI renombrados a la misma versión para evitar drift frente al timestamp CLI inicial `20261029233650`.
- Verificación SQL remota: 23 policies totales, **17 client policies con guard de sesión**, seis policies registrador intactas (misma huella MD5), registro=false, 0 empresas, 0 sesiones, 0 objetos, 0 trabajos, 0 policies Storage de escritura. Security Advisor conserva 1 WARN previo por contraseña filtrada y 2 INFO intencionales.
- Queda sin probar con JWT genuino Supabase Auth el efecto real de logout; sin cookies HTTPS, 429 remoto, permiso de subir, merge a main, producción ni cambios de Vercel/Hostinger. Ver `docs/51-commercial-session-migration.md`.


## [Sin publicar — Issue #78: diagnóstico real de revocación JWT por catálogo]
- Se amplió `apps/portal/scripts/auth-real-smoke.mjs` para un ensayo **manual seguro** con las cuentas exclusivas de Auth dev: JWT original validado, GET de categorías activas con 200 y filas **antes** de signOut global, y 200/[] con **el mismo JWT que aún no expiró** tras signOut. El objetivo es diferenciar revocación RLS real de bloqueo global de registro.
- Se agregó `src/server/auth-e2e-catalog-revocation.ts` con URL exacta, GET único, sin caché, clave exclusivamente publicable, margen de expiración, validación de formato y fallas cerradas. Tests unitarios offline adversariales en `tests/unit/auth-real-revoked-catalog.test.mjs`.
- SQL read-only de `cotironda-dev`: **5 categorías activas**, guard RLS de sesión presente, registro false, 0 empresas, 0 sesiones y 0 objetos Storage. No se enviaron credenciales ni se iniciaron sesiones reales con herramientas de CI.
- **Falta ejecutar** el flujo con credenciales privadas en un entorno controlado; la CI verifica solo el código y mocks HTTP. No se declara E2E real exitoso. Ver `docs/52-auth-real-revoked-catalog-e2e.md`.


## [Sin publicar — PR #81: cookie Secure obligatoria en HTTPS SSR]
- Prueba Next.js compilado **sobre HTTPS verdadero loopback** con CA temporal del runner (sin `rejectUnauthorized:false`), SDK SSR real y Auth enteramente ficticio. Encontró que el Proxy renovaba cookies sin atributo `Secure`. El problema quedó reproducido mediante un test que **falló**; no se debilitó la expectativa.
- Corrección de `cookieOptions` en los tres clientes Supabase (`proxy.ts`, servidor, navegador): `secure` en `NODE_ENV=production` (Preview y Production), `sameSite=lax`, `path=/`, sin activar `HttpOnly` que impediría refresh del lado navegador. `next dev` local sigue compatible con HTTP.
- Test HTTPS completo demuestra certificación CA, rechazo de certificado sin confianza, Set-Cookie Secure, no-store, rotación y reutilización de cookie, segundo visitante anónimo, origen adversarial 403 y registro autorizado aún 503 fail-closed. **161/161 unitarias y cinco workflows CI SUCCESS** en HEAD `a089be6545e3dcea905ab544ca788cc4d3c705f6`. Ver `docs/53-https-ssr-loopback-ci.md`.
- Este test no usa Supabase Auth real, ni navegadores completos ni certificado Vercel; no se hizo merge, cambió DB ni publicó producción.


## [Sin publicar — PR #83: no reutilización de credenciales y ejecución Auth aislada]
- Preflight de E2E manual Auth niega contraseñas iguales en las dos cuentas de ensayo, exige mínimo 12 caracteres y bloquea pruebas con credenciales genuinas en `GITHUB_ACTIONS`, `CI` y `VERCEL`.
- Se incorporó `npm run e2e:auth:dev` con Node 22 `--experimental-strip-types`, evitando fallas de importación `.ts`. La CI ejecuta deliberadamente el comando y requiere el rechazo antes de la red; **no dispone de claves ni contraseñas reales**.
- Se blindó el diagnóstico para imprimir solo códigos de error permitidos de Cotironda, nunca respuestas arbitrarias de SDK/red ni secretos. Tests adversariales nuevos y `docs/54-e2e-auth-secret-preflight.md`.
- Cuentas de ensayo que reutilizaron una contraseña ya divulgada deben rotarse localmente con dos secretos nuevos y distintos; **no se incluyeron valores sensibles en código ni documentación**. No se alteraron Supabase, producción, Vercel, DNS ni `main`. Pendiente de ejecutar JWT genuino tras logout.


## [Sin publicar — PR #85: prueba remota de Auth desde navegador]
- Se incorporó `tests/manual/cotironda-auth-dev-browser.html` autocontenido y sin dependencias; permite ensayo de dos usuarios de desarrollo con entrada de credenciales solo en navegador, clave `sb_publishable_` pública y conexión restringida por CSP al origen HTTPS de `cotironda-dev`.
- Contrasta JWT emitido por Auth, `/auth/v1/user`, catálogo RLS visible antes de logout y **200 con [] tras logout** con el mismo JWT original y no vencido; prueba bloqueo de correo no confirmado. Borra campos de contraseña, hace logout de emergencia y solo copia un reporte PASS/FAIL sin JWT, emails ni contraseñas.
- `tests/unit/browser-auth-dev-diagnostic.test.mjs` ejecuta el JavaScript real en entorno simulado y valida escenarios normales y adversariales. El E2E auténtico del navegador sigue **pendiente de ejecución**, sin secretos en GitHub y sin cambios de Supabase/producción. Documentación en `docs/55-browser-auth-dev-diagnostic.md`.

 
## [Sin publicar — 30/10/2026: prueba auténtica JWT/RLS desde Chrome Android]
- Propietario ejecutó diagnóstico de dos cuentas dev con **8/8 PASS** (captura aportada directamente, no incorporada a GitHub): JWT confirmado, identidad, catálogo visible, logout global, JWT aún vigente, **mismo JWT tras logout con HTTP 200 + []**, cuenta sin confirmar rechazada, diagnóstico sin errores.
- Se corroboró **independientemente** con logs agregados Auth (login y logout), gateway (GET catálogo 2 × HTTP 200, logout POST 204, login POST 200 y 400), y SQL dev (registro falso, dos usuarios, cero sesiones/empresas/objetos, cinco categorías y política SELECT con guard de sesión). No se consultó ni guardó ningún secreto o identificador personal.
- **Control específico de revocación RLS por sesión: aceptado en cotironda-dev**, sin confundir expiración JWT/HTTP 401 con revocación. Evidencia y limitaciones: docs/56-auth-real-mobile-rls-proof.md.
- Pendientes fuera de este control: cookies HTTPS del portal desplegado con Auth auténtico, HTTP 429 remoto, decisión sobre WARN password leakage, backup/recovery y revisión de PRs. Sin publicaciones ni cambios de Supabase por esta anotación.


## [Sin publicar — Issue #86: Preview Next real en proyecto Vercel correcto]
- Se auditó `cotironda` demo: Vercel status `READY` sobre build vacío de 46 ms, framework=null. Se evitó tomarlo como prueba del portal.
- Se inspeccionó el proyecto separado `cotironda-portal-dev`: framework Next.js, SSO habilitado para todos los despliegues, proyecto `live=false`, versión antigua con target production **no tocada**.
- Se creó un **nuevo Preview protegido** del portal sobre commit `31a8bd22`, deployment `dpl_EFo5qxksdsaUnUQn5cG7CEj87i3i`, `target=null`, Next.js 16.4.3 compilado realmente y rutas /ingresar, /alta y /api/organizaciones con Proxy presente. No se habilitó registro ni se publicaron cambios.
- Guard puro `src/server/vercel-preview-audit.ts` y tests adversariales: exigen proyecto, commit, SSO, target Preview y evidencia real de `next build`; rechazan una demo READY sin Next. Detalles docs/57-vercel-portal-preview-audit.md.


## [Sin publicar — Issue #88: separación de login Preview / registro comercial]
- Nueva compuerta server-only autenticacionPreviewSoloIngreso: solo cuando VERCEL_ENV=preview, bandera explícita, registro=false, cotironda-dev exacto y publishable key, sin heredar secretos ni habilitar production.
- UI de ingreso independiente para cuentas existentes en SSO Preview; no incluye signUp ni botón Crear cuenta. /alta validada con getUser muestra únicamente confirmación de sesión y salida global; no muestra formulario de empresa.
- Proxy de Next mantiene /api/organizaciones bajo puerta comercial previa (modo login-only API continúa HTTP 503); no se expone SQL, Storage ni alta por habilitar login.
- CI prueba escenarios de producción/flag/tenant, HTTP SSR y TLS real con renovación de cookie Secure, anti-cache y separación entre sesiones, para modo completo y modo login-only. Véase docs/58-preview-login-only-auth.md; no es una certificación Auth real Vercel.


### Verificación operativa del modo Preview login-only — 30/10/2026
- Las 5 workflows GitHub Actions aprobaron el commit de código `1c0c8b82dca326eed50339d68d4bd7ba1aa8d71b` con **190/190 unitarias**, Next Full y login-only en HTTPS TLS real CI con Auth simulado, RLS/Pg17, PostgREST y sitio.
- Vercel rechazó variable de entorno restringida por rama por no existir conexión Git a nivel proyecto. Solución fail-closed: flag en **Preview solamente** y guard adicional `VERCEL_GIT_COMMIT_REF` exacto a `test/01-auth-only-preview`; prueba unitaria adversarial y build remoto mostraron `COTIRONDA_AUTH_PREVIEW_BRANCH_GUARD=ALLOW`. No se conectó Git para evitar promover código inesperadamente.
- Nuevo deployment del proyecto correcto `cotironda-portal-dev` (`dpl_6X6o3xzgP1aRDRVpjdUtQ9p36tyM`) compiló Next 16.4.3, rutas y Proxy. `READY`, target Preview y SSO habilitado para todo despliegue; variables de Supabase verificadas por igualdad, registro false y SQL dev con 0 empresas/sesiones/archivos. **No significa E2E Auth real de Next bajo SSO verificado**. Ver docs/58.


### Ingreso auténtico verificado en Preview Android — 30/10/2026
- El propietario compartió pantalla «Sesión de prueba activa» sin formulario de alta. Supabase registra 1 login por Auth HTTP 200 y 2 comprobaciones `GET /auth/v1/user` HTTP 200.
- Login de ensayo real al portal Next y vista privada **verificados**. Pendiente pulsar logout y verificar que `/alta` redirige sin sesión; no se han inspeccionado atributos de cookies de esa Preview. Registro en `docs/59-preview-auth-real-mobile-login.md`. Sin producción ni secretos.


### Auth real de Preview — logout verificado el 30/10/2026
- Captura de Chrome confirma retorno al formulario «Ingresá a tu empresa» tras pulsar «Cerrar sesión de prueba».
- Supabase Auth gateway registra 1 POST `/auth/v1/logout` **HTTP 204** y Audit 1 `logout`. Consulta read-only: **0 sesiones Auth**, bandera de registro false, 0 empresas y 0 Storage. Esto acredita logout remoto y redirección real, pero **no** que reabrir directamente `/alta` esté protegido después; tampoco se inspeccionaron cookies de la Preview. Ver docs/59.

 
### Control funcional de sesión de Preview validado (30/10/2026)
- Tras logout global y retorno al formulario de ingreso, el propietario volvió a navegar al enlace directo **`/alta`**. Captura Chrome de escritorio muestra únicamente «Ingresá a tu empresa», sin contenido de la sesión anterior. El código de /alta protege acceso mediante `auth.getUser()` y redirección al ingreso.
- Supabase dev por SQL read-only posterior: 0 sesiones Auth, registro false, 0 empresas, 0 archivos. Se documenta **subcontrol login/logout/denegación posterior APROBADO**, con límite de que no se inspeccionaron headers/cookies en el navegador ni status HTTP exacto de redirección.
- Registrar cierre de Issue #88 sin declarar Etapa 01 finalizada. PR #89 permanece draft, sin publicación ni cambios SQL. Referencia: `docs/59-preview-auth-real-mobile-login.md`.

 
## [Sin publicar — PR #91: recuperación PG17 de ensayo y auditoría Free]
- Organización Supabase verificada en plan **Free**; la documentación oficial indica copias diarias automáticas para proyectos Pro/Team/Enterprise, no Free. No se creó, exportó ni almacenó un backup de `cotironda-dev` real.
- Nuevo `scripts/ci/pg17-backup-restore-drill.sh` usa exclusivamente PG17 de CI, dump custom con cuatro esquemas, checksum SHA-256, prueba adversarial de copia alterada, inventario exigente, eliminación simulada de una categoría ficticia y `pg_restore` transaccional en otra base CI. Se verifican seed recuperado, políticas RLS comerciales, guard JWT post-logout, buckets privados, registro bloqueado y grants. Se borran archivos temporales y base CI restaurada.
- `src/server/backup-restore-integrity.ts` y tests adversariales rechazan dumps parciales de Auth, Storage, privados, datos y funciones; workflow PG17 ejecuta restore luego de 12 migraciones y tests. Primera ejecución descubrió error sintáctico Bash en comparación de hash, **corregido** antes de repetir; siguiente ejecución obtuvo PASS completo en restore CI y 5/5 workflows.
- `docs/60-backup-recovery-free-plan.md`: diferencia entre respaldo SQL CI y respaldo real cifrado; Supabase CLI habitual excluye `auth`/`storage` gestionados y la base no respalda bytes de Storage. No se habilita registro ni piloto. **Copia externa real y recovery drill de servicios gestionados pendientes**.

 
## [Sin publicar — Issue #92 / PR #93: diagnóstico privado HTTPS en navegador]
- En `/alta` de Preview SSO, luego de `auth.getUser()` exitoso, se presenta botón «Comprobar cookies y caché». Usa CookieStore (si existe) para leer solamente nombre y atributos seguros de cookies de Cotironda; ningún token/cookie value se guarda, imprime ni transfiere. Comprueba GET de `/alta` mismo origen con `Cache-Control: private,no-store` y sin respuesta CDN HIT. Reporta PASS/FAIL/INCONCLUSO; sin CookieStore no inventa resultado positivo.
- `src/server/browser-cookie-cache-audit.ts`: evaluador puro y tests adversarios de atributos faltantes, cookies inseguras/ajenas, redirects, cache pública/CDN HIT. `apps/portal/scripts/smoke-https-ssr.mjs` exige botón solo en página SSR autenticada de ensayo y otro build CI verifica la segunda rama de Preview.
- La lista cerrada de ramas de solo ingreso ahora autoriza exactamente `test/01-auth-only-preview` y `security/01-browser-cookie-cache-audit`, manteniendo SSO, registro=false, tenant Supabase dev exacto y production bloqueada. No se agrega API, tráfico a terceros ni secretos.
- La primera ejecución del PR detectó discrepancia entre la definición DOM TypeScript de CookieStore y los metadatos de la API del navegador; corregida la conversión tipada, sin deshabilitar verificaciones.
- Doc `docs/61-real-browser-cookie-cache-diagnostic.md` explica limitación de `Set-Cookie` y `HttpOnly`, prueba real pendiente en navegador, sin enlace temporal que omita SSO.

 
### Bloqueo de despliegue de diagnóstico privado — 30/10/2026
- Vercel rechazó una **nueva Preview** de `security/01-browser-cookie-cache-audit` con HTTP 402 `api-deployments-free-per-day` (límite de despliegues Free; `retryAfter=86400`). La operación **NO creó un deployment**; no se promocionó producción, no se modificó SSO ni se contrató un plan pago.
- Los tests GitHub del código previo aprobaron **217/217 unitarias y 5/5 workflows**, incluyendo Next 16 + SSR HTTPS con Auth sintético. La prueba de atributos reales de cookies en navegador **NO fue realizada** porque la versión nueva no está desplegada.
- La documentación 61 registra exactamente qué se comprobó y cómo proceder cuando exista cuota de despliegues, sin generar enlaces temporales que omitan SSO.


## [Sin publicar — Issue #94 / PR #95: observador Auth signup público]
- Auditoría read-only detecta distinción de seguridad: el cierre de registro de **empresas** no impide necesariamente la creación de **usuarios Auth** por llamada directa a `/auth/v1/signup`. No se afirmó una configuración remota no verificada ni se intentó un POST de alta.
- Nueva rutina `comprobarRegistroAuthSoloLectura`: **GET** fijo `/auth/v1/settings` de cotironda-dev con apikey publicable, sin sesión/secretos/cookies, timeout y límite de respuesta, aceptando únicamente `disable_signup` booleano; resultados PASS/FAIL/INCONCLUSO sanitizados.
- Vista independiente `AuditoriaRegistroAuth` solo bajo `auth.getUser()` en Preview SSO de cuenta existente; agrega rama de ensayo exacta al guard del servidor y test HTTPS en Next con Auth sintético. No altera registro SQL, RPC, Storage ni producción.
- Pruebas unitarias adversarias de transportes falso, HTTP erróneo, JSON anómalo, CORS/timeout, otros proyectos, claves privadas y ruta protegida. Informe docs/62. No hay nueva Preview Vercel por cuota diaria 402; estado Auth remoto pendiente.


## [Sin publicar — Issue #96: headers anti-clickjacking en portal Next]
- `apps/portal/next.config.ts` agrega seis cabeceras explícitas: X-Frame-Options DENY, CSP documental `frame-ancestors 'none'` + base/form/object restrictions, X-Content-Type-Options nosniff, Referrer-Policy no-referrer, Permissions-Policy sin sensores/pagos y X-Robots-Tag noindex para el portal privado.
- `apps/portal/scripts/smoke-https-ssr.mjs` verifica estos headers con **Next compilado sobre HTTPS real de loopback**, incluso en redirect anónimo, refresh de token SSR con `Set-Cookie`, GET con sesión renovada y POST de alta bloqueado. Auth sigue completamente sintético e interceptado.
- `tests/unit/http-security-headers.test.mjs` agrega regresiones para impedir CSP de scripts sin nonces, HSTS amplio, CORS público o caché global de assets. **No se proclama CSP completa/XSS ni se reemplazan los permisos SQL.** Ver `docs/63-next-http-security-headers.md`.
- Cambio exclusivo GitHub branch/PR draft, no desplegado en Vercel ni production, sin tocar Supabase, DNS ni registro comercial.


## [Sin publicar — Issue #98: prueba pública GET de Auth remoto desde GitHub Actions]
- Nuevo script `scripts/ci/auth-settings-remote-probe.mjs` reutiliza el helper de validación `disable_signup` y ejecuta **un único GET** autenticado solo con clave publishable, sin usuarios/cookies/JWT ni POST. CI acepta la ejecución únicamente en PR de rama exacta, repo propio y flag privado explícito.
- Salida exclusivamente PASS/FAIL/INCONCLUSO con códigos fijos; si Auth permite autorregistro directo (aunque empresas SQL sigan cerradas), la prueba remota termina con exit 1 y obliga a investigar. Timeout/errores/no verificable también quedan bloqueados, sin informar falso PASS.
- `tests/unit/auth-settings-remote-probe.test.mjs` intercepta totalmente el transporte y prueba estados, contextos no autorizados, destino exacto, falta de filtraciones y no ejecución de red al importar el módulo.
- **No se alteró** Auth real, SQL, usuarios, Vercel, DNS o main. Guía `docs/64-remote-gotrue-signup-audit.md`; ejecución remota pendiente de la corrida del PR.


### Auditoría real del autorregistro Auth — 30/10/2026
- En el PR #99 se verificó `GET /auth/v1/settings` auténtico en Supabase dev desde GitHub Actions, con publishable pública y sin credenciales/POST. El valor exacto `disable_signup=false` confirma que **Auth tiene habilitada la creación directa de usuarios**, aunque SQL impida registrar empresas. Es un hallazgo del entorno dev, no un ataque ni un usuario creado.
- **245/245 unitarias PASS y 4/5 workflows SUCCESS; el quinto workflow falla deliberadamente** con `COTIRONDA_AUTH_SIGNUP=FAIL / autorregistro_auth_habilitado` (run 41060813027). No ocultar ni cambiar ese exit code sin corregir Auth remoto.
- Logs Supabase confirman GET /auth/v1/settings HTTP 200; SQL read-only posterior: 2 usuarios de ensayo, 0 sesiones, organizaciones o Storage, flag comercial false. No se modificó el servicio Auth ni producción.
- Issue #98 completo por evidencia; Issue #94 permanece bloqueado hasta deshabilitar en Dashboard «Allow new users to sign up» solo en dev y repetir GET PASS. Ver docs/64.


## [Sin publicar] — Inicio de Etapa 02 / 30-10-2026 / PR #101
- La configuración alojada de Supabase Auth dev fue corregida por el propietario: `Allow new users to sign up=OFF`; CI remota reejecutada confirmó `COTIRONDA_AUTH_SIGNUP=PASS` ([run 41061840605](https://github.com/ProtectorRudo/Cotironda/actions/runs/41061840605)). Issue #94 cerrado; 2 cuentas y 0 empresas preservadas. Sin publicación.
- Nuevo validador TypeScript `src/domain/extraccion-documental.ts` para salida IA no confiable: genera exclusivamente `pendiente_confirmacion_comprador`, mantiene trazabilidad de líneas, marca incertidumbres y duplicados, jamás inventa cantidades ni devuelve precios arbitrarios.
- `tests/unit/extraccion-documental.test.mjs`: 13 casos; 258/258 unitarias y 5/5 GitHub Actions SUCCESS en PR #101 commit `7895b748fd6a5cf24e60ab213b2a73fc8b07070a`. No se ejecutaron OCR, IA remota, AV ni uploads. Documento de alcance `docs/65-etapa02-borrador-documental.md`.
- Stage 01 permanece en PRs apilados; no merge ni deploy ni registro habilitado. El próximo objetivo es extraer un corpus sintético, después conectar IA bajo contrato y controles de ingreso de archivos.


## [Sin publicar] — D013: despacho automático sin revisión por línea, 30-10-2026
- El propietario modifica el flujo: enviar lista + autorización de distribución, sin corrección/confirmación previa de cada ítem. Las dudas se retienen y se notifican, las líneas claras se encaminan automáticamente.
- Nuevo módulo puro src/domain/despacho-automatico.ts: solo selecciona productos exactos del catálogo confirmado de proveedores activos con consentimiento WhatsApp y cobertura de zona, con claves de idempotencia por ronda/proveedor. No envía nada; proveedores sin coincidencia no reciben solicitudes. Mantiene confirmación posterior de precios por proveedor y adjudicación manual.
- Se actualizó la especificación de extracción, pruebas adversariales y documentación comercial/técnica, sin cambios en Supabase, producción, Auth, pagos, DNS o WhatsApp. Issue #102.


## [Sin publicar] — Etapa 02: texto → plan de solicitudes, 30-10-2026
- Primer módulo `src/domain/flujo-texto.ts`: texto explícito en español se valida y conecta con `prepararBorradorDocumental` y `planificarDespachoAutomatico`; conserva referencias y muestra líneas retenidas por incertidumbre y catálogo sin coincidencia.
- Demo local `npm run demo:texto` con proveedores ficticios, sin llamadas externas; pruebas adversarias y de 100 líneas en `tests/unit/flujo-texto.test.mjs`. El estado de CI se confirma por ejecución, no por crear commits.
- No OCR, IA remota, carga de documentos, WhatsApp, registro comercial, migraciones, cambios en producción ni DNS. Issue #104; doc/66.


## [Sin publicar] — Etapa 02: lectura XLSX controlada en memoria (Issue #106)
- `scripts/offline/xlsx-seguro.mjs`: ZIP/OOXML real pequeño con hojas/tablas explícitas; referencias `Hoja N, fila M`; no interpreta fórmulas, macros ni contenido activo.
- Endurecimiento adversarial de archivos: validación central/local headers, CRC32, rutas, tamaño, descompresión, XML, relaciones externas, hojas ocultas, hasta 100 ítems.
- `tests/helpers/xlsx-fixture.mjs`, `tests/unit/xlsx-offline.test.mjs`, `scripts/demo/xlsx-demo.mjs`, `npm run demo:xlsx` para simulación reproducible con catálogos ficticios.
- Reutiliza pipeline de D013 y no realiza envíos ni abre endpoints públicos. Suite CI debe verificarse contra commit final del PR. Sin cambios Supabase/Whapi/Vercel/DNS.


## [Sin publicar] — Etapa 02 OpenAI Responses adapter / 30-10-2026
- `src/server/openai-extraccion.ts`: llamada preparada a Responses API (`gpt-6-luna` candidato) con schema estricto, input no confiable, validación del origen, de cantidad fuera de medidas de envase y retención de líneas dudosas, sin acciones de envío.
- `simularPlanesConIA`: consume borrador IA validado y lo cruza con catálogo confirmado/consentimiento, únicamente plan offline. Autorización de solicitud antes de gasto, sin exposición de API key.
- `tests/unit/openai-extraccion.test.mjs`: casos mock positivos/adversarios. `tests/fixtures/materiales-argentinos-ia-v1.json`: corpus sintético inicial de 12 ejemplos. `npm run eval:ia` falla cerrado/offline; modo real requiere doble autorización y secreto en DEV.
- NO se conectó una clave real ni se llamó al modelo. NO hay precisión medida ni gasto real: no confundir mocks con pruebas del modelo. Docs/68 y Issue #108. Sin merge, despliegue, WhatsApp ni cambios Supabase.


## [Sin publicar] — Etapa 02: evaluación de calidad de IA sin red (Issue #110)
- Nuevo scorer determinista `src/domain/evaluacion-ia-documental.ts` con métricas separadas de exactitud de líneas y destinatarios; puerta FAIL por cantidades/unidades incorrectas, artículos inventados o proveedores ajenos.
- `tests/fixtures/gold-despacho-ia-v1.json`: 12 casos sintéticos con salidas mock, incluidos falsos productos, cantidades inventadas, materiales omitidos, duplicados, opt-out y zonas ajenas; simulador `tests/helpers/evaluador-gold.mjs`.
- `npm run benchmark:ia:offline` y test de regresión que detecta cambios en clasificación. **Nunca invoca API real**; no mide precisión del modelo ni consume créditos. Docs/69 y Issue #110.
- Sin cambios de base, precios, Whapi, usuarios, producción ni DNS; PR draft apilado sobre #109.

- Se actualizó el script opt-in `scripts/eval/openai-texto.mjs` para cotejar 3 casos live futuros contra gold (destinatarios, artículos y cantidades) con reporte de tokens/costo estimado y bloqueo CI/producción. No se ejecutó ningún request real.


## [Sin publicar] — Etapa 02: propuestas de cotización alternativas (Issue #113)
- `src/domain/alternativas-cotizacion.ts`: cálculo decimal exacto de envases alternativos y excedentes; consultas funcionales solamente por relación curada, sin homologar ni enviar.
- `tests/unit/alternativas-cotizacion.test.mjs`: pruebas de cemento 25/50, hidrófugo 4/5 L, látex 20/18 L, familias, especificaciones, opt-in, zonas, marcas, duplicados y retenciones.
- Docs/70 y alineación de README con la decisión D013 de distribución automática. No se modificó el matcher exacto, base Supabase, Whapi ni producción; cambios en PR borrador apilado sobre #111.


## [Sin publicar] — Etapa 02 / D014: identidad de producto, variantes de marca/envase
- Se aprobó priorizar identidad canónica del producto con atributos críticos verificables antes de filtrar marcas y presentaciones; marca flexible por defecto, restrictiva únicamente si el comprador la exige.
- Nuevo planificador puro `src/domain/identidad-producto.ts`: una sola solicitud por proveedor con varias opciones de marca/envase, cantidades y excedentes decimales exactos (BigInt); datos técnicos inciertos solo como consulta, incompatibilidades excluidas.
- Pruebas `tests/unit/identidad-producto.test.mjs` y docs/71. **Sin integración con despachador existente, bases reales ni WhatsApp**; sigue pendiente P007 y evaluación IA real. Issue #115.


## [Sin publicar] — D015: invitaciones amplias por producto (Issue #117)
- `src/domain/invitaciones-por-producto.ts`: consultas offline a proveedores con producto canónico confirmado, marca y presentación flexibles; diferencia técnica explícita es consulta, nunca oferta conforme. Marca obligatoria solo cuando comprador la exige expresamente.
- Se conservan requisitos, cantidades, unidades y origen; no se infieren kg de bolsas sin tamaño ni precios; una invitación por proveedor con varios SKUs agrupados. Zona, consentimiento, baja, duplicados y seguridad documental conservados.
- Se documentó separación fase de invitación D015 vs compatibilidad D014/Oferta posterior. Tests para «cemento» genérico, Loma Negra→Avellaneda 25/35kg, pintura, placas, electricidad, envases, exclusividad. Documentación docs/72. No conexión a catálogos Supabase ni envío Whapi/producción.


## [Sin publicar] — Etapa 02: puente de taxonomía argentina a invitaciones D015 (Issue #119)
- `src/domain/taxonomia-materiales.ts`: diccionario local curado de 6 familias iniciales de 5 rubros, exclusiones para falsos positivos y atributos explícitos para cemento/placas/látex/cables; retención de artículos no identificables.
- Resolver de marcas expresamente exclusivas vs mencionadas, corrigiendo falsa exclusividad de IA y conservando originales. No inventa peso de bolsas de cemento sin tamaño especificado.
- `simularInvitacionesConIA` conecta extractor OpenAI validado → taxonomía curada → matcher de catálogo producto confirmado/consentimiento; no hace envíos y usa fetch MOCK en pruebas.
- `npm run demo:productos`, tests unitarios de terminología argentina y docs/73. Sin OpenAI real, WhatsApp, Supabase, DNS ni publicación. PR draft hijo de #118.


## [Sin publicar] — Etapa 02: vía local sin tokens para textos simples (Issue #121)
- `src/domain/entrada-economica.ts`: interpretación determinista de pedidos simples, clasificación por producto D015, propuestas sin envíos y registro de líneas pendientes para IA.
- `src/domain/flujo-texto.ts`: parser reutilizable y unidades contables adicionales (placas, latas, bidones), sin inventar tamaños de presentación.
- `tests/unit/entrada-economica.test.mjs`: pruebas de textos argentinos, varias marcas y rubros, líneas ambiguas, exclusividad, duplicados, instrucciones adversarias, opt-in y límites. `npm run demo:sin-ia` es una simulación sin red.
- 0 tokens consumidos por esta ruta local; no afirmar ahorro real antes de comparar con inferencias OpenAI. Docs/74 y PR draft hija #120; sin Supabase/Whapi/producción.


## [Sin publicar] — Etapa 02 D016: calidad y cobertura antes que ahorro de IA
- `src/server/flujo-calidad-ia.ts`: primer coordinador IA-first (mockeado en tests) con estados y contadores por línea del documento, distinguiendo omisiones, retenciones, falta de proveedor y artículos preparados.
- Verificador OpenAI admite envoltorios coloquiales seguros («Necesito 20 bolsas de…») pero mantiene evidencia textual completa de cantidad/material; no acepta peso de envase como cantidad ni descripciones recortadas.
- `tests/unit/flujo-calidad-ia.test.mjs`: normal, extremo y rechazo remoto. El camino local de Issue #121 no se adopta por defecto sin evaluación comparativa. Docs/75 y D016.
- Sin mensajes reales ni inferencia OpenAI live; sin cambios Supabase, producción ni main.


## [Sin publicar] — Etapa 02: cobertura multimaterial por línea (Issue #125)
- Verificador de evidencia IA detecta separadores inequívocos y coteja **cada segmento de producto**. Añade campos `segmentos_fuente` / `segmentos_sin_extraccion` sin cambiar el contrato de envíos (sigue desactivado).
- Coordinador D016 informa cobertura parcial cuando un material se omite dentro de la misma línea; contadores y alertas visibles, sin confundir contenido de envase con artículo.
- Tests de regresión con dos materiales en una línea, uno omitido, duplicados y separador incompleto. Documentación docs/76. Sin IA live, WhatsApp, producción ni merge.


## [Sin publicar] — Etapa 02: benchmark de proveedores por producto (Issue #127)
- Nuevo `src/domain/evaluacion-invitaciones-producto.ts` que evalúa contra gold independiente extracción, recall de invitaciones, falsos proveedores, duplicados y cantidad/unidad alteradas con dos puertas de calidad.
- Doce casos sintéticos `tests/fixtures/gold-invitaciones-producto-v1.mjs` y tests adversariales de scoring; `npm run benchmark:producto:offline` usa Responses API MOCK y cero mensajes reales.
- No atribuir resultados al desempeño de GPT-6 Luna ni autorizar envío; docs/77 y PR draft hija de #126. Sin merge, base, WhatsApp ni producción.


## [Sin publicar] — Etapa 02: evaluación LIVE por producto preparada (Issue #129)
- Nuevo runner `scripts/eval/producto-quality-live.mjs` con seis casos sintéticos positivos del gold D015, ejecución manual DEV, scorer independiente, métricas de proveedor, tokens y costo estimado. **Ninguna llamada real ejecutada**.
- `scripts/eval/guardia-live-producto.mjs` exige `--live`, autorización exacta, clave de servidor, evita GitHub Actions/CI/Vercel/producción, sin reintentos ni logs de clave/prompt. Presupuesto soft USD 0,02 **no sustituye** control de gasto en OpenAI.
- Pruebas unitarias de guardas, estimación monetaria y bloqueo CLI. Documentación docs/78 sobre configuración externa mínima y límites. Sin WhatsApp, Supabase, deploy, merge ni datos reales.


## [Sin publicar] — Etapa 02: Supabase Edge Secrets para OpenAI (Issue #131)
- Se añadió gateway Deno protegido `supabase/functions/cotironda-ia-dev`, con autenticación servidor `@supabase/server` y proyecto DEV exacto, lectura exclusiva de `OPENAI_API_KEY` desde Edge Secrets, estado seguro y smoke sintético con flag explícito.
- Tests en Node22 para bloquear producción, ausencia de secreto/flag, prompts arbitrarios, rate limits, errores y filtraciones; documentación docs/79.
- **Pendiente** propietario configure secreto en Supabase DEV, despliegue DEV autorizado y smoke real, y conectar adaptador Next al gateway para extracción completa. Sin migración SQL, despliegue, llamadas pagadas, WhatsApp ni cambios a `main`.


### 30/10/2026 — Verificación del despliegue DEV del gateway (Issue #131)
- Supabase `cotironda-dev` ref `qkercsoqhehbenbbncwk`: Edge Function `cotironda-ia-dev` versión 1 **ACTIVE**; `verify_jwt=false` + `withSupabase(auth:'secret')` según esquema oficial de API keys modernas. Archivos verificados vía conector; **ninguna otra instancia ni producción tocada**.
- El propietario confirmó haber guardado `OPENAI_API_KEY`, pero el **runtime status** aún no pudo invocarse con la key privada Supabase desde las herramientas: no se verificó el booleano del secreto ni se realizó inferencia real. Ver procedimiento Dashboard en docs/79.


## [Sin publicar] — Etapa 02: laboratorio D015/D016 con motor real en Edge DEV (Issue #133)
- Prepara modo `quality_case` por ID sintético allowlisted y autorización separada, deshabilitado por defecto. Motor original de OpenAI + verificador de evidencia + taxonomía y selección D015 + benchmark independiente de cobertura. Nunca entrega texto/respuesta IA cruda ni envía solicitudes.
- `supabase/functions/cotironda-ia-dev/core` empaqueta copias byte-exactas de módulos `src` y corpus gold; script de regeneración y test de paridad para impedir deriva.
- Nuevos tests offline de casos múltiples, cantidad inventada, permisos independientes y rechazo 429. Docs/80. **NO se desplegó ni llamó OpenAI desde este modo**.


## [Sin publicar] — D018: una única consulta IA de laboratorio por caso (Issue #135)
- Edge `quality_case` exige reserva de DB antes de consumir OpenAI, con PK por caso (máximo seis) y denegación ante repetidos, carreras, fallos de BD o falta de cliente de cuota. Ni 429 ni error de red permiten liberar/reintentar la reserva.
- SQL versionado para registro sintético en Supabase DEV, RLS y permisos solo backend `service_role`; nuevos tests de concurrencia, 429 y permisos; docs/81.
- Sin publicación de producción, sin envíos reales. Medición del modelo real pendiente de permiso y acceso privado para invocar.


## [Sin publicar] — D019: persistencia de métricas de IA, solo laboratorio DEV (Issue #137)
- Nueva tabla privada `dev_ia_quality_results` con RLS, FK a reservas D018, métricas de productos y proveedores y tokens; sin texto de clientes/credenciales.
- Edge `quality_case`: después de consumir una reserva guarda el resultado y devuelve `auditoria_persistida`; error DB jamás desencadena nuevo gasto. Source `edge_runtime` o `reported_by_owner` para distinguir evidencias.
- Nuevos tests de denegación sin auditoría, guardado correcto, fallo de DB y caso FAIL. Docs/82. Sin despliegues productivos ni WhatsApp.

## [Sin publicar — D020 / Issue #139: automatización controlada del laboratorio]
- Se preparó dispatcher cron/pg_net **solo DEV**, configuración deshabilitada de fábrica, cola de los cinco casos sintéticos pendientes, sin consumo OpenAI en GitHub CI ni en la migración.
- Un caso por despachador; lock de concurrencia; avanza solo tras PASS real persistido; falla/timeout/resultado ausente detienen la secuencia sin reintento.
- Clave Supabase para invocar Edge almacenada en Vault (pendiente configuración única), no se mueve OPENAI_API_KEY de Edge Secrets. Tablas privadas RLS y función administrativa restringida.
- Pendiente CI, prueba SQL runtime DEV con interruptor OFF y activación posterior con aprobación/credencial. No se instaló cron ni se consumieron reservas para preparar este código. Ver docs/83.

- **Verificación remota D020:** migración instalada solo en Supabase DEV, dispatcher devuelve `disabled` y, al habilitarse transaccionalmente sin Vault, `blocked_missing_dev_invoker`; rollback verificó 0 cron jobs, 1/6 claims consumidos y 5 pendientes. Permisos SQL y RLS cerrados.
- **Corrección de seguridad:** pg_net se reinstaló en esquema `extensions` (sin tráfico, trabajos ni dependencias) y desapareció el WARN nuevo `extension_in_public`. Persisten observaciones RLS informativas y advertencia Auth previa independiente. **Automatización live aún desactivada** hasta almacenar credential de invocación y activar el cron.

## [Sin publicar — D020, evaluación LIVE real y bloqueo seguro, 30/10/2026]
- Vault guarda nueva credencial de invocación DEV. Edge v8 acepta solo secret keys de nombres `default` y `cotironda_quality_lab`; se corrigió HTTP 401 de auth:'secret' y se comprobó estado HTTP 200 sin gasto. 6/6 controles CI aprobaron el commit de código `57998292805147e787a04e67be89b08787380222`.
- Mediante Supabase pg_net y dispatcher SQL privado se ejecutaron tres nuevos benchmarks reales, **uno por transacción, sin cron**. Dos PASS/PASS con 2/2 y 1/1 materiales/proveedores; el tercero `cemento_generico_sin_especificacion_inventada` dio FAIL/FAIL, retuvo línea y omitió proveedor (ver Issue #141 y docs/83).
- Detención confirmada `halted_needs_review`; control OFF, 0 cron jobs, 4/6 reservas consumidas y 2 casos sin ejecutar. No hay reintentos y no se inventa causa raíz sin respuesta IA cruda. Sin Whapi, producción, secretos expuestos ni datos comerciales.

## [Sin publicar — D021: investigación de cemento genérico, Issue #141]
- Se agregó suite MOCK de regresión para «10 bolsas de Cemento», incluyendo respuestas buenas, descripción con cantidad, unidad equivocada, material y cantidad inventados y omisiones. No hay llamadas externas.
- Prompt de extracción precisa cómo separar producto de cantidad/unidad, sin dar el gold a la IA y sin relajar validación de evidencia de origen.
- Métricas numéricas privadas por etapa (ítems propuestos, aclaraciones, origen/cantidad no verificables, segmentos sin extracción y líneas retenidas); migración DEV opcional y writer Edge, sin almacenar respuestas del modelo.
- Continúan bloqueados los 2 casos pendientes. En el FAIL histórico no se puede determinar la causa precisa porque no se guardó la respuesta cruda. Ver docs/84 y PR #142.

- **Verificación DEV D021 completada:** 6/6 checks del código `e22206aa` SUCCESS, migración `dev_quality_numeric_diagnostics_d021` aplicada únicamente en Supabase DEV, seis columnas confirmadas, cuatro registros históricos sin modificar. Edge Function DEV actualizada a v9 ACTIVE y status autenticado HTTP 200 sin llamada paga. Postflight: 4/6 claims, 2 pendientes, 1 `needs_review`, despachador OFF, 0 cron jobs. Las columnas de diagnóstico aún no fueron validadas en un nuevo `quality_case` real; investigar error histórico sigue abierto.

## [Sin publicar — Etapa 03 / D022 prototipo de comparación justa]
- Se incorporó `src/domain/comparacion-ofertas.ts`: evaluación determinista de cobertura por artículo y cantidad, precios con BigInt/IVA explícito, fletes y mínimos por proveedor, opciones completas con hasta dos proveedores y ranking solo dentro de mismas condiciones.
- Bloqueos: sin inferencia de IVA/flete/tipo de cambio, sin equivalencias técnicas IA, sin suma engañosa de presupuestos parciales, sin contactos, sin adjudicación. Rango acotado de laboratorio 8 renglones/10 cotizaciones y asignaciones por renglón íntegro; fraccionamiento aún fuera de alcance.
- Nueva suite adversarial de 18 tests y contrato docs/85. Sin cambios de Supabase, OpenAI, WhatsApp, Vercel ni producción. PR #144 draft apilado sobre #142; pendiente revisión final.

## [Sin publicar — Etapa 03 / D023: rondas y ofertas versionadas OFFLINE]
- Núcleo `src/domain/rondas-offline.ts`: programada, abierta, cerrada, cancelada; invitaciones anónimas y autorización de distribución, borradores por revisión, confirmación por proveedor con versiones históricas inmutables, idempotencia de eventos y expiración UTC.
- Cierre compone comparador D022 solo con últimas versiones confirmadas; no admite drafts como precios, contacto, adjudicación o equivalencias no verificadas. Tests de roles, stale revisions, duplicados, plazos y datos desconocidos. Sin infraestructura ni producción. PR #146 draft sobre #144.

## [Sin publicar — D024: ledger privado SQL de rondas, Issue #147]
- Se preparó `supabase/sql/rounds_private_ledger_d024.sql` con seis tablas exclusivamente en esquema privado: rondas, renglones, invitaciones, borradores, eventos y versiones confirmadas. RLS activa sin políticas cliente y privilegios revocados incluso a `service_role` sobre nuevas tablas.
- Triggers: transiciones irreversibles, clock server, freeze de ítems e invitados, revisiones incrementales, confirmación igual al borrador, versiones secuenciales y confirmaciones/eventos que no pueden actualizarse ni borrarse.
- Validador JSON de líneas cerrado (cinco campos, cantidades/IVA/precios explícitos, sin texto libre ni contactos). Prueba aislada PG17 en `supabase/tests/ci/99_rounds_private_ledger.sql` con `ROLLBACK`. CI incorpora paso adicional sin alterar historial de 12 migraciones.
- No es backend operativo: falta autorización real de actor/empresa, funciones de escritura transaccionales, verificación de equivalencia y API. Sin aplicar en Supabase DEV ni despliegues, IA, Whapi o producción. Ver docs/87, PR #148.

## [Sin publicar — D025 / Issue #149: lectura compradora de rondas]
- Endpoint `GET /api/rondas/[rondaId]` protegido con cookies SSR, `getUser`, bandera propia apagada, no-store, validación de UUID y proyección estricta sin PII. Adaptador invoca solo `buyer_round_overview_v1(p_round_id)` sin user_id/tenant inyectados.
- SQL privado de lectura con rol NOLOGIN/NOBYPASSRLS, sesión `auth.sessions` vigente y membresía activa verificada en PostgreSQL, con RLS y wrapper público invoker; no grants de contacto, invitaciones ni ofertas.
- Tests unitarios adversariales y PostgreSQL 17 de empresas cruzadas, sesión revocada y permisos; esquema SQL pendiente solo en CI, sin migración ni instalación Supabase DEV. Ver docs/88 y PR #150.

## [Sin publicar — UX-001: fundamento WhatsApp-first y cero fricción, 30/10/2026]
- Decisión aprobada por el propietario: Cotironda será **hiperintuitiva, sin cursos y con cero fricción innecesaria** para compradores, corralones y demás proveedores. WhatsApp es el canal habitual para ambos; la web complementa con seguimiento, comparación y adjudicación sin obligar al proveedor a cargar su presupuesto otra vez.
- Se agregó [docs/89](docs/89-ux-cero-friccion-whatsapp-first.md) con recorridos ideales, textos claros, estados honestos, filtro UX por PR, métricas de piloto y pruebas con personas no técnicas.
- Se elevaron las reglas de UX a **AGENTS.md**, README, docs/01, docs/02, docs/05, docs/08, docs/09 y la decisión UX-001 en docs/10, manteniendo D013 (autorización inicial sin revisión de cada línea clara), confirmación de precios por proveedor y adjudicación manual.
- No confundir esta decisión documentada con integración Whapi lista. **No hay cambios de código, base, producción, mensajes WhatsApp ni costos de IA**. Seguimiento: Issue #151.

## [Sin publicar — D026 / Issue #153: borradores y confirmación transaccional privada]
- Funciones SQL privadas `save_offer_draft_atomic_v1` y `confirm_offer_atomic_v1` para crear borradores, controlar versiones, confirmar explícitamente y preservar ofertas anteriores sin ejecutar IA. Operan con lock de ronda, CAS, SHA-256 del evento generado en la BD y reintento idéntico sin duplicados.
- Rol `cotironda_rounds_writer` NOLOGIN/NOBYPASSRLS; no se concede acceso a la API pública ni a proveedores. La futura capa WhatsApp deberá comprobar identidad/consentimiento y ofrecer confirmación breve y sin portal, según UX-001.
- Suite `supabase/tests/ci/101_round_offer_atomic_write.sql` con datos de prueba y rollback, conectada a GitHub PostgreSQL17. Sin instalación ni despliegue, WhatsApp, IA o nuevos gastos; documento docs/90 y PR #154.

## [Sin publicar — D027 / Etapa 04: adaptador Whapi inbound aislado]
- Se preparó `src/server/whapi-inbound-offline.ts` para el formato Whapi `messages.post`: secreto compartido en header privado, validación de canal, mensajes directos, opt-in/invitación verificables desde backend, lotes limitados, huella y clave de idempotencia, puerto de persistencia. HTTP 200 solo tras éxito de todo el lote; errores 503 permiten reintentar sin duplicar mediante sink transaccional futuro.
- Los mensajes de texto/imagen/documento/audio/voz solo generan `pendiente_interpretacion`; no leen URLs ni ejecutan IA o confirmación de precio. `Confirmo` nunca autoriza D026 sin vinculación de conversación/revisión.
- Suite `tests/unit/whapi-inbound-offline.test.mjs` con casos adversariales y docs/91. **Sin webhook publicado, secrets, almacenamiento real, Whapi conectado ni producción**, y no se gastaron créditos IA.

## [Sin publicar — D028 / Issue #157: inbox durable privado de WhatsApp]
- Se crearon SQL de `whapi_contacts_v1` (canal + chat HMAC, verificación, consentimiento, baja) y `whapi_inbox_v1` (mensajes HMAC, contenido cifrado, huellas, estado y deduplicación), solo en GitHub CI. Rol NOLOGIN/NOBYPASSRLS, RLS y grants denegados a roles de API; funciones internas sin ejecución pública.
- Recibir mensaje requiere una invitación única vigente y consentimiento. «BAJA» exacta tiene camino propio sin invitación, persiste de forma idempotente y no se puede reactivar silenciosamente. Tests PostgreSQL17 + casos offline de baja, reintentos, colisiones y persistencia fallida; documentación docs/92.
- No se modifica Supabase DEV, producción, Whapi real ni las reservas de IA. Se necesita broker seguro que genere HMAC/AES-GCM, autentique el canal y autorice contacto antes de habilitar HTTP. PR #158 draft.

## [Sin publicar — D029 / Etapa 04: broker criptográfico Whapi offline]
- Nuevo `src/server/whapi-crypto-broker.ts`: HMAC-SHA256 para chat y mensaje con claves server-only separadas, huella HMAC de contenido, AES-256-GCM con nonce/tag/AAD y adaptadores hacia los puertos privados de D028. Identidad/invitación solo de almacenamiento confiable. BAJA protegida sin ronda activa.
- Suite `tests/unit/whapi-crypto-broker.test.mjs`: tampering, clave equivocada, aislamiento de canales, duplicación/colisión, baja, revocación, mensajes multimedia sin descarga, rechazo de recibos falsos y claves inválidas. Sin modificar scripts de IA ni historial de migraciones.
- D029 **no** habilita almacenamiento PostgreSQL desde Node ni rutas HTTP. Falta gestor de claves con rotación, worker SQL autorizado, configuración Whapi y pruebas E2E. Docs/93; PR #160 en borrador, sin instalación DEV/producción ni mensajes reales.

## [Sin publicar — D030 / Issue #161: gateway Whapi→PostgreSQL privado]
- Nueva función privada `whapi_resolve_active_contact_v1` bajo rol limitado D028, selecciona vínculo validado por HMAC+consentimiento y **una única** invitación abierta. Nuevo rol gateway NOLOGIN/NOBYPASSRLS con exclusivamente EXECUTE de resolver, inbox y BAJA, sin SELECT directo ni permisos de Data API.
- Adaptador Node `src/server/whapi-postgres-gateway.ts` con SQL parametrizado, validación estricta de HMAC, bytea/nonce/tag y respuestas, errores genéricos sin filtrar credenciales. Pruebas unitarias con driver simulado, pruebas SQL PostgreSQL17 reales en `103_whapi_gateway_private.sql`, documentación docs/94.
- No hay driver SQL conectado a DEV, ni configuración Whapi, ni despliegues, secretos, uso de IA o llamadas comerciales. PR #162 en borrador.

## [Sin publicar — D031 / Issue #163: E2E real Node a PostgreSQL 17]
- Dependencia aislada `pg@8.23.1` para CI con driver PostgreSQL auténtico, sin añadir carga al portal.
- Job PostgreSQL17 prepara login CI de mínimo privilegio y claves HMAC/AES y webhook efímeras; prueba con Node el recorrido completo D027→D029→D030→D028 y reenvíos/bajas entre conexiones.
- Prueba que rol gateway no puede SELECT de tablas ni UPDATE de rondas; SQL administrador inspecciona registros cifrados y BAJA. Datos sintéticos eliminados al destruir el contenedor de CI, sin alterar historial de 12 migraciones ni DEV/producción.
- Requiere cerrar package-lock, CI verde y auditoría antes de habilitar nada. Docs/95, PR #164.

## [Sin publicar — D032 / Issue #165: AES-GCM con key-id persistente]
- Nueva columna privada `crypto_key_id` con etiqueta `legacy_d029` para filas antiguas, función keyed NOLOGIN con permisos EXECUTE-only y colisión de replay si cambia key-id; la ruta D028 legacy no se elimina.
- Broker D029 acepta clave activa y clave(s) antiguas solo de lectura; el nuevo key-id queda autenticado en AAD. Gateway usa sentencia SQL parametrizada distinta para inserciones versionadas.
- Pruebas Node de rotación entre generaciones, tampering AAD, IDs inválidos y lectura histórica; SQL PG17 y E2E Node→PG con dos generaciones, sin cambiar HMAC de identidad ni clave de huella.
- Sin instalación DEV, Whapi, OpenAI, secretos ni despliegue de producción. Ver docs/96, PR #166.

## [Sin publicar — D033 / Issue #168: configuración server-only de claves Whapi]
- Nuevo `src/server/whapi-secret-config.ts`: control de entorno esperado, flag seguro deshabilitado por defecto, secreto header propio, HMAC de identidades/fingerprint y AES activo de 32 bytes, key-id y claves históricas acotadas; sin secretos en GitHub y sin usar `process.env` implícitamente.
- Valida formatos, claves triviales/duplicadas y rechazo de variables `NEXT_PUBLIC_COTIRONDA_WHAPI_*`; error genérico sin fuga. Preflight de retiro AES exige inventario completo confiable con cero filas por clave.
- Tests unitarios adversariales, docs/97. Auditoría read-only Supabase DEV confirmó D025 aún no instalado; Issue #167 sigue bloqueante de deploy. Issue #169 documenta replay que falla tras rotación AES de D032: NO activar rotación real hasta resolver. Sin instalaciones, Whapi, IA o producción.

## [Sin publicar — D034 / Issue #169: replay de WhatsApp entre claves AES]
- Corregida función SQL privada versionada para que un reenvío auténtico con mismo message-key, proveedor, tipo, timestamp y HMAC de contenido sea idempotente incluso tras rotar AES; key-id/ciphertext/nonce/tag históricos no se reescriben. Cambios de precio, chat, tipo o fecha siguen siendo colisiones.
- Revisiones equivalentes de timestamp en ruta legacy y BAJA, sin alterar grants ni propiedad del rol NOLOGIN. Nuevos ensayos PG17 y E2E Node→Postgres contra un login restringido más tests Node adversariales.
- D025 hosted Auth Issue #167 sigue bloqueante; las pruebas CI no implican instalación DEV ni conexión real de Whapi. Docs/98, PR #171 draft.

## [Sin publicar — D035 / Issue #167: rol lector sin dependencia auth.uid hosted]
- La D025 no instalada se corrige para eliminar `GRANT USAGE auth` inefectivo en roles personalizados de Supabase alojado, sustituyendo `auth.uid()` por un helper privado SECURITY INVOKER que lee el ID desde claims PostgREST validados.
- Se conserva `is_session_verified()` para verificación de sesión vigente y usuario/correo, así como RLS de empresa y membresía activa. Tests PG17 refuerzan ausencia de grants al lector y rechazo por claim `sub` contradictorio, session revocada o empresa ajena.
- No se otorga SELECT directo a `auth.users/auth.sessions`, no se habilita ninguna integración y no se instala D024–D035 en DEV o producción. Ver docs/99.

## [Sin publicar — D036 / Issue #173: preflight read-only antes de Supabase DEV]
- Nuevo `supabase/sql/dev_inventory_d036.sql` exclusivamente SELECT: inventario de migraciones alojadas, estado de roles/objetos D024–D035, RLS base, checker de sesión y flags, sin tocar datos personales.
- `scripts/ci/dev-readiness-d036.mjs` exige exactamente 17 migraciones (12 base + cinco laboratorio IA D019–D021), falla cerrado ante diferencias, y jamás devuelve aprobación automática de despliegue. Suite adversarial con historial corto, drift y permisos incorrectos.
- `supabase/tests/ci/106_dev_rollout_security_gate.sql` añade auditoría POST de grants/owners/segregación y RLS sobre PG17 efímero. Runbook `docs/100` define backups, etapas de instalación D024→D035, smoke tests reales y recuperación. Nuevo default de Supabase 30/10/2026 obliga grants explícitos para nuevas tablas `public` (RPC D025 tiene EXECUTE explícito).
- Preflight ejecutado en DEV alojado **solo lectura**, baseline conforme; ninguna migración, rol, secreto, webhook o producción modificada. CI y PR draft pendientes.

## [Sin publicar — D037 / Issue #176: recuperar fuentes históricas IA DEV]
- Archivo fiel de cinco migraciones SQL D018–D021 desde `supabase_migrations.schema_migrations.statements[1]` de DEV, verificado exactamente contra GitHub y firmado mediante manifiesto SHA-256. Las versiones D020 de ramas viejas no coincidían exactamente con SQL alojado; se prioriza la versión realmente aplicada. No se coloca bajo `supabase/migrations` para evitar reaplicación automática.
- `scripts/ci/verify-dev-ai-migration-sources-d037.mjs` y tests unitarios detectan cambios, faltantes y drift. PostgreSQL17 efímero restaura **solo tres definiciones tabulares** (D018/D019/D021) y verifica RLS, permisos y ausencia de cron/automatización. Las otras dos D020 se archivan pero no ejecutan por dependencias `pg_net`/`pg_cron` y `DROP EXTENSION`.
- No hubo modificaciones Supabase DEV o producción, ni llamadas IA, ni WhatsApp real. Issue #175 sigue abierto hasta respaldo y restauración completa en entorno Supabase aislado; docs/101.

## [Sin publicar — D038 / Issue #178: ensayo inerte del despachador y bloqueos de backup]
- Auditoría solo lectura: Supabase DEV plan Free, pg_cron/pg_net/Vault instaladas, cero cron, auto IA OFF y 4/6 reservas usadas. Sin respaldo diario automático garantizado en Free; urge exportación lógica real protegida y ensayo de recuperación antes de D024.
- Nuevo generador `scripts/ci/prepare-inert-quality-d038.mjs`, hash control y flag CI: omite **únicamente** dos `CREATE EXTENSION` de D020 en PG17 descartable, sin ejecutar migración que hace DROP EXTENSION. SQL CI 108 verifica despachador original desactivado, RLS, cinco casos sintéticos, cuatro reservas ficticias y ninguna llamada de red.
- Plan en docs/102: no confundir restauración lógica inerte con restauración completa de DEV, no hacer clon físico con jobs activos, proteger/Auth/Storage/Vault, sin secretos en repositorio ni cambios a DEV/producción.

## [Sin publicar — D039 / Issue #180: verificación de integridad de backups cifrados]
- Nuevo script local offline `scripts/ops/verify-encrypted-dev-backup-d039.mjs` con modos seal/verify y manifiesto SHA256 de cinco exportaciones age (roles/esquema/datos/historial), ref DEV fija y hash independiente obligatorio. No importa credenciales, no descifra y rechaza paquete incompleto, SQL abierto, symlinks y contenido alterado.
- Doce pruebas unitarias sintéticas y procedimiento en docs/103. Un paquete PASS NO demuestra exportación correcta, cobertura Auth/Storage/Vault, descifrado ni restauración. La herramienta informa expresamente `restore_verified=false` y `gate_d024_open=false`.
- Estado de Supabase DEV verificado solo con SELECT: 17 migraciones, cron 0 y flag IA auto false. Sin cambios de datos/esquema, sin backup real ni despliegues; Issue #175 bloqueante.

## [Sin publicar — D040 / Issue #182: privacidad local del paquete de backup]
- Auditoría de D039 halló falso nivel de confianza posible: ficheros cifrados o directorios con permisos públicos podían pasar las comprobaciones SHA256. D040 exige propiedad POSIX y modos privados 0700/0600, rechaza hardlinks y symlinks en cualquier ancestro y detecta cambios de inodo/tamaño/modo/marca temporal durante lectura. Rechazo en Windows nativo sin controles POSIX equivalentes.
- Seis pruebas adversariales nuevas (total 18 sintéticas), docs/103 corregido, sin acceso a secretos ni SQL alojado, sin backup real, sin despliegue o cambios en Supabase DEV/producción. Estado de recuperación #175 bloqueante.

## [Sin publicar — D041 / Issue #184: preflight de destino DEV y comprobación offline de descifrado]
- Nuevo script local scripts/ops/check-local-dev-backup-d041.mjs: valida destino Supabase DEV estricto con parámetro sslmode seguro obligatorio y único, sin conexiones ni secretos impresos, y confirma por CLI age real que cinco archivos cifrados verificados por D039/D040 se pueden descifrar con identidad privada local. El SQL descifrado se drena sin persistencia ni salida; valida nuevamente hash tras concluir.
- Tests con URL y procesos age SIMULADOS (no pruebas criptográficas en CI). Documentación docs/104 y restricciones de claves/cobertura de Auth, Storage, Vault y extensiones. Backup real, restauración aislada y bloqueo #175 permanecen PENDIENTES. No cambios Supabase DEV ni producción, sin IA/Whapi.

## [Sin publicar — D042 / Issue #186: prueba real age con cinco archivos sintéticos]
- Workflow independiente `age-synthetic-d042.yml` con permisos mínimos, Ubuntu24.04 y age paquete de repositorio firmado; genera dos pares X25519 efímeros y cinco SQL de prueba, cifra con CLI age real y comprueba pipeline D039/D040/D041.
- Pruebas negativas contra identidad equivocada, encabezado falso con SHA256 coherente y bytes alterados después de sellar; borra temporales sin artifacts ni logs de claves/plaintext. Tests unitarios de D041 anteriores eran únicamente mocks: D042 agrega comprobación criptográfica real sintética. No es backup DEV ni recuperación de Auth/Storage/Vault, sin cambios Supabase DEV/producción; bloqueos #175 y D024 permanecen.

## [Sin publicar — D043 / Issue #188: inventario alojado y comparador de recovery]
- Auditoría SELECT-only real sobre cotironda-dev: PG17.11, 17 migraciones, 2 cuentas Auth, 2 identidades, 0 sesiones, 2 buckets privados/0 objetos, 1 entrada Vault (sin leer su contenido), 4 claims IA, cron=0 y automatizaciones/registro OFF. Edge Function IA desplegada identificada para revisión independiente de auth Issue #189 (`verify_jwt=false` no equivale a prueba de explotación).
- Nuevo SQL D043 de solo lectura, comparador offline fail-closed de inventarios origen/restaurado, pruebas adversariales sintéticas y runbook docs/106. **No se ha tomado backup ni ensayado restauración real.** El comparador nunca abre D024 ni cierra bloqueo #175; sin cambios de DEV/producción.

## [Sin publicar — D044 / Issue #191: clave de laboratorio dedicada en Edge DEV]
- Auditoría de 13 archivos de `cotironda-ia-dev` contra despliegue v9 confirmó paridad exacta previo a cambios; `verify_jwt=false` respaldado por documentación oficial Supabase para auth secret key no JWT. Hallazgo de superficie innecesaria: también acepta `secret:default`.
- Rama D044 cambia únicamente fuente `index.ts` a `secret:cotironda_quality_lab` (whitelist mínima), agrega pruebas adversariales del handler con fetch/DB de CI bloqueados y contrato estático de wrapper; docs/107. **El despliegue alojado v9 NO cambia**, validación real de llamadas y migración desde default quedan pendientes. Sin IA, sin cambios en Vault/DEV/producción; #175 y D024 bloqueados.

## [Sin publicar — D045 / Issue #193: recorrido comercial B2B integrado offline]
- Nueva demo que **reutiliza** los módulos documentales, producto canónico/invitaciones y comparación monetaria determinista para un pedido de cemento, látex y yeso, con ítem inseguro retenido, cuatro proveedores aptos y tres ofertas simuladas anónimas.
- Suite integrada verifica consentimiento, catálogo/zona/baja, marca flexible, consulta de presentación alternativa NO homologada, IVA 21% y dos fletes, ofertas parciales, estado de confirmación, flete/IVA conocidos, no adjudicación y no filtración de identidad. Montos totalmente ficticios.
- docs/108 describe qué está probado y qué falta (IA/Whapi reales, confirmación del proveedor, DB licitaciones, recuperación #175). Sin cambios en DEV, producción, migraciones ni uso de recursos pagos.

## [Sin publicar — D046 / Issue #195: borrador y confirmación de cotización por conversación]
- Nuevo módulo de transición OFFLINE de oferta de proveedor con vínculo de ronda/chat validado por futuro backend, propuesta estructurada, preguntas por faltantes, confirmación por respuesta al borrador correcto o referencia explícita, idempotencia en memoria y versiones de precio inmutables.
- Confirmación del proveedor NO homologa diferencias de marca/envase ni permite comparación hasta verificación técnica: todas las equivalencias arrancan `sin_verificar`. Pruebas normales/adversariales de replay, identidad ajena, faltantes y cierre; suite integrada con receptor Whapi simulado D027 sin entregar mensajes. No DB ni Whapi/IA reales, sin efectos en DEV/producción. Ver docs/109.

## [Sin publicar — D047 / Issue #197: outbox de respuestas WhatsApp aislada]
- SQL D047 privada con trabajo idempotente por ronda/proveedor/revisión, referencia a inbox D028 HMAC, validación de consentimiento y borrador D026, leases exclusivos SKIP LOCKED, token de acuse, backoff y máximo 3 intentos. En caso de cambio de revisión, cancela el trabajo obsoleto; si muere el worker en el último lease, pasa a exhausted tras vencer.
- Pruebas transaccionales D047 sobre PostgreSQL17 de GitHub CI, sin datos personales, sin llamadas de Whapi/OpenAI, sin envío ni publicación. `accepted_by_transport` indica aceptación del transporte, nunca leído/entregado; persistencia de conversación D046 y correlación mensaje→versión todavía pendientes. Ver docs/110; bloqueo #175 intacto.

## [Sin publicar — D048 / Issue #199: procedencia inbox→oferta para bloquear respuestas equivocadas]
- SQL PostgreSQL CI con enlace de origen D028, evento de guardado D026, revisión y proveedor/ronda en la MISMA transacción; idempotencia y rechazo de replay distinto. Un trigger en outbox D047 rechaza respuesta si sólo comparte proveedor/ronda sin vínculo causal. Seguridad de funciones con roles NOLOGIN/RLS y sin acceso cliente ni secretos en datos.
- Pruebas PG17 de falso origen, retroasociación indebida, empresa ajena, distinta revisión, opt-out y replay; documentación docs/111. No se conecta Whapi, no hay validación semántica de IA ni publicación DEV. Gate backup #175 permanece.

## [Sin publicar — D049 / Issue #201: confirmación WhatsApp durable y versionada, solo CI]
- Se añade transacción privada PostgreSQL que valida mensaje inbox, aceptación del transporte del borrador correcto, correlación con revisión D048, términos completos e idempotencia y llama al confirmador inmutable D026. Evidencia de mensaje→evento→versión bajo RLS, sin teléfonos ni texto; el hash de intención depende de futuro broker de confianza.
- Pruebas PG17 de replay, otra empresa/chat, hash diferente, intento de confirmar antes de enviar, IVA desconocido, corrección, versión obsoleta y opt-out. **No significa que WhatsApp ya esté integrado, ni que SQL compruebe que alguien escribió «Confirmo» o que la oferta sea técnicamente equivalente.** Sin DB DEV ni producción, sin IA/Whapi, backup real #175 pendiente. Docs/112.

## [Sin publicar — D050 / Issue #203: cita Whapi cifrada y verificación de respuesta]
- Receptor D027 conserva únicamente `context.quoted_id` de mensajes de texto, con validación estricta, y broker D029 lo guarda cifrado AES-256-GCM y lo liga a fingerprint HMAC sin cambiar tablas ni romper mensajes legacy. No confía en quoted_content ni quoted_author.
- Nuevo módulo offline prepara intención de confirmación D049 solo si texto es `Confirmo`, el mensaje ya fue persistido, el ID citado corresponde por HMAC a una salida aceptada D047 de igual canal/chat/proveedor/ronda, y el evento de confirmación es determinista/antiduplicado. Pruebas adversariales en tests/unit/whapi-quoted-confirmation-d050.test.mjs; docs/113. Sin worker real, sin llamadas Whapi/IA, sin merge ni despliegue, recuperación DEV #175 pendiente.

## [Sin publicar — D051 / Issue #205: puerto PostgreSQL privado de confirmación]
- Dos RPC internas SECURITY DEFINER NOLOGIN/RLS para leer mensaje entrante AES-GCM cifrado y acuse D047 aceptado más origen D048, sin texto/chat/teléfono claro; índice único de acuse por canal evita asociar un mensaje saliente a dos jobs.
- Adaptador server-only SQL parametrizado con comprobación de tipos/buffers y conexión inyectada para D029/D050/D049. Nuevas pruebas unitarias adversariales y SQL en PostgreSQL17 CI, sin worker ni conector Whapi real, sin Supabase DEV/producción ni consumo IA. Ver docs/114; recuperación real #175 sigue abierta.

## [Sin publicar — D052 / Issue #207: E2E real Node ↔ PostgreSQL17 para confirmar precios]
- Ensayo reproducible PostgreSQL17 con login aislado y llaves efímeras que ejecuta el receptor WhatsApp D027, el cifrado AES de D029, la persistencia D030, procedencia D048, cola D047, verificador de cita D050/D051 y confirmación/versionado D049. Casos negativos, replay idempotente, dos versiones, baja, auditoría final de filas, sin enviar mensajes ni tocar DEV/prod. `scripts/ci/whapi-pg/confirm-d052-e2e.mjs`, workflow CI y docs/115.
- No se usa proveedor WhatsApp real, extracción IA ni HTTP externo; #175 sigue bloqueando cualquier migración comercial en DEV y el PR no autoriza producción.

## [Sin publicar — D053 / Issue #209: evitar duplicación de salida tras timeout]
- Hallazgo: D047 reclamaba lease expirado aunque el worker podía haber comenzado HTTP, arriesgando WhatsApp duplicado. Migración D053 en PG17 CI suma fase de envío iniciada antes de red, marca incertidumbre si crash/timeout, excluye esos trabajos de reclamos automáticos, concilia por acuse/evidencia HMAC o cancela sin reenviar.
- D047 finish(true) ya no es permitido tras D053; un fallo pre-HTTP conocido puede reintentarse bajo presupuesto. SQL privado roles NOLOGIN RLS, pruebas de expiración, token incorrecto, BAJA, rollback, estado incierto y reintento sin envío. Docs/116. No conectado a Whapi real; sin cambios DEV/prod, gate #175 pendiente.

## [Sin publicar — D054 / Issue #211: worker Whapi server-only y prueba fake transport]
- Orquestador `src/server/whapi-send-worker-d054.ts` para reclamar D047, resolver mensaje desde backend confiable, confirmar D053 `begin_send` con commit antes de ejecutar un transporte inyectado, registrar HMAC del ID de salida o marcar `uncertain` sin duplicar. No se implementa cliente HTTP ni existe ruta de producción.
- Rol sender `cotironda_reply_sender_d054` NOLOGIN con permiso mínimo y sin reconciliación/SELECT, 11 casos unitarios adversariales y E2E Node/PostgreSQL17 con transporte simulado, tres escenarios e inspección SQL. Docs/117; Whapi/IA real y backup/restore DEV #175 aún pendientes.

## [Sin publicar — D055 / Issue #213: Whapi.Cloud HTTP preparado, bloqueado por defecto]
- Adaptador server-only para POST /messages/text HTTPS, Authorization Bearer inyectada, destinatarios allowlist, autorizador de cupo obligatorio, sin global fetch ni retries, deadline 5 s, redirects prohibidos, JSON respuesta limitada a 16 KiB. Acepta `sent:true` + ID externo válido de Whapi y `pending/sent/delivered/read` como acuse de transporte **sin** inferir lectura; D054 registra HMAC o `uncertain` ante timeout/ambigüedad.
- Pruebas con fetch fake de credenciales, allowlist, límites, status, HTTP 429/errores, JSON malformado y composición con D054. Ningún token, envío ni migración real. Docs/118. Gate backup/restore DEV #175 vigente.

## [Sin publicar — D056 / Issue #215: límites de WhatsApp por comprador y consentimiento persistente]
- Política privada de envío por empresa compradora + canal (apagada por defecto), cuotas diarias/mensuales y presupuesto mensual en unidades de **reserva estimada**, no precios facturados. Trigger SQL une reserva del ledger 1/job con inicio HTTP D053 **en la misma transacción** y serializa concurrentes con `FOR UPDATE` sobre la política. Proveedor sigue gratis.
- Función privada pre-HTTP comprueba vigencia de consentimiento/BAJA/revisión + reserva, y adaptador server-only calcula HMAC D029 del destinatario para evitar enviar a otro chat. Tests PG17 transaccionales y tests TS de denegación, no public RPC ni tokens/clientes. No se instaló DEV/prod ni se habilitó Whapi, #175 sigue abierto. Docs/119.

## [Sin publicar — MVP-001 / Issue #217: primera experiencia comprador navegable]
- Nueva ruta responsive `/probar` en Next.js portal, accesible desde la portada: pegar lista, analizar con motor offline existente, retener dudas, agrupar invitaciones por rubro y proveedor ficticio, mostrar texto de consultas sin enviarlas. Privacidad por procesamiento local del navegador, sin red, sin IA ni presupuesto inventado. Tests unitarios de flujo y casos adversariales; docs/120.
- Reorientación de trabajo: consolidar PR encadenados y validar UX + ronda real supervisada en lugar de seguir añadiendo infraestructura aislada. Bloqueante restauración Supabase DEV #175 vigente. Sin merge o deploy.

## [Sin publicar — MVP-002 / Issue #219: candidatura de integración del producto]
- Creada rama de integración `integration/mvp-piloto-20261031` desde el MVP-001 probado; documentación de ancestría con `main` (1145 commits a favor, 0 detrás) y riesgos de megadiff, sin merge ni reescritura ciega de historial.
- Nueva prueba transversal entre vista comprador, motor de invitaciones D045 y comparador determinista, sin inventar precios, envíos ni adjudicación. CI completo y PR a `main` en borrador. Bloqueo Supabase DEV #175 y preview Vercel 402 vigentes. Docs/121.

## [Sin publicar — MVP-003 / #175: ensayo real de dump/restore PostgreSQL 17 aislado]
- GitHub Actions prueba un `pg_dump` custom y `pg_restore` PG17 reales sobre dos bases ficticias del mismo clúster CI después de todas las pruebas SQL. Compara huellas de filas, estados de outbox, ledger de cuotas, RLS, permisos y función de comienzo HTTP. No hay DROP, copia de datos de clientes, publicación, credenciales reales ni conexión a DEV. Docs/122. **No cerrar #175**: falta copia real cifrada de DEV y restauración separada con Auth/Storage/Vault/roles.

- Corrección MVP-003 en laboratorio: el primer pg_restore falló por `CHECK` de ofertas que consultaba `round_items_v1` durante COPY; se migra la validación cruzada a triggers de escritura en CI, manteniendo exactamente el validador y pruebas de rechazo. No se instaló el parche en DEV ni prod; requiere rollout auditado (#175). Ver docs/122.

### 31/10/2026 — MVP-003 extracción cifrada DEV preparada, pendiente de ejecución auténtica
- En PR #221 se sumó `scripts/ops/export-encrypted-dev-mvp003.mjs`, una herramienta local POSIX de cinco flujos `pg_dump`/`pg_dumpall` PostgreSQL17 → age, sin SQL plaintext persistente, con lista de destinos permitidos y manifiesto D039.
- 10 pruebas unitarias sintéticas de exportación (casos positivos y de falla); documentación de uso local en `docs/123-mvp-003-exportacion-cifrada-dev-local.md`. No se ejecutaron backups reales de DEV, ni restore alojado, ni despliegue; #175 permanece abierto.

### 31/10/2026 — MVP-004, comparador visible sin falsificar cotizaciones
- Nueva pantalla de demostración `/probar/ofertas`, enlazada desde `/probar`: cobertura por artículo, totales de canastas completas con IVA/flete y combinación de hasta dos vendedores anónimos. Selección de ejemplo exclusivamente local. Sin API ni contacto ni adjudicación.
- Reutiliza `compararCotizacionesOffline` con fixtures estáticos y verifica que una oferta parcial o no confirmada no gane por un subtotal menor. PR en borrador encadenado sobre #221, sin cambios en Supabase DEV ni producción.

### 31/10/2026 — MVP-005: no presuponer IVA ni flete
- Regla de negocio del propietario registrada en docs/125: el proveedor informa en detalles si los precios son con/sin IVA y cómo se cobra el flete. Ningún dato ausente se completa con cero o «incluido».
- Pantalla de comparación con aclaraciones desplegables por proveedor; el importe visible solo se anuncia como comparable según datos declarados. Caso de ejemplo IVA y transporte no aclarados; pruebas para null vs cero expreso y smoke HTTP que impide regresar al mensaje engañoso.
- Solo desarrollo y pruebas, sin tocar Supabase DEV, producción, canales de WhatsApp ni presupuestos reales.

### 31/10/2026 — MVP-006: aclaraciones documentales e IVA solicitado por comprador
- Lector offline con citas/fila para detectar condiciones expresas de IVA y transporte en notas de presupuestos, validar propuestas IA contra evidencia y conservar «no informado» o «contradictorio» sin inventar impuestos. IA real, PDF, WhatsApp y normalización bruto/neto no conectados.
- Solicitud de comprador con exigencia textual explícita de IVA en línea independiente: se separa del listado de materiales y se incorpora una sola vez por proveedor en el mensaje de ejemplo, preservando elegibilidad/idempotencia. No envío real, sin DEV/producción.

### 31/10/2026 — MVP-007: presupuesto con evidencia → borrador D046
- Nuevo adaptador económico offline de precio citado y condiciones IVA/flete a campos estrictos del borrador D046. No netear importes brutos si la alícuota y el redondeo no están comprobados. Flete omitido permanece `null`; solo es cero cuando está expresamente incluido o sin cargo.
- Casos de regresión integrados de cita de fuente, IVA bruto/neto, alícuota faltante, importe en pesos argentinos, requisito IVA de comprador, flete adicional y confirmación D046. Sin nuevas APIs, Whapi, SQL DEV ni producción; ver docs/127.

### 31/10/2026 — MVP-008: sin confirmaciones adicionales ni fricción
- Cambio vinculante de producto: comprador envía una sola vez; preguntar localidad/zona entrega solo si falta/contradice. Cada proveedor recibe consulta preparada con materiales, zona y detalles excepcionales expresamente pedidos. No se exige revisar renglones ni confirmar cotización dos veces.
- Nueva ruta offline de recepción de oferta del proveedor desde evento validado: se registra al recibirla aunque falten IVA/flete; respuesta posterior crea versión inmutable; duplicados y remitente inválido bloqueados. Comparación sigue excluyendo IVA/flete desconocidos o equivalencias no verificadas, sin ocultar oferta parcial recibida.
- Demo del comprador pregunta una única zona si falta, y muestra mensajes ficticios consolidados sin «Confirmo». Legado D046/D049/D051 permanece por compatibilidad: requiere migración real antes del piloto. Sin envío, deploy ni cambios Supabase DEV.

### 31/10/2026 — MVP-009: SQL de recepción directa sin mensaje de confirmación
- Nuevo procedimiento privado `whapi_receive_quote_d059` que liga inbox cifrado a revisión D048 y versión inmutable D026 de manera atómica, sin intervención D047/D049. Admite ofertas parciales y datos fiscales/logísticos ausentes, conserva control de opt-in, identidad, plazos, deduplicación y correcciones.
- Recibos protegidos por RLS/rol NOLOGIN sin datos personales en claro; ensayo de casos normales y extremos en PostgreSQL 17 efímero CI. No SQL instalado en Supabase, no Whapi real, no merge/deploy. Ver docs/129.

- MVP-009 añadió también puerto **server-only** `whapi-quote-direct-postgres-d059.ts` hacia SQL D059, con validación estricta de campos, SQL parametrizado y resultados fail-closed; tests de respuesta, replay, corrección, campos maliciosos y errores internos. Aún sin endpoints ni conexión de broker real.

### 31/10/2026 — MVP-010: no perder el importe declarado si IVA no está informado
- Nuevo diseño de origen de precios D060: monto unitario original, estado de IVA, posición/hash fuente y vínculo a versión del proveedor; ingreso atómico D059 y lectura comprador autenticado por alias, solo último presupuesto vigente. Sin inventar neto/IVA/flete y sin segundo «Confirmo».
- Rol SQL privado, RLS, exactitud económica, versiones y replay, ACL por empresa; pruebas PostgreSQL 17 CI y puerto TypeScript. No se aplica a Supabase DEV ni se conecta a Whapi real; ver docs/130.

- Puente servidor MVP-010 `whapi-quote-source-builder-d060.ts` de importe citado y aclaración IVA a filas D060, con hash de cita y mapeo por línea de ronda controlada; pruebas desde presupuesto de texto hasta puerto SQL, incluyendo IVA pedido no cumplido y citas inventadas. Aún no hay worker/Whapi live.

### 31/10/2026 — MVP-011: conectar recepción cifrada a cotización directa
- Nuevo puerto de lectura PG17 privado D061 verifica contacto, invitación, ventana y snapshot por ronda; entrega cifrado AES-GCM sin exponer datos personales, y revisión correcta de versiones/replays.
- Nuevo coordinador Node/TypeScript toma mensajes de inbox D028, comprueba autenticidad del cifrado y citas del importe, confronta artículos/unidades con ledger y ejecuta escritura atómica D060 sin «Confirmo». Tests crypto real + casos malos y pruebas SQL PG17; aún sin Whapi/API IA live ni workers. Ver docs/131.

### 31/10/2026 — MVP-012: cola durable de cotizaciones entrantes
- D062 en PostgreSQL17 efímero: trigger de inbox texto a cola privada, claim concurrente con `SKIP LOCKED`, lease y recuperación, orden por proveedor/ronda, ACK sólo tras escritura D060 real, revisión interna y máximo 4 reintentos sin revelar texto. Worker Node inyectado, sin cron/Whapi/IA live.
- Pruebas SQL normales/extremas y Node; documento 132 y auditoría. Sin instalación en Supabase DEV/prod ni merge.

### 31/10/2026 — MVP-013: ensayo vertical completo Node/PostgreSQL17
- Intérprete textual conservador de precios/cantidades explícitos D063, sin llamada IA ni suposiciones fiscales. Ensayo con webhook simulado y **driver pg real sobre PostgreSQL 17 efímero** enlazando cifrado, bandeja D028, cola D062, lectura D061, escritura D060, corrección/replay, BAJA y lectura anónima de comprador autenticado.
- Rol CI de permisos EXECUTE acotados, sin acceso directo a inbox/ofertas. No instalación Supabase DEV/prod ni webhook/Whapi/IA live; backup #175 sigue pendiente. Ver docs/133.

### 31/10/2026 — MVP-014: comprador ve sus rondas y ofertas recibidas, no precios inventados
- Pantalla móvil de «Mis solicitudes» y consulta anónima de última versión de cotizaciones por ronda, sin ingresar IDs, basada en RPC D025/D060 y autenticación de sesión; listado SQL privado con RLS. D060 amplía moneda, unidad, cantidad disponible, condiciones fiscales, flete y pago sin inferir costos. Tests SQL PG17 y API Node/TypeScript/Next, flags Preview fail-closed. Sin instalación en Supabase DEV, Whapi ni despliegue. Ver docs/134.

### 31/10/2026 — MVP-015: alta real de pedido comprador como ronda privada
- Nueva RPC SQL privada de propietario/administrador autenticado y función public invoker, idempotente, zona obligatoria, IVA explícito, 1–8 materiales sin suposiciones. Inserta ronda programada y líneas en una transacción, nunca fabrica proveedores ni envía Whapi. API Next POST con origin/CSRF, validación y guard Preview apagado. Pruebas PostgreSQL17 y unitarias; documentación 135. No instalado DEV/prod, respaldo #175 pendiente.

### 31/10/2026 — MVP-016: preparación de proveedores aptos sin mensajes
- PostgreSQL17 D065 curado rubro→producto y localidad→provincia/ciudad, proveedores por categoría habilitada, área, aceptación y opt-in Whapi sin BAJA, cada invitación con scope de líneas, alias anónimo y máximo 10. Idempotencia transaccional por ronda/canal, no apertura ni WhatsApp, controles RLS y test PG17. Backup real DEV #175 sigue pendiente. Ver docs/136.

### 31/10/2026 — MVP-017: paquetes WhatsApp por proveedor con rubro y consentimiento, SIN ENVÍO
- Función privada D066 de vista previa con scope D065, etiqueta curada, zona, cantidad, IVA explícito y revalidación de contacto/BAJA, rubro y área. Generador TS sin red. Tests PostgreSQL17 con BAJA posterior y zona revocada + casos maliciosos en unitarias. No envío, no nuevas tablas en Supabase DEV, #175 pendiente. Ver docs/137.

### 31/10/2026 — MVP-018: defensa de cotización entrante fuera de rubro
- D061 restringe snapshot a líneas asignadas D065 para rondas D064. Nuevo trigger D067 impide escribir ofertas de artículos ajenos incluso por RPC directa; roles dedicados NOLOGIN/RLS y ensayos PostgreSQL17 con dos proveedores, replay y BAJA. Sin Whapi real ni instalación DEV. Ver docs/138.

### 31/10/2026 — MVP-019: vault privado de destinatarios WhatsApp cifrados (sin enviar)
- Vínculo HMAC↔destino Whapi cifrado AES-256-GCM/AAD y tabla D068 inmutable privada, functions EXECUTE-only de enrolamiento/lectura con BAJA actual y scope D066; resolver TS sin red. Tests cripto+PG17 con proveedores ficticios, manipulación, replay, rol/área y opt-out. No modifica DEV/prod ni hace envíos. Ver docs/139.

### 31/10/2026 — MVP-020: registro cifrado desde broker y onboarding verificados (sin envíos)
- Adaptador D069 solo servidor reutiliza vault D068 y SQL con consentimiento/BAJA, autorizador HMAC inyectado, flags cerrados y respuestas sin PII. Broker D029 acepta puerto opcional y revalida proveedor después de persistir entrada autenticada. Pruebas unitarias webhook sintético, SQL D068 PG17 de BAJA/replay/identidad inexistente; ejecución CI sujeta a verificación. No implica alta real de comerciantes, Whapi activo ni cambios DEV/prod. Ver docs/140.

### 31/10/2026 — MVP-021: outbox exclusiva de invitaciones (sin envíos live)
- SQL D070 roles privados, trabajo único por proveedor/ronda/canal, reserva transaccional de límites D056 compartidos con respuestas y fases no-retry tras HTTP incierto. Worker TypeScript utiliza cifrado D068 y transporte Whapi existente D055 con autorización final HMAC+consentimiento; flags deshabilitados por defecto. Tests unitarios/PG17 de casos normales y de rechazo. No se despliega ni instala Supabase DEV/prod, backup #175 pendiente. Ver docs/141.

### 31/10/2026 — MVP-022: snapshot uniforme para los fragmentos del respaldo DEV
- `export-encrypted-dev-mvp003.mjs` usa `psql pg_export_snapshot()` en transacción READ ONLY y pasa `--snapshot` único a los cuatro dumps que componen el SQL, preservando streaming a `age`. Verifica versión PostgreSQL17 de `psql`; falla cerrado ante protocolo inválido/desconexión. `pg_dumpall` roles sigue sin snapshot global y el restore auténtico de DEV sigue pendiente Issue #175. Pruebas sintéticas Node/CI, sin datos reales ni despliegue. Ver docs/142.

### 31/10/2026 — MVP-023: matching y preparación integral de ronda (sin red)
- Nueva función D071 privada PostgreSQL17 CI integra D065+D068+D070 transaccionalmente, reintentos idempotentes y pendientes cuando falten contactos verificados/etiquetas/alcance; no envía nada ni añade paso al comprador. Puerto Node con validación strict/fail-closed, tests sintéticos de dos rubros, BAJA, permisos y replays. No se desplegó y Supabase DEV #175 sigue sin respaldo auténtico. Ver docs/143.

### 31/10/2026 — MVP-024: primer proveedor puede vincular WhatsApp mediante una sola acción (solo CI)
- Nuevo D072 de token SHA256 15min/128bits para dueño/gerente Auth válido de empresa proveedor, consumo privado por webhook D027 autenticado, consentimiento explícito al enviar `COTI ALTA`, chat HMAC sin número en SQL y sellado D069 AES-GCM tras COMMIT. Broker D029 opcional y enlace `wa.me` generado sin enviar. Pruebas Node/PG17 sintéticas; no integrado en UI ni instalado DEV/prod, falta #175. Ver docs/144.

### 31/10/2026 — MVP-025: pantalla para activar WhatsApp de proveedor (solo CI)
- Nueva UI móvil `/proveedores/whatsapp` con un CTA de alta; SSR lista negocios propios autorizados y emite enlace `wa.me` mediante JWT Supabase + RPC D072. D072 ahora exporta emisor sin requerir claves HMAC/AES en Next. Nuevo controlador D073 con entorno Preview/Origin/Auth, response no-store, límite streaming 256 bytes y host wa.me exacto. Tests Node/HTTP Next sin envíos; flag OFF; no base DEV ni producción. Ver docs/145.

### 31/10/2026 — MVP-026: Preview proveedor con registro general cerrado
- Separado el modo de inicio de sesión del proveedor de `COTIRONDA_REGISTRATION_ENABLED`, ahora obligatorio OFF; flags explícitos Auth+WhatsApp, Vercel Preview, commit branch de integración y Supabase DEV exclusivo. `/alta` ofrece enlace a activación sin formulario de empresa, Next Proxy refresca SSR cookies en rutas proveedor. Nuevo HTTP E2E de Next con fake Auth/PostgREST/RLS/D072, origen, falta de sesión, empresa ajena y signup bloqueado. Sin deploy, migraciones reales ni WhatsApp live. Ver docs/146.

### 31/10/2026 — MVP-027: exportación cifrada de DEV en un comando, pendiente ejecución real
- Nuevo `scripts/ops/cotironda-private-backup-d075.mjs` para ordenador privado POSIX: preflight de conexión exclusiva DEV y binarios PG17+age; identidad age con permisos 0600, derivación `age-keygen -y` y rechazo antes de exportar si no coincide; reutiliza D003 snapshot consistente, D039 manifest y D041 descifrado sin plaintext en disco. Rechazo explícito GitHub Actions/CI/Vercel. Pruebas sin red mediante inyección sintética. No hay backup auténtico ni restore, bloqueante #175 abierto. Ver docs/147.

### 31/10/2026 — MVP-028: comprador pega lista y conserva especificaciones exactas
- Nuevo formulario móvil en `/mis-rondas` para texto y localidad con un único CTA, sin confirmaciones adicionales; captura 1–8 productos reconocidos por taxonomía curada, retiene líneas dudosas y explicita `invitationsSent:0`. D064 valida y guarda `source_description` (CPC 50 kg, marca, RH 12,5) dentro del hash idempotente; D066 usa fuente original en el mensaje privado en lugar del label genérico. Auth Preview comprador separado de WhatsApp proveedor y signup OFF. Unit tests, SQL PG17 y HTTP Next con Auth/PostgREST ficticios en CI; ningún envío, SQL DEV ni despliegue. Ver docs/148 y #269.

### 31/10/2026 — MVP-029: identidad de producto validada en SQL y HTTP, sin nuevos pasos
- La RPC D064 exige `source_description` en todas las líneas nuevas y comprueba en PostgreSQL (`valid_pilot_product_d078`, solo interno) que el código del artículo corresponde a su familia literal; evita pedidos falsificados con código cemento y texto látex. Rechaza palabras parecidas excluidas y coincidencias de dos familias. Validación HTTP temprana con taxonomía existente, pero SQL conserva la autoridad. Nuevas pruebas de SQL autenticado, unitarias y regresión CI; sin instalación DEV ni mensajes WhatsApp. Ver docs/149 e Issue #271.

### 31/10/2026 — MVP-030: mapeos curados para el primer pedido con dos corralones
- Nuevo script SQL opcional D079 para seis familias exactas de materiales, cinco rubros y localidad La Plata/Buenos Aires, con verificación de taxonomía, idempotencia y rechazo de conflictos. Nueva prueba transaccional PostgreSQL17: comprador con Auth sintético guarda una ronda D064 de 20 bolsas CPC Loma Negra 50 kg; D065 alcanza dos corralones en zona y excluye tercero fuera de zona y otro con BAJA; D066 preserva texto y cantidad; D071 sin vault devuelve dos destinatarios pendientes y cero jobs/mensajes. Nada aplicado en DEV ni enlazado a Whapi real. Ver docs/150 e Issue #273.

### 31/10/2026 — MVP-031: evitar invitaciones a proveedores sin producto de catálogo
- D080 agrega correspondencia interna entre `public.supplier_products` y familia material (SHA-256 del producto declarado), sin permisos de escritura para proveedores/usuarios/servicio y solo lectura del matcher NOLOGIN. D065 exige producto activo, del mismo comercio/rubro, y huella sin cambios; D066 revalida el catálogo antes de entregar un paquete al orquestador. CI PostgreSQL17: rubro sin producto no invita; dos corralones con producto de catálogo sí, tercer corralón sin producto no; edición o desactivación invalida paquetes; sin Whapi real, cambios DEV ni producción. Ver docs/151 e Issue #275.

### 31/10/2026 — MVP-032: decisión de dominio y control final pre-WhatsApp
- Auditoría de Vercel: el dominio propio `cotironda.com` aún no está asociado a ninguno de los dos proyectos; mantenerlo fuera de Preview hasta producción aprobada. El portal Next `cotironda-portal-dev` sí tiene Preview SSO `READY` de HEAD integrado. Identificado que D070→D068→D066→D080 ya revalida catálogo, consentimiento, localidad y huella inmediatamente antes del intento HTTP. Agregada prueba PG17 que cambia/desactiva productos y registra BAJA entre `BEGIN` y autorización, asegurando rechazo sin ampliar permisos. Sin cambios DEV, Whapi live ni DNS. Ver docs/152 y #277.

### 31/10/2026 — MVP-033: el destino se pregunta solo si falta
- La pantalla del primer pedido no presenta una segunda entrada de localidad por defecto; usa `Entrega en:` de la lista cuando es inequívoca y pregunta únicamente cuando falta o hay conflicto. Un valor anterior escrito en el campo no puede sobrescribir sin aviso un nuevo destino en el texto. Se retienen líneas ambiguas/IVA contradictorio como antes, sin cambios en D064, Whapi, RLS, Supabase DEV ni despliegue. Tests nuevos y smoke HTTP SSR; ver docs/153 e Issue #279. #175 sigue abierto.

### 31/10/2026 — MVP-034: pegar desde planillas sin reescribir materiales
- Soporte estricto para pegar tres columnas de Excel (texto TSV) en el campo comprador existente: dos órdenes reconocibles, encabezado exacto opcional, fuente literal conservada y aclaraciones por línea para filas dudosas o contenido peligroso. Sin subir archivos ni ejecutar fórmulas; reutiliza D064 y sus verificaciones. Añadida suite de regresiones, explicación de UI y docs/154. Sin tocar base DEV, WhatsApp, dominio ni producción; #175 abierto.

### 31/10/2026 — MVP-035: asistente local para obtener respaldo cifrado de DEV
- Un único comando en una PC privada prepara identidad age, pide URL sin eco y reutiliza `cotironda-private-backup-d075.mjs`; comprobación fail-closed ante cloud/CI/no-TTY, cero SQL en claro guardado. Suma pruebas offline y runbook docs/155; **no hubo dump de DEV ni restore genuino**. No cambia Supabase, Whapi, DNS, env ni producción. #175 permanece abierto.

### 31/10/2026 — MVP-036: política de ahorro de deployments Vercel DEV
- `apps/portal/vercel.json`: regla global `git.deploymentEnabled: {"**":false}` más única excepción para rama de integración, sin `ignoreCommand` que consume la cuota. Tests unitarios de alcance y configuración, docs/156. Requiere validación de Root Directory/efecto real; no elimina el 402 ya consumido, no actualiza producción, no instala SQL DEV ni activa WhatsApp.

### 31/10/2026 — MVP-037: corregir permisos de carpetas privadas en asistente de backup
- Se detectó que `mkdir -p -m 700` no asegura permisos sobre carpetas preexistentes. Preflight con Node22 comprueba propietario actual, rutas privadas sin symlinks, HOME no manipulable y bits grupo/otros de keys/backup en 0 antes de generar clave age o leer conexión. Pruebas con chmod/symlink reales sobre fixtures; sin ejecutar backup real ni modificar Supabase/Vercel/Whapi. Ver docs/157, Issue #287 y gate pendiente #175.

### 31/10/2026 — MVP-038: una ronda ficticia completa y navegable
- Ruta móvil `/probar/piloto` une pedido real escrito por el usuario con respuestas **ficticias editables** de A/B y el comparador económico ya existente, IVA/flete desconocidos sin ranking engañoso, selección solo visual y sin persistencia. CTA desde `/`, enlace desde `/probar`; pruebas de dominio y smoke SSR. Sin DB DEV, WhatsApp, producción o DNS; #175 permanece bloqueante.

### 31/10/2026 — UX-002 / MVP-039: NO adjudicación; finalistas y contacto recíproco
- El propietario rectifica expresamente D006 y UX-001: Cotironda al cierre identifica **hasta dos presupuestos finalistas comparables por rubro**; arquitecto y cada finalista autorizados conocen recíprocamente sus datos comerciales, sin click de adjudicar ni compromiso de compra en Cotironda. La negociación se acuerda por fuera.
- Nuevo contrato puro `src/domain/finalistas-automaticos-mvp039.ts`, sin contacto real, red, WhatsApp ni persistencia: elige anónimos únicamente después del vencimiento con consentimientos e identidades verificados por el caller, canasta completa, mismas condiciones, sin falsos totales parciales, empates dudosos ni contactos de no finalistas; tests unitarios asociados.
- Se rectifican AGENTS, visión, reglas, decisiones, WhatsApp, pruebas, roadmap y nota de que la demo MVP-038 de adjudicación visual es **legada/rechazada como UX**. Ver [docs/159](docs/159-ux-002-finalistas-y-contacto-mutuo.md), Issue #291. Sin publicación ni difusión de contactos; backend real requiere #175, RLS y pruebas de WhatsApp/consentimientos.

### 31/10/2026 — MVP-040: primer puente WhatsApp arquitecto → ronda → proveedores
- Consumidor privado `src/server/buyer-whatsapp-ingress-d073.ts` procesa entrada confiable y cifrada de comprador (vía puerto pendiente de conectar), extrae lista textual verificada sin pedir confirmación extra, prepara pregunta de localidad idempotente en outbox, permite continuar con respuesta posterior del mismo chat y llama creación de ronda + preparación de invitaciones D071 tras COMMIT. Rechaza adjuntos sin descarga/escaneo/extracción autorizados, identidad no vinculada y ausencia de consentimiento previo de contacto. Sin envíos/SQL DEV/Whapi live/IA de documentos: ver [docs/160](docs/160-mvp-040-ingreso-whatsapp-comprador.md) e Issue #293; bloqueos #175 y wiring real.

### 31/10/2026 — MVP-041: preparar Whapi.Cloud para QR sin activar tráfico
- Propuesta segura de webhook Body/messages.post + encabezado secreto, auditor GET-only con URL fija `/health?wakeup=false`, `/users/profile` y `/settings` (respuesta sanitaria sin teléfonos, secretos ni payload), comando local privado sin envíos ni cambio de ajustes y pruebas adversariales. **No existe webhook real montado todavía**; ni token guardado, ni Whapi vinculado, ni backend comercial instalado. Ver [docs/161](docs/161-mvp-041-conectar-whapi-qr.md); bloqueo de respaldo DEV #175 intacto.

### 01/11/2026 — MVP-042: entrada Whapi para arquitecto y negocio en un mismo número
- D027 ahora enruta mensajes entrantes de compradores **o** proveedores únicamente por vínculo privado del chat y bloquea doble rol. D029 extiende cifrado AES-GCM/AAD y HMAC con separación de comprador; BAJA independiente, duplicados y fallos fail-closed, sin confirmar, despachar ni revelar contactos. Tests con WhatsApp sintético; detalles docs/162. **Sin endpoint ni canal Whapi real habilitado**, Supabase DEV comercial sigue pendiente de #175.

### 01/11/2026 — MVP-043: inbox comprador SQL/RLS y gateway Whapi dual
- Nuevo D074 con tablas privadas de chat comprador HMAC y mensajes AES-GCM, resolución verificada, BAJA idempotente, prevención del mismo chat comprador/proveedor, RLS/EXECUTE-only y cifrado AES key-id. Adaptador JS para gateway dual sobre D030, pruebas SQL PG17 sintéticas y unitarias de permisos/parametrización. **Sin migración DEV ni Whapi real**, bloqueo #175 intacto. Ver docs/163.

### 01/11/2026 — MVP-044: lector SQL cifrado del WhatsApp comprador al procesador de pedidos
- D076 privado para recuperar inbox D074 solo con consentimiento actual y sin doble rol, permisos NOLOGIN/EXECUTE-only y RLS. Adaptador Node sin red ni secreto para validar ciphertext AES-GCM AAD del comprador y pasar texto validado al motor D073 (que prepara pregunta de zona o ronda vía puertos transaccionales). SQL PG17 CI, pruebas de eventos cifrados y regresión. **No webhooks vivos ni migraciones instaladas en DEV**. Ver docs/164, gate de respaldo #175.

### 01/11/2026 — MVP-045: continuar pedidos por WhatsApp con una sola respuesta de zona
- D077 privado: memoria HMAC del pedido original y outbox fija de consulta de localidad, sin texto ni contactos en claro, idempotencia/concurrencia, expiración 48h, revocación y lectura de dos mensajes cifrados validados por AES-GCM. Worker nuevo reutiliza D073; tests PG17 y unitarios. **No envía la pregunta, no consume pendiente al crear ronda real, no habilita Whapi ni DEV**. Ver docs/165 y backup #175.

### 01/11/2026 — MVP-046: ronda WhatsApp comprador transaccional sin usuario ficticio
- D081 privado en PG17 CI crea ronda+ítems+pedido compatible con D065/D071+origen Whapi HMAC en una transacción, conserva created_by NULL con constraint de procedencia, consume pregunta D077 al asociar respuesta exacta y evita duplicados/concurrencias. Adaptador JS compone D073 con D071 solo después de commit y jamás envía WhatsApp. Tests SQL/unitarios. Sin Supabase DEV, Whapi live, publicación ni migraciones productivas. Ver docs/166; backup real #175 pendiente.

### 01/11/2026 — MVP-047 cola durable de pedidos por WhatsApp
- D082 SQL PG17 CI: trigger de inserción cifrada comprador→cola única por canal/mensaje, lease/ACK, reintento con demora y dead-letter, RLS/roles restringidos. Worker server-only D082 conecta D077/D081, trata archivos no verificados como revisión y nunca envía WhatsApp; regresión SQL/Node. Sin instalación Supabase DEV, Whapi ni producción. Ver docs/167 y gate #175.

### 01/11/2026 — MVP-048: ruta HTTP HTTPS Whapi, segura y cerrada hasta piloto
- Nueva ruta Next `/api/integraciones/whapi` y adaptador server-only D083: Preview/branch/flags, header secreto comprobado antes de conexión, HMAC/AES mediante módulos existentes, escritura buyer/supplier sin descargar medios ni enviar mensajes. Tests HTTP/seguridad. **Sin gateway PostgreSQL real inyectado, permanece 503**, ninguna migración comercial Supabase DEV o despliegue Whapi/Vercel. Ver docs/168; backup real+restore #175 no cumplido.

### 01/11/2026 — MVP-049: ensayo de restore local aislado para desbloquear Supabase DEV
- Herramienta `restore-encrypted-dev-lab-mvp049.mjs` y wrapper `restaurar-dev-aislado.sh`: D039 valida integridad AGE y hash independiente; D041 valida clave y descifrado; crea PostgreSQL17 local Docker sin red/ports/mounts, reconstituye 5 SQL por streaming, verifica esquema y destruye contenedor. Rechaza cloud/CI/DSN externos, oculta contenido y nunca deja SQL en disco. Unitarias con procesos simulados y shell. **Todavía no hay restore real ni conexión Supabase DEV; gate #175 continúa pendiente.** Docs/169.

### 01/11/2026 — MVP-050: preparar rol técnico exclusivo para receptor Whapi HTTPS
- D084 PostgreSQL17 CI define rol de privilegios NOLOGIN/NOBYPASSRLS, seis funciones privadas de guardar/resolver mensajes comprador/proveedor y BAJA, sin lectura directa ni creación de rondas y cola. Test con login ficticio de CI bajo ROLLBACK, controlando explícitamente permisos prohibidos. Sin secret, driver DB, migración Supabase DEV, llamada Whapi ni despliegue. Ver docs/170 y gate #175.
