# Etapa 01 — Portal separado del sitio público

- Proyecto de Next.js en `apps/portal/`; demo actual alojada en `site/`, sin cambios.
- El portal sólo se activa con un proyecto Supabase **exclusivo de Cotironda**. Hasta entonces los formularios y el endpoint de alta responden de manera segura y no almacenan registros.
- Dependencias de producción y desarrollo fijadas en `package.json`. El workflow `generate-portal-lock.yml` genera y registra el `package-lock.json` una única vez en la rama autorizada, sin ejecutar scripts de paquetes.
- `portal-ci.yml` ejecuta instalación, análisis TypeScript y compilación real de Next.js con registro deshabilitado.
- `src/server/registro-http.ts` es un controlador testeable por inyección de autenticación, rate limit y BD; la ruta usa Supabase Auth `getUser()` y envía la solicitud a la función SQL interna.

**Bloqueos:** faltan credenciales de un Supabase exclusivo; no desplegar portal a producción ni usar las claves de Viralio/TeHiceEsto. No hay costos nuevos.

## Encendido deliberado del portal
Configurar en un entorno aislado nuevo `COTIRONDA_SUPABASE_PROJECT_REF` (referencia de 20 letras), `NEXT_PUBLIC_SUPABASE_URL`, clave publicable, `COTIRONDA_DATABASE_URL` del MISMO proyecto, `COTIRONDA_SITE_ORIGIN` HTTPS y recién entonces `COTIRONDA_REGISTRATION_ENABLED=true`. No habilitar sin pruebas de Auth real, permisos, E2E y autorización de producción.

El interruptor se aplica tanto a páginas como a API, Proxy y acceso PostgreSQL; las credenciales públicas solas no habilitan formularios.
