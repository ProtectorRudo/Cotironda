# Cotironda — estado verificable y relevo entre conversaciones

> **ACTUALIZACIÓN P0 — 11/11/2026: evaluación de código abierto:** [Comparativa ERPNext vs Cotironda](P0-ERPNext-vs-Cotironda-evaluacion.md). Se eligió mantener el núcleo actual y no instalar ERPNext/otra base para el piloto, con reserva de revisarlo si falla un spike real. **P0 no está terminado:** falta matriz de Vercel, política explícita de revelación de originales y tests de acceso. Último dato real: 8 medios archivados con SHA, 4 ligados a request_id (no necesariamente correctos), 0 ofertas anónimas, Auth piloto 0, política originales OFF, consentimientos 0. **Siguiente paso único:** completar P0 de privacidad/empresa/implementación desplegada; luego P1/P2 proyección documental. Rama y PR de esta evaluación independientes, sin deploy.


**FECHA DEL ÚLTIMO RELEVO:** 11/11/2026 (Argentina). Este archivo es un SNAPSHOT, no una consulta en tiempo real.

> **VERCEL, VERIFICADO 11/11/2026:** `cotironda` producción READY es una demo aislada de `main` (SHA `5987f170...`), NO el piloto documental. `cotironda-seguimiento-vista-piloto` tiene producción READY de rama antigua y **previews documentales ERROR**; `cotironda-seguimiento-web-piloto` conserva producción ERROR y previews previas READY. Los commits de documentación activan builds de **Preview automáticos** por la conexión GitHub, aunque no se haya publicado a producción. Antes de P3/P4, identificar URL real autorizada del comprador, revisar build y validar con Auth/ACL. [Evidencia y matriz](P0-ERPNext-vs-Cotironda-evaluacion.md).

