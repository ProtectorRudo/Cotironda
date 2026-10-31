# 17 — Evidencia de PostgreSQL real (Etapa 01)

## Entorno de verificación
- PostgreSQL 17 Alpine como servicio efímero de GitHub Actions.
- Usuario `postgres` y credenciales **ficticias exclusivas del job de CI**.
- Sin acceso a los proyectos Supabase de Viralio ni TeHiceEsto.
- Stub de `auth.users` y `auth.uid()` sólo en CI; **NO equivale a Supabase Auth**.

## Qué se comprobó
- Aplicación completa del esquema SQL sobre PostgreSQL real.
- RLS: la empresa A no puede consultar ni cambiar datos de la B; la B conserva sus filas.
- Usuarios suspendidos, miembros de solo lectura y rol anónimo bloqueados según políticas.
- La clave de servicio (simulada) puede ejecutar el registro; los usuarios ordinarios no.
- Registro como una transacción: creación de empresa, membresía inicial owner y perfil proveedor condicional.
- Proveedor nuevo con recepción de cotizaciones desactivada.
- Reintento igual devuelve `replay=true`; mismo identificador con diferente contenido es rechazado.
- Usuario inexistente causa rollback de la operación; no queda una empresa huérfana.
- Dos altas simultáneas de igual usuario/solicitud producen **una creación y una respuesta replay**, con una única organización resultante.
- Se verificó `success` en el paso `postgres-rls` de GitHub Actions.

## Evidencia
- Prueba A/B + SQL onboarding + concurrencia: https://github.com/ProtectorRudo/Cotironda/actions/runs/40856168116
- Archivos: `supabase/tests/ci/00_bootstrap.sql`, `10_tenant_rls.sql`, `20_onboarding.sql`, `30_concurrency.sh`.
- Workflow: `.github/workflows/postgres-rls.yml`.

## Riesgos aún abiertos
1. **El registro no está conectado a un endpoint Next.js** y no maneja aún cookies, validación real de sesión, CSRF ni rate limits.
2. El procedimiento privado de registro recibe `p_user_id` como parámetro: **el servidor debe derivarlo de un usuario autenticado mediante Supabase**, nunca del cuerpo HTTP.
3. `service_role` es una credencial privilegiada. Nunca debe aparecer en cliente, archivos públicos ni logs. Esquema privado y `SECURITY INVOKER` reducen superficie; no reemplazan controles del backend.
4. Se requiere entorno de prueba Supabase exclusivo, creación de migración oficial y auditoría con Supabase Auth real.
5. Aún no existe una plataforma que permita comprar, enviar RFQs o cotizar comercialmente.

## Decisión
No integrar el PR #4 a `main` ni desplegar el backend hasta completar autenticación y pruebas de integración. El sitio público `cotironda.vercel.app` permanece solamente demostrativo.
