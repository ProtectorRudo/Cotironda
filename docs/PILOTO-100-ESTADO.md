# COTIRONDA V2 — ESTADO REAL Y RELEVO ENTRE CONVERSACIONES

**Última actualización de documentación: 12/11/2026 (Argentina).**
**Estado:** código D014 IA Central con [PR #823](https://github.com/ProtectorRudo/Cotironda/pull/823) en desarrollo, apilado sobre #822/#821/#820/#819/#818/#817/#816; **SIN desplegar ni E2E**. Automatización fuente oficial/DB todavía pendiente. Los datos de Supabase caducan; reconsultar cuando se necesite estado vivo.

## Relevo actualizado — V2-02 (12/11/2026)

- **Rama operativa:** [PR #816](https://github.com/ProtectorRudo/Cotironda/pull/816) sobre #813 (NO #814). Lookup por referencia seguro, con consentimiento e invitación anteriores al envío y consentimiento proveedor anterior a respuesta. CI del último SHA debe verificarse; NO instalado.
- **PILOTO — solo lectura:** cuatro despachos históricos `api_accepted`; 4/4 con consentimientos e invitación anteriores al envío, 0 permisos tardíos. No implica cuatro cotizaciones ni E2E. El esquema real tiene las columnas necesarias; no se modificó un registro.
- **Supabase Edge instalado:** WhatsApp v76, seguimiento v29, recuperación v13. La nueva RPC V2-02 no está instalada. Estas versiones están identificadas, pero sigue pendiente reconciliar el bundle completo y las descargas.
- **Una próxima tarea:** terminar CI, resolver correlación segura de archivos originales sin cita / evidencia de WhatsApp, y preparar acceso autenticado al comprador. V2-00 (inventario de SHA/Storage/Auth) y V2-01 (matching por PRODUCTO D013) permanecen parcialmente pendientes.

## Nuevo desarrollo V2-02 — PR #817 (12/11/2026)

- **Código propuesto:** [PR #817](https://github.com/ProtectorRudo/Cotironda/pull/817) (draft, apilado sobre [PR #816](https://github.com/ProtectorRudo/Cotironda/pull/816)). Adjunto PDF/Excel/foto **sin respuesta citada**, pero con `Cotironda pedido: XXXXXXXX` en el **caption original de WhatsApp**. Lookup SQL privado solo lectura con SHA de manifiesto, archivo `stored`, proveedor real, autorización e invitación, único despacho aceptado, validación final MVP225. Overlay aislado y flag OFF. Incluye tests Node/PG17/Deno en CI.
- **LÍMITE REAL:** un archivo sin cita, sin caption ni preámbulo no tiene prueba suficiente con rondas concurrentes; NO atribuir por fecha, parecido de materiales ni precio. Mantener revisión privada. El PDF histórico `ambiguous_round` sigue intacto.
- **CI verificado:** [PR #817](https://github.com/ProtectorRudo/Cotironda/pull/817) SHA `65a3762968e8ea6cae950c0c6de7586c92056abf`, **6/6 workflows SUCCESS** (Node, PostgreSQL17 con ROLLBACK y PDF/Excel, Deno candidato, build Next.js, PostgREST y sitio). Es **prueba sintética/de compilación, NO E2E**.
- **PILOTO solo lectura:** 0 RPC V2-02 instaladas; `auth.users=0`; 4 archivos históricos `stored` ligados a alguna solicitud, **sin acreditar la nueva ronda V2**. SQL V2-02, overlay Edge, WhatsApp y Vercel NO publicados. Ningún pedido ni presupuesto real enviado desde esta intervención.
- **Próxima tarea:** completar/verificar CI y auditoría del nuevo vínculo; después habilitar **portal comprador autenticado para los originales de quienes respondieron**, antes de la IA de análisis comercial. D013 por catálogo PRODUCTO sigue pendiente y obligatorio antes del piloto final.

## Nuevo incremento V2-03a — listado de respondedores (PR #818, 12/11/2026)

- **Rama y código:** [PR #818](https://github.com/ProtectorRudo/Cotironda/pull/818) sobre #817/#816, **sin #814**. Se propuso un catálogo privado `cotironda_piloto_v2_responders_private` que elimina los gates heredados de cierre y certificación económica, pero **solo lista originales con vínculo fuerte MVP225, SHA, despacho real y permiso V2 prospectivo**. Contrato de `auth.users` + `auth.sessions` y comprador asociado a WhatsApp, con política V2 OFF por defecto. Ningún cambio en las descargas v1 existentes.
- **API candidata:** GET `/api/piloto/v2/rondas/[rondaId]/respuestas` verificada con `getUser(jwt)`, SHA exacto de release y `preview`; devuelve únicamente nombre comercial, tipo, fecha y estado `Análisis en preparación`, **nunca invitados sin respuesta, rutas, hashes ni montos**.
- **CI aprobado:** PR #818 SHA `21f7d1e47197a45dfffdc0fe084a1db93e945c2e`, **6/6 workflows SUCCESS**, incluidos Node, PG17 rollback (0/1/2 respondedores y permisos), TypeScript/Next.js, PostgREST y aislamiento. [Workflow específico V2-03a](https://github.com/ProtectorRudo/Cotironda/actions/workflows/cotironda-v2-03-respondedores-pg17.yml) prueba 0/1/2 originales autorizados, sesión/empresa ajena, proveedor sin permiso, consentimiento revocado, política apagada, Node, Postgres 17 con rollback. No es E2E: pruebas sintéticas/compilación únicamente.
- **NO instalado:** función, tabla, endpoint ni políticas en Supabase/Vercel; `auth.users` continuaba en cero al último SELECT. Sin descarga real, sin interfaz autenticada en navegador, sin E2E. No se registraron consentimientos nuevos ni se enviaron WhatsApps.
- **Próxima tarea única tras CI:** V2-03b — permitir descargar bytes originales únicamente con Auth, relectura de SHA, permisos prospectivos y auditoría; conectarlo a tarjetas de solo respondedores. Luego validar E2E real con comprador Auth. D013 por producto sigue pendiente antes del piloto completo.

## V2-03b — Descarga original y vista comprador (PR #819, 12/11/2026)

- **Código:** [PR #819](https://github.com/ProtectorRudo/Cotironda/pull/819) (draft, sobre #818/#817/#816, NO #814). Nueva fuente SQL privada que reusa el catálogo 03a y revalida usuario/sesión Auth, consentimiento prospectivo del proveedor, fuente original SHA y correlación a pedido. Auditoría transaccional de la descarga con nueva tabla privada.
- **HTTP/UX:** endpoint GET privado para documento con bytes originales de Storage, SHA-256 verificado, segunda verificación de permiso tras I/O y auditoría obligatoria antes de devolver el archivo. Página `/piloto/v2/rondas/[rondaId]` para el comprador, con OTP de teléfono **solo cuentas existentes** (`shouldCreateUser:false`), lista **únicamente respondedores**, estado `Análisis en preparación` y descarga autenticada sin URL firmada.
- **CI final verificado:** PR #819 SHA `d3c45a75bc56bc41249b9c7bdeb033399843b30e`, **6/6 workflows SUCCESS** (Node, PG17 ROLLBACK, Next.js build, PostgREST, aislamiento y sitio). Pruebas de bytes modificados, SHA/tamaño, buyer ajeno, revocación durante lectura y auditoría fallida. **No equivale a E2E real**.
- **Estado PILOTO reconsultado solo lectura:** 0 usuarios `auth.users`, 0 RPC V2-03 de listado/descarga instaladas, 0 tablas V2 de políticas/consentimiento/auditoría instaladas. No se enviaron WhatsApps ni se hicieron descargas reales. No publicar sin orden `Publicalo`.
- **Próximo bloqueo principal:** preparar instalación coordinada del conjunto #816 → #819 en **PREVIEW PILOTO autorizado**, con alta Auth del comprador y consentimiento V2 real de los comercios durante el alta. Antes: cerrar auditoría SHA/Storage/RLS; no inferir consentimientos. Luego E2E con dos presupuestos auténticos. D013 por PRODUCTO y análisis/cierre siguen pendientes.

## V2-PREFLIGHT — VALIDACIÓN DE INSTALACIÓN (PR #820, 12/11/2026)

- [PR #820](https://github.com/ProtectorRudo/Cotironda/pull/820) (**draft**, sobre #819/#818/#817/#816; nunca #814) documenta el piloto real y prepara **un candidato V2 desde el webhook Whapi v76 DESPLEGADO**, no desde el `index.ts` histórico. Comparación real: **59/61 archivos idénticos**; difieren solo `index.ts` y correlador `supplier-auto-correlation-mvp336.ts`, preservados en snapshots Git SHA verificados. v76 tiene protecciones y funciones MVP333 ausentes en la base histórica. Generator/CI Node+Deno para nueva candidata con funciones v76 + V2, no instalado.
- **Supabase SOLO LECTURA:** proyecto sano PG17.11, Storage originales privado 8 MiB, **0 comprador Auth**, **0/5 RPC V2 nuevas**, **0/3 tablas V2 nuevas**, una ronda `prepared`, 2 `CHECK` que obligan 3–7 días corridos. Esto **bloquea** el contrato V2 de 2 días hábiles. La única asociación histórica es `semantic_unique_mvp291`, no evidencia suficiente para listado V2 seguro. Consulta auditable `supabase/piloto/v2_release_preflight_readonly.sql` confirmó `ready_for_v2_release=false`.
- **Vercel:** cinco proyectos Cotironda; el identificado como Next.js es `cotironda-portal-dev` y su preview todavía no tiene variables V2 requeridas. No confundir build GitHub con ruta V2 realmente disponible.
- **CI PR #820 APROBADO:** SHA `a388f60338a06f33fefe68f1585b9f981dda1ce3` con **7/7 workflows SUCCESS**: preflight v76 Node+Deno, Whapi Deno, PG17, unitarias, autenticación, sitio y build Next.js. Pruebas sintéticas/compilación; **NO E2E**, sin desplegar, enviar mensajes ni cambiar permisos. Ver [Acta preflight](https://github.com/ProtectorRudo/Cotironda/blob/feat/v2-preflight-conciliar-whapi-v76-20261112/docs/V2-PREFLIGHT-EDGE-V76-Y-PILOTO-20261112.md).
- **Próximo bloqueo único:** corregir reloj SQL/feriados a 2 días hábiles y validar catálogo D013 por PRODUCTO, luego preparar migración ordenada y reversible de #816–#820 en único proyecto PREVIEW PILOTO y Auth/consentimiento reales. **Solo instalar bajo `Publicalo`**. No atribuir presupuesto ambiguo por fecha.

## V2-D013 + V2-05 — productos concretos y 2 días hábiles (PR #821, 12/11/2026)

- **Código en rama [PR #821](https://github.com/ProtectorRudo/Cotironda/pull/821)** apilada sobre #820 (y #819/#818/#817/#816). Se localizaron tres filtros antiguos de igualdad de rubro: en ruteador, puente TypeScript y RPC real `cotironda_piloto_ia_shadow_prepare_mvp221`. D013 **solo invita por productos CONCRETOS del catálogo y zona**, nunca por rubro. El código nuevo se aisló en `ruteador-catalogos-v2-d013.ts`, `planificador-piloto-v2-d013.ts`, `puente-sql-rondas-v2-d013.ts` y `ai-central-buyer-v2-d013.ts`, conectado **solo** al candidato Edge v76. Se restauraron los archivos históricos con SHA del manifiesto MVP332. Una primera corrida detectó 9 regresiones por alterar archivos históricos; corregidas con módulos nuevos.
- **SQL D013 candidato SIN instalar:** parche pinned SHA `a2225bc...c25cf9` de función pública de preparación, mantiene chequeos de producto literal, proveedor, zona, consentimiento y origen. Reemplaza exclusivamente igualdad entre etiquetas de rubro por validación de etiqueta permitida. **La IA semántica aún requiere acreditar normas, tipo, marcas obligatorias y demás equivalencias técnicas**; no presumir que el nombre implica sustitución segura.
- **SQL plazo candidato SIN instalar:** `v2_05_plazo_dos_dias_habiles_candidate.sql` configura modalidad prospectiva `business_two_days` (18:00 del segundo día hábil siguiente, `America/Argentina/Buenos_Aires`) con calendario anual/feriados por localidad **aprobado o bloqueo cerrado**. Política OFF y rondas legadas 3–7 días intactas. `v2_05_shadow_prepare_activar_modo_habil.sql` adapta la creación de rondas cuando esa política esté ON, también con fuente SQL SHA pinned. No se cargaron ni aprobaron feriados reales.
- **Prueba sintética PG17:** el archivo `v2-05-plazo-habil-pg17.sql` instala en `BEGIN/ROLLBACK` una copia real de la función de preparación y las **tres migraciones ordenadas D013→calendario→modo de creación**; verifica fin de semana, feriado, cruce de año, región no aprobada, flag OFF, legados intactos y niega cambios retroactivos. No es prueba sobre PILOTO real ni E2E.
- **CI FINAL PR #821 APROBADO:** SHA `51583f5c6b5a7375978f8499e6641f6f3f8b36d0`: **9/9 workflows GitHub SUCCESS** (Node, Deno Edge v76, PG17 calendario y migraciones en orden con ROLLBACK, aislamiento, Auth, documental, Next.js build, sitio). Primera corrida falló por fuente histórica bloqueada; corregido con módulos V2 y todo verde en último SHA. NO significa instalación ni E2E.
- **Nuevo bloqueo único:** calendario oficial nacional, provincial y local aprobado + auditoría de contrato técnico IA D013 + preparación de despliegue conjunto #816→#821 en PREVIEW PILOTO con Auth del comprador y consentimiento V2 del proveedor, **únicamente bajo autorización `Publicalo`**. Sin implementación en base/Edge/Vercel ni WhatsApps reales.

## V2-D013b — evidencia técnica y feriados opcionales: PR #822 (12/11/2026)

- **Rama de código:** [PR #822](https://github.com/ProtectorRudo/Cotironda/pull/822) (draft, basada en #821) agrega un control independiente posterior a IA y previo a SQL/Whapi: valida atributos técnicos contenidos en el pedido y catálogo, no toma texto imaginado por IA como ficha técnica. En pruebas incluye 100 bolsas×50 kg → 200×25 kg y 100 envases×4 L → 80×5 L (solo masa/volumen), restricciones de marca, Portland/albañilería, cable mm², yeso/OSB, espesor mm, látex interior/exterior. Casos sin evidencia quedan en revisión interna.
- **Cotizaciones parciales conservadas:** un material dudoso NO cancela otros productos compatibles ni proveedores legítimos. El ruteador V2 registra `revisionTecnica` por producto/proveedor sin enviarlo; mantiene otros pares verificados para preparación. **Identidad, zona, permiso o catálogo inválidos siguen provocando fallo completo**.
- **Feriados reales 2026 revisados** sin aprobar calendario anual: 19/11 La Plata = optativo para comercio según resolución provincial 516/2026; 23/11 = feriado nacional; 07/12 = no laborable turístico; 08/12 y 25/12 = feriados nacionales. Fuentes verificables documentadas en [acta PR #822](https://github.com/ProtectorRudo/Cotironda/blob/feat/v2-d013-evidencia-tecnica-feriados-20261112/docs/V2-D013-EVIDENCIA-TECNICA-Y-FERIADOS-20261112.md). Manifest de fechas **parcial** `publicable:false`, sin `approved_at`, sin SQL instalado, sin considerar optativos como feriados obligatorios. PG17 prueba casos nacionales y locales.
- **CI PR #822 confirmado:** SHA `ef8d50f64c5de3184da7341a1b8e5d2751e7184a`, **8/8 workflows SUCCESS**, incluidos Node/D013, PG17 de feriados reales y rollback, Deno candidato Whapi v76, Next.js build, Auth, aislamiento y regresiones. Corregido error detectado por CI: tamaño `L` en comparación 4 L vs 5 L. **Sin E2E, sin deploy ni cambios SQL reales.**
- **Próximo bloqueo:** validación técnica con fichas originales para sinónimos de uso distinto, completar calendario ANUAL por localidad con criterio privado/optativo, y preparar Auth/consentimientos y único portal Vercel. Instalación PILOTO exclusivamente con `Publicalo`, sin nuevas rondas ni WhatsApps hasta entonces.

## D014 — IA Central responsable del calendario y equivalencias (PR #823, 12/11/2026)

**Decisión explícita del propietario:** la IA Central coordina **calendario, selección por producto, equivalencias, originales y análisis** sin pedir a comprador/proveedor que editen, carguen feriados ni confirmen rutinariamente nada. Modelo interpreta y orquesta; fuentes verificadas y cálculos deterministas protegen la exactitud. Ver sección D014 en [Contrato V2](COTIRONDA-V2-CONTRATO.md).

**Nuevo [PR #823](https://github.com/ProtectorRudo/Cotironda/pull/823)** (draft, sobre #822/#821/.../#816): lector de fuente pública JSON con HTTPS/host allowlist, tamaño/timeout, cero secretos/cookies y sin redirects; cálculo determinista de 2 días hábiles a las 18 con dos fuentes anuales nacional+contraste, local y año siguiente, diferenciando feriados obligatorios/optativos; orquestador IA Central que revisa calendario antes de consumir IA para el ruteo semántico D013. Falta URL JSON gubernamental **exacta** y validada (dataset oficial comprobado), lectura municipal automática, ingesta/snapshot SQL y cron automático: NO atribuir al piloto una función que hoy solo está en código. SI una fuente discrepa, revisión/recuperación **interna**, sin consulta al cliente. 0 envíos y 0 escrituras SQL por el nuevo orquestador.

- **CI PR #823 confirmado:** SHA `065451e6953158ca3181c1eef5d843e7934be74a`, **7/7 workflows SUCCESS** (Node calendario/fuentes/IA Central, PostgreSQL17, PostgREST Auth, aislamiento, pruebas unitarias, documental/sitio y Next.js build). Primer build encontró tipo local `unknown` y se corrigió; **sin ingesta externa real, sin deploy, sin E2E**.
- **Cierre del desarrollo técnico actual:** compatibilidad entre preflight anual SQL V2-05 y fuente oficial sincronizada; NO exigir al usuario aprobar cada año de feriados. Sincronizar de forma automática y auditable en servidor, con versionado y fail-closed.
- **Último estado PILOTO verificado:** funciones V2 no desplegadas, Auth comprador 0, consentimiento V2 pendiente, Whapi activo v76. Revalidar en nueva conversación antes de cambios.

## V2-04 — Análisis individual con evidencia literal: PR #824 (12/11/2026)

- **Nuevo [PR #824](https://github.com/ProtectorRudo/Cotironda/pull/824)** (draft, sobre #823/#822/#821/#820/#819/#818/#817/#816). Implementa un servicio V2-04 de análisis individual del texto original, **no del PDF binario por sí mismo**. Exige identificación de documento, SHA-256 textual, origen/proveedor/consentimiento/comprador ya verificados; salida JSON con 2–4 observaciones ancladas en **citas literales comprobables**; no inventa montos, IVA/flete, no ranking, no ganadores. Error IA/origen/datos → `analisis_pendiente`, el original sigue disponible. Tests con simulaciones de fuente real, errores API, privacidad y contraejemplos de montos inventados.
- **Límite explícito:** nuevo procesador NO está aún conectado a recepción de WhatsApp, extracción fiel PDF/Excel, cola idempotente ni RPC autenticada del portal. En `respuestas-comprador.tsx` sigue figurando `Análisis en preparación`. **No marcar V2-04 terminada, ni inferir que 2 presupuestos históricos aparecen en V2.**
- **Estado PILOTO SOLO LECTURA reconfirmado 12/11:** `auth.users=0`; 7 rondas históricas, 1 `prepared`; bucket privado de originales sí; **0 de las RPC V2-02/03/04 nuevas** instaladas; 5 RPC `cotironda_piloto_v2_*` que aparecen en inventario pertenecen SOLO a funciones de diagnóstico PDF histórico B5, no al nuevo piloto. Tabla de requests continúa limitada a 3–7 días corridos. El reloj V2 no está instalado ni activo.
- **CI PR #824 verificada:** SHA `f3f9a03cb75dc24bdcbd5a62ef4ab3ad3d7261f4` **6/6 SUCCESS**, V2-04 con fuente SHA/evidencias/PII/IVA/flete, pruebas globales, PostgREST Auth, PG17 aislamiento, sitio y Next.js build. **Código no conectado al portal ni desplegado, sin E2E.**
- **PRIORIDAD REAL:** completar una ruta vertical de PILOTO, no generar más tareas de refinamiento semántico: enlazar original real → proceso IA → guía privada del comprador, terminar la autenticación del arquitecto y consentimiento V2 de proveedores, escoger portal de Vercel PILOTO y preparar despliegue conjunto únicamente tras `Publicalo`. Luego prueba con 1 arquitecto y 2 proveedores (texto/PDF/Excel originales), cierre real e informe general. El calendario autónomo D014 todavía NO sincroniza fuentes oficiales confirmadas a Supabase; no activarlo por defecto.

## V2-04b — Análisis persistido asociado a original y portal (PR #825, 12/11/2026)

**Nuevo [PR #825](https://github.com/ProtectorRudo/Cotironda/pull/825)** apilado sobre #824. Se preparó una integración real de código (NO desplegada) para que el comprador autenticado vea, al lado del archivo original, las 2–4 observaciones con citas originales sin pedir confirmación: **Storage privado → SHA bytes → extractor TXT/CSV/DOCX/XLSX ya existente → IA Central → reserva SQL por (ronda, documento, SHA) → guía SQL privada → RPC del listado de respondedores → vista buyer**. El portal la solicita automáticamente al mostrar una respuesta. Fallos del extractor/IA dejan la cotización original descargable y análisis pendiente. PDF, imagen y WhatsApp texto puro aún no cuentan con integración segura de texto para esta ruta; no inventar lecturas.

**Privacidad y costo:** nueva tabla `v2_original_analysis` con RLS, RPCs `cotironda_piloto_v2_analysis_claim_private`, `cotironda_piloto_v2_analysis_finish_private` y `cotironda_piloto_v2_responders_with_analysis_private`: solo service_role del servidor, reválida de buyer Auth sesión y consentimiento V2 proveedor. Reservas con token/lease exclusivo y reintentos acotados. Las guías se muestran únicamente si el catálogo privado ya permite ver ese original. Fuente original prevalece, no hay rankings.

**Pruebas:** [`v2-04b-analysis-checks.sql`](https://github.com/ProtectorRudo/Cotironda/blob/feat/v2-04b-analisis-persistido-portal-20261112/supabase/tests/fixtures/v2-04b-analysis-checks.sql) verifica rol ajeno, doble reserva, token viejo, cooldown, revocación, ACL y publicación autenticada dentro de transacción PG17 **ROLLBACK**; Node valida origen, SHA, procesador, propuesta y proyección privada. CI técnico #825 verificado **6/6 SUCCESS** SHA `e481315a07afec23e6acc9663fe45d397a3b2a44` (PG17 incluida integración 04b con ROLLBACK, Node, Next.js, Auth, aislamiento y sitio). **SHA final `686cf3d77a89e514c49a74ed11ca52f5fdd63efe`: 6/6 workflows SUCCESS**, incluso el build completo posterior al CHANGELOG. No se ejecutó ninguna migración ni llamada OpenAI real.

**Bloqueos del PILOTO real:** compradores Auth 0 en última lectura; RPCs V2-03a/03b/04b no instaladas; consentimiento prospectivo por proveedor pendiente; Edge v76 y Vercel PILOTO requieren preflight de versión, configuración y autorización **`Publicalo`**. Falta WhatsApp texto puro, PDF e imagen, informe global al cierre, reloj hábil instalado y ensayo WhatsApp→2 originales→portal→análisis→cierre.

## V2-04c — PDF con texto auténtico por lector Deno privado (PR #826, 12/11/2026)

**[PR #826](https://github.com/ProtectorRudo/Cotironda/pull/826)** draft sobre #825: nueva Supabase Edge **aislada** `cotironda-piloto-v2-pdf-reader` usa el lector posicional PDF **ya existente** en Whapi (unpdf 2.1.0, Deno). El servidor Node Vercel verifica comprador/Auth, consentimiento y SHA del PDF original, lo envía SOLO a la nueva Edge usando secreto largo privado y verifica nuevamente SHA de PDF y del texto. La guía IA Central de 2–4 observaciones se guarda por (ronda, documento, SHA) con el mecanismo idempotente V2-04b y aparece junto al PDF descargable. PDF escaneado o ilegible NO produce un resumen ficticio: deja el original disponible. Whapi Edge **v76 no se modificó**.

**CI PR #826 CONFIRMADA:** SHA `6e63ff606e4c592f9f3d88821337e65911a4a7f7`, **7/7 workflows SUCCESS**; Node flujo Auth→PDF→guía y seguridad/sha, Deno lector PDF real con documento sintético válido, Next.js build, PG17 aislamiento, PostgREST Auth, catálogo privado y sitio. Primer Next detectó tipado de `process.env` y fue corregido; la repetición fue verde. **Ningún despliegue ni E2E real.**

**Sin publicar:** config de función Edge `verify_jwt=false` porque usa secreto opaco verificado en el propio handler; **NO establecer secreto inventado ni desplegar sin `Publicalo`**, flags de portal/lectura OFF. No se leyeron los PDF reales de los proveedores ni se abrió el portal V2 en PILOTO. Auth comprador sigue sin alta real y SQL V2 sin instalar según último preflight; no se puede declarar E2E. WhatsApp texto puro y PDF escaneado/imagen quedan pendientes.

**Siguiente tarea única:** pasar preflight de instalación segura del circuito #816–#826 para PILOTO, preparar buyer Auth + consentimiento original real de cada proveedor y probar la primera cotización auténtica PDF/Excel por navegador; después cierre 2 días hábiles e informe global. Evitar nuevas mejoras cosméticas y no exponer presupuestos históricos ambiguos como V2.

## V2-06 — PREPUBLICACIÓN BLOQUEANTE (PR #827, 12/11/2026)

**Actualización real con Supabase/Vercel/Edge SOLO LECTURA**: [PR #827](https://github.com/ProtectorRudo/Cotironda/pull/827) apilado sobre #826 incorpora preflight automatizable para dos etapas distintas: `primer_original` y `piloto_completo`. No despliega ni puede hacerlo. SQL `supabase/piloto/v2_06_release_inventory_readonly.sql` ejecutado en Supabase PILOTO PostgreSQL 17.11 devolvió **0 usuarios Auth**, **0 nuevas funciones V2-02/03/04**, **0 tablas V2**, bucket privado original 8MiB confirmado, funciones legadas de preparación presentes, y 2 constraints históricas de `round_days`. Whapi activo **v76**, SHA `656cb24bd1cbfdbb0de6d87a9acae17ad911c13b6e404667029dd4d0b55b822e` intacto. Vercel `cotironda-portal-dev` es Next.js y Preview protegida por SSO, **solo están los cinco nombres de env del acceso anterior**; los flags/secretos/URLs privados V2 NO figuran en Preview. No se leyeron valores secretos. No se probó ningún original V2 fuertemente asociado ni consentimiento prospectivo efectivo de proveedor.

**Desarrollo:** `scripts/piloto/v2-release-readiness.mjs` compara observación no sensible contra requisitos: comprador Auth, proveedor consentido prospectivamente, vinculación documental fuerte, RPC y tablas reales, Edge PDF, SHA exacto del build Vercel y Preview protegida. Para `piloto_completo` exige además 2 originales de proveedores distintos, ruteo D013, calendario con cierre a 2 días hábiles, Whapi E2E e informe final real. Si falta uno, `BLOCKED`. **Aunque pasara todos, nunca publica ni autoriza: `can_publish=false`.** Foto sanitizada del estado de hoy en `scripts/piloto/observaciones/v2-readiness-piloto-20261112.json`; sus datos deben refrescarse antes de cualquier release. Control CI específico PR #827 aprobado; verificación de toda CI pendiente para SHA final. [Acta](https://github.com/ProtectorRudo/Cotironda/blob/feat/v2-06-preflight-publicacion-bloqueante-20261112/docs/V2-06-PREFLIGHT-PUBLICACION-20261112.md).

**Orden crítico:** NO seguir acumulando PRs de IA: asegurar Auth de arquitecto, consentimiento prospectivo proveedor para mostrar originales, instalación SQL V2-03/04, lector PDF, Vercel Preview pin SHA/flags OFF, prueba primer original real. Luego ruteo/feriados/cierre/informe final. Todo deploy requiere **`Publicalo`**, sin afectar producción ni Whapi v76 hasta verificación de compatibilidad.

## SI ABRÍS UNA CONVERSACIÓN NUEVA: LEÉ ESTO PRIMERO

1. [Contrato V2 vigente](COTIRONDA-V2-CONTRATO.md).
2. [Plan maestro y checklist V2](PILOTO-100-PLAN-MAESTRO.md).
3. **Este documento** (estado y próxima acción).
4. [Issue #794 — tablero canónico](https://github.com/ProtectorRudo/Cotironda/issues/794) y PR V2 activo.

**NO continúes** del último PR antiguo por reflejo. NO uses el texto viejo de README/AGENTS/histórico si contradice V2. Verificá rama, código y despliegue real antes de modificar nada. **El propietario autorizó avanzar con código y pruebas en rama, sin desplegar.**

## Regla de negocio V2 (en una línea)

**Pedido del arquitecto → IA cruza cada PRODUCTO con CATÁLOGOS PROPIOS de proveedores y zona (NO por rubro; equivalencias D013) → comercios cotizan por WhatsApp → solo respondedores IDENTIFICADOS con ORIGINAL y análisis → cierre de DOS días hábiles → comparación general.**

- **D013 aprobada:** [catálogo por producto y equivalencias técnicas](V2-D013-CATALOGOS-EQUIVALENCIAS.md). IA reconoce sinónimos, marcas no excluyentes y presentaciones convertibles (Ceresita/hidrófugo compatible, cemento 50/25 kg del mismo tipo). Cada proveedor recibe solo los artículos que vende; no asumir equivalencia sin respaldo técnico. **DOCUMENTADO, NO IMPLEMENTADO.**
- **No** anonimato, ranking de ganadores ni lista/contador de invitados pendientes.
- Original recibido + fuente asociada + permiso **visible sin esperar al parser ni al cierre**. Comentario IA sin bloquear el original.
- En caso de ambigüedad, revisión interna, jamás atribución inventada.
- Comercios pueden participar en varias rondas a la vez **con correlación por referencia**, no prohibiendo concurrencia.
- Privacidad y consentimiento al compartir identidad/documento originales con comprador destinatario; no equivale a publicación abierta.
- Proveedores gratuitos y sin comisión; ARS 10.000 mensuales comprador es hipótesis a validar.

## Snapshot TÉCNICO verificado (12/11/2026, solo lectura PILOTO)

| Indicador | Observación |
| --- | --- |
| Repositorio | `ProtectorRudo/Cotironda` (GitHub); `main` y el documental histórico contienen decisiones anteriores |
| Supabase PILOTO | proyecto `ilggkalaafhtiysyzlmg` (NO confundir con proyectos DEV) |
| Solicitudes `prepared` vigentes | **1** en la última consulta |
| Envíos de la ronda investigada | **2 proveedores / 2 despachos aceptados** |
| Documentos originales acreditados a esa ronda | **0/2** en el último preflight P1; **no equivale a ausencia de archivos históricos** |
| Caso ambiguo | 1 archivo con `whapi_inbox.request_id=NULL`, `media_archive.request_id=NULL`, `MVP237 ambiguous_round` con 2 candidatas al llegar; M291 `insufficient_material_evidence` y un reintento registrado |
| Segundo proveedor | Sin documento candidato de la ronda al último preflight |
| Compradores Auth en PILOTO | `auth.users=0` |
| Operadores MFA activos | `0` |
| Proyección documental MVP354 | **NO instalada** |
| Revisor de términos P0 | **NO instalado** |
| V2 en despliegue | **NO**. Documentar no implica publicar ni habilitar WhatsApp |
| PR #814 | 6/6 CI técnico aprobados en desarrollo, **NO desplegado y funcionalmente incompatible con V2** porque restringe una ronda simultánea por proveedor |

**Advertencia:** este snapshot no demuestra WhatsApp → dos archivos → portal final. No cambiar request_id o relanzar IA para «arreglar» el archivo histórico; la correlación original resultó ambigua.

## Estado de etapas

- **V2-00 — EN CURSO (AUDITORÍA PARCIAL 12/11):** inventario de repositorio, código en rama #813 y consultas SOLO LECTURA del PILOTO registrado en [V2-00 Inventario de reutilización](V2-00-INVENTARIO-REUTILIZACION-20261112.md). **PENDIENTE** conciliar versiones Vercel/Edge, Storage/RLS y estrategia de rama base; no se modificó código ni se probó E2E.
- **V2-01 — PENDIENTE DE REVALIDAR:** la distribución anterior funcionó 2/2, pero V2 necesita referencias inequívocas y **matching D013 por producto de catálogo con equivalencias verificadas**, no por rubro.
- **V2-02 — EN DESARROLLO, BLOQUEO PRINCIPAL:** [PR #816](https://github.com/ProtectorRudo/Cotironda/pull/816) preparó referencia visible en caption y lookup seguro de mensaje acreditado, con flag OFF. **Sin SQL/Edge instalados**, sin evidencias E2E ni solución completa para PDF sin cita. Conservar original y varias rondas concurrentes sigue pendiente.
- **V2-03 — CÓDIGO PROPUESTO Y PROBADO:** PR #818 listado + PR #819 descarga/vista con Auth; **SIN SQL/Vercel desplegados ni E2E**.
- **V2-04 — PENDIENTE:** análisis individual útil, no bloqueante.
- **V2-05 — PENDIENTE:** dos días hábiles e informe general.
- **V2-06 — PENDIENTE:** permisos, Auth real, piloto E2E.

## Hallazgos verificados V2-00 (12/11, solo lectura)

- [Inventario técnico y mapa de reutilización](V2-00-INVENTARIO-REUTILIZACION-20261112.md): `main` contiene sitio estático y documentación; núcleo operativo en ramas PR apiladas (auditado #813); contrato V2 documentado en PR #815.
- PILOTO: 2 proveedores, 106 líneas de catálogo (86 con `curated_family`), **0 catálogos formalmente confirmados**, 1 ronda `prepared`, 2 invitaciones en esa ronda, **0 compradores Auth**. Hay 3 registros históricos `ambiguous_round`, no deben reatribuirse a ciegas.
- Código actual valida `rubro` además del catálogo y base SQL usa `family_code`: **NO demuestra el matching D013 por producto**. Componentes offline `identidad-producto.ts` e `invitaciones-por-producto.ts` son reutilizables con adaptación.
- **V2-00 todavía no está cerrado**. Vercel confirmó previews `READY` de la web documental, pero **ERROR** en los previews más recientes del seguimiento para la rama documental V2 (la rama no incluye código del seguimiento). PILOTO tiene 1 bucket privado y las tablas centrales tienen RLS activado, sin SELECT directo anon/authenticated; **no equivale a probar descargas**. Falta alinear SHA Edge, endpoint/URL de originales y rama de código. Sin nuevas pruebas E2E, códigos funcionales ni WhatsApps enviados en esta auditoría.

## Primer cambio de código V2-02 (12/11/2026)

- [PR #816](https://github.com/ProtectorRudo/Cotironda/pull/816) (draft, sobre rama operativa #813, NO sobre #814) implementa consulta de referencia exacta de pedido y reusa vinculación Whapi existente, con feature flag **OFF**. Incluye tests Node y ensayo PG17 sintético con ROLLBACK en revisión.
- La referencia no sustituye prueba de origen para archivos no citados. El bloqueo comercial persiste hasta demostrar 2 respuestas reales, Auth del comprador, originales visibles y análisis.
- **No hubo despliegue ni cambio de datos PILOTO**; no confundir el PR con funcionalidad activa.

## ÚNICA PRÓXIMA ACCIÓN ACTUAL — Preflight y primer original PDF + Excel real

**PR #826** ya propone PDF con texto y Excel, hash verificable, guía IA privada y portal. Validar CI final y después revalidar entorno Vercel PILOTO, Edge v76 vivo y migraciones SQL #816–#825 en el orden probado; preparar cuenta Auth comprador y consentimientos V2 prospectivos de proveedores sin suponerlos por haber usado WhatsApp. Desplegar ÚNICAMENTE con `Publicalo`. Primera prueba real: comprador ve dos originales verdaderos (PDF/Excel) y sus guías, sin confirmaciones extra, luego cierra a dos días hábiles con análisis global. Imágenes/escaneados aún requieren OCR/multimodal fiel con fuente probada; no inventar resultados.

## Autorizaciones y cómo registrar un avance

- `Auditá`: solo leer; `Documentalo/Reorientá`: documentación en PR; `Avanza/Luz verde`: código + pruebas en rama **sin desplegar**; `Publicalo`: despliegue solo al entorno/versión autorizados y con verificaciones.
- Cada entrega debe indicar **documentado / probado sintético / instalado en PILOTO / comprobado E2E**, SHA CI, PR, pruebas, riesgos y **siguiente acción**. Nunca mezclar estados.
- Actualizar [Issue #794](https://github.com/ProtectorRudo/Cotironda/issues/794), [Contrato](COTIRONDA-V2-CONTRATO.md) si cambia una regla y [Plan](PILOTO-100-PLAN-MAESTRO.md) si cambia el camino crítico.

**Histórico conservado:** [estado previo completo](historico/2026-11-12-estado-pre-v2.md), [plan anterior](historico/2026-11-12-plan-maestro-pre-v2.md), [contenido anterior de Issue](historico/2026-11-12-issue-794-pre-v2.md). **No tiene autoridad para reintroducir decisiones reemplazadas.**
