# Cotironda V2-20 — diagnóstico de SMS desde Preview protegida

**Fecha:** 13/11/2026 · **Estado:** diagnóstico base publicado en Preview `06e1700`; ampliación por campo solo en rama (sin publicar) · PR #836.

## Objetivo operativo

Dejar de adivinar por qué el primer arquitecto no puede recibir el código. Ya existen 1 comprador WhatsApp comprobado y 0 usuarios Auth en PILOTO. Antes de crear el usuario, debemos distinguir si la configuración **real de Supabase Auth** tiene habilitado el ingreso por teléfono, registro cerrado, autoconfirmación desactivada y proveedor SMS real.

El proveedor oficial GoTrue anuncia estos campos en `GET /auth/v1/settings`, ver [`internal/api/settings.go`](https://github.com/supabase/auth/blob/master/internal/api/settings.go). Esto **no demuestra entrega SMS**: solo permite un preflight seguro y reproducible de la configuración.

## Implementación

Se agrega un endpoint GET exclusivamente en la Preview protegida por SSO de `cotironda-portal-dev`:

```text
GET /api/piloto/v2/diagnostico-sms
```

El contrato `src/server/v2-20-diagnostico-sms-http.ts` bloquea ANTES de hacer solicitudes de red si cualquiera de estas precondiciones falla:

- `VERCEL_ENV=preview`, `COTIRONDA_AUTH_PREVIEW_ENABLED=true`.
- `COTIRONDA_REGISTRATION_ENABLED=false` (registro cerrado).
- URLs pública y servidor exactamente `https://ilggkalaafhtiysyzlmg.supabase.co`.
- Clave publicable moderna del piloto presente **solo desde** `NEXT_PUBLIC_COTIRONDA_PILOT_SUPABASE_PUBLISHABLE_KEY`. No necesita `sb_secret_*`.
- `COTIRONDA_PILOT_V2_RESPONDERS_RELEASE_SHA` coincide con el SHA real `VERCEL_GIT_COMMIT_SHA`, de 40 caracteres hexadecimales.

**A propósito NO requiere `COTIRONDA_PILOT_V2_AUTH_PAGE_ENABLED=true` ni `RESPONDERS_ENABLED=true`.** Necesitamos diagnosticar que SMS funciona sin abrir todavía ni el login ni las ofertas.

El servidor entonces llama a la función de lectura `comprobarAuthPublicaPilotoV2` desarrollada en V2-18; ésta hace **solo GET** a GoTrue con clave PUBLICABLE, sin cookies de usuario, sin JWT de comprador, sin service-role, sin POST ni envío de SMS. Recibe JSON limitado (8 KiB) con timeout de 7 s. Nunca imprime el JSON original.

Devuelve exclusivamente códigos seguros y banderas, por ejemplo:

```json
{
 "state":"BLOCKED",
 "code":"sms_o_registro_go_true_no_seguros",
 "serviceAccessible":true,
 "signupClosed":true,
 "phoneConfigured":false,
 "smsConfirmedByUser":false,
 "writesPerformed":false
}
```

La respuesta usa `Cache-Control: private,no-store`, `X-Robots-Tag: noindex`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`. Sin variables mínimas, status HTTP 503 (no hacer GET a Supabase); con settings observadas, HTTP 200 y `state=BLOCKED` o `SETTINGS_READY_REQUIRES_REAL_SMS`. Sólo GET sin querystrings.

**Importante:** el control de acceso humano a esta ruta corresponde al SSO **ALL** de Vercel; su estado debe verificarse por separado antes de cada publicación. El endpoint no expone datos privados, pero no reemplaza SSO ni la autorización de una sesión de compra.

## Criterios de aceptación y regresión

Test `tests/unit/v2-20-diagnostico-sms-http.test.mjs`:
- Página SMS y cotizaciones pueden estar apagadas, mientras el preflight público responde.
- Producción, registro abierto, URL errónea, clave ausente, SHA diferente o SSO flag falso bloquean SIN requests.
- POST, PATCH, parámetros desconocidos bloquean SIN requests.
- Configuración teléfono OFF, autoconfirm ON, signup abierto o SMS no configurado retornan `BLOCKED`.
- Ningún error o resultado puede serializar credenciales, destinatarios, sesiones, datos de proveedor o habilitar SMS.
- Se comprueba ruta Next SSR sin caché y sin POST/secretos.

## Para validar en PILOTO real (solo próxima orden Publicalo)

1. Configurar **clave publicable moderna ya existente** en la variable `NEXT_PUBLIC_COTIRONDA_PILOT_SUPABASE_PUBLISHABLE_KEY` del proyecto exacto `cotironda-portal-dev` **Preview** (no desarrollo ni producción). Sin service-role/AES.
2. Fijar el release SHA a la versión V2-20 efectivamente publicada. Dejar `COTIRONDA_PILOT_V2_AUTH_PAGE_ENABLED=false`, `RESPONDERS/ANALYSIS/PDF/TEXT=false`, registro cerrado y Vercel SSO ALL.
3. Desplegar Preview desde SHA exacto y leer `/api/piloto/v2/diagnostico-sms` con acceso autorizado SSO. Si bloquea, corregir **el proveedor real de Supabase**; no intentar crear usuarios.
4. Cuando informe configuración compatible, solo con alta autorizada del comprador real y SMS en funcionamiento, abrir la página OTP V2-19 con `AUTH_PAGE_ENABLED=true`. Completar `verifyOtp` con el código **real**. Sólo después tratar consentimientos V2 y presupuestos comerciales.

**Estado confirmado en la primera publicación:** Preview protegida SSO ALL `dpl_9d7DghjFZpP9Lo8hW4JtouUPiZnh`, commit `06e1700` READY; cuatro migraciones V2 instaladas con políticas OFF. El endpoint base respondía detrás de SSO: `serviceAccessible=true`, `signupClosed=false`, `phoneConfigured=false`, `writesPerformed=false`. Es **configuración insegura/insuficiente**, no fallo de la Preview. `auth.users=0`; no se envió SMS.

## Ampliación de diagnóstico por condición — SOLO DESARROLLO (13/11)

Se mantienen todos los bloqueos, el mismo endpoint GET, SSO y ninguna escritura. Se agrega desglose **exclusivamente booleano**:

- `signupClosed`: `disable_signup===true` en **Supabase GoTrue**, distinto del switch Vercel `COTIRONDA_REGISTRATION_ENABLED=false`.
- `phoneEnabled`: `external.phone===true` (método Phone de Supabase Auth habilitado).
- `autoConfirmDisabled`: `phone_autoconfirm===false` (la posesión del número debe demostrarse con OTP).
- `smsProviderReady`: `sms_provider` anuncia un identificador de proveedor no vacío, no simulado ni inválido; **no** valida credenciales, saldo, entrega o cobertura Argentina.
- `phoneConfigured`: agregado conservado por compatibilidad, **solo `true` cuando los cuatro anteriores son `true`**. Un `false` no debe interpretarse sin mirar los cuatro campos.

La inspección por campo **reutiliza el criterio V2-07** del alta segura. Ausencia de un dato, error HTTP, JSON inválido y respuestas inesperadas fallan cerrados. No se devuelven teléfonos, OTP, nombres de proveedor, credenciales, payload GoTrue completo ni información personal. Test de regresión V2-07/V2-18/V2-20 para cada caso individual.

**Pendiente:** el desglose nuevo requiere publicación de una Preview distinta **solo con «Publicalo»**. El despliegue vigente continúa entregando el formato anterior hasta entonces. La lectura real anterior solo confirma de manera independiente `signupClosed=false`; no permite afirmar todavía qué otras condiciones fallaron.

**Próxima acción operativa:** cerrar registros públicos **dentro de Supabase Auth**, configurar Phone y un SMS provider real con `phone_autoconfirm=false`, respetando presupuestos/rate limits. Las herramientas Supabase actualmente disponibles aquí no tienen operación para editar configuración de Auth; no intentar UPDATE SQL sobre `auth.config` ni producir un SMS de prueba sin autorización. Repetir GET desde SSO y, si queda `SETTINGS_READY_REQUIRES_REAL_SMS`, hacer un OTP real con el primer comprador verificado en una publicación separada. Mantener `AUTH_PAGE_ENABLED`, originales, análisis, envío y cierre OFF.

Fuentes: [GoTrue settings.go](https://github.com/supabase/auth/blob/master/internal/api/settings.go) y [Supabase Phone sign-in](https://supabase.com/docs/guides/auth/phone-login).
