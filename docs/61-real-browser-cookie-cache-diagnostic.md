# 61 — Diagnóstico de cookies y caché de una sesión real en Preview protegida

**Etapa 01 · 30/10/2026 · Issue #92 / Issue #80 · PR pendiente · Solo desarrollo.**

## Riesgo y antecedente

Se verificó en [docs/53](53-https-ssr-loopback-ci.md) que Next 16 y `@supabase/ssr` emiten cookies de refresh con `Secure`, `SameSite=Lax`, `Path=/` y respuesta `private, no-store` al utilizar HTTPS de **loopback CI con Auth ficticio**. En [docs/59](59-preview-auth-real-mobile-login.md), el propietario demostró login, vista privada, logout global y denegación de `/alta` después del cierre en la **Preview Vercel auténtica con SSO**. El Issue #80 continúa abierto porque **no se inspeccionaron los atributos reales de cookies y caché de esa Preview HTTPS**.

Para que el asistente lea la respuesta de una Preview con SSO, el conector Vercel puede generar una share URL temporal que amplía el acceso al despliegue por 23 horas. **No se usará:** debilitaría el aislamiento que estamos auditando. Tampoco se extraerán sesiones, JWT ni passwords del navegador.

## Cambio de código: diagnóstico local con datos mínimos

Se agrega **`AuditoriaSeguridadSesion`** dentro de `/alta`, única y exclusivamente en el bloque de **solo ingreso Preview** posterior a `auth.getUser()` exitoso y a la validación del usuario confirmado/no anónimo. La vista comercial original sigue sin cambios. Botón: **«Comprobar cookies y caché»**.

