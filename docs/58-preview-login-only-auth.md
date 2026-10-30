# 58 — Modo Preview de solo ingreso con registro comercial cerrado

**30/10/2026 · Etapa 01 · Issue #88 · rama test/01-auth-only-preview.**

## Problema

El portal Next compartía la misma compuerta para login y alta comercial. Esa compuerta exigía COTIRONDA_REGISTRATION_ENABLED=true y COTIRONDA_SITE_ORIGIN; en el Vercel de pruebas el registro está explícitamente apagado y no hay origen comercial configurado. Activar altas solo para comprobar cookies sería inseguro.

## Reglas del nuevo modo

La función autenticacionPreviewSoloIngreso únicamente puede habilitarse con:
- COTIRONDA_AUTH_PREVIEW_ENABLED=true, bandera de **servidor**, nunca NEXT_PUBLIC.
- VERCEL_ENV=preview, nunca production ni development.
- VERCEL_GIT_COMMIT_REF debe ser exactamente test/01-auth-only-preview. El proyecto Vercel aún no tiene un repositorio Git vinculado: no acepta variables limitadas por rama. El servidor debe **fallar cerrado** en cualquier otra rama, aunque la variable Preview exista. Si Vercel no expone la referencia, no se habilita login.
- COTIRONDA_REGISTRATION_ENABLED=false, literalmente. Si falta, no funciona.
- URL y referencia exactas de Supabase cotironda-dev con clave publishable; ningún service role ni contraseña SQL heredada.
- Si se configuró COTIRONDA_SITE_ORIGIN, debe ser un origen HTTPS seguro. No es necesario para una prueba sin escrituras empresariales.

La compuerta comercial portalHabilitado se conserva sin cambios, mientras que autenticacionPortalHabilitada permite renderizar login en el entorno aislado. Auth y RLS siguen imponiendo la autorización real.

## Comportamiento

- /ingresar: componente independiente AccesoPrueba, **solo signInWithPassword** de cuentas existentes; no tiene signUp ni botón Crear cuenta. El flujo comercial anterior sigue intacto fuera de esta modalidad.
- /alta sin sesión: redirección a login.
- /alta con sesión confirmada: verifica con Auth.getUser y muestra solo «Sesión de prueba activa» y logout global, **sin** FormularioEmpresa.
- /api/organizaciones POST: HTTP 503 registro_no_disponible **antes** de invocar Auth, cuotas, RPC o SQL, incluso con una cookie válida.
- proxy.ts: permite Auth solamente en páginas; para la API sigue usando únicamente la compuerta comercial.
- Production: modo login-only deshabilitado siempre por VERCEL_ENV, incluso si se copia la variable por error.

**Límite:** ocultar signUp en la interfaz no equivale a desactivar el endpoint de altas Auth de Supabase. Por eso este Preview debe permanecer detrás del SSO Vercel. No se presenta como onboarding público.

## CI de seguridad

- tests/unit/auth-only-preview.test.mjs: flags faltantes, producción, entorno ajeno, claves privadas, origen inválido, separación de signup, logout y formulario.
- smoke-https-ssr.mjs: tests existentes de TLS real con CA verificada y SDK Supabase SSR; en modo login-only debe probar cookie Secure, SameSite=Lax, no-store, renovación y reutilización, anónimo sin sesión, ausencia de «Crear cuenta» y formulario empresarial, y API 503.
- .github/workflows/portal-ci.yml: recompilar el Next en modo login-only con credenciales CI sintéticas y bandera comercial false. Los tests existentes de modo comercial y producción también permanecen.
- Todos los tests usan Auth ficticio interceptado; ninguno envía JWT o contraseñas reales desde CI.

## Preview autorizada de desarrollo

El proyecto Vercel correcto es cotironda-portal-dev, no cotironda (demo). Su protección SSO cubre todos los despliegues. Vercel rechazó una variable limitada por gitBranch debido a que este proyecto no tiene conexión Git configurada. Se define por tanto COTIRONDA_AUTH_PREVIEW_ENABLED=true **solo para target=preview** y se exige adicionalmente en el código que VERCEL_GIT_COMMIT_REF coincida con test/01-auth-only-preview. No se crea acceso fuera de esa rama. Se conserva COTIRONDA_REGISTRATION_ENABLED=false y SSO en todos los despliegues. Se requiere comprobar la disponibilidad de VERCEL_GIT_COMMIT_REF en el build real antes de afirmar Auth habilitado. No modificar el origen del dominio público ni production.

