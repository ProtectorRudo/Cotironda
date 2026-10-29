# 19 — Cotironda en Supabase (desarrollo)

**Fecha:** 29 de octubre de 2026. **Estado:** base creada, migración aplicada, pruebas SQL aprobadas; sin usuarios reales ni app conectada.

## Infraestructura
- Organización: ProtectorRudo's Org.
- Proyecto exclusivo: `cotironda-dev`, ref `qkercsoqhehbenbbncwk`, región `sa-east-1` (São Paulo).
- URL de consola: https://supabase.com/dashboard/project/qkercsoqhehbenbbncwk
- Costo de creación cotizado por Supabase: **USD 0/mes**, sin contratación de plan pago.
- Para liberar el cupo se **pausó** el proyecto Supabase `viralio` de manera reversible. Viralio no se borró; queda inactivo y sus funciones dependientes de Supabase pueden fallar hasta restaurarlo. TeHiceEsto continúa activo.

## Migración
- Historial confirmado en Supabase: `20261029105736_initial_identity_catalog`.
- SQL fuente versionado en `supabase/migrations/20261029105736_initial_identity_catalog.sql`, creado por la CLI de Supabase en GitHub Actions y alineado con el número de versión del servidor.
- Conjunto: 7 tablas `public`, 2 `cotironda_private`, todas con RLS, 5 categorías básicas, 17 políticas de acceso y procedimiento transaccional privado.
- El proyecto se creó vacío; no se copió ningún dato de Viralio ni de TeHiceEsto.

## Pruebas ejecutadas sobre el PostgreSQL real de Supabase
- Aislamiento entre empresa A y B en consultas y escrituras.
- Permisos de owner, miembro sin privilegios, miembro suspendido y usuario anónimo.
- Protección de membresías y esquema privado.
- Registro de empresa y propietario como una sola operación.
- Alta de proveedor deshabilitada por defecto.
- Reintentos idempotentes, conflictos de payload, rollback de usuario inexistente y cuota diaria.
- Fixtures ficticios dentro de transacciones revertidas: **0 empresas, 0 miembros, 0 registros de alta** después de ejecutar los tests.
- La prueba con dos conexiones concurrentes sigue verificada por GitHub Actions sobre PostgreSQL 17 aislado; todavía no se reprodujo concurrencia en Supabase real.

## Advisors de Supabase
- Seguridad: dos avisos `INFO` de RLS sin política en tablas del esquema privado. Se mantiene RLS sin políticas porque sólo deben operar desde un servicio privilegiado y no se expone el esquema a clientes. No se detectaron avisos críticos.
- Performance: dos índices para claves foráneas pendientes de priorizar; los índices sin uso son esperables sin tráfico.
- Documentación: https://supabase.com/docs/guides/database/database-linter

## Pendientes para habilitar el portal
1. Configurar de forma segura **credenciales exclusivas** de este Supabase en el proyecto Vercel `cotironda-portal-dev`; nunca usar `postgres` superusuario del navegador ni subir secretos al repositorio.
2. Revisar privilegios del backend y acceso de funciones SQL.
3. Ejecutar flujo de Supabase Auth real con un usuario de prueba, correo verificado y cookies SSR, incluyendo ataques cross-tenant.
4. Configurar storage privado, trazabilidad, rate limits de infraestructura y observabilidad.
5. Abrir/revisar PRs #4, #8 y #10; no integrarlos ni publicar producción sin superar aceptación.

## Preparación de Vercel para pruebas
- El proyecto de Vercel `cotironda-portal-dev` (`prj_d13rTHxJADvP2K9PcrM0CJQD9Zok`) recibió **sólo variables no secretas** de Supabase: URL, clave publicable y referencia de proyecto, dirigidas a `preview` y `development`.
- `COTIRONDA_REGISTRATION_ENABLED=false` permanece establecido en **todos los entornos** del proyecto de desarrollo, incluido `production` de ese proyecto.
- No se configuró contraseña de PostgreSQL ni clave de servicio, ni se activó login/registro. El portal público de Cotironda es otro proyecto y no se modificó.
- Próximo paso: diseñar credenciales de backend con permisos mínimos y verificar Auth real antes de habilitar el registro, incluso en entorno protegido.

## Segunda migración de seguridad (29/10/2026)
- `20261029111731_backend_role_limited` aplicada mediante Supabase en el proyecto `cotironda-dev`, y registrada en `supabase/migrations/20261029111731_backend_role_limited.sql` tras generación con CLI. No volver a aplicar el mismo SQL completo.
- Nuevo rol `cotironda_app` (sin LOGIN, sin BYPASSRLS); permiso de registro bajo RLS con privilegios limitados.
- Pruebas reales: registro de organización/miembro/proveedor con el rol, y rechazo de SELECT productos/contactos y de UPDATE/DELETE. Fixtures revertidos.
- Evaluación de seguridad: una observación INFO de RLS sin política en `cotironda_private.supplier_contacts`, bloqueo deliberado; sin vulnerabilidades altas reportadas. Avisos de índices sin uso se esperan en una base nueva.
- Se verificó cero organizaciones y cero solicitudes tras la prueba. Sigue pendiente la credencial privada de backend y la verificación de Supabase Auth real.
- Detalle en `docs/20-backend-privilegios.md`.

## Tercera migración de seguridad
- `20261029112947_execute_only_registration`: elimina acceso DML directo del backend, transfiere la función a un propietario privado NOLOGIN sin BYPASSRLS y conserva EXECUTE solo a `cotironda_app`.
- Proceso probado con transacciones reversibles antes/después de aplicar. Cero empresas, membresías o solicitudes de prueba persistentes. Sin contraseñas configuradas.
- Advisor sin advertencias altas. Evidencia: `docs/21-funcion-registro-privilegios.md` y CI 40866084063.