- **Cookies:** si el navegador dispone de la API [CookieStore `getAll`](https://developer.mozilla.org/en-US/docs/Web/API/CookieStore/getAll) en HTTPS, la interfaz extrae **solamente** los campos `name`, `secure`, `sameSite`, `path`; nunca conserva `value`, `expires`, JWT ni refresh tokens. Filtra exclusivamente nombres de la cookie Supabase del proyecto `cotironda-dev` y sus fragmentos `.0`, `.1`, etc. Requiere **todos** los fragmentos `Secure=true`, `SameSite=Lax`, `Path=/`.
- **Caché:** `fetch('/alta')` por HTTPS y mismo origen, `credentials:'same-origin'`, `cache:'no-store'`. Valida URL final `/alta`, status HTTP 200 y sin redirecciones; requiere `Cache-Control` con `private` y `no-store`, sin `public` ni `s-maxage`. Rechaza `x-vercel-cache: HIT` si viene presente. No lee el body ni hace llamadas a la API empresarial.
- **Salida:** exclusivamente los estados **PASS**, **FAIL**, **INCONCLUSO** de cookie, caché y ruta privada. Sin correo, user id, session id, token, cookie value, IP, ni telemetría. No se escribe a ninguna tabla.
- **No engañar:** si el navegador no implementa CookieStore, no hay cookie visible, falta algún atributo o el usuario fue deslogueado, el control queda **INCONCLUSO**. Un atributo explícitamente inseguro da FAIL. La validación es un chequeo del contexto del usuario, **no una auditoría de todas las sesiones/usuarios**.

### Lo que deliberadamente NO asegura

**JavaScript del navegador no puede acceder a la cabecera `Set-Cookie` de Fetch**, que es un header de respuesta prohibido. No se pretende certificar esa cabecera ni el atributo `HttpOnly` mediante el botón. La biblioteca `@supabase/ssr` utiliza cookies para sincronizar sesión del cliente y el servidor; no afirmar `HttpOnly` sin evidencia. El botón tampoco comprueba los servidores de todos los clientes ni el valor de un JWT.

Una cookie con `SameSite=Strict` (potencialmente restrictiva) se marca FAIL porque **difiere del contrato explícito de Cotironda (`Lax`)**, no necesariamente porque sea globalmente menos segura.

## Protección de rama y ejecución

Se mantiene el deployment original funcionando en la rama `test/01-auth-only-preview`, con SSO de Vercel activado. La compuerta servidor de Auth admite **solo dos referencias exactas**:
1. `test/01-auth-only-preview` (Preview anterior).
2. `security/01-browser-cookie-cache-audit` (Preview del diagnóstico).

Sigue exigiendo `VERCEL_ENV=preview`, flag privado de login-only, registro **explícitamente false**, Supabase dev exacto y sin clave `service_role`. Otras ramas, `main`, prefijos parecidos y production permanecen deshabilitados.

El botón no existe en `/ingresar`, en producción, en páginas anónimas ni en flujo comercial de altas. Su aparición solo tras `auth.getUser()` se verifica mediante tests de código y HTTPS/SSR real de loopback. El `NEXT_PUBLIC` no contiene ninguna nueva bandera de seguridad.

## Plan de verificación y trazabilidad

- **Pruebas unitarias adversariales:** `tests/unit/browser-cookie-cache-audit.test.mjs` — cookies completas, inseguras, parciales, de otro tenant, CookieStore ausente, caché pública, redirect, HTTP status incorrecto, Vercel HIT, prioridad de FAIL, UI sin lectura/telemetría y guard de rama exacta.
- **GitHub CI Portal:** compilar desde cero ambos modos de Preview y ejecutar HTTPS real con Next 16 + SSR, certificado CA verificado y Auth ficticio sin internet; exigir que el HTML de `/alta` privada incluya el diagnóstico y que `/ingresar` no lo tenga. El flujo no crea cuentas ni empresas reales.
- **Preview remota (si se despliega):** comprobar ID del proyecto `cotironda-portal-dev`, rama exacta, commit, Vercel SSO `all`, `target=null`, logs del build `next build` y `COTIRONDA_AUTH_PREVIEW_BRANCH_GUARD=ALLOW`. Ningún enlace temporal que omita SSO.
- **Prueba humana pendiente:** propietario abre la URL protegida, ingresa con la **cuenta de ensayo existente** y toca «Comprobar cookies y caché». Comparte únicamente los tres estados PASS/FAIL/INCONCLUSO; **no** es necesario mostrar DevTools ni copiar secretos.

**El Issue #80 NO se cierra hasta recibir los estados reales del navegador y distinguir limitaciones observables.** El remoto HTTP429, política de signup de Supabase, protección de contraseñas filtradas y backup offsite real siguen pendientes para Etapa 01.

## Fuentes verificables

- [Supabase SSR y caché / CDN](https://supabase.com/docs/guides/auth/server-side/advanced-guide): deshabilitar ISR y caches compartidas si hay refresco con Set-Cookie.
- [MDN CookieStore.getAll](https://developer.mozilla.org/en-US/docs/Web/API/CookieStore/getAll): atributos y disponibilidad solo en contextos seguros de navegadores compatibles.
- `apps/portal/proxy.ts`: `Cache-Control: private, no-store`, cookie Secure cuando `NODE_ENV=production`, no confiar en X-Forwarded headers arbitrarios.
- `apps/portal/app/alta/page.tsx`: `dynamic='force-dynamic'` y protección con `auth.getUser()`.

**No se realiza navegación privilegiada con credenciales, ni despliegue de producción, ni modificación de Auth/SQL remoto.**

## Resultado de la primera verificación y bloqueo real de Vercel (30/10/2026)

El **código** se compiló y probó en GitHub Actions, pero el despliegue solicitado de una **nueva Preview** de la rama `security/01-browser-cookie-cache-audit` **NO se creó**. La API de Vercel respondió HTTP **402 `payment_required`**, con código específico **`api-deployments-free-per-day`**: límite diario de más de 100 despliegues para el plan actual, indicación `retryAfter=86400` segundos. No fue un error de Next.js ni de las pruebas.

- **No** se utilizó un bypass de SSO, share link ni un upgrade de plan. Tampoco se creó un proyecto alternativo.
- **No** hay URL de Preview nueva disponible para probar el botón con una cuenta real. La Preview anterior continúa siendo la última versión de pruebas auténticamente accesible; no contiene este botón.
- El conector sugirió CLI como fallback, pero no hay sesión autenticada ni un proyecto Vercel vinculado a la CLI en el entorno de trabajo actual. No se pidieron credenciales ni se reintentó el mismo endpoint agotando cuota.
- Al reanudarse los despliegues, el paso permitido es **únicamente** crear una Preview del proyecto `cotironda-portal-dev` con la **rama exacta y commit GitHub verificado**, `target=null`, SSO `all`, guard `ALLOW`, y comparar el build Next real con el CI.
- Hasta entonces, **Issue #80 y #92 siguen abiertos** para la evidencia HTTPS real. La CI con Auth sintético no equivale a haber observado cookies de una sesión verdadera desde el navegador.

### Validación inicial en GitHub (antes del bloqueo de Vercel)

El HEAD de código `084e2d571f3ebc5b9f33d8176dd77a731cbf82dd` aprobó **217/217 unitarias y cinco workflows**: Next.js con build/TypeScript y HTTPS loopback de 3 escenarios, PG17 y recovery, PostgREST HTTP con JWT CI y sitio. La primera compilación detectó una intersección de tipos de CookieStore en TypeScript; se corrigió explícitamente antes de estos PASS.

**No anunciar estado READY ni URL para esta versión hasta que Vercel confirme un deployment real.**
