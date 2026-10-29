# 31 — Control HTTP de cierre del portal en Production (Etapa 01)

**29/10/2026. PR #36 en borrador.** Validación local del binario Next.js de CI. No hay publicaciones, tokens, usuarios Auth ni cambios a Supabase/Vercel.

## Problema de cobertura
Hasta esta revisión, CI construía el portal con `COTIRONDA_REGISTRATION_ENABLED=false` y verificaba HTTP 503. Esa prueba **no** demostraba la defensa por `VERCEL_ENV=production` cuando alguien configuraba el flag de alta en true por error.

## Controles agregados
En `.github/workflows/portal-ci.yml`, después del build y smoke con flag false:

1. Borrar `.next` para descartar optimizaciones antiguas y **recompilar** el portal con `VERCEL_ENV=production`, `COTIRONDA_REGISTRATION_ENABLED=true`, referencia exacta de Cotironda dev, origen HTTPS de prueba y llave pública **ficticia** (`sb_publishable_ci_dummy_never_valid`). Se recompila para que las variables `NEXT_PUBLIC_*` sean las mismas en build y runtime.
2. Ejecutar `scripts/smoke-production-guard.mjs` con las mismas variables, sobre `next start` en puerto local 4174.
3. Control **positivo**: `portalHabilitado({...env,VERCEL_ENV:'preview'})===true`; la configuración es válida y no da un falso cierre por variables faltantes.
4. Control **negativo**: `portalHabilitado(env)===false` en production, exclusivamente por el guard de ambiente.
5. HTTP GET `/ingresar` y `/alta`: muestran avisos cerrados y no generan formularios.
6. HTTP POST `/api/organizaciones`: 503 `registro_no_disponible`, `cache-control=no-store`; GET al endpoint sigue 405.

## Seguridad y alcance
- El origen HTTPS `https://cotironda-ci.example` es reservado de prueba, no se resuelve ni se consulta remotamente. Next atiende sólo en localhost para el smoke.
- La llave pública tiene formato de marcador, nunca es válida. No se crean usuarios o sesiones y la API debe cerrar antes de intentar conectarse.
- **No se activan** las banderas de Vercel ni de Supabase: todo ocurre dentro del proceso efímero de CI. El flag `true` simula un error de configuración, no una habilitación comercial.
- Una prueba HTTP real del Next local **no** equivale a una prueba real de autenticación, renovación de cookies, revocación o un POST aceptado con JWT firmado.
- Esta prueba **no impide** el despliegue automático de un commit fusionado a `main`: el proyecto Vercel `cotironda` tiene despliegues productivos desde `main`; el guard sólo protege funcionalidades del portal. No fusionar a `main` sin autorización expresa y comprobación de protección de rama/despliegue.
- Conserva el rate limiter SQL de la migración 7, el guard HTTP fail-closed y la documentación del PR #34.

## Criterio de aceptación
- [ ] CI del último commit: unitarias, PostgreSQL 17/40 concurrentes, sitio y Next.js con los DOS builds y smokes, 4/4 exitosos.
- [ ] Verificación posterior de `cotironda-dev`: séptima migración registrada; registro SQL false, 0 usuarios y organizaciones.
- [ ] PR #36 borrador; no se fusiona ni publica.

Evidencia: [PR #36](https://github.com/ProtectorRudo/Cotironda/pull/36) · [Issue #35](https://github.com/ProtectorRudo/Cotironda/issues/35) · [Guía anterior](30-integracion-aislamiento-portal.md).
