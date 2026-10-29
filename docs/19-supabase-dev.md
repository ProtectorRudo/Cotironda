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
