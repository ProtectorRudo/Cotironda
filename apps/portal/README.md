# Etapa 01 — Portal separado del sitio público

- Proyecto de Next.js en `apps/portal/`; demo actual alojada en `site/`, sin cambios.
- El portal sólo se activa con un proyecto Supabase **exclusivo de Cotironda**. Hasta entonces los formularios y el endpoint de alta responden de manera segura y no almacenan registros.
- Dependencias de producción y desarrollo fijadas en `package.json`. El workflow `generate-portal-lock.yml` genera y registra el `package-lock.json` una única vez en la rama autorizada, sin ejecutar scripts de paquetes.
- `portal-ci.yml` ejecuta instalación, análisis TypeScript y compilación real de Next.js con registro deshabilitado.
- `src/server/registro-http.ts` es un controlador testeable por inyección de autenticación, rate limit y BD; la ruta usa Supabase Auth `getUser()` y envía la solicitud a la función SQL interna.

**Bloqueos:** faltan credenciales de un Supabase exclusivo; no desplegar portal a producción ni usar las claves de Viralio/TeHiceEsto. No hay costos nuevos.

## Encendido deliberado del portal
Configurar el proyecto exclusivo de Cotironda: `COTIRONDA_SUPABASE_PROJECT_REF`, `NEXT_PUBLIC_SUPABASE_URL`, clave publicable y `COTIRONDA_SITE_ORIGIN`. El registro se efectúa con la sesión SSR mediante RPC, **sin DATABASE_URL ni service_role**. Para habilitarlo deberán aprobarse: sesión real, correo confirmado no salteable por RPC, control de tasa y el doble interruptor de Vercel y PostgreSQL.

El interruptor se aplica tanto a páginas como a API, Proxy y acceso PostgreSQL; las credenciales públicas solas no habilitan formularios.

## Modificación de seguridad de Etapa 01
La ruta de registro ya no importa `pg` ni credenciales SQL; usa la RPC `register_company_for_current_user` desde el cliente SSR autenticado. `COTIRONDA_DATABASE_URL` está explícitamente prohibido por el validador de configuración.

### Aviso de seguridad actual
El portal llama RPC con la sesión SSR del usuario, y nunca el adaptador SQL. La base dispone de un segundo interruptor `cotironda_private.registration_settings.enabled=false`, distinto de la variable web. La quinta migración exige confirmación de correo mediante un claim respaldado por Auth Hook y eliminó el WARN de la RPC pública. Aun así, **NO activar** hasta habilitar/probar el Hook real, JWT E2E, rate limit y cookies.


### Diagnóstico manual de Auth real (solo cuentas privadas de ensayo)

Tras crear **dos cuentas de prueba con contraseñas distintas, nuevas y de al menos 12 caracteres** (no reutilizar claves que hayan aparecido en chats), configurá las variables locales descritas en `docs/24-auth-e2e-seguridad.md` y ejecutá desde `apps/portal` **`npm run e2e:auth:dev`** en tu equipo privado. Este comando usa Node 22 con `--experimental-strip-types` para los imports TS del diagnóstico. El runner se niega a trabajar en GitHub Actions/CI/Vercel y no imprime secretos ni errores sin filtrar. Nunca enviar contraseñas/JWT en mensajes, archivos versionados o PRs. **Todavía no se ejecutó el diagnóstico de revocación con JWT genuino tras logout.** Ver `docs/54-e2e-auth-secret-preflight.md`.
