# 156 — MVP-036: controlar despliegues automáticos de Vercel DEV

31/10/2026 · Issue #285 · rama `ops/mvp-036-vercel-deploy-budget`.

## Motivo y evidencia

El proyecto de desarrollo `cotironda-portal-dev` alcanzó el error **402** `api-deployments-free-per-day` al solicitar la Preview privada del commit integrado `33a290d`. El deployment READY más nuevo de Vercel seguía en el commit anterior `29f36d5`. No es un fallo comprobado del frontend ni se soluciona corriendo más despliegues.

Vercel crea despliegues automáticos por commits de Git por defecto, incluso si los cambios se originan en ramas de pruebas. **El Ignored Build Step no evita consumir el límite de deployments**, por lo cual esta decisión usa `git.deploymentEnabled`, que evita que nazca el deployment (documentación oficial: [Git Configuration](https://vercel.com/docs/project-configuration/git-configuration), [Monorepos](https://vercel.com/docs/monorepos)).

## Configuración controlada

Se incorpora `apps/portal/vercel.json` (raíz prevista del proyecto Next.js, que debe verificarse en Vercel) con un patrón global `**: false` y una excepción `integration/mvp-piloto-20261031: true`. La regla específica `true` prevalece si coincide con la global `false`, conforme a la documentación Vercel. Así no se crean automáticamente Previews de las numerosas ramas hijas de desarrollo; la candidatura integrada conserva la posibilidad de Preview privada.

Esta regla solo estará vigente para commits donde Vercel lea **este** archivo de configuración; **no** implica un cambio global del servicio, no modifica el código de producción ya desplegado y no cancela desplegados existentes. `main` no recibe el cambio porque esta PR no se fusiona con `main`. No sustituye los controles de rama de Next Auth ni activa flags comerciales.

**No se puede asegurar que funcione en el proyecto real hasta validar el Root Directory y observar un deploy posterior al reinicio de cuota.** La presencia del JSON y sus unitarias solo verifica la intención declarada.

## Test y operación

- `tests/unit/mvp036-vercel-deploy-budget.test.mjs`: validez JSON, única excepción `true`, patrón global `false`, sin `ignoreCommand` engañoso, sin DNS/env/producción.
- Probar CI Next.js, TypeScript, tests unitarios, PG17 y PostgREST normalmente, sin exigir que Vercel publique la PR.
- En Vercel → `cotironda-portal-dev` → Settings: confirmar Root Directory `apps/portal` y que `git.deploymentEnabled` se interprete correctamente, con Preview SSO activa. Al levantarse la limitación 402, generar como máximo **una** Preview del HEAD integrado, comprobar commit exacto y flujos sintéticos seguros.
- Si se necesita una PR hija navegable excepcionalmente, habilitar de forma deliberada un deployment manual Preview para el SHA específico, evitando volver a agotar cuota.
- Al publicar una versión aprobada, revisar esta política y la estrategia de despliegue de `main`; no eliminar silenciosamente las protecciones del piloto.

## Puertas aún cerradas

Issue #175 sin backup/restore auténtico DEV. Sin SQL D024+, sin Whapi live, DNS ni `main`. Una Preview READY, por sí sola, tampoco autoriza envíos comerciales. No se adquirió plan pago ni modificó configuración Vercel del servidor.
