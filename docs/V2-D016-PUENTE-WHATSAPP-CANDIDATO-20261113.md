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
