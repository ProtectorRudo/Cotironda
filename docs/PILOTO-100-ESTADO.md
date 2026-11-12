# Cotironda — estado verificable y relevo entre conversaciones

> **ACTUALIZACIÓN P0 — 11/11/2026: evaluación de código abierto:** [Comparativa ERPNext vs Cotironda](P0-ERPNext-vs-Cotironda-evaluacion.md). Se eligió mantener el núcleo actual y no instalar ERPNext/otra base para el piloto, con reserva de revisarlo si falla un spike real. **P0 no está terminado:** falta matriz de Vercel, política explícita de revelación de originales y tests de acceso. Último dato real: 8 medios archivados con SHA, 4 ligados a request_id (no necesariamente correctos), 0 ofertas anónimas, Auth piloto 0, política originales OFF, consentimientos 0. **Siguiente paso único:** completar P0 de privacidad/empresa/implementación desplegada; luego P1/P2 proyección documental. Rama y PR de esta evaluación independientes, sin deploy.


**FECHA DEL ÚLTIMO RELEVO:** 11/11/2026 (Argentina). Este archivo es un SNAPSHOT, no una consulta en tiempo real.

> **VERCEL, VERIFICADO 11/11/2026:** `cotironda` producción READY es una demo aislada de `main` (SHA `5987f170...`), NO el piloto documental. `cotironda-seguimiento-vista-piloto` tiene producción READY de rama antigua y **previews documentales ERROR**; `cotironda-seguimiento-web-piloto` conserva producción ERROR y previews previas READY. Los commits de documentación activan builds de **Preview automáticos** por la conexión GitHub, aunque no se haya publicado a producción. Antes de P3/P4, identificar URL real autorizada del comprador, revisar build y validar con Auth/ACL. [Evidencia y matriz](P0-ERPNext-vs-Cotironda-evaluacion.md).

