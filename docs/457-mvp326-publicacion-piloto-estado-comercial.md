# Acta 457 — MVP326 publicado en piloto, sin envíos ni alteración de cotizaciones

**Fecha:** 09/11/2026 (ART). **Autorización:** orden expresa «Publicalo» posterior a la integración del PR [#725](https://github.com/ProtectorRudo/Cotironda/pull/725), commit de desarrollo `2a5ecdd357e01bfc81fd1722f247cf1dbcdb9ad7`.

**Alcance exclusivo:** Supabase `cotironda-piloto` (ref `ilggkalaafhtiysyzlmg`), Edge `cotironda-piloto-seguimiento`, proyecto Vercel separado `cotironda-seguimiento-vista-piloto` (ID `prj_0kZzvuzEg7vL4FzsqbdARKeoHzLk`). No tocar `cotironda` principal, producción comercial, webhooks de Whapi, cron, envíos automáticos ni datos de negocios.

## Motivo

El enlace privado abierto por el arquitecto desde celular mostraba «Esperando verificación» para una respuesta que ya **había terminado** con estado `review / semantic_review_required`. La fuente se encontraba asociada a su ronda y a un envío válido; no se conserva el motivo económico específico de aquella lectura. Cambiar el estado **no** permite aprobar importes. Se necesita indicar al comprador que una respuesta procesada requiere revisión comercial sin prometer un análisis que ya no se está ejecutando.

## Publicación y verificaciones

### 1. PostgreSQL piloto

- Versión existente: **PostgreSQL 17.11**. El preflight confirmó que la RPC MVP326 **no existía**, los hashes de RPC buyer MVP227 / reveal MVP303 coincidían con `fbf961028746a1d68ff7a9f3ff645b8677b392c5192bbdbe256a279b2d4bcd1f` y `5f9db475a16897ee5931045f2817ba77c037cc0590ad2a117daff6654b4d358c`, respectivamente.
- Migración aplicada correctamente y registrada como **`20261109164501`**, nombre `cotironda_piloto_mvp326_estado_revision_comercial_sin_envios`. Una transacción con guardias de hash, permisos, conteos, cero despachos inciertos y flags OFF creó exclusivamente la nueva RPC `public.cotironda_piloto_ia_review_status_mvp326(text)`. No se reemplazaron tablas, cotizaciones, respuestas ni funciones previas. Origen: `supabase/piloto/mvp326_estado_revision_comercial_comprador.sql`, Git blob `f32a2bfd75ce516df7c5febf234660059bffe717`.
- Verificación posterior: función presente; `anon_execute=false`, `authenticated_execute=false`, `service_execute=true`. Token inválido devuelve `not_found`. El token privado del comprador no se extrajo ni publicó; se ensayó dentro de la base con el token hash almacenado, devolviendo únicamente estados **no identificatorios**.
- En la ronda de la captura, la proyección devolvió `vinculados=1`, `requieren_revision=1`, `en_proceso=0`, `verificados=0`. La lectura **no** escribió sobre el caso histórico ni cambió el estado de su fuente.

### 2. Supabase Edge de seguimiento

- Antes: `cotironda-piloto-seguimiento` **v26 ACTIVE**, `verify_jwt=false` porque la función protege el enlace privado con su propia autenticación y comprueba el token hash en la RPC. El primer bloque de archivos descargado contenía 30 fuentes; **29 coincidían byte por byte con GitHub**, y el único índice distinto tenía exactamente las inserciones previstas de MVP326 tras comparar contra la versión viva.
- Se desplegó la función **v27 ACTIVE** enviando el **bundle de 34 archivos** verificado en CI por el gate MVP324: 30 archivos actuales (29 sin cambios + índice con adición MVP326) y cuatro módulos necesarios fuera de esa lista (3 dependencias transitivas + adaptador `estado-revision-comercial-mvp326.ts`). No se cambiaron los mecanismos de token, el transporte Whapi ni `verify_jwt`.
- Supabase confirmó despliegue ACTIVE v27 y el nuevo índice contiene la llamada opcional protegida por `estadoRevisionComercialMvp326`. La API de descarga de Edge devuelve **31 archivos**, no la lista completa de los 34 enviados. Por eso el listado íntegro no está confirmado por esa API; el bundle de código se había validado recursivamente antes de enviar y el desplegador aceptó la función.
- `cotironda-piloto-whapi` sigue **v70 ACTIVE**; `cotironda-piloto-ai-batch` sigue **v1 ACTIVE** pero sin cron ni gates habilitados. No se enviaron WhatsApps.

### 3. Página del arquitecto en Vercel

- Se solicitó un despliegue **preview** desde la integración exacta `2a5ecdd357e01bfc81fd1722f247cf1dbcdb9ad7`, sin forzar el límite de compilaciones, sin plan pago y sin promover la aplicación comercial principal.
- Vercel aceptó y construyó el deployment **`dpl_Fawg4YtKtEE4oXnypRH6mYdPowCq`** con estado **READY**, URL de preview `cotironda-seguimiento-vista-piloto-fb4ij0pq3.vercel.app`. La verificación confirma proyecto `prj_0kZzvuzEg7vL4FzsqbdARKeoHzLk`, rama de desarrollo autorizada y commit exacto.
- Se reasignaron los **dos alias** del mismo proyecto aislado al nuevo deployment READY y se confirmaron nuevamente por Vercel:
  1. <https://cotironda-seguimiento-vista-piloto-protector-rudo-s-projects.vercel.app/seguimiento> — host que incluyen realmente los enlaces privados enviados al arquitecto (con fragmento `#...`, que no se compartió ni modificó).
  2. <https://cotironda-seguimiento-vista-piloto.vercel.app/> — alias corto.
- La página mostrará «Respuesta procesada · revisión comercial necesaria» en vez de «Esperando verificación» **solo cuando la nueva proyección autorizada esté disponible**; el adaptador SQL, Edge y proxy tienen validaciones independientes de forma, fuente, acceso y contadores.

### 4. Protección y datos luego de publicar

- `ai_auto_release_gate_mvp306.enabled=false`, `ai_batch_gate_mvp314.enabled=false`, `ai_buyer_notice_gate_mvp315.enabled=false`.
- **0** despachos `pending/leased/uncertain`.
- **3** participantes, **5** rondas y **7** documentos originales preservados.
- En `ai_supplier_review_mvp227` permanece **1** revisión, **0** presupuestos `verified`. No se modificó ninguna condición, precio ni asociación.
- PR #725 pasó **16/16 controles GitHub** antes de fusionar, incluida compilación Next.js, PostgreSQL17, Deno y pruebas de la vista/proxy/privacidad. Los dos estados automáticos de Vercel asociados al PR fallaron por cuota de build; eso es distinto al deployment preview **manual y verificado READY** del mismo commit integrado.

## Limitaciones pendientes

**Publicación técnica completada; validación E2E no certificada.** El acceso HTTP al preview desde la herramienta web no estuvo disponible, y no se ingresó desde un navegador real con el enlace privado completo posterior a la publicación. Se requiere que el arquitecto actualice su propio enlace y compruebe que aparezca «Respuesta procesada · revisión comercial necesaria» sin mostrar identidad ni dinero. No pedir ni copiar el fragmento del enlace privado.

No existe un backup recuperable verificado; el piloto se continuó según decisión previa del operador, limitando modificaciones a una RPC nueva y al seguimiento aislado. Si la nueva proyección falla, la página conserva la vista anterior sin permitir que una revisión pendiente se convierta en oferta económica.

**No está resuelta ni verificada la cotización de Nahuel.** La causa detallada del análisis anterior fue reemplazada por un código genérico y no debe inventarse. El futuro procedimiento de conciliación con originales y evidencia sin volver a pagar IA está registrado en [Issue #726](https://github.com/ProtectorRudo/Cotironda/issues/726); no es parte de este despliegue.

**Siguiente control:** captura de celular sin barra de direcciones ni token, seguida de verificación real de token revocado y una nueva oferta plenamente verificada. No habilitar WhatsApp automático mientras la credencial de sandbox siga expuesta y el operador no autorice un cambio de seguridad.
