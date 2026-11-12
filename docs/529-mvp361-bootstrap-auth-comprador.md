# Acta 529 — MVP361: bootstrap seguro del comprador Auth desde WhatsApp

**Fecha:** 12/11/2026. **Autorización:** «Avanza y registrá» = desarrollo y pruebas, **NO publicación**. Vinculado al Issue [#794](https://github.com/ProtectorRudo/Cotironda/issues/794) y PR técnico #803, basado en #802. Entorno único `cotironda-piloto`, jamás producción.

## Problema comercial que resolvemos

El arquitecto envía el pedido por WhatsApp y debe poder consultar sus originales tras el cierre sin volver a cargar archivos ni contactar al proveedor. La interfaz original del comprador ya existe (MVP207: `signInWithOtp({phone, options:{shouldCreateUser:false,channel:'sms'}})`) y el backend valida identidad real (MVP191), sesión, vínculo WhatsApp y empresa antes de acceder al archivo. **Pero la base del piloto aún tiene 0 usuarios Supabase Auth**: por diseño, el OTP bloquea a compradores no registrados. El proceso de alta inicial debe ser interno, seguro, idempotente, sin nuevos pasos para el comprador antes de consultar el enlace.

## Estado REAL verificado mediante SELECT en Supabase

- **1 comprador elegible** ya tiene `participant_channels_mvp109.bound_at` y mensaje auténtico de `whapi_inbox` consistente en el mismo chat; su contacto SHA256 es único entre participantes activos. Además, existe pedido suyo. Se consultaron solamente conteos, no se leyó ni expuso el número, nonce, cifrado ni HMAC real.
- **2 proveedores consentidos para participar**, pero no implica consentimiento para entregar sus PDFs identificables. `original_share_consents_mvp178` vigentes **0**, política de originales `enabled=false`, `auth.users=0`.
- **1 ronda `prepared` vigente**: no duplicar ni adjudicar archivos ambiguos a esa ronda.
- Los originales M360, rutas de descarga y guardia M191 existen en código; **no están habilitados** para compradores reales. El control externo REST de `net` permanece sin verificar, bloqueo para activar cron M357.

## MVP361 — solución en desarrollo, sin crear usuarios

1. `supabase/piloto/mvp361_buyer_auth_bootstrap_check_only.sql`: RPC exclusivamente para `service_role` y sin mutaciones, que responde **solo booleano** ante SHA256 del teléfono normalizado al formato WhatsApp. Se exige comprador activo con consentimiento de participación, canal vinculado, mensaje entrante exacto, solicitud real, unicidad del contacto en comprador/proveedor, y ausencia de Auth anterior con ese mismo teléfono. Nunca devuelve nombres, archivos, chats, teléfonos ni claves. `SECURITY DEFINER SET search_path=''`, `REVOKE ... PUBLIC,anon,authenticated`.
2. `scripts/piloto/bootstrap-buyer-auth-mvp361.mjs`: herramienta SOLO servidor/operador, con hostname fijo del proyecto piloto, HTTPS y clave admin JWT con rol `service_role`. `dry-run` (por defecto) hace **0 llamadas HTTP**; `--check` hace SOLO RPC de identidad; `--apply` requiere **una segunda autorización explícita y una variable de entorno exacta**, luego ejecuta `POST /auth/v1/admin/users` con `{phone,phone_confirm:false}`. **No envía OTP/SMS, no asigna teléfono confirmado ni saltea la verificación**. La UI M207 enviará el OTP solo cuando el comprador solicite ingresar, luego de configurar proveedor SMS, límites, CAPTCHA, etc.
3. El CLI nunca muestra número, usuario, SHA, respuesta HTTP cruda, token ni secreto. Un `timeout` tras petición de alta deja estado `MANUAL_REVIEW_NETWORK_UNCERTAIN`, nunca reintenta creación a ciegas. Un duplicado Auth bloquea el preflight SQL.
4. Pruebas Node con `fetch` simulado y PostgreSQL17 ficticio, con ROLLBACK, sin llamadas a Auth, SMS, WhatsApp ni DB real.

**Privacidad:** el token de seguimiento de WhatsApp NO autoriza descargar originales. La identidad del comprador se valida por OTP + sesión real + teléfono coincidente con contacto verificado, no por claims editables `user_metadata`. Para autorizar originales sigue haciendo falta consentimiento prospectivo del proveedor por la política versionada y autenticación corporativa. No inventar consentimiento por la mera existencia de un proveedor en Cotironda.

## Operación FUTURA (solo tras «Publicalo» al PILOTO)

1. Verificar que la función SQL se instale con `service_role` como único ejecutor y la misma política en 1 comprador/2 proveedores. Volver a revisar hashes de funciones y que se mantiene la ronda `prepared` sin nuevos despachos.
2. Configurar Supabase Auth **Phone provider + SMS provider real o teléfonos de prueba no productivos** y límites, CAPTCHA, verificación OTP y costos. Supabase Phone OTP requiere un proveedor compatible; **Whapi no sustituye a Twilio/otro SMS**.
3. Configurar secretos **solo en entorno seguro de operador**, nunca en GitHub, navegador o logs:
   - `COTIRONDA_PILOT_SUPABASE_URL`: URL fija del piloto.
   - `COTIRONDA_PILOT_BUYER_E164`: teléfono E.164 correspondiente al canal WhatsApp ya vinculado (el comprador lo informa a Cotironda por canal seguro, sin exponerlo en el repo).
   - `COTIRONDA_PILOT_AUTH_ADMIN_KEY`: JWT administrador `service_role` del piloto, solo para operador.
   - `COTIRONDA_PILOT_AUTH_APPROVAL`: valor exacto de autorización operativa definido en el script.
4. Ejecutar el mismo script con **sin argumentos** (solo dry-run), después `--check` (**NO escribe**) y finalmente `--apply` **SOLO con publicación autorizada**, si RPC confirma y el proveedor SMS/OTP está configurado. Tras alta, comprobar que `auth.users.phone_confirmed_at` permanece NULL hasta que el comprador verifique SMS en la interfaz; no utilizar `phone_confirm:true` por comodidad.
5. No usar cuentas compartidas ni Auth de desarrollo para el piloto. Mantener desactivadas descargas hasta asociar ambos originales, obtener consentimiento de originales y cerrar la ronda.
6. Si Auth admin devuelve conflicto, datos inesperados, timeout o código no confirmado, STOP y auditar, no reintentar a ciegas.

**Requisitos de consentimiento:** el usuario quiere cero confirmaciones adicionales por presupuesto, decisión comercial válida. La solución objetivo es términos versionados que el proveedor acepte **una sola vez al incorporarse** y que permitan compartir sus originales identificables exclusivamente en rondas futuras dentro de ese alcance, con revocación. **MVP178 hoy requiere prueba de consentimiento por ronda/mensaje anterior a la invitación**; por eso la sustitución por consentimiento único de alta **aún no está programada ni aprobada como migración**. No dar permiso retroactivo a los presupuestos ya recibidos.

## Pruebas y criterios de aceptación

- [ ] CI Node: hostname exacto, teléfono E.164, key service_role, nunca escribir sin bandera `--apply` y aprobación operativa, `--check` sin crear, POST solo tras prueba positiva, `phone_confirm:false`, errores/timeout fail-closed, respuestas sin PII.
- [ ] CI PostgreSQL17: comprador verificado pasa; comprador sin mensaje, revocado, sin consentimiento de participación, identidad duplicada en proveedor, Auth previo, teléfono inválido, comprador sin ronda y ACL anon/authenticated bloqueados. ROLLBACK con esquemas y función retirados.
- [ ] CI general Next.js/PostgREST/sitio/aislamiento verde en SHA exacto.
- [ ] **No ejecutar** creación Auth, SMS, cron, WhatsApp ni SQL live hasta autorización `Publicalo`.
- [ ] Preparar proveedores consentimiento prospectivo sin trabajo por cotización; prueba comprador real con SMS OTP; política de originales OFF hasta completar.
- [ ] P0–P5 sin cerrar: 2 documentos vinculados, navegador, autenticación, cierre, descargas completas y prueba E2E.

**Próxima acción única:** certificar CI del PR #803, después preparar preflight de configuración Auth SMS/costos y consentimiento único prospectivo antes de cualquier alta real. No crear segunda ronda `prepared`. El resultado del [Issue maestro #794](https://github.com/ProtectorRudo/Cotironda/issues/794) y [plan maestro/estado PR #796](https://github.com/ProtectorRudo/Cotironda/pull/796) es la fuente de verdad entre conversaciones.

Referencias Supabase: <https://supabase.com/docs/guides/auth/phone-login> y <https://supabase.com/docs/reference/javascript/auth-admin-createuser>.
