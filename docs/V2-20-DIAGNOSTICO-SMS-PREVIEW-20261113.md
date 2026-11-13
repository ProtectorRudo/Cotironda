# Cotironda V2-20 — diagnóstico de SMS desde Preview protegida

**Fecha:** 13/11/2026 · **Estado:** solo desarrollo y CI, no publicado · PR #836.

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

**Estado al redactar:** código+tests en rama, sin despliegue ni modificaciones de Vercel/Supabase, sin crear cuentas y sin SMS/WhatsApp. La Preview anterior `b591ab7` sigue siendo la desplegada.
