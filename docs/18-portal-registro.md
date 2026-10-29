# Registro web: seguridad y despliegue (Etapa 01)

## Arquitectura
El portal Next.js 16 está en `apps/portal/`, separado del sitio demostrativo `site/`. Su API `POST /api/organizaciones` delega en `src/server/registro-http.ts`; jamás debe aceptar IDs de usuario, empresa ni roles desde el formulario. La identidad se obtiene con `supabase.auth.getUser()` en el servidor, no `getSession()`.

El acceso y los formularios permanecen **deshabilitados** si no están las variables de entorno necesarias. La habilitación deliberada requiere `COTIRONDA_REGISTRATION_ENABLED=true`, `COTIRONDA_SITE_ORIGIN` idéntico al origen público y acceso exclusivo a una BD Cotironda. No existe aún ese proyecto Supabase.

El procedimiento privado `cotironda_private.register_company` crea empresa/owner/perfil en una única transacción; su clave de idempotencia se guarda en esquema privado. La cuota inicial de **máximo 5 empresas nuevas por usuario cada 24 h** se ejecuta bajo bloqueo transaccional de usuario y permite reintentar solicitudes anteriores aun después de alcanzar el límite. La cuota es un mecanismo técnico antiabuso, **no una política comercial aprobada**.

## Controles
- Cookies de sesión mediante `@supabase/ssr` y Proxy de Next.js 16; `getUser()` confirma sesión actual en Auth.
- Verificación estricta de `Origin` fijo y `Content-Type`, cuerpo JSON limitado a 10 KiB y sin caché.
- Validación de campos con esquema del dominio; se rechazan claves ajenas como `role`, `userId` o `organizationId`.
- Contraseña y secretos fuera del repositorio y de mensajes; el URL de BD sólo es de servidor.
- Fallos de Auth o BD responden sin revelar consultas ni credenciales.
- Todas las escrituras esperan prueba real del entorno Cotironda; **ningún proyecto ajeno se usa**.

## Estado y pruebas
El código del portal se valida por CI con versiones de Next y React fijadas. `src/server/registro-http.ts` se prueba con dobles de autentificación y persistencia; RLS y SQL se prueban en PostgreSQL 17 efímero de GitHub Actions. Aun con CI verde, NO reemplaza pruebas E2E de cookies, registro en Supabase Auth y conexión real.

## Próximos criterios
1. Revisar dependencias y agregar `package-lock.json` generado por npm (no fabricar lockfile).
2. Verificar build Next, tests HTTP, RLS, idempotencia y rate limit en CI.
3. Crear proyecto Supabase exclusivo Cotironda; aplicar migración bajo pruebas y ejecutar advisors.
4. Validar registro con usuarios de prueba y correo confirmado y comprobar permisos por empresa.
5. Publicación solo tras autorización explícita y plan de reversión.

### Verificación inicial del PR #8
- Node 22.16 + 64 pruebas unitarias exitosas: https://github.com/ProtectorRudo/Cotironda/actions/runs/40858591761.
- PostgreSQL 17 real (RLS, registro, cuota y concurrencia): https://github.com/ProtectorRudo/Cotironda/actions/runs/40858590551.
- Next.js 16, TypeScript y build sin credenciales: https://github.com/ProtectorRudo/Cotironda/actions/runs/40858590465.
- Archivos de registro de clientes reales: **ninguno**. Proyecto Supabase de Cotironda: **no creado**.

### Vista previa técnica protegida
- Proyecto Vercel independiente: `cotironda-portal-dev` (`prj_d13rTHxJADvP2K9PcrM0CJQD9Zok`).
- Despliegue del commit `14b4b9c`: `dpl_9PD322umqvKJLqbkS5P6yPByEN92`, estado **READY**.
- URL: https://cotironda-portal-mv39u52l2-protector-rudo-s-projects.vercel.app (requiere Vercel Authentication).
- Vercel clasifica su primer despliegue como target `production` **del proyecto exclusivo de desarrollo**, pero está protegido por SSO completo, sin secretos ni habilitación de registros. **No** reemplaza el proyecto público Cotironda ni sus dominios.
- No se completó una prueba HTTP externa detrás de SSO; sí se verificó el build de Next.js y el estado READY en Vercel.