**Pendiente para cerrar el control:** que un usuario autorizado por Vercel SSO pruebe con cuenta dedicada el flujo Auth real de navegador, valide las cookies del Preview HTTPS y cierre sesión. No declarar E2E real de Next acreditado solo por CI.

No se modifica SQL, Supabase Auth, Storage, proyecto demo, GitHub main, DNS Hostinger ni Vercel production.

## Evidencia de configuración Vercel y despliegue real (30/10/2026)

**Observación inesperada:** al intentar crear una variable limitada por gitBranch, la API de Vercel respondió 400: el proyecto `cotironda-portal-dev` no tiene el repositorio Git conectado en la configuración del proyecto, aunque permite despliegues a partir de `gitSource` autenticado. **No se conectó el repositorio** para evitar activar despliegues automáticos o alterar la rama de producción del proyecto.

Alternativa segura y aplicada: la variable `COTIRONDA_AUTH_PREVIEW_ENABLED=true` se configuró **solo en target=preview** (jamás producción) y se añadió una segunda barrera, completamente en el servidor, que exige `VERCEL_GIT_COMMIT_REF==='test/01-auth-only-preview'`. Otras ramas, ambientes de producción y referencias de Git ausentes continúan bloqueados. No hay variables NEXT_PUBLIC nuevas para controlar la seguridad.

**Despliegue verificable:**

| Propiedad | Evidencia |
|---|---|
| Proyecto | `cotironda-portal-dev` (`prj_d13rTHxJADvP2K9PcrM0CJQD9Zok`) |
| Deployment | `dpl_6X6o3xzgP1aRDRVpjdUtQ9p36tyM` |
| URL | `https://cotironda-portal-e6u3p64sl-protector-rudo-s-projects.vercel.app` |
| Commit de código desplegado | `1c0c8b82dca326eed50339d68d4bd7ba1aa8d71b` |
| Rama | `test/01-auth-only-preview` |
| Target | `null` (Preview, no producción) |
| Vercel SSO | `enabled=true`, `deploymentType=all` |
| Framework | Next.js 16.4.3 |
| Build | `next build`, `Compiled successfully`, rutas Next/Proxy; `READY` |
| Guard de rama | **`COTIRONDA_AUTH_PREVIEW_BRANCH_GUARD=ALLOW`** (mensaje booleano, sin secretos) |
| Proyecto Vercel live | `false` |

Las variables preexistentes de Vercel `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` y `COTIRONDA_SUPABASE_PROJECT_REF` fueron contrastadas con la clave publishable de `cotironda-dev` por **igualdad booleana**, sin revelar valores; las tres coincidieron. `COTIRONDA_REGISTRATION_ENABLED` sigue **false** también en Vercel y SQL.

Auditoría SQL read-only posterior: **cero sesiones, empresas y objetos de Storage; cinco categorías semilla**. Vercel runtime logs de severidad error/fatal en esa Preview: **sin entradas en la ventana consultada**. Eso no prueba navegación ni login; la URL está protegida por SSO y no se ejecutaron requests de navegador a la app desde el asistente.

## CI final del código desplegado

Commit `1c0c8b82dca326eed50339d68d4bd7ba1aa8d71b`:
- **190/190 pruebas unitarias**: https://github.com/ProtectorRudo/Cotironda/actions/runs/41033887885
- **Portal Next, TLS real modo completo + login-only, cookies Secure y alta 503**: https://github.com/ProtectorRudo/Cotironda/actions/runs/41033887838
- PostgreSQL17 y RLS: https://github.com/ProtectorRudo/Cotironda/actions/runs/41033888078
- PostgREST HTTP con JWT ficticio CI: https://github.com/ProtectorRudo/Cotironda/actions/runs/41033887914
- Sitio sin regresiones: https://github.com/ProtectorRudo/Cotironda/actions/runs/41033887880

**Cinco workflows SUCCESS.** El test HTTPS de login-only comprobó la pantalla sin signup, SSR autenticado sin formulario empresarial, cookie renovada Secure/SameSite Lax, no-store, visitantes aislados y ambos orígenes de POST devolviendo 503.

**PENDIENTE:** abrir esta Preview con acceso Vercel SSO y comprobar login y logout genuinos con cuenta exclusiva de ensayo, cookies del navegador y comportamiento de /alta. No declarar E2E Next/Preview completado antes de esa evidencia. No deshabilitar SSO ni abrir la bandera de registro para facilitar el ensayo.
