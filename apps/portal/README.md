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
