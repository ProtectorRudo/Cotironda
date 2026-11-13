# Cotironda V2 — D016: acceso desde WhatsApp, sin SMS ni contraseñas

**Decisión funcional APROBADA por el propietario: 13/11/2026.** Sustituye el requisito de **SMS OTP** de los borradores V2-07/V2-16/V2-18/V2-19/V2-20 y del antiguo plan, **solo para el acceso del comprador al portal**. Es **dirección aprobada, todavía no implementada ni desplegada**. No revoca los permisos por empresa, consentimiento prospectivo ni custodia del original.

## 1. Contrato visible — cero pasos extra

1. El comprador ya participa por su WhatsApp conocido y envía su pedido de materiales normalmente.
2. Cotironda, por el **mismo chat autenticado Whapi**, envía un enlace privado al seguimiento de su pedido. Se evita un WhatsApp extra por cada respuesta; un enlace nuevo se entrega si el comprador lo solicita o el anterior vence.
3. El comprador **toca el enlace** y entra en el portal; no ingresa teléfono, e-mail, OTP, contraseña, código, ni se registra.
4. Durante la ronda ve **solo los negocios que respondieron**, con nombre, original y análisis individual. Al cumplirse dos días hábiles ve el análisis general. La IA no expone proveedores que no contestaron.
5. Si pierde el enlace o vence, escribe por el mismo WhatsApp para recibir otro. Si su sesión de navegador sigue autorizada, no se le vuelve a pedir acceso.

**El enlace NO es un enlace público a los documentos**, sino una credencial efímera para **crear una sesión autenticada**. La autorización final de la sesión, empresa y ronda sigue siendo exigida por servidor/SQL **en cada petición y cada descarga**.

## 2. Contrato de seguridad no negociable

- Emisor **servidor Whapi autenticado** y comprador elegible vinculados por identidad de empresa + huella única del chat + prueba de un mensaje entrante; nunca aceptar un número escrito en un formulario ni un parámetro `buyer_key` del navegador como identidad.
- Token aleatorio criptográficamente seguro, **10 minutos de vigencia**, **un solo canje transaccional** (dos clicks concurrentes: uno válido como máximo), alcance a comprador/ronda/propósito concretos; almacenar solo hash/HMAC del token, nunca token plano en BD, logs, CI ni análisis IA.
- El enlace no se consume en GET o vista previa de WhatsApp, que puede ser inspeccionada por bots. Redimir mediante una acción POST controlada; proteger fugas en Referer, analytics, cachés, historial y logs; preferir token en fragmento `#` y eliminarlo del navegador antes de navegar.
- **HTTPS obligatorio.** Sesión válida y revocable; si se usan cookies, `HttpOnly; Secure; SameSite=Lax`, CSRF en acciones de escritura y protección frente a fijación de sesión. Nada de access token en localStorage ni URL de originales.
- Revocación por baja del comprador, pérdida de consentimiento, cambio o duplicidad de canal Whapi, cambio de empresa o cierre de acceso. Rotar el token al regenerarlo. Limitar generación, intentos, reenvíos y costos WhatsApp.
- Al consultar: comprobar sesión viva, empresa propietaria, ronda exacta, proveedor respondedor identificado y consentimiento vigente sobre original. Revalidar antes/después de recuperar bytes, SHA y auditoría obligatoria. Nunca exponer service_role al browser.
- **Advertencia explícita:** un enlace de acceso es una credencial de posesión; quien lo reciba por reenvío y lo abra primero podría canjearlo. El uso único y plazo corto mitigan, pero **no hacen imposible esa transferencia**. Incorporar revocación y limitar duración de sesión; evaluar controles de riesgo sin agregar fricción rutinaria al comprador.
- Despliegue solo PILOTO Preview con SSO y flags OFF hasta pruebas. Sin SMS, Twilio, SMTP del comprador ni fake JWT. La configuración insegura actual de GoTrue (`disable_signup=false`) **no deja de ser un hallazgo** y debe cerrarse antes de habilitar sesiones comerciales.

## 3. Decisión técnica: conservar Auth real, no esquivar las protecciones

**Candidato preferido a prototipar:** aprovechar Supabase Auth **`auth.admin.generateLink({type:'magiclink', email: ...})` del servidor** para crear un token de autenticación legítimo sin enviar email; entregar la credencial mediante Whapi al chat verificado, con una capa propia de canje único/TTL. El comprador nunca ve ni escribe el alias interno. Verificar empíricamente el caso de alta por operador con registro público cerrado y el posterior canje (`verifyOtp`/sesión auténtica), sin asumir que generar un link significa abrir una sesión.