**LECTURA OBLIGATORIA:** [Issue #794 — checklist canónico](https://github.com/ProtectorRudo/Cotironda/issues/794) y [Plan maestro](PILOTO-100-PLAN-MAESTRO.md).

**Compatibilidad de la vinculación (auditoría actualizada):** el webhook del piloto ya intenta `cotironda_piloto_ia_link_supplier_mvp225` después de verificar y archivar el binario; la prueba no depende de que la IA termine precios, pero sí del permiso `quote_link` (2 de 2 proveedores habilitados en el piloto al 11/11). Cuando el negocio primero avisa que enviará un archivo, la función `cotironda_piloto_ia_attach_supplier_media_mvp238` puede generar el método seguro `prior_supplier_preamble`; MVP355 ahora lo admite además de `quoted_whapi_id` y `single_active_round`. El enlace legado MVP151 trabaja sobre `whapi_outbox` y no constituye automáticamente evidencia de un despacho IA nuevo. **Falta prueba real de ambas respuestas y de la ruta de seguimiento completa.**

**CI FINAL MVP355 (11/11/2026):** el SHA técnico [`721ecc12d2a9a35e54d53b35f009d419b4cca3f6`](https://github.com/ProtectorRudo/Cotironda/pull/798) pasó **5/5 workflows generales**: Next.js, unidad general (incluye **PG17 documental** y **Deno seguimiento** como jobs separados), PostgREST, PG17 aislamiento y verificación sitio. Probados dos formatos sintéticos, SHA, links débiles/ausentes, vínculo de aviso previo, duplicados, rondas solapadas y revocación. Además SELECT del nuevo SQL sin escrituras contra piloto: `2 despachos / 0 documentos acreditados`; token falso `not_found`. **Sin despliegue**, PR draft; no E2E real.

## Avance MVP357 — reintentos automáticos privados sin duplicar WhatsApps (12/11/2026)

**[PR #800](https://github.com/ProtectorRudo/Cotironda/pull/800)** en desarrollo sobre [PR #799](https://github.com/ProtectorRudo/Cotironda/pull/799). Este avance soluciona un **bloqueo preventivo P2**: los pedidos que MVP356 deja `pending` por colisión no deben quedar esperando sin nuevo tick, y el selector no debe repetir siempre el primer proveedor bloqueado.

- [x] **Snapshot real de PILOTO, sin escrituras:** `pg_cron 1.6.4`, `pg_net 0.20.4`, Vault `0.3.1` disponibles; Edge `cotironda-piloto-ai-batch` activo. Había tres crons (cierre, recuperación documental y conciliación), ninguno invocaba batch. Vault tenía solo el nombre del secreto de recovery, **cero secretos nuevos MVP357**. El estado de trabajos IA era **4 `api_accepted`, 0 `pending`, 0 `uncertain`**. No había reintento real para demostrar en vivo.
- [x] Corregida **en rama** `public.cotironda_piloto_ia_next_batch_mvp314` para **saltear proveedores bloqueados por MVP356** y elegir otros aptos. Se conserva el resto de lógica desplegada, presupuesto/consentimientos/estados `pending` y cuotas por comprador.
- [x] Desarrollado programador SQL privado `ai_batch_retry_tick_mvp357`: `enabled=false` por defecto, lock transaccional, no más de una invocación por intervalo, ninguna llamada sin `pending` elegible. Cron de 5 minutos en archivo separado **NO ejecutado**.
- [x] Eliminado transporte de credenciales administrativas: DOS secretos app-scope en Vault/Edge exclusivos de batch; el Edge mantiene autenticación manual histórica y añade ruta cron independiente que rechaza `apikey`/Authorization. Petición HTTP debe ser exactamente vacía o `{}`. **No se provisionaron secretos ni se cambiaron valores de configuración del piloto**.
- [x] Auditoría ACL `pg_net`: anon/authenticated NOLOGIN, roles internos LOGIN con SELECT en cola. Por defecto `net` no figura en el Data API de Supabase, pero **falta verificar configuración del proyecto** antes de enviar encabezados. Credenciales scoped reducen el riesgo, no eliminan obligación de auditoría.
- [x] CI **de desarrollo**: prueba sintética PostgreSQL17 `pg17-mvp357-batch-retry` pasó, incluyendo supplier bloqueado vs libre, 0 secretos, doble tick, `uncertain/api_accepted`, cierre, bandera OFF y ROLLBACK. **CI final PR #800** en commit `b804e48f5d3f59dcc8ab44db076d494034c6a4ce`: **5/5 workflows generales SUCCESS** (Next.js, unidad general, PostgREST, aislamiento PG17, sitio) y **todos los 6 jobs del workflow unitario SUCCESS** (Node, PG17 MVP354, PG17 MVP356, PG17 MVP357 con net simulado/ROLLBACK, Deno seguimiento y Deno lote). Esto certifica el código en desarrollo, **NO** el cron ni WhatsApp real.
- [ ] **No publicado**: SQL, flags, Edge nuevo y cron NO instalados, 0 WhatsApps enviados en este avance. Se necesita `Publicalo` específico del piloto, con revisión de coexistencia de despacho legacy y permisos de esquema `net`.
- [ ] P0–P5 siguen abiertos. Todavía no hay una ronda con **dos documentos reales vinculados, vista por rubro y descarga autenticada al cierre**.

**Próxima acción única:** cerrar preflight de publicación segura (Data API `net` no expuesto, despachador legacy fuera de nuevas rondas, configuración de dos secretos app-scope, activación reversible), entonces bajo autorización `Publicalo en cotironda-piloto` publicar sin activar y ejecutar la ronda E2E 2/2. [Acta 525](https://github.com/ProtectorRudo/Cotironda/blob/feat/mvp357-batch-retry-cron-piloto-20261112/docs/525-mvp357-reintento-automatico-seguro-batch.md), [Issue #794](https://github.com/ProtectorRudo/Cotironda/issues/794).

## Avance MVP356 — prevenir nuevas ambigüedades de despacho (12/11/2026)

**Estado: PR técnico [#799](https://github.com/ProtectorRudo/Cotironda/pull/799) en desarrollo, SIN merge ni publicación.** Basado en #798. Al reexaminar Supabase PILOTO se confirmó que los dos archivos `ambiguous_round` recibidos históricamente tuvieron competidores al tiempo de la recepción: **uno con dos despachos IA Central, otro con IA Central + Whapi legado**. Una ronda actualmente preparada contiene 2 despachos aceptados y 0 documentos probados; no reasociar sus archivos históricos con el pedido actual por fecha.

Se propone bloqueo transaccional de ambos reclamos `cotironda_piloto_ia_claim_mvp222/mvp314` con un único advisory lock y helper privado: un mismo proveedor no recibe una segunda ronda `prepared` cuando otra está `leased/api_accepted/uncertain`, incluso si la otra invitación salió por Whapi anterior. Los demás proveedores continúan normalmente. **Solo piloto**: retener varios días un proveedor por cada solicitud no es aceptable para el negocio a escala.

**Bandera de seguridad:** instalación de MVP356 deja `ai_supplier_overlap_gate_mvp356.enabled=false`; no altera despachos hasta activación separada. Se agregó fixture PostgreSQL17 (dos compradores, dos proveedores, legacy, batch, estados inciertos, cierre, ROLLBACK), tests Node y CI. Los resultados deben comprobarse con SHA exacto del PR antes de marcar las casillas.

**Bloqueo nuevo fundamental:** existe el Edge privado `cotironda-piloto-ai-batch`, pero consulta real `cron.job` muestra que **ninguna tarea de cron llama a ese Edge**; están configuradas cierre, recuperación documental y conciliación IA. Si se activa el guard sin un reintento programado los envíos `pending` podrían quedarse detenidos indefinidamente. Tampoco se probó que el despachador legado use la misma exclusión: exigirlo deshabilitado en nuevas rondas o integrarlo a la guarda. **No publicar todavía**.

- [x] Evidencia de concurrencia histórica y versión instalada de ambas RPC de claim inspeccionadas.
- [x] Desarrollo de exclusión con bandera OFF en PR #799 y documentación [Acta 524](https://github.com/ProtectorRudo/Cotironda/blob/fix/mvp356-guard-despachos-solapados-piloto-20261112/docs/524-mvp356-despachos-sin-solapamientos-piloto.md).
- [x] CI del PR técnico #799 SHA `137b5ad98521e0f2661f389999c168df1531ae1e`: **5/5 workflows generales SUCCESS** y jobs específicos PG17 claims/PG17 documental/Deno seguimiento SUCCESS. No demuestra reintento programado ni archivo E2E del comprador.
- [ ] Reintento automático, idempotente y con secretos privados para trabajo `pending` (sin reenviar `uncertain`).
- [ ] Convivencia del despachador legado auditada y bandera habilitada SOLO con autorización de publicación de piloto.
- [ ] P0 Auth y política de originales, P1/P2 fuentes reales, P3 portal y P4/P5 cierre/E2E pendientes.

**Siguiente paso ÚNICO: implementar y verificar el reintento controlado de lote `ai-batch` para recuperar pendientes, con cron privado y sin duplicados.** Luego prueba 2 proveedores/2 fuentes reales, publicación autorizada y navegador. Jamás considerar cerrado P2 por pruebas sintéticas.

## Avance MVP355 — prueba fuerte antes de contar una respuesta (11/11/2026)

**[PR #798](https://github.com/ProtectorRudo/Cotironda/pull/798)**, apilado sobre [#797](https://github.com/ProtectorRudo/Cotironda/pull/797), es un cambio de SEGURIDAD Y CORRECCIÓN dentro del circuito documental, no un despliegue.

- [x] Auditoría del código real de `cotironda_piloto_reserve_media_mvp095`: puede **preasignar** `request_id` cuando hay una sola invitación prepared, pero esa asignación por fecha no prueba que el archivo corresponda a ese comprador. Detectado bloqueo de integridad.
- [x] RPC MVP354 reforzada en el PR #798: requiere **mismo mensaje de WhatsApp en `whapi_inbox` + vinculación `ai_supplier_links_mvp225` + archivo con SHA idéntico**; solo acepta asociación por cita del pedido o ronda comercial única probada. Rechaza conflictos sin resolver y compara las ventanas sobre `received_at`, no `reserved_at`.
- [x] PG17 de prueba sintética pasó con PDF/XLSX, duplicación de adjuntos, vínculos ausentes, hash falso, método semántico débil, ronda simultánea, token revocado/vencido y ROLLBACK, job del último SHA `8fce7625eae8c62c9a6f2d99cd98af4af617ebe5`. Deno del seguimiento y unidad general también PASS.
- [x] SELECT directo contra la base PILOTO con el nuevo SQL **sin instalación ni escrituras**: token inválido -> `not_found`; una ronda prepared vigente -> `2 despachados, 0 documentos acreditados`. No inventa fuentes ni mezcla documentos históricos.
- [ ] E2E real con respuestas de ambos proveedores y navegador; no se completó P2 ni P3.
- [ ] Respuestas de texto libre: guardadas cifradas en `whapi_inbox`, pero no aparecen aún en el contador documental de archivos ni se descargan como original.
- [ ] P0 acceso y revelación: Auth comprador 0, consentimientos de originales 0 y política de descargas OFF al último SELECT. **No activarla ni exponer originales de no ganadores**.
- [ ] Validar la URL real del seguimiento: `DESTINO_SEGUIMIENTO_PILOTO_MVP212` fija un alias que **no coincide exactamente** con los dominios actualmente devueltos por la API de Vercel. Esto no prueba rotura, pero exige smoke HTTP autenticado antes de anunciar el enlace estable.

**Siguiente paso operativo único:** verificar que el webhook enlaza automáticamente cada archivo recibido al pedido original mediante `cotironda_piloto_ia_link_supplier_mvp225` **aunque la interpretación de precios falle**, probando una respuesta por proveedor sin reenvío ni mensaje extra. Si no, corregir solo ese enlace, sin relajar el candado MVP355. Paralelamente sigue pendiente P0 Auth/consentimiento para el cierre. No crear ronda superpuesta ni activar publicación sin autorización.

**Estado:** PR en desarrollo; P0 [ ], P1 [ ], P2 [ ], P3 [ ], P4 [ ], P5 [ ]; no anunciar 100%. [Acta 523](https://github.com/ProtectorRudo/Cotironda/blob/fix/mvp355-receipt-source-provenance-20261111/docs/523-mvp355-procedencia-documentos-recepcion.md).

## Actualización de pruebas y bloqueo real (11/11/2026)

El [PR #797](https://github.com/ProtectorRudo/Cotironda/pull/797) ahora también incluye la actualización del manifiesto de seguridad MVP324 **sin cambiar su hash base**, tests de regresión y un fixture **PostgreSQL 17 con ROLLBACK** que cubre PDF/XLSX, duplicados, SHA/ruta forjada, varias rondas y token revocado. Unidad general, Deno Whapi, PostgREST y PG17 histórico pasan con commit `c8a937f614a701ea2eb46e366685668021da79ee`. Next.js del commit `c8a937f614a701ea2eb46e366685668021da79ee` finalizó verde. El test **PG17 específico ahora PASÓ** en commit `97bf726dea3add014b027c971156a79b0126390c`, job `pg17-mvp354-documental` ID `130900434755` (base sintética, ROLLBACK). La batería unitaria y controles existentes también PASS en el mismo commit; Next.js de SHA `97bf726...` finalizó exitoso. **Último SHA técnico `de8a9d31a56a776efe69ff2843cb529c89140305`: los siete workflows generales finalizaron SUCCESS, incluidos Next.js y unitarios; los dos jobs específicos `pg17-mvp354-documental` y `deno-mvp354-seguimiento` también SUCCESS**. No hay E2E real ni publicación. Esto NO acredita prueba E2E del piloto. Ninguna función nueva está instalada ni habilitada.

**Próxima comprobación concreta antes de seguir:** CI del SHA final (especialmente Next y SQL PG17 específico); test de correlación P2 y política comercial P0. No abrir nuevas ramas de parser ni crear ronda sobre prepared activa.

## Relevo de avance — 11/11/2026 (PR #797)

**Código efectivamente creado:** [PR #797 — MVP354 recepción documental sin IA](https://github.com/ProtectorRudo/Cotironda/pull/797). Incluye nuevo SQL RPC PRIVADO, DTO de ocho campos, tracking opt-in con flag apagado, HTML de contador documental y tests Node. Basado en PR técnico #793. El PR está en borrador, no fusionado ni publicado; NO cambió las Edge live, base, Whapi o producción. Compilaciones automáticas de Preview de GitHub/Vercel no prueban el circuito E2E.

**Ensayo SQL SOLO LECTURA:** token inexistente -> not_found; ronda preparada actual -> `2 despachados / 0 originales acreditados / 2 pendientes`. Esto evita inventar archivos recibidos y no altera datos. Faltan pruebas de DDL PG17 + autorización, regresión y 2 archivos reales; ninguna etapa P1–P5 está aprobada. Respuestas de texto puro aún requieren archivo inmutable propio.

**Siguiente acción única:** completar P0 de política de originales/contactos + auditoría de identidad/ACL y URL real del comprador. Después validar el RPC MVP354 en PostgreSQL17 con rollback y pruebas de ambigüedad/duplicados, implementar P1/P2 para archivos/textos y P3 en la ronda E2E. Ver [Acta 522](https://github.com/ProtectorRudo/Cotironda/blob/feat/mvp354-document-receipt-status-20261111/docs/522-mvp354-recepcion-documental-independiente.md).

## Próximo paso ÚNICO
**P0: hacer una auditoría de implementación y consentimiento de originales, SIN modificar producción ni activar E2E.** Hay que leer código actual, qué se desplegó realmente en Supabase/Vercel, las rutas del comprador, las descargas MVP178–207 y la relación entre ronda/invitación/inbox/Storage. Entregar una matriz con pruebas: existe en código / instalado en piloto / demostrado E2E. Resolver explícitamente si los originales de no ganadores se pueden descargar íntegros al cierre sin contradecir la norma de revelar contactos solo de los dos ganadores.

Si el usuario responde **«Luz verde»**, avanzar en rama, con tests, NO desplegar. **«Publicalo»** autoriza solo la versión y el entorno concretamente determinados tras controles. No enviar WhatsApps reales sin un acto de ejecución autorizado.

## Diagnóstico de corte, CON FUENTE, 11/11/2026
- GitHub repo: ProtectorRudo/Cotironda. Rama principal main todavía contiene un contrato temprano, no la implementación piloto completa. Este plan está en PR documental independiente; no confundir con merge/despliegue.
- Supabase piloto: ilggkalaafhtiysyzlmg.
- Rondas: 1 prepared aún activa, 1 draft vigente entre 2 drafts, 4 closed. Fecha de cierre prevista de prepared: 14/11/2026.
- Invitaciones a la ronda preparada: 2. Despachos aceptados: 2. Una respuesta de proveedor vinculada. Zero ofertas anónimas visibles; 1 offer_version histórica, distinta de las ofertas actuales. No hay outbox leased/uncertain.
- PRs #790, #791, #792, #793 en desarrollo y no integrados a main. Recuperación MVP351 documentó publicación solo a Supabase piloto, pero no consiguió convertir PDF ambiguo en oferta verificada. PR #792 última lectura contextual NO está publicado. PR #793 previene preflight que recomiende otra ronda pese a prepared vigente; solo controles read-only.
- Código existente de originales: documentos MVP190/201/207 confirman rutas y Auth preparados pero no activados integralmente; nunca anunciar descarga disponible antes de prueba.
- Issue histórico #750: correlación PDF ambiguo y falta E2E, no resolver alterando fechas o forzando asignaciones.

## Qué NO hacer al retomar
- NO enviar otra solicitud de prueba sobre la ronda prepared viva.
- NO anunciar «2 presupuestos disponibles» solo porque hay 2 envíos/una versión histórica.
- NO continuar con cuarta/quinta relectura de PDFs por inercia.
- NO desbloquear originales de no ganadores sin norma explícita de contacto, aviso y consentimiento.
- NO mezclar Supabase DEV con piloto, ni tokens de seguimiento con Auth comprador.
- NO fusionar PRs apilados ni desplegar por la sola existencia de CI exitoso.

## Formato del próximo relevo: completar antes de cerrar cada etapa

### Relevo — [fecha UTC + ART]
- **Etapa activa:** P0/P1/P2/P3/P4/P5/P6/P7.
- **Último resultado realmente comprobado:** [hecho y fuente: GitHub/SQL/CI/prueba navegador].
- **Criterio pendiente exacto:** [una frase verificable].
- **Próxima acción ÚNICA:** [comando/herramienta/archivo o componente a revisar; no promesa].
- **Versión vigente:** [branch, commit, PR, Supabase SQL/Edge, Vercel URL y entorno solo cuando sean comprobables].
- **Datos E2E:** [comprador, invitados, archivos guardados, asociados, visibles, descargables, todos como conteos, sin identificadores privados].
- **Pruebas pasaron/fallaron:** [nombres, links y SHA de la ejecución].
- **Riesgos y retroceso:** [invariantes, consentimiento, idempotencia, backups].
- **Publicación:** [no / sí, entorno y autorización explícita].
- **Issue #794:** [checklist actualizado con enlaces o queda pendiente].

**Nunca declarar éxito por leer este archivo.** Verificar estado live y evidencias actualizadas antes de afirmar qué funciona.
