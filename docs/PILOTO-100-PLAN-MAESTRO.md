# Cotironda — Plan maestro del piloto documental 100%

**Evaluación de reutilización (P0, solo desarrollo):** [ERPNext vs núcleo Cotironda](P0-ERPNext-vs-Cotironda-evaluacion.md). Decisión: conservar el núcleo existente y reusar el MODELO de trazabilidad RFQ/original de ERPNext; no instalar ERPNext ni importar código GPL. Esta evaluación NO completa P0 ni el piloto E2E: faltan permisos/consentimiento de originales y prueba real.

**Decisión de producto:** 11 de noviembre de 2026. **Estado de este documento:** planificación, no código desplegado. **Único tablero de tareas:** [Issue #794](https://github.com/ProtectorRudo/Cotironda/issues/794). **Estado diario y próxima acción:** [PILOTO-100-ESTADO.md](PILOTO-100-ESTADO.md).

> REGLA DE CONTINUIDAD: al comenzar cualquier conversación sobre Cotironda, abrir primero Issue #794, leer este contrato y el estado diario, inspeccionar código/PR y verificar datos de Supabase; continuar el primer paso NO aprobado. Nunca inferir del historial del chat que un deploy o una prueba externa fue ejecutada.

## Para quién existe Cotironda

El arquitecto y la constructora compran una solución para ahorrar tiempo y conseguir alternativas útiles de suministro. El valor no es vender un archivo PDF. Cotironda reúne solicitudes enviadas una vez, busca comercios pertinentes, recibe respuestas por WhatsApp, muestra qué llegó, conserva evidencia y permite decidir con tranquilidad.

- Proveedores: participación gratuita y sin comisiones; cotizan como siempre por WhatsApp.
- Compradores: abono proyectado ARS 10.000 por mes, prueba gratuita y precio/uso razonable sujetos a validación real. No anunciar resultados económicos aún no corroborados.
- Piloto inicial: 1 comprador y 2 proveedores previamente habilitados, formatos distintos, localidad de entrega explícita (única aclaración si falta). No pedir que compradores o proveedores editen, confirmen o reenvíen cotizaciones por defectos del parser.
- Cotironda no compra materiales ni garantiza ventas; contacto comercial y decisiones del comprador respetan la política vigente.

## CAMBIO DE MÉTODO — nuevo camino crítico

ANTES: archivo -> IA interpreta 100% -> conciliación económica -> asociación -> oferta visible -> cierre.

AHORA: archivo -> archivado inmutable -> asociación segura a ronda -> proyección pública mínima de recepción -> cierre -> autenticación y original autorizado. Análisis de productos, precios y ranking son **procesos posteriores independientes** y nunca bloquean el estado «recibido con asociación verificada».

### Estados separados (no mezclar)
1. **Mensaje ingresado:** webhook autenticado, deduplicado, participante reconocido.
2. **Original archivado:** bytes privados intactos, hash SHA-256/tamaño/tipo y manifiesto de origen; para texto, copia exacta inmutable.
3. **Asociado a ronda:** evidencia concreta de invitación y destinatario; el documento puede quedar temporalmente en revisión interna si hay dos solicitudes candidatas.
4. **Recepción visible:** únicamente al comprador autorizado de la ronda; etiqueta Proveedor A/B, rubro y fecha, sin identidad/contacto ni acceso al contenido previo al cierre. «Recibido» NO significa «precio verificado».
5. **Interpretado parcialmente:** artículos/importes extraídos con respaldo, separados de la existencia del original. Errores de IA no eliminan ni modifican el original.
6. **Económicamente comparable:** unidades/cantidades/IVA/flete/descuentos/condiciones corroborados, cobertura separada de precio y ofertas parciales visibles como tales.
7. **Ronda cerrada y descargable:** original legítimo para comprador autenticado, con autorización específica, registro de acceso y SHA comprobado al descargar.

**Nunca:** regenerar un PDF «idéntico» con IA generativa, inventar importes, borrar el original, mostrar monto como verificado cuando no lo está ni inferir vínculo al pedido por proximidad de fechas.

### Flujo arquitectónico sin reescribir el sistema
WhatsApp Whapi -> webhook existente -> inbox + Storage privado -> correlación de ronda (proveedor, mensaje citado/ID de pedido/invitación/despacho y evidencia temporal secundaria) -> registros de documentos asociados -> proyección de seguimiento de estado -> cierre existente -> API Auth+RLS+consentimiento+SHA -> descarga original. Los módulos IA/normalización/comparador consumen el archivo en paralelo o diferido y escriben exclusivamente proyecciones verificadas.

No crear segundo pipeline de ingestión ni otro backend de descargas. Reutilizar exactamente lo que exista y esté auditado. La «revisión operativa» para casos ambiguos no debe pedirle al proveedor reenvío ni permitir al operador escoger un destinatario sin evidencia.

## Decisión pendiente y bloqueo de seguridad para P4

El objetivo comercial es que, **al cierre**, el comprador pueda obtener los originales con identidad del proveedor. Sin embargo:
- Regla histórica: contactos directos al comprador solo de 2 ganadores, aunque las identidades de todos los invitados se revelan al cierre.
- Un original de proveedor puede incluir logo, teléfono, correo, CUIT, dirección, web, QR, datos bancarios y nombre comercial.
- Por tanto, descargar TODOS los originales con datos cambia materialmente la política de acceso/contactos.

**Resolver en P0** el alcance definitivo del documento completo de TODOS los participantes, y el consentimiento/aviso prospectivo incluido en el alta o invitación. Hasta entonces, deshabilitar la liberación de originales identificables de no ganadores; no sustituir consentimiento por una inferencia. No introducir nuevas confirmaciones en cada mensaje. Proteger siempre datos privados del comprador antes de las reglas de cierre.

**Compatibilidad de la vinculación (auditoría actualizada):** el webhook del piloto ya intenta `cotironda_piloto_ia_link_supplier_mvp225` después de verificar y archivar el binario; la prueba no depende de que la IA termine precios, pero sí del permiso `quote_link` (2 de 2 proveedores habilitados en el piloto al 11/11). Cuando el negocio primero avisa que enviará un archivo, la función `cotironda_piloto_ia_attach_supplier_media_mvp238` puede generar el método seguro `prior_supplier_preamble`; MVP355 ahora lo admite además de `quoted_whapi_id` y `single_active_round`. El enlace legado MVP151 trabaja sobre `whapi_outbox` y no constituye automáticamente evidencia de un despacho IA nuevo. **Falta prueba real de ambas respuestas y de la ruta de seguimiento completa.**

**CI FINAL MVP355 (11/11/2026):** el SHA técnico [`721ecc12d2a9a35e54d53b35f009d419b4cca3f6`](https://github.com/ProtectorRudo/Cotironda/pull/798) pasó **5/5 workflows generales**: Next.js, unidad general (incluye **PG17 documental** y **Deno seguimiento** como jobs separados), PostgREST, PG17 aislamiento y verificación sitio. Probados dos formatos sintéticos, SHA, links débiles/ausentes, vínculo de aviso previo, duplicados, rondas solapadas y revocación. Además SELECT del nuevo SQL sin escrituras contra piloto: `2 despachos / 0 documentos acreditados`; token falso `not_found`. **Sin despliegue**, PR draft; no E2E real.

## MVP364 — aviso de condiciones probado antes de aceptar originales (12/11/2026)

**[PR técnico #806](https://github.com/ProtectorRudo/Cotironda/pull/806)** sobre #805, DRAFT sin publicar, [Acta 532](https://github.com/ProtectorRudo/Cotironda/blob/feat/mvp364-proof-terms-delivered-20261112/docs/532-mvp364-aviso-terminos-proveedor-previo.md). **El código está en desarrollo; ninguna aceptación es real ni se habilitó la descarga**.

- [x] Se identificó que el hash de un mensaje WhatsApp **entrante** no acredita que previamente se enviaran los términos exactos. El `whapi_outbox` actual es de **rondas**, no de **altas**; no se lo reutiliza como evidencia falsa.
- [x] Se agregó **en la fuente SQL M362 todavía NO instalada** un ledger privado de avisos M364, vacío por defecto, con HMAC de envío aceptado por API, proveedor, chat, versión, SHA de condiciones, huella del mensaje y tiempo. `anon`, `authenticated` y `service_role` sin acceso directo.
- [x] Opt-in prospectivo obliga FK a **aviso de condiciones específico**, y la misma puerta de autorización privada cruza proveedor, chat, versión, SHA, política activa y tiempos: aviso registrado antes de aceptación y ronda. No relaja consentimiento por ronda legado, cierre ni revocaciones.
- [x] Casos negativos añadidos a PG17 de aviso con SHA de términos falso, chat cruzado, notificación posterior a la aceptación o anterior a activación; tests Node y job específico en CI. **No marcar batería verde hasta comprobar resultados del SHA final**.
- [ ] Persistir comprobante **real** del proveedor WhatsApp mediante un emisor autenticado e idempotente, sin duplicación ante envíos inciertos; verificar cuerpo/versión entregados. Hasta entonces una fila de aviso **por sí sola** no acredita entrega real.
- [ ] Revisión humana de la aceptación literal (texto cifrado), operador Auth + MFA AAL2 habilitado, autorización operativa atómica; resolver reaceptación por episodios tras revocación.
- [ ] Términos legales/comerciales aprobados; Auth comprador Phone/OTP; dos originales PDF/XLSX vinculados con evidencia fuerte; vista navegador, cierre, descargas y REST `net` externos. **P0–P5 ABIERTOS**.

**SIGUIENTE ACCIÓN EXCLUSIVA:** conectar emisión autenticada del aviso versionado + constancia WhatsApp y revisión de respuesta por operador MFA, sin publicar a usuarios ni activar política. No crear ronda superpuesta. Publicar solamente tras autorización específica `Publicalo en cotironda-piloto`, con términos aprobados y preflight seguro.

## MVP363 — preflight real del alta explícita y auditoría del operador (12/11/2026)

**[PR técnico #805](https://github.com/ProtectorRudo/Cotironda/pull/805)** sobre #804, borrador, **sin despliegue**. [Acta 531](https://github.com/ProtectorRudo/Cotironda/blob/feat/mvp363-preflight-alta-explicita-20261112/docs/531-mvp363-preflight-aceptacion-real-operador.md). No crear rondas superpuestas ni enviar WhatsApps.

- [x] **Verificación REAL solo SELECT** en Supabase `cotironda-piloto`: 0 usuarios Auth, 0 operadores habilitados, 0 consentimientos originales antiguos vigentes, política originales OFF, M362 no instalado, operador MFA M267 instalado y **1 ronda prepared vigente**. Resultado `NO_APTO_PARA_ALTA_REAL`.
- [x] Consulta del preflight versionada en `supabase/tests/preflight/mvp363-originales-alta-readiness-readonly.sql`: solo conteos y estados, sin PII ni mutaciones; el resultado positivo únicamente indica precondiciones parciales, **NUNCA consentimiento**. Pruebas Node del contrato añadidas; **CI del PR #805 pendiente de certificar**.
- [x] Revisada reutilización de operador `operator_session_mvp267()` con sesión Auth real y MFA AAL2, sin crear nuevo login.
- [ ] **Riesgo P0 detectado:** MVP362 prueba mensaje de aceptación entrante pero no acredita que el proveedor recibió previamente **esa versión exacta** del texto de condiciones. Requiere prueba autenticada del mensaje saliente, referencia de respuesta y revisión del texto descifrado por operador con MFA. Un hash no prueba intención.
- [ ] **Reaceptación:** el PK M362 admite un opt-in por proveedor/versión; tras revocar, una reaceptación de igual versión no cabe. Definir historial inmutable por episodio, con nuevos tests de revocación, antes de habilitar.
- [ ] Aprobación comercial/legal del texto (incluye originales de no ganadores e identificadores), usuario operador MFA real, alta prospectiva auditada y comprador Auth Phone/OTP, dos fuentes con vínculo fuerte, portal y cierre E2E, control externo `net`. **P0–P5 continúan ABIERTOS**.

**SIGUIENTE ACCIÓN ÚNICA:** desarrollar vínculo verificable *condiciones enviadas → aceptación expresa recibida* y revisión segura por operador MFA, dejando todas las puertas apagadas. No habilitar originales por participación general ni usar la ronda ya preparada como autorización retroactiva. Luego, autorización específica «Publicalo en cotironda-piloto» para instalar y probar, tras aprobar términos y preflight.

## MVP362 — consentimiento de originales UNA VEZ al alta, sin autorizaciones retroactivas (12/11/2026)

**[PR técnico #804](https://github.com/ProtectorRudo/Cotironda/pull/804)** sobre #803, **SOLO DESARROLLO, sin despliegue**, [Acta 530](https://github.com/ProtectorRudo/Cotironda/blob/feat/mvp362-consentimiento-originales-una-vez-20261112/docs/530-mvp362-consentimiento-originales-una-vez.md). Términos disponibles como [BORRADOR](https://github.com/ProtectorRudo/Cotironda/blob/feat/mvp362-consentimiento-originales-una-vez-20261112/docs/politica-originales-alta-v1-borrador.md), NO aprobados ni presentados a proveedores.

- [x] **Regla de negocio**: una aceptación **expresa, verificable y versionada UNA vez** durante la incorporación del proveedor puede cubrir todos sus originales enviados en rondas FUTURAS, incluidos presupuestos no adjudicados que pueden tener contacto/datos bancarios. **No** implica revelar datos del arquitecto durante la ronda ni contactos de terceros. Sin consentimiento explícito, ninguna oferta identificable se expone. No pedir confirmación por cada presupuesto.
- [x] **Diferencia crítica detectada**: MVP161 exigía aceptación DESPUÉS de crear cada ronda; el consentimiento al alta habría sido rechazado. Se adaptó el validador a dos regímenes exactos: `cotironda-originales-v1` (por ronda, aceptado después de creación) o `cotironda-originales-alta-v1` (aceptación previa a creación, y posterior a activación de política). No se acepta opt-in general ni aceptación posterior de una ronda antigua.
- [x] **SQL privado**: tablas de texto/version/SHA/activación **sin fila activa** y `enabled=false` por defecto; pruebas por mensaje WhatsApp, proveedor, chat, SHA de aceptación, revisión operadora, ledger de revocaciones y RLS/ACL. SHA de términos se recalcula desde el texto al autorizar, evitando cambios silenciosos. Sin insertar permisos en el piloto ni RPC pública de alta; la aceptación expresa deberá ser examinada y auditada.
- [x] **Una puerta autorizante**: helper privado `original_effective_consent_mvp362` verifica regla antigua por ronda u onboarding futuro, y alimenta **tanto** preflight M178 **como** catálogo M360, conservando Auth de comprador, fuente WhatsApp/SHA, archivo inmutable, cierre, revocación y auditoría HTTP. Revocación general o retiro específico de ronda bloquea descargas. No se habilitó el seguimiento público como identidad.
- [x] **CI FINAL VERIFICADA PR #804, SHA `89ebba03eb504161f2c9049dd7618bb344f0ff38`: 5/5 workflows generales SUCCESS** (Next.js, Node, PostgREST Auth, PG17 aislamiento empresarial, sitio) + job `pg17-mvp362-terms-onboarding` SUCCESS con ROLLBACK. Pruebas: autorización antigua por ronda, incorporación válida sólo tras activar términos, no retroactividad por registro/aceptación tardía, SHA de condiciones/texto aceptado, revocación global/específica y ACL; catálogo PDF/XLSX sin V9. Otras tareas de M354–M361 condicionadas a sus propias ramas fueron SKIPPED en este SHA (cuentan con evidencias previas), no decir que corrieron aquí. **CI sintética no acredita E2E WhatsApp ni autorización real.**
- [ ] **Revisión comercial/legal y evidencia del alta REAL**: las dos empresas proveedoras del piloto NO aceptaron estas condiciones. Consentimiento general de participación NO basta, y la IA no puede afirmar «aceptó» por un mensaje cualquiera. El registro exige la comprobación del contenido explícito de aceptación por operador habilitado; falta integrar mecanismo auditado de revisión del mensaje cifrado/identidad MFA, sin enviar solicitudes por presupuesto.
- [ ] **Estado de PILOTO sin mutaciones**: política MVP178 OFF, `original_share_consents_mvp178` 0, comprador Auth 0, ronda preparada vigente 1. Nuevas tablas M362/funciones/flags NO instaladas, ninguna descarga abierta.
- [ ] **P0–P5 siguen abiertos**: configuración Phone/SMS y usuario Auth real, dos proveedores con consentimiento prospectivo aprobado, dos archivos con prueba de ronda segura, navegador, cierre y descarga autenticada; antes de cron verificar externamente Data API `net`.

**SIGUIENTE PASO ÚNICO:** revisar CI final #804; preparar la aceptación explícita UNA VEZ en el alta mediante mecanismo auditado (versión exacta y contenido, revisión de operador MFA, revocación y texto legal/comercial aprobado). Solo después, bajo «Publicalo» para el PILOTO, instalar SQL en orden seguro con gates OFF, y probar el circuito 1 comprador/2 proveedores/2 originales sin ronda superpuesta. No se mandan WhatsApps ni se modifica producción con esta autorización.

## MVP361 — alta protegida del comprador desde WhatsApp, sin SMS ni cuentas nuevas todavía (12/11/2026)

**[PR #803](https://github.com/ProtectorRudo/Cotironda/pull/803) solo DESARROLLO**, apilado sobre #802; [Acta 529](https://github.com/ProtectorRudo/Cotironda/blob/feat/mvp361-bootstrap-buyer-auth-piloto-20261112/docs/529-mvp361-bootstrap-auth-comprador.md). Ni Supabase Auth ni WhatsApp fueron modificados.

- [x] **Auditoría real P0 por SELECT sin PII**: ya hay exactamente **1 comprador** con canal `participant_channels_mvp109` vinculado, prueba de mensaje WhatsApp auténtico `whapi_inbox`, contacto SHA único y pedido existente. Hay **2 proveedores** habilitados para participar, pero **0 usuarios Auth, 0 consentimientos de originales y política de originales OFF**. **1 ronda `prepared` vigente: NO crear otra**.
- [x] **Nuevo preflight versionado `mvp361-buyer-auth-readiness-readonly.sql` ejecutado contra Supabase real**: 9 controles, retornan solo conteos/estados, nunca teléfonos, HMAC o documentos. Resultado: `01=WHAPI_PROBADO_1`, `02=SIN_USUARIO_AUTH`, `03=DOS_O_MAS_ACTIVOS`, `04=SIN_CONSENTIMIENTO_ORIGINALES`, `05=OFF`, `06=NO_DUPLICAR_RONDA`, `07=NO_INSTALADO`, `08=NO_VERIFICABLE_POR_SQL` (proveedor SMS/CAPTCHA), `09=NO_VERIFICADO_EXTERNAMENTE` (Data API net). Es un GO parcial de identidad, NO permiso de descarga.
- [x] **Código MVP361 en rama**: RPC `cotironda_piloto_buyer_bootstrap_allowed_mvp361(contact_sha256)`, accesible exclusivamente a `service_role`, prueba pertenencia WhatsApp/inbox/consentimiento de participación/contacto único y rechaza un Auth preexistente. Operador tiene `dry-run` (sin red), `--check` (solo lectura), `--apply` bloqueado sin aprobación operativa separada. En caso autorizado crearía Auth con `phone_confirm:false`, de modo que **nunca se suplanta la verificación OTP del propio arquitecto**.
- [x] **CI FINAL PR #803 verificada** sobre commit `d44d4f818211d991a4021f865ea7575f0fd2ff24`: **5/5 workflows generales SUCCESS** (Next.js, tests unitarios, PostgREST, PG17 aislamiento y sitio); además **pg17-mvp361-buyer-auth-bootstrap SUCCESS** con ROLLBACK y suite Node SUCCESS. Negativos: host/clave falsos, comprador revocado, identidad duplicada entre empresas, mensaje sin prueba, Auth previo, sin ronda y timeout incierto. Los jobs específicos de MVP354–MVP360 que dependen de otras ramas fueron SKIPPED en este SHA (evidencia en sus PRs). **Ningún usuario ni SMS real fue creado.**
- [ ] **Alta Auth real no hecha**: verificación Phone/SMS provider, rate-limit, CAPTCHA, costos y OTP real sin alta abierta `shouldCreateUser:false`. No crear usuario antes de `Publicalo` específica de piloto.
- [ ] **Consentimiento prospectivo de originales**: la adhesión comercial general de proveedores NO habilita por sí sola exhibir PDFs identificables. Diseñar/versionar condiciones de incorporación que se acepten una sola vez y rijan futuras rondas, con revocación; **no inventar aceptación retroactiva**. El backend MVP178 requiere por ronda prueba previa actualmente y deberá reconciliarse antes de activar descargas sin fricción.
- [ ] Control externo `net` mediante REST y entrega E2E P0–P5 siguen pendientes.

**Próxima acción ÚNICA**: terminar CI de MVP361, preparar checklist de puesta en marcha Auth Phone+SMS y política de consentimiento prospectivo de originales para un único proveedor, y solo con aprobación publicar en `cotironda-piloto` sin enviar mensajes hasta smoke. Seguidamente comprobar ingreso comprador con OTP, dos respuestas PDF/Excel con SHA vinculado, seguimiento por rubro y descarga en navegador tras cierre. No afirmar P0 cerrado por tests sintéticos.

## MVP360 — originales verificables sin bloquearse por parser económico (12/11/2026)

**[PR técnico #802](https://github.com/ProtectorRudo/Cotironda/pull/802)**, basado en #801, **SOLO DESARROLLO, sin publicación**. [Acta 528](https://github.com/ProtectorRudo/Cotironda/blob/feat/mvp360-originales-sin-gate-ia-economica-20261112/docs/528-mvp360-originales-sin-interpretacion-economica.md).

**Nuevo bloqueo real encontrado con `pg_get_functiondef` en PILOTO:** `cotironda_piloto_originals_private_mvp192` todavía exigía filas en `supplier_media_quotes_mvp098` **y** `supplier_evidence_mvp138` con `verifier_version=9,state='verified'`. Un PDF original con fuente verdadera pero con lectura comercial imperfecta no se podía descargar, **contradiciendo el camino crítico P0 de originales independientes del parser**.

- [x] Código MVP360 preparado sobre la función REAL desplegada: cambia la fuente del catálogo a `media_archive_mvp095` + `ai_supplier_links_mvp225` + `whapi_inbox`, con SHA, message_hmac, chat, mismo proveedor y ronda, y método fuerte `quoted_whapi_id` / `single_active_round` / `prior_supplier_preamble`. Rechaza `semantic_unique_mvp291`, rondas IA/legacy solapadas, archivo reemplazado/corregido y permisos insuficientes.
- [x] Se preservan `auth.users` + `auth.sessions`, dueño comprador, cierre, política prospectiva MVP178, consentimiento revocable de cada proveedor, nombres opacos y proyección únicamente por HTTP autorizado con SHA/auditoría MVP190/201. **NO se abren originales durante la ronda ni a personas sin consentimiento**.
- [x] Test específico PostgreSQL17 sintético de ejecución completa **APROBADO en SHA `53dcac0c3cc3b064bb810c2849ca00967da50030`**: el fixture NO CREA tablas de lectura económica V9 y prueba **PDF y Excel**, buyer/sesión correctos, consentimiento vigente, fuente no ambigua, SHA/MIME/ruta correctos. Bloquea usuario ajeno, fuente ambigua, cambio de hash, MIME ejecutable, ruta adulterada, superposición, reemplazo, revocación y ronda abierta. Todo con ROLLBACK; no Whapi real. **CI FINAL 5/5 workflows generales SUCCESS en ese mismo SHA**, incluidos Node, PostgREST, sitio, PG17 aislamiento y Next.js; el job específico `pg17-mvp360-originales-sin-parser` SUCCESS. Los demás jobs de controles M354–M358 eran condicionales a sus propias ramas y NO se ejecutaron sobre #802: conservan la evidencia de sus respectivos PR previos. Ningún E2E piloto aprobado.
- [x] Auditoría piloto SQL SELECT: `auth.users=0`, consentimientos originales activos = **0**, política original habilitada = **0**, asociaciones por métodos fuertes = **0**, un único vínculo `semantic_unique_mvp291` NO aceptable, una ronda `prepared` vigente. También `originals_private_mvp192` solo concede EXECUTE a `service_role`, no a `anon/authenticated`. **Nada fue modificado en el piloto**.
- [ ] No se habilita P0/P4 todavía: faltan usuario comprador y SMS OTP en Auth, consentimiento prospectivo de cada proveedor para ronda NUEVA, vínculo seguro de dos originales, permisos multiempresa, prueba en navegador/HTTP y cierre. El control de exposición REST `net` del MVP359 también queda **[ ] pendiente**, no suponerlo verde.
- [ ] **P0–P5 continúan abiertos**. Una función con test sintético no equivale a una descarga real del comprador.

**Siguiente acción exacta:** revisar CI final del PR #802 y ejecutar, en cuanto exista autorización de publicación del piloto y políticas/identidad preparadas, una ronda NO superpuesta con 1 comprador y 2 proveedores; acreditar ambos documentos PDF/Excel, ver seguimiento real y cerrar con descarga auténtica conforme a consentimiento. Antes de instalar cron, cerrar el test HTTP real de `net`. No pedir al comercio rehacer el presupuesto por fallas de IA.

## MVP359 — preflight comprobado antes de publicar (12/11/2026)

**Evidencia adicional:** rol `authenticator` sin override `pgrst.db_schemas` en `pg_roles.rolconfig` (consultado SOLO LECTURA); esto NO sustituye verificar el panel ni el HTTP REST real. La CI prueba la lógica, no la configuración del proyecto.



**[Acta 527](https://github.com/ProtectorRudo/Cotironda/blob/fix/mvp358-legacy-dispatch-guard-piloto-20261112/docs/527-mvp359-preflight-rest-y-huellas-sql.md), código de pruebas en [PR #801](https://github.com/ProtectorRudo/Cotironda/pull/801).** Se evitó abrir otro PR apilado: los nuevos controles están dentro de la rama técnica actual, **sin despliegue ni nuevos WhatsApps**.

- [x] Preflight SQL **ejecutado realmente** contra `cotironda-piloto` SOLO LECTURA el 12/11/2026: **4/4 huellas SHA256 de las funciones `claim_whapi_v1`, `ia_claim_mvp222`, `ia_claim_mvp314`, `ia_next_batch_mvp314` coinciden** con el código de Supabase capturado. Resultado: **0 pendientes / 0 inciertos** en ambas colas, **1 ronda prepared vigente** (NO crear otra), **0 cron batch / 0 secretos Vault MVP357**, **0 usuarios Auth**.
- [x] SQL versionado de preflight `supabase/tests/preflight/mvp359-piloto-solo-lectura.sql`; no ejecuta ninguna escritura, no lee documentos ni secretos. Cambios futuros de función => `BLOQUEADO` antes del despliegue.
- [x] Verificador REST `scripts/piloto/verificar-exposicion-net-mvp359.mjs` desarrollado y **CI verificada sobre commit `4549ca0c63853c69ae2f7e3da35542d7d16856e7`: 5/5 workflows generales SUCCESS y 7/7 jobs unitarios/específicos SUCCESS**: `GET` de **tabla inexistente** usando clave pública, `public` debe devolver 404/PGRST205 y `net` **406/PGRST106**. Si `net` expuesto, falla; si no hay conexión o autenticación, queda **INCONCLUSIVE** y bloquea publicación. Tests con HTTP simulado; no hay llave administrativa ni lectura de la cola.
- [ ] **Control REST REAL `net`: NO VERIFICADO.** La sesión SQL y los metadatos del conector no muestran el listado «Exposed schemas». Desde este entorno el host externo no resuelve DNS; los grants SQL de `net` no son evidencia de exposición. Necesitamos ejecutar el probe en entorno con red y clave pública (sin publicar) o constancia de <https://supabase.com/dashboard/project/ilggkalaafhtiysyzlmg/integrations/data_api/settings>. Hasta entonces NO instalar cron ni activar gates.
- [ ] **Bloqueo P0/P4 independiente:** `auth.users=0`; descargas identificables no se pueden habilitar hasta autenticación/empresa y condiciones aceptadas. La CI técnica no lo resuelve.
- [ ] **P1/P2/P3/P5**: 2 presupuestos originales reales asociados a ronda correcta, seguimiento en navegador, fin y originales descargables conforme a la autorización siguen sin E2E.

**Próxima acción EXACTA (continuidad entre chats):** obtener evidencia HTTP REST **PGRST106 para `net`** o confirmar esquema no expuesto mediante ajustes del piloto; volver a ejecutar las cuatro huellas SQL justo antes de publicar. Si es seguro, preparar instalación SQL/Edge/cron en `cotironda-piloto` con banderas OFF y rollback, previa orden «Publicalo». Después autenticar comprador y probar una sola ronda completa de 2 proveedores; no tratar `prepared` como oferta ni reatribuir archivos históricos ambiguos.

## MVP358 — despachador heredado ya no puede esquivar la exclusión (12/11/2026)

**[PR #801](https://github.com/ProtectorRudo/Cotironda/pull/801) sobre #800, SOLO DESARROLLO.** Se consultó la RPC `cotironda_piloto_claim_whapi_v1` instalada: todavía reserva `whapi_outbox.pending` sin el lock transaccional común ni el filtro MVP356. El guard anterior excluía comparaciones **dentro de la misma ronda**; por ello era posible enviar a un mismo proveedor dos veces el mismo pedido desde canales distintos. En el piloto real el outbox contiene **5 accepted, 1 cancelled, 0 pending**, por lo que no se enviaron mensajes en esta revisión.

- [x] SQL de corrección en PR #801: agrega `pg_advisory_xact_lock(7835634)` y `NOT hay_despacho_solapado_mvp356(...)` a claim legacy; el helper comprueba también un envío `leased/api_accepted/uncertain` del **mismo** `request_id` por la otra vía. Respeta el flag MVP356 **OFF** y no toca estado histórico.
- [x] Nuevo test PostgreSQL17: dos compradores, dos proveedores, choque entre rondas y dentro de la misma ronda, legado/IA, proveedor independiente, cierre que libera y ROLLBACK. **CI final de PR #801 VERDE sobre commit `918fe62a324a3e57ea6bb6e54d513f186567bb99`: 5/5 workflows generales SUCCESS (Next.js, Node, PostgREST, PG17 aislamiento y sitio), y 7/7 jobs unitarios/específicos SUCCESS (incluye PG17 de legado/IA, lote, documental y Deno).** Fixture SQL usa ROLLBACK, no se enviaron WhatsApps ni se instaló el nuevo SQL. No equivale a E2E real.
- [x] Revisión Data API de solo lectura: `anon` y `authenticated` tienen USAGE en esquema `net` y SELECT sobre `net.http_request_queue`. Eso **NO demuestra exposición por REST**; no se obtuvo el listado real de «Exposed schemas», de modo que permanece **[ ] control bloqueante**. `current_setting('pgrst.db_schemas')` no permitió verificarlo. No revocar permisos de `pg_net` a ciegas.
- [ ] Aceptación E2E y publicación en piloto: PR apilado sin integrar, SQL/Edge/cron/flags no activados, cero envío real, dos originales correctamente asociados y seguimiento del comprador pendientes. **P0–P5 siguen abiertos.**

**Próximo paso único:** comprobar CI final del PR #801 y, sin publicar, verificar la configuración exacta de esquemas expuestos del piloto mediante Data API o panel autorizado. Tras ese control y verificación de SQL desplegado, preparar publicación **solo al recibir «Publicalo en cotironda-piloto»** y entonces ejecutar una prueba de una ronda, dos proveedores, dos originales acreditados y navegador. No crear rondas simultáneas. [Acta 526](https://github.com/ProtectorRudo/Cotironda/blob/fix/mvp358-legacy-dispatch-guard-piloto-20261112/docs/526-mvp358-legacy-outbound-anti-duplicacion.md).

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
- [x] CI técnico del SHA `137b5ad98521e0f2661f389999c168df1531ae1e`: **5/5 workflows generales SUCCESS**, incluyendo build Next.js, unidad general, PG17 aislamiento, PostgREST, sitio; además **pg17-mvp356-claim-anti-solapamientos, pg17-mvp354-documental y deno-mvp354-seguimiento SUCCESS** en el workflow unitario. DB sintética, no instalación en Supabase.
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

## Controles del avance MVP354 (11/11/2026)

**Última CI del PR técnico #797:** commit `de8a9d31a56a776efe69ff2843cb529c89140305`, **7/7 workflows generales SUCCESS** y jobs específicos `pg17-mvp354-documental` y `deno-mvp354-seguimiento` **SUCCESS**. Todo en desarrollo; no prueba externa ni despliegue del nuevo circuito.

- [x] Código de la RPC documental y DTO de 8 campos seguros en [PR #797](https://github.com/ProtectorRudo/Cotironda/pull/797) (desarrollo, **NO integrado**).
- [x] Tracking con opt-in **OFF por defecto**, sin reemplazar contador económico ni exponer contenido.
- [x] SQL de solo lectura ensayado en piloto: token inválido `not_found`; ronda preparada 2/0.
- [x] CI unitaria general, Deno Whapi, PostgREST y PostgreSQL17 de aislamiento histórico **verdes** sobre commit `c8a937f614a701ea2eb46e366685668021da79ee`.
- [x] **Build Next.js del SHA `c8a937f614a701ea2eb46e366685668021da79ee` completado con éxito**; mismo SHA con unidad/PG17 histórico/PostgREST/Deno verdes.
- [x] **PG17 ESPECÍFICO de DDL MVP354 aprobado** en SHA `97bf726dea3add014b027c971156a79b0126390c`: job `pg17-mvp354-documental` ID `130900434755`, PASS. Fixture con PDF, Excel, duplicados, solapamiento de rondas, rutas forjadas, revocación/vencimiento de token y ROLLBACK completo; además controles PG17 existentes y unidad general PASS.
- [ ] Asociación de 2 archivos reales e ingreso de texto libre, recuperación por SHA de bytes (P1/P2) y navegador del comprador real (P3).
- [ ] P0 identidad de comprador, reglas de originales de no ganadores y ruta efectiva autorizada.

**Semáforo:** P0 [ ], P1 [ ], P2 [ ], P3 [ ], P4 [ ], P5 [ ]. Es avance real de código pero no de piloto en ejecución. No aplicar SQL ni activar flag sin «Publicalo».

## Avance técnico verificable — PR #797 / MVP354 (11/11/2026)

**Desarrollo propuesto, no publicado ni integrado:** [PR #797](https://github.com/ProtectorRudo/Cotironda/pull/797), apilado sobre el técnico #793. Se implementó la primera vía de **recepción documental independiente de IA económica**: RPC de SOLO LECTURA que exige comprador con token válido, invitación y despacho Whapi aceptado, proveedor coincidente con HMAC, original almacenado con SHA y ausencia de otra ronda aceptada del mismo proveedor en la misma ventana; cuenta una vez por proveedor. Su respuesta pública queda limitada a 8 campos de conteos y booleanos siempre `false` para revelar precios/contactos/descargas. Edge integra la llamada opcional bajo flag **OFF por defecto**, sin modificar los estados o números económicos previos; HTML distingue claramente archivo recibido de precio verificado.

**Validación hasta ahora:** consulta SELECT del cuerpo SQL sobre piloto (sin instalar RPC) con token inexistente -> `not_found`; para prepared vigente -> 2 despachados, 0 archivos acreditados, 2 pendientes. Unidad general y ensayo de ACL/DDL PostgreSQL17 sintético **ya aprobados**; siguen pendientes pruebas integradas reales en piloto y navegador del comprador. Por lo tanto **P1, P2 y P3 NO terminadas**. Este camino solo cubre adjuntos archivados; las respuestas de texto sin archivo necesitarán fuente propia inmutable. No confundir 0 archivos con 0 mensajes de proveedor ni reconocer documentos de otras rondas por fecha.

**Pendientes para activación:** PostgreSQL17 con rollback de RPC + prueba de roles y revocación; verificación contra dos archivos realmente recibidos, duplicados, otra empresa, ronda solapada y comprador autenticado; confirmar URL de portal; política de originales/contactos P0. No habilitar el flag ni publicar Edge hasta superar estas pruebas y recibir «Publicalo en piloto».

## Hoja de ruta verificable

| Etapa | Trabajo necesario | Prueba de aceptación | Avance inicial |
| --- | --- | --- | --- |
| **P0** | Auditar estado desplegado, rutas y permisos, requisitos y política de contacto/originales | Matriz código-deploy-pruebas y regla de revelación explícita, no contradictoria | Pendiente |
| **P1** | Archivo inmutable para PDF/Excel/Word/imagen/texto | Recuperación byte a byte + SHA, reintentos, deduplicación y error seguro | Pendiente |
| **P2** | Asociación inequívoca a ronda y control de rondas superpuestas | Dos presupuestos reales correctamente ligados; ambiguos privados, empresa cruzada rechazada | Pendiente |
| **P3** | Mostrar recepción por rubro sin ranking obligatorio | 2/2 documentos visibles en el portal real aunque IA falle; ningún contacto filtrado | Pendiente |
| **P4** | Cierre y descarga original autenticada, autorizada y auditada | Usuario correcto descarga, ajeno/no vencida/revocado falla; SHA intacto y sesión comprobada | Pendiente |
| **P5** | Prueba E2E de un comprador, dos proveedores y formatos diferentes | WhatsApp -> dos respuestas -> navegador -> cierre -> dos descargas en una misma ronda | Pendiente |
| **P6** | Comparador inteligente progresivo y opcional | Cobertura vs precio, rubros, gastos y flete/IVA explícitos, sin falsas clasificaciones | Pendiente, NO condiciona P5 |
| **P7** | Estabilidad y validación comercial | Varias rondas repetibles, monitoreo, seguridad, gastos, recuperación y comprador dispuesto a pagar | Pendiente |

**Primera meta E2E: P0–P5.** **Piloto comercial al 100%:** P0–P5 + controles de operación/seguridad y repetición de P7; P6 puede desarrollarse sin bloquear recepción. No significa que todos los modelos de presupuesto futuros sean legibles por IA.

### P0: tareas técnicas
- [ ] Reconstruir arquitectura desde archivos actuales y conexiones live, no desde memoria/README obsoleto.
- [ ] Verificar qué versión exacta está en Supabase Edge, SQL, cron, Storage y Vercel; comparar con GitHub PRs #790–#793 y la rama main.
- [ ] Identificar tabla/estado de archivo recibido, recibido validado, remitente, invitación, ronda, revisión y descarga. Mantener nombres reales en la matriz.
- [ ] Documentar política final original/identidad/contactos vs 2 ganadores con consentimiento, revocación, retención y uso de WhatsApp; ninguna exposición sin validarla.
- [ ] Establecer tests, presupuesto IA/Whapi, cuotas, y un solo recorrido a desarrollar primero.
- [ ] Actualizar Issue #794: marcar P0 solo cuando todo lo anterior tenga evidencia.

### P1–P2: tareas técnicas
- [ ] Duplicación de mensajes: mismo ID Whapi reintentado no duplica documento ni envío.
- [ ] MIME, tamaño, hash, bytes, PDF multipágina, XLSX con varias hojas, JPG, TXT y errores de descarga.
- [ ] Asociar fuente por proveedor/invitación verdadera/ID conversación, no solo por fecha o cercanía de cantidades.
- [ ] Dos rondas candidatas: cola/revisión interna segura; proveedor nunca debe ser obligado a reenviar.
- [ ] Al menos dos proveedores y dos empresas sintéticas: bloqueo de acceso cruzado.
- [ ] Documentar verificación real de dos documentos con trazas que no expongan datos comerciales.

### P3: tareas técnicas
- [ ] Crear proyección segura de estado por rubro: invitados, enviados, respondidos, documentos asociados, pendientes.
- [ ] «Documento recibido» no debe depender de line items, total ni clasificación de IVA/flete.
- [ ] Si archivo ambiguo/no asociado, NO mostrarlo como presupuesto de una ronda equivocada; ofrecer estado genérico sin identidad donde sea seguro.
- [ ] Reusar el enlace de seguimiento existente, con protección contra difusión de su token y datos identificatorios.
- [ ] Probar navegador y falsos positivos; nada de imágenes anonimizadas no verificadas.

### P4: tareas técnicas
- [ ] Reutilizar Auth y originales MVP178/190/191/192/200/201/207; verificar qué está compilado/publicado y qué está apagado.
- [ ] Auth comprador PILOTO real; empresa/rol/propiedad de ronda y sesión fresca; RLS y autorización de proveedor versionada.
- [ ] Prohibición antes de cierre; original SHA, MIME, tamaño, nombre opaco y Cache-Control no-store.
- [ ] Auditoría de lectura, revocación posterior, rate limits y error de Storage.
- [ ] Archivo íntegro del proveedor correcto, no nueva versión sintetizada ni URL de Storage pública.
- [ ] Registrar explícitamente contactos permitidos según decisión P0, sin adelantarlos por accidente.

### P5–P7: prueba y salida comercial
- [ ] E2E controlado con participantes consentidos, sin rondas superpuestas.
- [ ] Comprobar una sola solicitud por WhatsApp a cada negocio y respuesta en dos formatos.
- [ ] Comprobar que el comprador ve inmediatamente «recibido» tras asociación verdadera; sin intervención técnica.
- [ ] Al cierre, verificar bloqueo de descarga temprano, accesos a originales finales y auditoría.
- [ ] Casos extremos: respuesta fuera de plazo, archivo inválido, falta de zona, presupuesto parcial, doble webhook, proveedor equivocado, token de seguimiento compartido, dos empresas.
- [ ] Monitoreo de tiempos de respuesta, errores, costes y reintentos; backup/restore y alertas.
- [ ] Entrevistar al comprador: ¿ahorra trabajo? ¿volvería a usarlo y pagaría abono? Sin esto, no declarar viabilidad comercial.

## Protocolo de ejecución para futuras conversaciones

1. Buscar [Issue #794](https://github.com/ProtectorRudo/Cotironda/issues/794) y [PILOTO-100-ESTADO.md](PILOTO-100-ESTADO.md), luego leer AGENTS, README, código y último PR relevante.
2. Revalidar en vivo Supabase piloto: rondas, mensajes asociados, originales guardados, ofertas, flags y riesgos; distinguir datos históricos y actuales.
3. Elegir **UNA SOLA etapa no aprobada** como foco. No crear nuevas variantes PDF/IA si no bloquean directamente esa etapa.
4. Abrir Issue/PR en rama; probar happy path, edge, seguridad y regresión; documentar. Sin integración/publicación no autorizada.
5. Al terminar, actualizar este documento/Issue #794 con estado, pruebas, PR, commit, entorno, riesgos y **siguiente paso único**. Si una etapa no pasó, dejarla [ ] y no declararla terminada.
6. Interpretar permisos: «Auditá» solo lectura; «Documentalo» registro; «Luz verde» desarrolla y prueba sin publicar; «Publicalo» solo versión/entorno autorizados, distinguir publicar código de enviar WhatsApps reales.

**Éxito = evidencia externa de un comprador recibiendo DOS documentos reales desde dos proveedores y descargándolos al cierre de la misma ronda.** Tests aislados, rutas construidas o archivos en base no equivalen a esto.

## Enlaces
- [Issue canónico #794](https://github.com/ProtectorRudo/Cotironda/issues/794)
- [Bloqueo histórico #750](https://github.com/ProtectorRudo/Cotironda/issues/750)
- [PR #793 preflight](https://github.com/ProtectorRudo/Cotironda/pull/793)
- [PR #792 parsing contextual](https://github.com/ProtectorRudo/Cotironda/pull/792)
- [PILOTO-100-ESTADO.md](PILOTO-100-ESTADO.md)
