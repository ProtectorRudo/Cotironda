# 35 — Auditoría SSR: cookies y renovación en Proxy de Next.js

**29/10/2026 · Etapa 01 · PR #43 en borrador. Sin despliegue.**

## Riesgo
Cotironda ya probó la emisión real de un JWT desde Auth en un navegador (ver `docs/34-auth-jwt-navegador-real.md`), pero el portal Next.js continuaba sin una prueba ejecutable del mecanismo SSR de cookies. Una respuesta con `Set-Cookie` cacheable podría difundir el token de un usuario a otro; cookies mal transmitidas pueden impedir la renovación o generar fallas intermitentes. Supabase advierte expresamente estos riesgos.

## Contrato automático añadido
`apps/portal/scripts/ssr-cookies-contract.mjs` utiliza versiones fijadas `@supabase/ssr@0.12.7`, `@supabase/supabase-js@2.118.0` y Next `16.4.3`, instaladas realmente por `npm ci` dentro del runner. Todos los intercambios Auth pasan por un `fetch` interceptado que **solo admite la URL fijada de cotironda-dev y /auth/v1/** y responde con datos totalmente ficticios. Nunca hay conexiones con Supabase remoto ni contraseñas auténticas.

1. Emite una sesión ficticia con `signInWithPassword` sobre el servidor falso y comprueba que el SDK escribe cookies persistentes bajo el prefijo exclusivo del proyecto.
2. Un **segundo cliente SSR** lee la sesión desde ese mismo contenedor de cookies.
3. `refreshSession` renueva access y refresh tokens contra el transporte falso; otro cliente vuelve a leer ambos valores rotados.
4. Una cookie jar independiente permanece anónima: ninguna sesión compartida.
5. Se importa **`proxy` real de `apps/portal/proxy.ts`** mediante Node ESM y se le pasa una `NextRequest` con la cookie del SDK; exige respuesta no cacheable.
6. Se coloca después una **sesión falsa caducada** en una cookie serializada por el SDK (sin usar una estructura inventada). El **mismo Proxy real** debe invocar refresh contra Auth falso, transmitir `Set-Cookie` con el token rotado, preservar `SameSite=Lax` y responder `Cache-Control: private, no-store`.
7. `getUser()` se prueba por separado y debe consultar `/auth/v1/user` del servidor falso. `getClaims()` del Proxy **NO demuestra por sí mismo vigencia actual de la sesión**.
8. Con bandera de registro apagada, Proxy responde no-store **sin una sola llamada al transporte de Auth**.
9. `signOut({scope:'global'})` se simula contra Auth falso; el SDK elimina cookies y otro cliente ya no conserva sesión.
10. La prueba falla si intenta otro origen, una RPC o cualquier llamada SQL, y no imprime tokens ni credenciales.

## Hallazgo de integración
Node ESM de la CI no resolvía el submódulo `next/server` sin extensión, aunque Next compilaba normalmente. Para importar el Proxy real en la prueba, el módulo usa `next/server.js` tanto en el script como en `proxy.ts`. Se mantuvo el mismo objeto `NextRequest`/`NextResponse`, y la CI de TypeScript y ambos builds Next pasaron.

El primer contrato asumía que `getClaims()` siempre llamaría al servidor Auth. Esa suposición **era incorrecta**: la documentación actual indica que `getClaims` verifica JWT, no consulta necesariamente Auth ni confirma que la sesión no haya sido revocada. Se corrigió el test: `getUser` debe consultar Auth en una prueba separada; Cotironda ya lo usa para el acceso protegido (`/alta` y `POST /api/organizaciones`), más la inspección de `auth.sessions` en SQL.

## Sobre cookies HttpOnly
No forzar `HttpOnly` en los cookies manejados por `@supabase/ssr`: la guía oficial advierte que el cliente de navegador necesita leer el refresh token para mantener sesión. El objetivo aquí es restringir acceso al dominio, HTTPS cuando corresponde, políticas SameSite adecuadas, mitigar XSS, validar permisos en el servidor y **jamás** cachear respuestas con `Set-Cookie`. La prueba local de `SameSite` no equivale a revisar un despliegue HTTPS real. Una política CSP rigurosa queda pendiente para la interfaz comercial.

## Evidencia, sin exageraciones
- **Ejecución real del SDK y Proxy con Auth local falso** en CI (no mocks de clases del SDK).
- Renovación automática de un JWT **ficticio** vencido dentro del Proxy con transmisión de cookies de respuesta y no-store.
- Prueba HTTP real anterior con registro deshabilitado y con bandera true + Vercel Production simulada.
- **No** se ejecutó un navegador contra el portal Next con login verdadero ni refresh remoto real; esos escenarios exigen entorno de Preview aislado y flujo controlado.
- **No** se probó que un access token auténtico ya emitido sea rechazado tras revocar la sesión, ni su expiración natural. Estas pruebas no deben eludir el flag SQL apagado ni atribuir su rechazo solo al flag.
- **No** se recibió ni guardó ningún secreto real ni se habilitó el registro en desarrollo o producción.

## Próximos pasos
1. Crear un E2E de cookies de **navegador** con origen HTTPS controlado, sin desplegar en Production y sin usar cuentas comerciales.
2. Diseñar un ensayo de revocación con JWT firmado pero sesión eliminada que mida específicamente el guard de `auth.sessions`; el SQL de registro sigue cerrado y puede enmascarar el rechazo, por lo que requiere fixture/contrato aislado.
3. Priorizar un test HTTP auténtico 429 de PostgREST solo cuando exista una forma transaccional segura de no crear organizaciones ni abrir el portal global.
4. Revisar CSP y WAF antes de invitar terceros.

**Referencias:** [PR #43](https://github.com/ProtectorRudo/Cotironda/pull/43), [Issue #42](https://github.com/ProtectorRudo/Cotironda/issues/42), [guía Supabase SSR avanzada](https://supabase.com/docs/guides/auth/server-side/advanced-guide), [creación de clientes SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client).
