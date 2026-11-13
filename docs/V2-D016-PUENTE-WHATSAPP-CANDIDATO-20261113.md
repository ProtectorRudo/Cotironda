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
