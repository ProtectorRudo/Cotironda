# 57 — Auditoría de Vercel: distinguir demo pública y portal Next real

**30/10/2026 · Etapa 01 · Issue #86 · rama `audit/01-vercel-correct-portal-preview`.**

## Hallazgo que evitó un falso positivo

El deployment Vercel marcado `READY` de la rama `test/01-browser-real-auth-diagnostic` no correspondía al portal comercial, sino al proyecto **demo** `cotironda`, ID `prj_gcJ44fDzmkHuZCdggE9jHrTG9zm8`. Su proyecto tenía `framework=null`, entrypoint de build `.` y el log **`Build Completed in /vercel/output [46ms]`**. No ejecutó `next build`. **READY no equivale a aplicación Next correctamente compilada.**

El proyecto destinado a probar el portal de Auth es **`cotironda-portal-dev`**, ID `prj_d13rTHxJADvP2K9PcrM0CJQD9Zok`. Ya tenía `framework=nextjs` y un despliegue antiguo `target=production` del propio entorno *dev* (`dpl_9PD322umqvKJLqbkS5P6yPByEN92`, commit `14b4b9c`), que **no se alteró ni se promovió**.

La inspección del proyecto de pruebas confirmó **SSO habilitado para todos los despliegues**, y variables disponibles en los entornos preview/development (nombres, nunca sus valores): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `COTIRONDA_SUPABASE_PROJECT_REF`, `COTIRONDA_REGISTRATION_ENABLED`. **No se encontró `COTIRONDA_SITE_ORIGIN`**; `portalHabilitado` requiere ese origen válido, el proyecto Auth exacto, registro true y no-production. Por eso la mera compilación del portal no certifica ingreso real ni habilita registros. El sistema sigue bloqueando altas en SQL con `registration_settings.enabled=false`.

## Preview correcta del proyecto de desarrollo: creada y compilada

Se creó de forma deliberada **solo un deployment Preview**, sin especificar `target=production`, mediante Vercel conectado al repositorio GitHub existente:

| Campo | Verificado |
| --- | --- |
| Vercel project | `cotironda-portal-dev` |
| ID | `prj_d13rTHxJADvP2K9PcrM0CJQD9Zok` |
| Deployment ID | `dpl_EFo5qxksdsaUnUQn5cG7CEj87i3i` |
| URL | `https://cotironda-portal-duomm6gyt-protector-rudo-s-projects.vercel.app` |
| Commit GitHub desplegado | `31a8bd22fb501934398a4bdb5e133e01eb2acd73` |
| Branch | `audit/01-vercel-correct-portal-preview` |
| Target | `null` (Preview, **no** Production) |
| Framework | Next.js 16.4.3 |
| Protección | SSO `deploymentType=all` |
| Estado Vercel | `READY` |

**Evidencia directa de build:** eventos Vercel `Detected Next.js version: 16.4.3`, `> next build`, `Compiled successfully`, `Route (app)`, rutas `/`, `/ingresar`, `/alta`, `/api/organizaciones`, y `ƒ Proxy (Middleware)`. El build real tardó aproximadamente **12 segundos**. No es la demo de 46ms ni el portal antiguo de octubre.

El Preview está protegido por SSO. **No se probó navegador público ni cookies Auth genuinas en el Preview**; `READY` significa compilación y despliegue, no test funcional E2E.

## Guardia contra confundir READY de demo y portal

`src/server/vercel-preview-audit.ts` agrega un validador puro, sin red/secretos, que exige:
- ID y nombre exactos de `cotironda-portal-dev`, framework `nextjs`.
- `state=READY`, `target=null` (Preview), commit SHA exacto y rama de trabajo.
- SSO activado para Preview o todos los deployments.
- Eventos reales de compilación Next 16, salida `next build`, `Compiled successfully`, rutas de alta y API, y Proxy.

`tests/unit/vercel-preview-audit.test.mjs` incluye pruebas positivas y negativas: demo que marca READY, deployment production del proyecto dev, SHA sin revisar, rama main, Preview sin SSO, build vacío, rutas/Proxy faltantes y compilador Next fallido.

## Decisiones y pendientes

- [x] No modificar proyecto `cotironda` demo ni cambiar Framework/Root Directory de ese proyecto.
- [x] No sobrescribir el `target=production` antiguo de `cotironda-portal-dev`.
- [x] Nuevo Preview correcto con código de revisión, SSO y build real.
- [ ] Para probar **cookies reales en Next** falta un acceso Preview con Auth habilitado **sin** apertura de registro empresarial. Diseño recomendado: bandera independiente *solo de login en Preview* y Signup oculto, mientras la ruta de alta permanece deny-all. No poner `COTIRONDA_REGISTRATION_ENABLED=true` solo para mostrar login si la puerta SQL y el modelo comercial deben seguir cerrados.
- [ ] Falta prueba con sesión real en navegador del Preview SSO, retorno de logout y cookies Secure antes de cerrar Etapa 01.
- [ ] HTTP 429 remoto, aviso de protección de contraseñas filtradas y backups/restauración siguen pendientes.
- [ ] Todos los PRs siguen borradores, sin merge, dominio `cotironda.com` sin cambiar. Los proyectos Vercel `live=false`.

## Fuentes

- Vercel deployments `dpl_4R7KsWym77MvkK5vAMZ45Rq7WxjN` (demo) y `dpl_EFo5qxksdsaUnUQn5cG7CEj87i3i` (portal correcto), obtenidos mediante connector del equipo.
- [Configuración oficial Vercel para monorepos](https://vercel.com/docs/monorepos), donde cada app utiliza su Root Directory.
- `docs/38-dominio-hostinger-vercel.md`, `docs/56-auth-real-mobile-rls-proof.md`, `AGENTS.md`.
