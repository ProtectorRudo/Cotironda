# 30 — Integración del aislamiento de entorno de Cotironda (Etapa 01)

**29/10/2026 — desarrollo, sin publicar ni fusionar.**

## Hallazgo crítico recuperado de PR #26
El PR #26 (`fix/01-project-pin-failclosed-rate`) añadió una restricción de proyecto de Supabase exclusivamente a `cotironda-dev` y un bloqueo `VERCEL_ENV=production`. Ese PR salió como rama hermana de #24. La línea vigente #32 **no** incluía esos cambios: aceptaba cualquier referencia Supabase con 20 letras cuando URL y referencia eran coherentes.

Se hizo una recuperación **selectiva** del módulo `src/server/portal-entorno.ts` del PR #26 y se adaptaron/ampliaron las pruebas sobre una rama hija de #32, sin fusionar ni sobrescribir el resto de sus cambios.

El portal de desarrollo ahora:
- Requiere `COTIRONDA_SUPABASE_PROJECT_REF=qkercsoqhehbenbbncwk` y la URL exacta de ese proyecto;
- Rechaza `VERCEL_ENV=production` incluso con configuración de desarrollo correcta;
- Mantiene la bandera explícita `COTIRONDA_REGISTRATION_ENABLED=true` para permitir portal. **No se ha habilitado**;
- Nunca acepta `service_role`, `DATABASE_URL`, http remoto o referencias de otros proyectos;
- Sigue con `autorizarIntentoDeRegistro` fail-closed en Next, hasta completar Auth Hook y E2E reales.

Esta restricción **no debe trasladarse sin rediseño** al producto comercial futuro: para producción se requerirá Supabase propio de producción, entorno y secretos separados, nueva revisión de permisos y autorización de despliegue.

## Checklist de aceptación
- Proyecto Cotironda dev correcto + origen HTTPS + bandera true: puede pasar sólo el preflight de configuración en desarrollo/preview; **no representa una autorización de alta**.
- Referencia distinta y URL coherente (incluidas otras aplicaciones del mismo equipo) siempre rechazada.
- `VERCEL_ENV=production` siempre rechazado.
- Bandera false, origen inválido, `service_role` y conexión SQL directa siempre rechazados.
- Ruta real conserva guardia fail-closed y la RPC de Supabase conserva limitación SQL + `registration_settings.enabled=false`.
- Ejecutar CI unitarias, PostgreSQL con concurrencia, Next.js/HTTP y sitio tras el commit final.

## Orden de PR existentes
La rama base sigue en `main` con la documentación inicial. Camino de cambios propuestos:
`#4 → #8 → #10 → #12 → #14 → #16 → #18 → #20 → #22 → #24 → #28 → #30 → #32` y esta rama en la punta.

**#26 es una rama alternativa de #24**: el control de aislamiento se recupera aquí; **no fusionar #26 sin revisar duplicaciones y conflictos**. Los PR anteriores son borradores, no integrados a main.

## Advertencia de publicación
Inspección de Vercel por conector: el proyecto público `cotironda` está conectado a GitHub `ProtectorRudo/Cotironda`. Su despliegue histórico de producción `dpl_8o4RmhJ2qCFTJRRxoqbqTHeLNz7g` (READY) identifica **`githubCommitRef=main`** y commit `5987f1705ff1dba609489374531fa9e942150e7` (demo publicada). Por lo tanto, el vínculo entre `main` y producción está **verificado en un despliegue real**, y fusionar cambios en `main` puede publicar automáticamente contenido nuevo. No se han cambiado ni reconfigurado las reglas actuales de auto-deploy; no dar por segura una fusión. Se identificó por separado `cotironda-portal-dev`, proyecto Next.js, protegido por SSO. Por tanto, antes de integrar `main` hay que verificar explícitamente el comportamiento de Git, los checks requeridos y, si corresponde, deshabilitar el autodespliegue o separar la rama productiva de la integración. **No fusionar PR ni cambiar esa configuración sin autorización**.

## Bloqueantes de Etapa 01
- Custom Access Token Hook preparado en SQL, pero no demostrado activo en Auth.
- No se ejecutó E2E real JWT, sesión revocada, expiración ni cookies SSR.
- La prueba HTTP 429 con SDK real fue vía fetch simulado, no PostgREST autenticado en red.
- El límite por usuario no reemplaza la mitigación contra altas múltiples/IP ni presupuesto.
- Aunque la tabla de cuota y RLS están aplicadas en Supabase dev, el portal sigue apagado y la base mantiene `registration_settings.enabled=false`.

## Evidencias
- [PR #26 (referencia del cambio recuperado)](https://github.com/ProtectorRudo/Cotironda/pull/26)
- [PR #32 (línea de trabajo anterior)](https://github.com/ProtectorRudo/Cotironda/pull/32)
- [Issue de aislamiento](https://github.com/ProtectorRudo/Cotironda/issues/33)
- [Registro de migraciones](https://github.com/ProtectorRudo/Cotironda/tree/fix/01-rpc-persistent-rate-limiting/supabase/migrations)
