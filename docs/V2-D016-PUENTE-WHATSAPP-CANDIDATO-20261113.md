# Cotironda V2 D016 — primer candidato ejecutable del enlace WhatsApp

**Fecha:** 13/11/2026 · **Dirección:** [D016 aprobada](https://github.com/ProtectorRudo/Cotironda/blob/docs/cotironda-v2-unica-direccion-20261112/docs/V2-D016-ACCESO-WHATSAPP-SIN-SMS-20261113.md) · **Estado: CÓDIGO CANDIDATO NO PUBLICADO**, sin envío real. Esta implementación inicia D016, NO es el acceso final.

## Qué se construyó

1. `src/server/v2-d016-enlace-whatsapp.ts`: núcleo de **emisión** únicamente desde un webhook Whapi autenticado y con una comprobación del comprador, canal único, ronda y consentimiento en SQL. Requiere `preview`, proyecto `cotironda-piloto` exacto, feature flag explícito, SHA de release y origen HTTPS. Token `randomBytes(32)`, TTL máximo **10 minutos**, almacenamiento únicamente de HMAC-SHA256 con secreto dedicado que jamás entra al navegador. El enlace va en `#d016=...`: el token no viaja en GET ni en las previsualizaciones HTTP. Envío exclusivamente mediante puerto servidor que resuelve destinatario ya verificado; nunca por número de un formulario. Errores inciertos de WhatsApp **no generan reintentos automáticos**.
2. `canjearEnlaceD016`: requiere **POST de mismo origen** hacia ruta exacta, JSON limitado, token de formato estricto y HMAC generado del lado servidor. El callback de base debe ser **atómico**; jamás comparar una fila con SELECT y luego consumirla con UPDATE separado. Devuelve exclusivamente `CLAIMED_AWAITING_AUTH` o `BLOCKED`. **No emite JWT, cookie, sesión Auth ni datos de un pedido: CANJEADO NO significa AUTENTICADO.**
3. `supabase/piloto/v2_d016_whatsapp_link_tickets_CANDIDATE.sql`: tabla privada RLS y dos RPC solo `service_role`, con validaciones en el servidor de comprador, consentimientos, canal Whapi probado, contacto no duplicado y ronda `prepared/closed`. La emisión bloquea la ronda y revoca tickets no consumidos anteriores del mismo pedido. El canje es `UPDATE ... WHERE consumed_at IS NULL AND expires_at > now AND revoked_at IS NULL ... RETURNING`, que impide dos redenciones simultáneas por una misma fila.
4. `tests/unit/v2-d016-enlace-whatsapp.test.mjs`, `supabase/tests/ci/v2-d016-whatsapp-access-pg17.sql`, y workflow D016 dedicado: pruebas sintéticas de preview, flag OFF, token alterado, caducidad, renuncia, duplicación, identidad ajena, rotación, 2 clics concurrentes, no GET de previsualización, sin filtraciones y ACL. PostgreSQL17 ejecuta **ROLLBACK completo**: ninguna fila, usuario, función o ticket llega al piloto.

## Límites de seguridad explícitos

- Este candidato **NO tiene endpoint Next.js conectado** y `/piloto/v2/acceso` **NO existe todavía como página habilitada**. Solo es el motor interno y migración preparatoria.
- El sender del puerto, aún **sin implementar**, debe resolver el destinatario original por una ruta privada de Whapi con idempotencia de envío y controles de costos. La promesa del puerto en un test no equivale a un mensaje entregado.
- La misma autorización de sesión, empresa y ronda debe sobrevivir al acceso: `src/server/v2-03-respuestas-http.ts`, `originales-piloto-http-runtime.ts`, y la RPC de respondedores todavía **requieren `phone_confirmed_at` y la huella de `auth.users.phone`**. Prohibido eliminar esas comprobaciones antes de sustituirlas por vínculo WhatsApp → Auth real, probado y revocable.
- La próxima pieza crítica es **crear una sesión auténtica con Supabase Auth sin SMS ni correo**. Investigar bajo test la emisión administrada `generateLink` y su canje de uso único para un usuario preaprovisionado, sin inventar emails y sin `phone_confirmed_at` artificial; luego cambiar las RPC y el API en una sola versión controlada. La tabla de tickets de esta etapa **no concede permisos al navegador por sí sola**.
- Antes de usar el vínculo en producción, el registro público de Supabase GoTrue debe cerrarse. La configuración pública observada permitía signup. El código no debe confundir el switch `COTIRONDA_REGISTRATION_ENABLED=false` de Vercel con el estado real de Auth.
- El enlace es un **bearer**: si alguien lo reenvía y lo abre primero podría canjearlo; uso único + TTL limitan exposición, pero el acceso WhatsApp no ofrece garantía de dispositivo físico. Prevenir logs, Referer, analytics, prefetch que ejecute JS y abrir enlaces en lectores de documentos. Ante riesgo severo, revocación.
- No introducir secretos en GitHub: el `claveHmacHex` del helper es **server-only** y los valores de tests son sintéticos. No habilitar feature flag ni migrar en el proyecto real con `Avanza`.

## Criterios antes del próximo despliegue

- [ ] Tests Node y PG17 del candidato PASS en GitHub Actions; TypeScript / Next.js sin regresiones.
- [ ] Adaptador real Whapi aislado con resolución privada, no duplicación y emisión solo después de identidad buyer verificada.
- [ ] Prueba de sesión GoTrue auténtica sin SMS ni correo (no un JWT inventado ni un token público), creación de comprador desde prueba Whapi; signup general cerrado.
- [ ] Canje HTTP Next.js seguro, sesión en cookie HttpOnly/Secure/SameSite y validación de Origin, no caché, anti reenvío; observar que WhatsApp no consuma ticket al previsualizar.
- [ ] Reemplazo seguro de autorizaciones de teléfono confirmado en SQL/HTTP por asociación fuerte a WhatsApp con sesión vigente; pruebas sesión ajena, revocada y acceso a original.
- [ ] Preview protegido SSO, 1 comprador y 2 proveedores, archivos auténticos, informe individual/final y cierre calendario; publicación solo bajo orden **«Publicalo»** limitada a PILOTO.

**Reporte de etapa:** creado en rama separada apilada sobre #836, *sin commit a la rama publicada*, sin despliegue, SMS, WhatsApp, usuario Auth, migración aplicada ni registro público habilitado. Continuidad canónica: [Issue #794](https://github.com/ProtectorRudo/Cotironda/issues/794).

## Incremento siguiente: sesión privada del servidor SIN EMAIL / SMS (13/11/2026)

Se implementó un camino alternativo al magiclink/GoTrue que evita **incluso el alias de correo interno** y la administración de cuentas Auth para compradores:

- `src/server/v2-d016-sesion-privada.ts`: después del POST del fragmento de WhatsApp, emite **una cookie `__Host-cotironda-v2`**, `Secure; HttpOnly; SameSite=Lax; Path=/`, duración máxima de 8 h. El navegador **no recibe JSON con sesión o token**. El secreto de la cookie es independiente del ticket de acceso y solo se guarda su HMAC SHA-256 en BD.
- Se añadió al candidato SQL `v2_d016_browser_sessions` (RLS, solo service_role) y una RPC **`claim_session_private`** que **consume el ticket e inserta la sesión en UNA operación transaccional**; si falla la inserción, no se consume el ticket. Un segundo canje no crea sesión.
- La RPC `session_context_private` revalida en cada lectura **ronda exacta, comprador, consentimiento, canal Whapi probado, contacto no duplicado, revocación y caducidad**. `logout_private` invalida inmediatamente la sesión.
- `tests/unit/v2-d016-sesion-privada.test.mjs` y el fixture PostgreSQL 17 se ampliaron para probar cookie, origen, tokens alterados, ausencia de cookie en rechazo, doble canje, sesión cruzada, baja, logout, vencimiento y ACL.

**Frontera aún pendiente:** las rutas de respuestas y descargas del portal usan JWT GoTrue y las RPC antiguas exigen `phone_confirmed_at`. Aún **NO aceptan la nueva cookie**, NO hay ruta Next activada ni se mostró presupuesto. **No saltar esos controles**: habrá que incorporar el contexto de sesión privada a las RPC de respondedores/originales mediante contratos nuevos o guard seguro, manteniendo en cada llamada los checks comerciales originales y la auditoría SHA.

Se conserva `v2-d016-sesion-auth.ts` y `v2-d016-supabase-gotrue.ts` como alternativa probada con mocks; **no se deben activar ambos accesos simultáneamente ni enviar magiclinks a cuentas ficticias**. La vía preferida para el piloto ahora es sesión privada respaldada por PostgreSQL, **solo si la auditoría de autenticación/autorización por empresa supera PG17 y navegador**.

**Estado:** candidato solo en PR #837, tests CI específicos y generales a verificar sobre el último SHA. NO despliegue, SQL aplicado, usuario Auth, correo, SMS ni WhatsApp real.

## Integración de portal y originales — incremento del 13/11/2026

**NUEVO CÓDIGO en PR #837, candidato sin despliegue ni E2E:**

- `apps/portal/app/piloto/v2/acceso`: ingreso de un toque con enlace de Whapi `#d016=<token>&ronda=<uuid>`. El navegador borra el fragmento con `history.replaceState`, efectúa POST same-origin de canje y redirige al pedido protegido. El GET de previsualización no consume. Manejo de reejecución de `useEffect` (React StrictMode) sin canjear dos veces.
- `apps/portal/app/api/piloto/v2/acceso/canjear`: llama solo a `claim_session_private`, entrega cookie `__Host-cotironda-v2` protegida y sin JSON con secretos.
- `apps/portal/app/piloto/v2/rondas/[rondaId]/whatsapp` y `.../respuestas-whatsapp`: lista únicamente comercios que respondieron y análisis guardados mediante la sesión privada, nunca JWT del teléfono; refresca en pestaña visible, no revela invitados. El botón de original envía cookie del mismo origen.
- `apps/portal/app/api/piloto/v2/rondas/[rondaId]/originales-whatsapp/[documentoId]`: descarga aislada de PDF/Excel/Word/imagen/CSV. `src/server/v2-d016-descarga-privada.ts` valida cookie/empresa/ronda → fuente autorizada con proveedor y consentimiento → bytes privados exactos → tamaño y SHA256 → sesión y fuente nuevamente → auditoría SQL obligatoria **ANTES** de responder bytes. No Signed URL ni acceso a bucket público.
- `apps/portal/app/api/piloto/v2/acceso/salir`: logout por POST same-origin con verificación de Origin/Sec-Fetch-Site, revocación SQL y borrado de cookie. La interfaz ofrece **Cerrar sesión**.
- `supabase/piloto/v2_d016_respuestas_y_originales_CANDIDATE.sql`: tres RPC nuevas creadas a partir de los SQL V2 existentes, reusando sus joins de recepción, archivos SHA, anuncios y consentimientos prospectivos sin la vieja exigencia de SMS; cambia solo la puerta de identidad por `session_context_private`. Audit trail D016 propio sobre `session_hmac`, servicio exclusivamente `service_role`. **NO sustituye las RPC históricas**.
- `supabase/tests/fixtures/v2-d016-response-checks.sql`: comparaciones PostgreSQL 17 contra mismo catálogo y fuente original de la ruta Auth histórica, denegación de ronda ajena y revocación, auditoría y RLS/ACL. Se ejecuta dentro de **ROLLBACK** sintético.
- La ruta de ingreso SMS anterior se deshabilita cuando `COTIRONDA_D016_ENABLED=true` para evitar que ambos modos queden expuestos simultáneamente.

**Bloqueos todavía pendientes, no ocultar:**

1. El envío del enlace desde el webhook Whapi v76 **no está conectado en el entorno real**; el sender del núcleo es aún un puerto protegido que requiere integración y prueba de entrega, deduplicación y presupuesto.
2. **Textos originales cifrados**: el lector Edge anterior exige JWT GoTrue y no debe recibir un token falso; la ruta D016 no descarga texto hasta tener lector compatible que revalide sesión y SHA. El comprador ve una nota clara, no un enlace que exponga la fuente.
3. La IA de análisis individual se muestra cuando ya está lista en base; la generación o reintento automático por esta nueva sesión necesita integrar un trabajador autenticado. El informe final comparativo y cron de dos días hábiles siguen por validar.
4. **Sin publicación ni prueba real comprador + 2 proveedores.** Los flags comerciales siguen OFF; los scripts SQL son candidatos; PR draft; no mensajes WhatsApp, SMS, email ni usuarios Auth.
5. Verificar CI exacta del HEAD actualizado antes de declarar el avance aprobado. Un workflow que pasa no reemplaza navegador real ni auditoría de permisos.

**Continuidad inmediata:** resolver fallos de CI, probar el portal íntegro en navegador/Preview y el sender Whapi, proteger lectura de texto y análisis; recién activar servicios con **«Publicalo»** limitado a PILOTO.

## Envío WhatsApp D016 — incremento aislado del 13/11/2026

**Candidato implementado, SIN publicación ni mensajes reales:**

- `supabase/functions/cotironda-piloto-whapi/buyer-whatsapp-entry-d016.ts`: usa WebCrypto de Deno para un token nuevo de 256 bits y el **mismo dominio HMAC SHA-256** que el portal Node; genera enlace `#d016=<token>&ronda=<uuid>` de 10 minutos. La identidad, evento y ronda se toman del webhook autenticado, no de un formulario. Exige portal **Preview Vercel** y coincidencia estricta de SHA de versión/aprobación. Un SMS, SMTP o cuenta Auth no se requieren.
- `supabase/piloto/v2_d016_whatsapp_link_tickets_CANDIDATE.sql`: `v2_d016_whapi_link_deliveries` (tabla privada RLS) y funciones `prepare_whapi_link_private` / `finish_whapi_link_private` exclusivas de `service_role`. El SQL exige: mensaje Whapi entrante persistido durante los últimos 10 min, comprador con consentimiento y canal único, policy de originales V2 habilitada para ronda prospectiva y un pedido exacto. Recuperación sin pedido explícito solo si hay **una** ronda elegible; no elige una al azar.
- Antes del HTTP Whapi, la transacción SQL **bloquea al comprador, rota el ticket e inserta una reserva única por evento**. Máximo un intento por evento; distancia mínima **60 segundos** entre enlaces del mismo comprador y cuota de **6 enlaces por 24 horas**. Si Whapi no confirma, el resultado es `uncertain` y jamás se reenvía automáticamente. Un mensaje nuevo `SEGUIMIENTO COTI` inicia otra evaluación independiente (con cuota).
- `scripts/piloto/v2-d016-whapi-overlay.mjs`: genera fuera de Git `index.v2-d016-candidate.ts` desde el webhook **histórico inmutable** con el overlay V2-02 seguido por la rama D016. **No se edita `index.ts` histórico ni se debilitan las huellas MVP332/333/335.** Cuando `COTIRONDA_PILOT_D016_WHATSAPP_SEND_ENABLED=true`, D016 reemplaza **el único aviso** MVP289, no añade un segundo mensaje. Con flag OFF, MVP289 permanece como estaba. `index.v2-d016-candidate.ts` es transitorio para Deno typecheck y NO está publicado.
- `tests/unit/v2-d016-whapi-envio.test.mjs` y `supabase/tests/ci/v2-d016-whatsapp-access-pg17.sql`: HMAC cruzado Deno/Node, destino Whapi, receptor alterado, tokens malformados, flags, idempotencia, canal y ronda ajenos, replay, revocación, cuota y sesión, ACL y ROLLBACK PG17. Workflow D016 genera y typechequea **el candidato** en Deno, sin hacer ningún POST real.

**Configuración para futuro release Preview, TODAVÍA NO ACTIVAR:** `COTIRONDA_PILOT_D016_WHATSAPP_SEND_ENABLED`, `COTIRONDA_PILOT_D016_PORTAL_ORIGIN`, `COTIRONDA_PILOT_D016_PORTAL_RELEASE_SHA`, `COTIRONDA_PILOT_D016_APPROVED_RELEASE_SHA`, `COTIRONDA_PILOT_D016_HMAC_KEY_HEX`. La clave HMAC debe coincidir exactamente (sin exponerse) con `COTIRONDA_D016_HMAC_KEY_HEX` del servidor Next. Mantener `COTIRONDA_PILOT_WHAPI_OUTBOUND_ENABLED` y el interruptor general de seguimiento controlados por separado, y comprobar costos/cupo. **No se deben enviar datos ni activar flags sin «Publicalo».**

**Bloqueos de cierre del piloto:** verificar el CI exacto final antes de declarar PASS; la base real no tiene el candidato D016 instalado y el webhook actual no envía esos enlaces; falta comprobar Preview/Whapi → sesión → presupuestos reales, lector de textos cifrados, análisis bajo sesión D016 e informe de cierre por días hábiles. No declarar 100 %.

## Lector de texto cifrado D016 — integración de 13/11/2026

**Desarrollo candidato SIN desplegar**, extendiendo la sesión privada sin restaurar SMS ni crear JWT ficticios.

1. La ruta `GET /api/piloto/v2/rondas/[rondaId]/originales-whatsapp/[documentoId]` del portal ahora distingue fuente de archivo y fuente **`authorized_text_v2`**. No genera URL pública. Descarga el mensaje original como `.txt` solo cuando recibió bytes exactos, SHA256, UTF-8 válido y doble autorización viva, y `cotironda_piloto_v2_d016_record_text_download_private` auditó el resultado.
2. `src/server/v2-d016-texto-edge-client.ts` invoca desde **Next servidor** el nuevo lector Edge `cotironda-piloto-v2-text-reader-d016`. Envía `requestId`, `documentId` y HMAC de la sesión D016 en cuerpo POST (no URL), más API key secreta y secreto segregado en headers. No envía `nonceB64` ni `ciphertextB64`; nunca copia `COTIRONDA_PILOT_AES_HEX` a Vercel.
3. `supabase/functions/cotironda-piloto-v2-text-reader-d016/` comprueba **dos secretos servidor a servidor** (apikey y `X-Cotironda-D016-Text-Internal`), consulta `session_context_private` y `original_source_private` con `service_role`, descifra con **AES-GCM + AAD chatHmac|messageHmac|text**, compara SHA y UTF-8 y vuelve a consultar autorización y fuente para resistir revocaciones durante I/O. No acepta identidad, texto ni sobres cifrados de un navegador. No CORS ni respuestas con material sensible ante errores.
4. `supabase/config.toml` tiene entrada independiente `verify_jwt=false` **solo para la nueva función D016** porque `sb_secret_*` no es JWT. La función rechaza todo si falta cualquier secreto, flag o sesión SQL; no cambia el lector Auth V2-15 `verify_jwt=true`. Diseño revisado contra <https://supabase.com/docs/guides/functions/auth> (service-to-service secret).
5. Se preservan por completo los JOINs comerciales de la V2-03b (pedido/proveedor/cotización, consentimiento prospectivo, SHA de fuente) y los controles por cookie de D016. La auditoría de texto está separada de la de PDF para que no se acepte un PDF como mensaje ni un mensaje como archivo.
6. Pruebas: `tests/unit/v2-d016-texto-edge.test.mjs` usa **AES-GCM sintético real**; verifica texto correcto, AAD cambiado, SHA, credenciales inválidas, proveedor/consentimiento alterado, revocación entre lecturas y cliente Next que nunca manda cifrado; `tests/unit/v2-d016-descarga-privada.test.mjs` comprueba `.txt`, SHA y auditoría. En PG17 `supabase/tests/fixtures/v2-d016-response-checks.sql` compara el mismo texto original con la ruta de Auth histórica bajo transacción **ROLLBACK**.

**Gates futuros (OFF ahora):**
- Vercel Preview: `COTIRONDA_D016_TEXT_ENABLED=true`, `COTIRONDA_D016_TEXT_SHARED_SECRET` (secreto nuevo largo, diverso y no relacionado con AES).
- Supabase Edge PILOTO: `COTIRONDA_PILOT_D016_TEXT_ENABLED=true`, `COTIRONDA_PILOT_D016_ENABLED=true`, mismo secreto `COTIRONDA_PILOT_D016_TEXT_SHARED_SECRET`; `SUPABASE_SECRET_KEYS.default` y `COTIRONDA_PILOT_AES_HEX` permanecen solo en Supabase.
- El portal mantiene además `COTIRONDA_D016_ENABLED=true` y el pin de SHA Preview, con SQL instalado bajo autorización.

**NO significa finalizado:** hasta `Publicalo` no se instalan tablas/RPC, no se despliega la nueva Edge ni se habilitan flags. Falta prueba real de texto de proveedor → apertura en celular de comprador. También quedan automatización del análisis individual y comparación al cierre, con calendario hábil aprobado. Nunca declarar acceso real ni funcionalidad publicada basándose únicamente en pruebas CI.

## D016 — análisis individual y cierre comparativo (13/11/2026)

**Alcance:** desarrollo candidato en PR #837, **sin merge ni publicación**. Reutiliza código V2-04b, no crea otra IA Central ni cambia las reglas de matching D013.

### Análisis individual con sesión WhatsApp

- `supabase/piloto/v2_d016_analisis_automatico_CANDIDATE.sql`: dos nuevas RPC privadas `d016_analysis_claim_private` y `d016_analysis_finish_private` se basan en V2-04b original. Revalidan `d016_original_source_private` y por lo tanto sesión, buyer, ronda, proveedor, consentimiento y SHA. `v2_original_analysis` conserva cuotas: un lease 90 segundos, hasta **3 intentos por documento+SHA**, y estado `review` si no puede confirmar la guía.
- `src/server/v2-d016-analisis-automatica.ts`: exige POST same-origin y cookie D016; antes de invocar IA comprueba fuente y SHA exactos, extrae texto desde los lectores verificados ya existentes (TXT Edge D016, PDF Edge original, Office verificado) y revalida permisos antes/después de ejecutar el modelo. Reutiliza `analizarOriginalTextoConIAV2` con evidencias literales y advertencia de original prioritario. No inventa IVA/flete/precio ni revela contactos.
- `apps/portal/app/api/piloto/v2/rondas/[rondaId]/analisis-whatsapp/[documentoId]`: puerto servidor de Supabase `service_role`, no expone claves ni permite llamadas directas del navegador a IA/SQL.
- `respuestas-whatsapp.tsx`: intenta el análisis **sin botón adicional al abrir el portal**, secuencialmente y con tope de seis documentos por visita. La base previene gasto repetido; un análisis fallido no impide descargar el original. **Importante:** todavía NO es un trabajador autónomo con comprador offline. Para garantizar análisis incluso si el arquitecto no abre su enlace, falta un worker/evento autenticado separado y presupuestado.

### Informe al cierre efectivo de dos días hábiles

- `supabase/piloto/v2_d016_informe_final_CANDIDATE.sql`: `d016_final_status_private` (solo `service_role`) exige `timing_mode='business_two_days'`, `round_days=2`, cierre efectivo con `state='closed'`, `closed_at>=closes_at`, políticas `v2_business_policy` y `v2_original_share_policy` activas para la ronda, y calendarios localizados **aprobados** de inicio y cierre, de revisión coincidente. Sin calendario o cierre, **NUNCA** revela un informe final.
- `src/server/v2-d016-informe-final.ts`: agregador determinista de las **guías verificadas y los originales autorizados**. Resume documentos, comercios que respondieron y citas verificadas por IVA, flete, pago, plazo y disponibilidad. Los ítems sin guía se informan como pendientes. **No suma presupuestos de distinta cobertura, no compara precios heterogéneos, no fuerza ganadores ni infiere que una condición falta por no aparecer en la guía.**
- `/api/piloto/v2/rondas/[rondaId]/informe-final-whatsapp`: GET privado sin caché, confirma sesión, estado de cierre, fuente de catálogo y cierre nuevamente antes de construir informe. UI lo muestra solo tras cierre.
- Pruebas sintéticas `tests/unit/v2-d016-informe-final.test.mjs` y fixtures PostgreSQL17 `v2-d016-response-checks.sql`: no informe temprano, calendario sin aprobación, fecha falsa, RLS/ACL, sesión ajena, revocación, conteo de ofertas y comparación sin ranking engañoso.

### Precisión del estado

Este incremento **NO ejecuta el cron**, no aprueba calendarios, no cambia `requests` reales, no genera análisis mientras el comprador no visita la pantalla, no instala RPC/Edge ni habilita flags. Aún faltan integración offline por evento/cola y cierre automático efectivo con calendario autorizado, además del E2E con un arquitecto + proveedores consentidos. Todas las pruebas CI se deben verificar sobre el SHA final, no inferirlas de versiones anteriores. «Avanza» no autoriza despliegue.

## Worker autónomo y cierre SQL D016 — incremento candidato, 13/11/2026

**Alcance exclusivo: desarrollo y pruebas. NO está instalado, programado ni publicado.**

**IA de ofertas sin el arquitecto conectado:** `v2_d016_worker_offline_CANDIDATE.sql` define catálogo/fuente propios para servicio interno, derivados de las mismas consultas originales D016. Revalida comprador con consentimiento, canal WhatsApp autenticado y teléfono único, política V2 prospectiva, calendario aprobado, proveedor invitado con envío Whapi confirmado, documento con SHA y consentimiento específico de originales. **No acepta cookie ni datos de identidad del navegador**. El listado interno `worker_due_private` examina como máximo 20 rondas y devuelve hasta dos documentos aptos. Las RPC `worker_claim`/`worker_finish` usan los mismos leases de 90 segundos y cuota de 3 intentos por SHA que el portal. Las funciones solo admiten `service_role`.

`cotironda-piloto-v2-worker-d016` es una Edge Function con `verify_jwt=false` únicamente porque el gateway de Supabase no acepta `sb_secret_` como JWT. Su propio código exige `apikey` privado más **otro secreto segregado**, flags habilitados, URL exacta del proyecto piloto y parámetros de cron sin selector de compradores. Procesa **como máximo un original por ejecución**: PDF mediante lector verificado, Excel/Word vía ZIP/XML acotado y texto WhatsApp AES-GCM dentro de Supabase. Si la lectura o IA falla, deja `review`; nunca genera presupuesto artificial ni bloquea el original. Si cambian consentimiento/proveedor/huella entre lecturas y modelo, la base impide guardar.

**Cierre comercial:** `v2_d016_cierre_habil_CANDIDATE.sql` calcula exactamente dos fechas hábiles posteriores a la creación de la ronda en **America/Argentina/Buenos_Aires**, conservando hora local, saltando sábados, domingos y feriados registrados en `v2_business_holidays`. Exige calendarios localidad/año/revisión aprobados previamente para TODOS los años involucrados; sin aprobación, fecha en discrepancia, política OFF, comprador sin consentimiento/WhatsApp o ronda histórica, **NO CIERRA**. Cierre atómico `FOR UPDATE SKIP LOCKED` de hasta 5 rondas por tick, registro `v2_d016_closure_audit` por ronda y función `close_due_private(5)`. La función del informe final ahora exige también auditoría del cierre, política de publicación y vencimiento exacto. No adjudica ganadores ni envía mensajes.

**Automatización futura:** `v2_d016_cron_ACTIVATE_ONLY_AFTER_PUBLICALO.sql` es un script explícito de activación, **NO una migración**. Contiene programación cada 5 min para close SQL y worker Edge mediante `pg_cron + pg_net + Supabase Vault`, sin secretos codificados. **NO EJECUTAR** hasta aprobar `Publicalo` SOLO PILOTO, comprobar cron/RLS/costos y registrar calendarios de 2026 y 2027 según zona. `pg_net` retiene transitoriamente los encabezados en la cola; controlar permisos operativos y el canal de Vault. Documentación oficial de <https://supabase.com/docs/guides/functions/schedule-functions>.

**Verificación:** tests nuevos `tests/unit/v2-d016-worker-offline.test.mjs`, `supabase/tests/fixtures/v2-d016-offline-closure-checks.sql` dentro de PostgreSQL 17 `BEGIN/ROLLBACK`, y `deno check` en workflow D016. El fixture usa feriado FICTICIO y comprueba que la discrepancia impide cerrar; después verifica cierre único, auditoría, estado final y ACL. No afirmar PASS antes de consultar el SHA actualizado.

**Falta en vivo:** instalar nuevos SQL, configurar secretos en Vault y Edge, aprobar feriados de La Plata, habilitar por `Publicalo`, ejecutar cron real y hacer una ronda por WhatsApp de punta a punta. El usuario NO tiene que configurar SMS ni su celular. Todas las tablas/políticas reales continúan sin cambiar.