**Limitación encontrada en código/SQL real del piloto:**
- `src/server/v2-03-respuestas-http.ts`, `src/server/originales-piloto-http-runtime.ts` y RPC `cotironda_piloto_v2_responders_private` **exigen hoy `phone_confirmed_at` y huella basada en `auth.users.phone`**; no funcionarán con una simple URL.
- Antes del E2E, adaptar el vínculo a prueba **Whapi acreditada + Auth real vivo + asociación única por comprador**, sin marcar ficticiamente `phone_confirmed_at` como si hubiera llegado un SMS. Usar tabla/RPC privada versionada, pruebas de RLS, controles de revocación y sin acceso público. Mantener JWT validado mediante `getUser(jwt)` y `auth.sessions` vivo.
- Si la vía de enlace administrativo no permite canje estricto sin SMTP ni registro abierto para cuentas existentes, documentar el resultado de pruebas y elegir sesión privada de servidor con igual nivel de autorización. **Nunca aceptar un JWT propio no emitido/validado por GoTrue en el guard existente.**
- No reescribir Whapi v76 instalado ni los mecanismos antiguos de seguimiento; preparar adaptador aislado y candidate SQL con switches OFF hasta publicación expresamente autorizada.

Fuentes oficiales consultadas (sin desplegar):
- [Supabase Auth Admin generateLink](https://supabase.com/docs/reference/javascript/auth-admin-generatelink) — genera enlaces/OTP para entrega personalizada.
- [Supabase Passwordless email](https://supabase.com/docs/guides/auth/auth-email-passwordless) — enlaces de uso único y configuración de Auth.
- [Supabase verifyOtp](https://supabase.com/docs/reference/javascript/auth-verifyotp) — redención de token y sesión.

## 4. Checklist de aceptación para el PILOTO

- [ ] Prototipo offline y pruebas HTTP: no se envía SMS/email, no se abre registro, no requiere formulario, tokens no aparecen en logs.
- [ ] Criptografía y concurrencia: token faltante, alterado, vencido, revocado, previsualizado, duplicado/concurrente; canje válido una vez.
- [ ] Identidad: chat falsificado, proveedor que pide enlace de comprador, buyer no autorizado, múltiples canales o empresas, ronda ajena; todos denegados.
- [ ] Sesión real: primer comprador ya verificado en WhatsApp consigue sesión Auth de verdad; logout/revocación/expiración funcionan; ninguna concesión basada solo en URL.
- [ ] Datos: 0/1/2 presupuestos; solo negocios que contestaron; PDF/Excel/texto original exacto y análisis breve, sin invitados no respondedores.
- [ ] Descarga: pruebas de empresa cruzada, token antiguo, original SHA alterado, permiso proveedor revocado y cambio de sesión durante I/O.
- [ ] PG17 ROLLBACK, Node, Next.js, Deno/Whapi v76 y pruebas E2E navegador contra Preview; salida documentada en Issue #794/PR de desarrollo.
- [ ] Solo con `Publicalo` para PILOTO: configurar entorno seguro, instalar candidato migratorio con gates OFF, habilitar prueba real de 1 comprador y 2 proveedores; no tocar producción ni enviar mensajes sin esa autorización.

## 5. Estado de implementación y continuidad

**Al registrar D016:** existe una Preview V2 anterior protegida por SSO y una rama de desarrollo PR #836 con **12/12 checks CI PASS** en SHA `8fdf2d0e72a4a412b1bcc24f0ee150f6665b35da`. Esa rama contiene acceso **SMS anterior**, no el nuevo WhatsApp-login; no declararlo migrado. Supabase piloto tiene `auth.users=0` y `v2_original_share_policy=false` en la última lectura. No hay sesión WhatsApp-to-portal comprobada.

**Siguiente trabajo único de desarrollo:** construir y probar un adaptador **WhatsApp → token efímero → sesión Auth real** con canje único, sin modificar publicación/producción ni el webhook Whapi v76. Luego adaptar, en forma atómica y auditada, los guards HTTP y RPC que hoy requieren `phone_confirmed_at`. Recién entonces primera prueba E2E del arquitecto y dos proveedores.

**Precedencia:** D016 sustituye los pasos de SMS y la intervención de Phone/Twilio como **requisitos del comprador**. No cambia D013 matching por producto, originales fieles, V2 consentimientos, dos días hábiles, ni reglas de revelación. Los documentos que siguen diciendo «activar SMS» son históricos/candidatos y se interpretan a la luz de esta decisión.
