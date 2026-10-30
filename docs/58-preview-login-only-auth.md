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
