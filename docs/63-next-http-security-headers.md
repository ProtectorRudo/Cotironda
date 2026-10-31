# 63 — Cabeceras HTTP anti-clickjacking y privacidad del portal Next

**Etapa 01 · 30/10/2026 · Issue #96 · PR en borrador · rama `security/01-next-http-security-headers`**

## Hallazgo

En la rama predecesora, `apps/portal/next.config.ts` únicamente tenía `poweredByHeader:false`, mientras que `apps/portal/proxy.ts` ya enviaba `Cache-Control:private,no-store` en las rutas de Auth. Faltaba un contrato explícito de cabeceras de defensa en profundidad para la pantalla de ingreso y la sesión privada, especialmente contra **clickjacking** (incrustar un login dentro de un iframe engañoso) y pérdida de privacidad de URL en referencias externas.

La página `/alta` ya exige `auth.getUser()` real, las sesiones revocadas se filtran en RLS y el registro comercial permanece desactivado por Supabase/portal. Los nuevos headers no sustituyen estos controles.

## Solución elegida: protección CSP parcial, compatible con Next

Se incorpora `async headers()` de la configuración oficial de Next.js 16, aplicado a `/:path*` del **portal de desarrollo**, sin alterar el sitio demostrativo `cotironda`:

| Cabecera | Valor | Alcance |
|---|---|---|
| `X-Frame-Options` | `DENY` | Impide iframes en navegadores que usan la protección clásica |
| `Content-Security-Policy` | `frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'` | Anticlickjacking moderno, evita `base` y objetos externos, y limita envío de formularios a este origen |
| `X-Content-Type-Options` | `nosniff` | Reduce interpretación por MIME equivocada |
| `Referrer-Policy` | `no-referrer` | No exponer rutas/parámetros del portal en cabecera Referer |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=()` | El portal de identidad actual no necesita cámara, micrófono, ubicación ni Payment API |
| `X-Robots-Tag` | `noindex, nofollow, noarchive` | Evita indexación del portal privado de desarrollo |

### Decisiones deliberadas

- **No se impone `default-src`, `script-src` ni `style-src` improvisados.** El App Router de Next 16 incluye scripts para hidratar la interfaz y puede requerir nonce por petición; una directiva de scripts restrictiva sin adaptar SSR puede cortar el login. Esta CSP **no constituye una protección integral contra XSS** y no se anuncia como tal. Abrir un cambio separado para diseño de nonce dinámico y verificación de librerías/estilos.
- **No se establece `Strict-Transport-Security` con `includeSubDomains; preload`** porque el dominio comercial y los subdominios no fueron auditados ni publicados. El Vercel Preview ya sirve HTTPS y un encabezado de HSTS mal configurado puede afectar dominios futuros. Revaluar con DNS y certificado del dominio definitivo.
- **No se fija `Cache-Control` global para recursos estáticos.** La protección `private,no-store` se mantiene en el Proxy y rutas Auth; Next debe conservar caché de assets inmutables por hash para no afectar rendimiento.
- **No se añade `Access-Control-Allow-Origin: *`** ni se abren CORS; Supabase Auth se utiliza desde su propio endpoint con la clave pública del proyecto.
- La `Permissions-Policy` debe revisarse antes de implementar cámara de documentos o geolocalización de proveedores, funcionalidades que **no existen en esta Etapa 01**.

## Prueba automatizada, no solo inspección de código

Se amplió `apps/portal/scripts/smoke-https-ssr.mjs`, que usa **Next 16 compilado en HTTPS real sobre loopback con certificado temporal y CA verificada**, con la librería `@supabase/ssr` auténtica y **Auth totalmente ficticio/interceptado**. Ahora exige los headers descritos en:

- Página inicial pública `/`, formulario `/ingresar` y acceso anónimo `/alta` redirigido.
- Página `/alta` de usuario de CI autenticado con token vencido que se **refresca**, más la respuesta `Set-Cookie` renovada.
- Segundo GET `/alta` con cookie actual y nuevo acceso sin cookie.
- Ambos intentos POST al registro empresarial `/api/organizaciones` denegados por Origin, cuota o bandera de registro.

Si una ruta pierde `X-Frame-Options`, CSP, no-referrer, noindex o la política de permisos, **el test falla**. La prueba conserva además el criterio histórico: `Set-Cookie` seguro `Secure; SameSite=Lax; Path=/`, aislamiento de otro visitante, y `Cache-Control: private,no-store` en ruta privada. Nunca entrega contraseña real ni JWT Auth a Next CI.

`tests/unit/http-security-headers.test.mjs` agrega pruebas de estructura, directivas permitidas, ausencia de HSTS/CDN/CORS ambiguos, exclusión de script-src sin nonce y presencia de aserciones HTTPS para todas las rutas relevantes.

### Qué NO queda certificado

- Los headers de esta rama **todavía no se observaron en Vercel Preview remoto**, porque sus builds fueron bloqueados recientemente por `402 api-deployments-free-per-day`. Una CI HTTPS loopback con autenticación sintética **no sustituye** un GET de la Preview SSO con sesión auténtica.
- La CSP parcial no previene XSS por sí misma.
- La opción de autorregistro directo Supabase Auth (`disable_signup`) continúa pendiente de lectura real; ver docs/62.
- Rate limit remoto 429, backup cifrado de base real y Storage, protección de contraseñas filtradas y consolidación de PRs siguen abiertos en Etapa 01.

## Seguridad operativa

**Sin migraciones SQL, cambios de Supabase, usuarios, empresas, Archivos, DNS, producción ni plan pago.** Este PR solo cambia la respuesta del portal Next y sus pruebas. Requiere CI verde, revisión de código y despliegue **solo** en una Preview SSO de una rama exacta aprobada cuando haya cuota.

## Referencias técnicas

- [Next.js — `next.config.js headers()`](https://nextjs.org/docs/app/api-reference/config/next-config-js/headers)
- [MDN — CSP y `frame-ancestors 'none'`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP#clickjacking_protection)
- [MDN — Referrer-Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Referrer-Policy)
- [Supabase — Advanced SSR guide](https://supabase.com/docs/guides/auth/server-side/advanced-guide)

**Resultado final:** registrar valores de tests y commit solamente después de obtener CI confirmada, no por haber creado archivos o un PR.