**LECTURA OBLIGATORIA:** [Issue #794 — checklist canónico](https://github.com/ProtectorRudo/Cotironda/issues/794) y [Plan maestro](PILOTO-100-PLAN-MAESTRO.md).

**Compatibilidad de la vinculación (auditoría actualizada):** el webhook del piloto ya intenta `cotironda_piloto_ia_link_supplier_mvp225` después de verificar y archivar el binario; la prueba no depende de que la IA termine precios, pero sí del permiso `quote_link` (2 de 2 proveedores habilitados en el piloto al 11/11). Cuando el negocio primero avisa que enviará un archivo, la función `cotironda_piloto_ia_attach_supplier_media_mvp238` puede generar el método seguro `prior_supplier_preamble`; MVP355 ahora lo admite además de `quoted_whapi_id` y `single_active_round`. El enlace legado MVP151 trabaja sobre `whapi_outbox` y no constituye automáticamente evidencia de un despacho IA nuevo. **Falta prueba real de ambas respuestas y de la ruta de seguimiento completa.**

**CI FINAL MVP355 (11/11/2026):** el SHA técnico [`721ecc12d2a9a35e54d53b35f009d419b4cca3f6`](https://github.com/ProtectorRudo/Cotironda/pull/798) pasó **5/5 workflows generales**: Next.js, unidad general (incluye **PG17 documental** y **Deno seguimiento** como jobs separados), PostgREST, PG17 aislamiento y verificación sitio. Probados dos formatos sintéticos, SHA, links débiles/ausentes, vínculo de aviso previo, duplicados, rondas solapadas y revocación. Además SELECT del nuevo SQL sin escrituras contra piloto: `2 despachos / 0 documentos acreditados`; token falso `not_found`. **Sin despliegue**, PR draft; no E2E real.

## P0 — controlador de ejecución PostgreSQL TLS para Whapi (12/11/2026)

**[PR #810](https://github.com/ProtectorRudo/Cotironda/pull/810)** DRAFT sobre #809; [Acta 537](https://github.com/ProtectorRudo/Cotironda/blob/feat/p0-executor-postgres-tls-20261112/docs/537-p0-runner-postgres-tls-whapi.md).

- [x] Driver `whapi-terms-pg-driver-p0.ts`: conexión PostgreSQL directa SSL con CA, proyecto PILOTO exacto, `session_user` técnico, `SET ROLE` mínimo comprobado, una conexión y cierre por RPC; deny SQL no listado y entornos no autorizados. No reusa D088 que apunta a otra base.
- [x] `whapi-terms-runner-p0.ts`: encadena cinco RPC de DB y descifrado AES P0 al transporte D055, un aviso por invocación, banderas dobles OFF, cero ruta/cron instalados.
- [x] Tests sintéticos Node de login y conexión, errores fail-closed, recorrido del aviso. CI PG17 con rollback heredado y ejecutándose en esta rama. **No acreditar CI último SHA sin inspección.**
- [x] Snapshot Supabase PILOTO 12/11: Auth 0, operadores activos 0, consentimientos originales 0, política OFF, 1 prepared vigente, M362/P0 SQL sin instalar. Ningún envío ni mutación.
- [ ] **NO APTO PARA PILOTO E2E:** falta provisionar login DB, credenciales seguras, operator Auth MFA verdadero, términos aprobados y aceptación explícita auditada; comprador OTP y 2 originales/seguimiento/cierre pendientes. P0–P5 ABIERTOS.

**SIGUIENTE ACCIÓN:** revisar consentimiento entrante con operador AAL2, sin atajos; publicación solo con `Publicalo en cotironda-piloto` y política comercial aprobada. Luego E2E 1 comprador/2 proveedores.

## P0 — resolver contacto AES-GCM pre-ronda (12/11/2026)

**[PR #809](https://github.com/ProtectorRudo/Cotironda/pull/809)** DRAFT sobre #808, [Acta 536](https://github.com/ProtectorRudo/Cotironda/blob/feat/p0-resolver-contacto-cifrado-20261112/docs/536-p0-contacto-cifrado-antes-de-ronda.md).

- [x] Se contrastó el HMAC/AES del Edge PILOTO con D068 y M313: D068 tiene formato de otro proyecto; M313 exige ronda. Para el alta anterior a ronda se añadió SQL `terms_recipient_packet_p0` con lease/propietario/chat exactos y ACL `NOLOGIN`.
- [x] `whapi-terms-recipient-p0.ts` descifra el contacto ya existente `participant_channels_mvp109` con AES-GCM + AAD PILOTO, verifica SHA/HMAC y bloquea suplantaciones, sin teléfonos en BD de nuevos trabajos. Puerto SQL compositor listo en código, NO conectado a ejecución remota.
- [x] Supabase PILOTO SELECT: 3 canales cifrados autenticados, 2 pertenecen a proveedores activos. 0 datos modificados, 0 envíos. Se preserva ronda `prepared` sin duplicarla.
- [x] Tests Node AES sintético, PG17 de lease/ACL preparados. **CI FINAL 5/5 SUCCESS** en SHA `5e234f62f55511d73cec3dad78b24afc0a7ba541`: Node (incluidas pruebas AES), PG17 P0 con ROLLBACK, Next.js, PostgREST, aislamiento PG17 y sitio. Se reforzó la revalidación del contacto cifrado justo antes del HTTP y se probó su revocación tras BEGIN. La primera discrepancia fue un caso de test incorrectamente exigente; corregido y repetido. Sin contacto ni MFA reales en la prueba.
- [ ] Aún no hay login DB de runner, claves inyectadas, MFA real, condiciones legales aprobadas ni revisión de aceptación; tampoco comprador OTP y E2E documental. **P0–P5 ABIERTOS**.

**SIGUIENTE ACCIÓN SIN DESVÍOS:** adaptar ejecutor servidor PostgreSQL TLS con rol exclusivo + revisión MFA del consentimiento; después autorización específica para despliegue en `cotironda-piloto`, y prueba comercial completa con un arquitecto y dos proveedores. No publicar con `Avanza`.

## P0 — reserva de aviso Whapi y ACK SQL atómicos (12/11/2026)

**[PR #808](https://github.com/ProtectorRudo/Cotironda/pull/808)** DRAFT, [Acta 535](https://github.com/ProtectorRudo/Cotironda/blob/feat/p0-whapi-aviso-alta-sin-reenvio-20261112/docs/535-p0-aviso-whapi-reserva-ack-transaccional.md). Desarrollo sin despliegue ni WhatsApps.

- [x] Cierre de puertos simulados `claim/begin/authorize/finish` en **SQL privado preparado**, más adaptador `whapi-terms-sql-p0.ts`. Encadenamiento confirmado antes de HTTP, reserve lease y `in_flight` sin reintento. ACK API válido persiste el aviso versionado M364, **no una aceptación**. Resultado incierto no guarda aviso ni habilita descarga.
- [x] Cola autorizada solo por operador Auth AAL2 `operator_session_mvp267()`, sin `operator_id` del cliente; rol emisor `NOLOGIN` aislado y sin permiso de `service_role`/usuarios API para fabricar constancias. Reutiliza D055 con huellas PILOTO.
- [x] **CI FINAL 5/5 SUCCESS en SHA `d743c35be826320d77bb84fc908088b05a85f938`**, con `pg17-p0-terms-sender` SUCCESS y ROLLBACK. Node detectó y permitió corregir la aceptación de campos inesperados; Node final SUCCESS. Next.js, PostgREST, aislamiento PG17 y sitio SUCCESS. Sin MFA/Whapi reales. Pruebas **sintéticas**: no operador real ni red Whapi.
- [x] Supabase PILOTO `SELECT` 12/11/2026: 0 usuarios Auth, 0 operadores activos, 0 consentimientos originales, política OFF, M362 y emisor P0 sin instalar, 1 ronda prepared activa.
- [ ] **Bloqueo siguiente:** condiciones de originales de no ganadores aprobadas; crear operador MFA real, identidad DB autorizada y runner server-only, registrar anuncio Whapi real una vez y revisión expresa del mensaje entrante. Después Auth comprador OTP y prueba de dos originales.
- [ ] P0–P5 siguen abiertos, ningún E2E. No crear ronda superpuesta, ni envío o despliegue bajo `Avanza`.

**Continuidad obligatoria:** próximo desarrollo solo integración ejecutable con servidor/roles y revisor MFA. Prohibido un nuevo refactor del ledger si no desbloquea el ensayo real. La publicación requiere `Publicalo en cotironda-piloto`, con términos aprobados y reversión preparada.

## P0 — emisor Whapi de condiciones listo en código OFF, aún no conectado (12/11/2026)

**[PR #808](https://github.com/ProtectorRudo/Cotironda/pull/808)** (DRAFT, sobre #807) / [acta 534](https://github.com/ProtectorRudo/Cotironda/blob/feat/p0-whapi-aviso-alta-sin-reenvio-20261112/docs/534-p0-emisor-whapi-terminos-sin-reenvio.md).

- [x] Se reutilizó transporte existente D055 para validación de Whapi API ACK: texto de condiciones completo y no truncado, versión/SHA exactas, destinatario/chat comprobados, `beginCommitted` antes de HTTP y `authorizeCommitted` inmediatamente antes. Rechazos, fallos o timeout → incierto sin reenvío. **No genera opt-ins**.
- [x] **HMAC revisado en Edge activo**: el webhook PILOTO no usa el mismo HMAC que D029/D056; PR #808 corrigió cálculo de chat y message ID al prefijo exacto `cotironda|pilot|...` y agregó test de incompatibilidad. No se tocó el Edge vivo.
- [x] Tests unitarios sintéticos creados. **CI final pendiente por SHA**, no marcar aprobación hasta verificar ejecución.
- [x] Snapshot en Supabase PILOTO revalidado con `SELECT` el 12/11/2026: 0 usuarios Auth, 0 operadores habilitados, 0 consentimientos originales, política OFF, 1 ronda prepared vigente y M362 sin instalar. **0 modificaciones, 0 mensajes.**
- [ ] **CÓDIGO NO CABLEADO:** falta adaptador real SQL con `claim/begin/authorize/finish` que persista HMAC de respuesta a M364, con operador AAL2 y anti-duplicación; no activar WhatsApp ni autorizar por ACK de API. El texto de términos sigue en borrador comercial/legal.
- [ ] Comprador OTP, 2 archivos verdaderamente asociados, seguimiento y cierre/descarga en navegador, `net` externo; P0–P5 ABIERTOS.

**Próximo paso exacto:** desarrollar adaptador SQL transaccional y tests PG17. Luego una autorización real con operador MFA y consentimiento explícito, y pasar directamente al E2E documental. Requiere `Publicalo en cotironda-piloto` para despliegue; no crear una segunda ronda aún.

## MVP365 — corrección de reaceptación y no retroactividad (12/11/2026)

**[PR #807](https://github.com/ProtectorRudo/Cotironda/pull/807)**, borrador sobre #806. [Acta 533](https://github.com/ProtectorRudo/Cotironda/blob/fix/mvp365-reaceptacion-no-retroactiva-20261112/docs/533-mvp365-reaceptacion-prospectiva-episodios.md).

- [x] Bloqueo de reaceptación detectado y corregido **solo en código**: historial de aceptaciones por episodio de WhatsApp y revocación con referencia al evento anterior. Aceptar nuevamente requiere un nuevo aviso y respuesta registrados posteriores a la revocación. El permiso anterior no resucita rondas ya creadas.
- [x] PG17 sintético del circuito de revocación/reaceptación y contrato Node extendidos. **CI FINAL 5/5 workflows SUCCESS** en SHA `e625a7f8dfcb8fd6062b19e95a10cbc381f048f9`; job `pg17-mvp362-terms-onboarding` SUCCESS con ROLLBACK, Node SUCCESS; Next.js, PostgREST, PG17 empresarial y sitio SUCCESS. No hubo Auth ni WhatsApp reales. No hay validación Whapi real ni cierre de P0–P5.
- [ ] Operador Auth MFA AAL2 real, envío verificable de condiciones y aceptación explícita revisada; texto comercial/legal aprobado, Auth comprador OTP, 2 archivos y seguimiento+descarga HTTP real. No crear ronda superpuesta ni habilitar política por defecto.

**Próxima acción sin desvíos:** ensayar una aceptación explícita usando Whapi real y operador habilitado, y después realizar la prueba E2E documental. No introducir otro subsistema. Ningún deploy ni mensaje por esta autorización.

## MVP364 — aviso de condiciones previo a aceptación (12/11/2026)

**[PR #806](https://github.com/ProtectorRudo/Cotironda/pull/806)** DRAFT sobre #805 y [acta 532](https://github.com/ProtectorRudo/Cotironda/blob/feat/mvp364-proof-terms-delivered-20261112/docs/532-mvp364-aviso-terminos-proveedor-previo.md). **No desplegado; política OFF; ningún Whapi, SMS, consentimiento o ronda nuevos**.

- [x] SQL M362 (aún no instalado) ahora exige **aviso de términos anterior**, registrado en nuevo ledger privado M364, y opt-in asociado por FK; código de acceso verifica mismo proveedor, chat, versión y SHA y anterioridad a respuesta/ronda. `whapi_outbox` de ronda no se confunde con envío de condiciones de alta.
- [x] PG17 extendido para aviso con términos adulterados, chat incorrecto, fecha posterior a respuesta o anterior a política; tests Node, ejecución CI M362 en rama M364. **CI FINAL 5/5 SUCCESS en SHA `da3fdfb31d7f52834a25f1242ebf6bec6026f241`**, incluido job `pg17-mvp362-terms-onboarding` con ROLLBACK y suite Node; Next.js, PostgREST, aislamiento y sitio también SUCCESS. Jobs específicos de ramas anteriores SKIPPED.
- [ ] Falta emisor confiable Whapi con comprobante real de mensaje enviado, revisión por operador AAL2 de aceptación cifrada, consentimiento válido y reaceptación por episodio tras revocación. Hasta instalar y verificarlo, esto es **barrera de código**, NO certificación de intención.
- [ ] Política legal/comercial de originales no ganadores, operador y comprador Auth reales, documentos con vínculo fuerte, interfaz al cierre y descarga E2E, `net` externo. P0–P5 siguen abiertos.

**Próximo paso exacto:** integrar mensaje de condiciones enviado de forma comprobable + revisión de aceptación explícita MFA, sin crear ronda mientras exista prepared vigente y sin habilitar descargas. Fuente operativa [Issue #794](https://github.com/ProtectorRudo/Cotironda/issues/794).

## MVP363 — preflight de alta de originales: seguridad preparada, sin aceptaciones (12/11/2026)

**[PR #805](https://github.com/ProtectorRudo/Cotironda/pull/805)** (DRAFT, sobre #804), [Acta 531](https://github.com/ProtectorRudo/Cotironda/blob/feat/mvp363-preflight-alta-explicita-20261112/docs/531-mvp363-preflight-aceptacion-real-operador.md), preflight `supabase/tests/preflight/mvp363-originales-alta-readiness-readonly.sql`.

- [x] **Supabase PILOTO reconsultado SOLO LECTURA el 12/11/2026**, sin PII: Auth 0, operadores activos 0, consentimientos de originales 0, política OFF, M362 NO instalado, función MFA M267 instalada, ronda preparada vigente 1. Preflight `NO_APTO_PARA_ALTA_REAL`.
- [x] Código de preflight y tests Node versionados. **CI de #805 aún pendiente de certificar**. No hay registro real, SQL instalado, WhatsApp ni despliegue.
- [ ] Debe acreditarse texto/version exactos entregados al proveedor en mensaje Whapi **antes** de su aceptación, más respuesta explícita y revisión descifrada solo por operador con Auth+MFA AAL2; el hash del mensaje recibido NO demuestra por sí solo intención.
- [ ] Resolver reaceptación tras revocar: el PK M362 impide una segunda alta para misma versión; el diseño debe conservar ledger de episodios y prohibir retroactividad.
- [ ] Revisión comercial/legal del alcance con archivos originales de no adjudicados, operador real, comprador Phone/OTP, fuentes PDF/Excel ligadas, navegador/cierre y comprobación REST `net`. P0–P5 sin cerrar.

**Siguiente acción:** construir el mecanismo verificable *términos enviados → aceptación recibida → revisión humana MFA → registro duradero*, SIN crear una ronda adicional. Solo con aprobación y «Publicalo en cotironda-piloto» estudiar despliegue con gates OFF.

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
