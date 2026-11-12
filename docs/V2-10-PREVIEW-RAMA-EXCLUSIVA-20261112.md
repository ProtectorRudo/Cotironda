# Cotironda V2-10 — Preview exclusiva y preflight de configuración

**12/11/2026 — Avanza: solamente código, documentación y pruebas. No despliegue.**  
Se basa en el PR #830, sin integrarlo ni modificar el proyecto vivo.

## Hallazgos comprobados

Consulta de solo lectura al Vercel del equipo `ProtectorRudo's projects`:
- El proyecto correcto **`cotironda-portal-dev`** existe, usa Next.js y tiene SSO activado.
- Sigue **desconectado de Git** (aunque otros proyectos Cotironda sí están conectados).
- Tiene **cinco nombres de variables** en Preview: `COTIRONDA_AUTH_PREVIEW_ENABLED`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `COTIRONDA_SUPABASE_PROJECT_REF` y `COTIRONDA_REGISTRATION_ENABLED`. No se leyó ningún valor.
- Los once nombres `COTIRONDA_PILOT_*` / `NEXT_PUBLIC_COTIRONDA_PILOT_*` exigidos por el flujo V2 no existen hoy en esa configuración. El control exige además el nombre `COTIRONDA_REGISTRATION_ENABLED`. **La presencia de un nombre no verifica el valor ni los permisos.**
- La última comprobación de cuota devolvió HTTP 402; no se ha vuelto a intentar un deployment para eludirla.

Consulta SQL real **solo lectura** a Supabase `cotironda-piloto`:
`auth.users=0`, `v2_supplier_original_consents=0`, `v2_original_share_policy.enabled=false` y `v2_original_analysis=0`. Son conteos agregados, sin información personal. Cuatro tablas privadas V2 tienen RLS.

## Impedimento adicional del código

`apps/portal/vercel.json` tenía una política `git.deploymentEnabled` con catch-all `"**": false` y una sola excepción para la vieja rama `integration/mvp-piloto-20261031`. No había permiso para desplegar automáticamente **ninguna** rama de V2 por Git. Conectar Git sin atender este punto no habilitaría la Preview que queremos.

## Cambio candidato V2-10

- Preparación de una **única rama nueva** autorizable para Preview: `release/cotironda-v2-piloto-preview`. Se agrega como excepción exacta `true` en `apps/portal/vercel.json`.
- `"**": false` queda intacto: `main`, otras ramas de trabajo y PR no pasan automáticamente. La excepción previa `integration/mvp-piloto-20261031` se conserva para no modificar comportamiento legado sin autorización.
- La rama `release/cotironda-v2-piloto-preview` **NO fue creada ni vinculada al proyecto** por este cambio. En caso de crearla más adelante, antes hay que confirmar en Vercel que la rama de producción del proyecto no sea esa rama y que el destino es **Preview**, SSO activo y variables seguras.
- El preflight exige también la **presencia de la variable `COTIRONDA_REGISTRATION_ENABLED`**; en tiempo de ejecución su valor debe ser exactamente `false`. No se imprimen secretos ni se concede autorización de publicación.
- Tests Node y workflow de GitHub examinan la lista cerrada de ramas; si se habilita `main` o un patrón amplio, falla CI.

Vercel documenta que `git.deploymentEnabled` usa coincidencia minimatch y que, si varios patrones coinciden, basta un `true` para permitir el despliegue: https://vercel.com/docs/project-configuration/git-configuration. Por eso la excepción debe ser exacta; nunca usar `release/*` ni `main`.

## Condiciones para un próximo «Publicalo»

1. Revisar equipo y proyecto correctos, protección SSO y rama de producción. Conectar Git al repositorio `ProtectorRudo/Cotironda` sin disparar un deployment de `main` o del legado por accidente.
2. Volver a consultar cuota Hobby real; no asumir que se liberó ni contratar un plan por defecto.
3. Crear `release/cotironda-v2-piloto-preview` **desde el SHA probado y autorizado**, y verificar que los ajustes de Git producen **solo Preview protegida**.
4. Configurar los nombres y valores de entorno V2 en el gestor secreto de Vercel, con publicables solo en `NEXT_PUBLIC_*` y claves secretas solo en servidor. Verificar `COTIRONDA_REGISTRATION_ENABLED=false` y flags V2 OFF.
5. Comprobar proveedor SMS, alta segura del primer comprador, OTP real y sesión válida sin abrir registro público.
6. Exigir consentimiento prospectivo de proveedores, asociación documental fuerte y autorización de comprador antes de activar exposición de originales; después probar PDF/Excel real y E2E WhatsApp → portal → cierre.
7. Auditar CI, fuente SHA, SQL y efectos antes de habilitar controles. Ni este PR ni la CI crean cuenta Auth, envían SMS, migran, envían WhatsApp o despliegan.

## Evidencia de aceptación

- [x] Detectada configuración de ramas que impedía V2.
- [x] Preparada excepción exacta a rama de Preview, manteniendo `main` bloqueada.
- [x] Añadidas pruebas de whitelist y presencia de registro cerrado.
- [ ] GitHub Actions del SHA final, sin afirmar aprobación antes de que concluyan.
- [ ] Conectar Vercel y confirmar Preview por navegación/despliegue **solo con Publicalo**.
- [ ] SMS, originales reales, consentimiento y E2E comercial.

**Esta decisión no cambia reglas comerciales V2, WhatsApp v76, Supabase ni producción.**
