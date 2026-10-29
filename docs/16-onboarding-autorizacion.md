# 16 — Registro y autorización de empresas (Etapa 01)

**Estado:** núcleo de dominio implementado y probado; integración con Supabase **pendiente**. No hay ruta HTTP, interfaz de registro ni base de datos activa para Cotironda.

## Registro de empresa

- La identidad del usuario debe obtenerse exclusivamente desde una sesión verificada **en el servidor** (Supabase Auth; no confiar en userId/rol enviado por el cliente).
- Se requiere usuario autenticado no anónimo y correo verificado. El flujo comercial para proveedores que operarán exclusivamente por WhatsApp se definirá aparte; este es para cuentas del portal.
- Formulario: sólo requestId UUID, nombre, tipo comprador/proveedor/ambos y nombre comercial cuando corresponda.
- No permite pedir ID de empresa, rol administrativo, cambio de estado ni disponibilidad por el cuerpo de la solicitud.
- La membresía inicial es **owner** asignada por backend. El proveedor comienza con recepción de cotizaciones **deshabilitada** hasta completar catálogo, zona y consentimiento.
- Una única transacción atómica debe crear empresa, membresía y perfil de proveedor cuando corresponda. Evitar escrituras independientes con estados parciales.
- El puerto recibe clave idempotente requestId. La base de datos debe imponer unicidad por usuario/clave y proteger reintentos con contenido distinto. **El procedimiento SQL existe y pasó pruebas de transacción, rollback, reintentos y concurrencia en PostgreSQL aislado**. Aún falta el adaptador HTTP que verifique la identidad del usuario.

## Permisos de catálogo

- La membresía se lee de BD en el servidor, nunca desde el cuerpo HTTP.
- Miembro activo: lectura de su catálogo.
- Sólo owner/manager activos: edición.
- Sin membresía, suspendido, diferente empresa o diferente usuario: denegado.
- RLS PostgreSQL sigue siendo control definitivo; TypeScript aporta una segunda barrera pero no sustituye pruebas reales.

## Pruebas ejecutadas (29-10-2026)

- 24/24 pruebas unitarias **nuevas** aprobadas con Node.js v22.16.0 y --experimental-strip-types.
- TypeScript: tsc -p tsconfig.json correcto.
- Los cuatro archivos de código/test guardados en GitHub fueron comparados por hash Git blob con el contenido probado localmente.
- **CI GitHub Actions** corrió todos los tests del repositorio en Node 22.16.0: **50/50 aprobados**, sin fallos. La ejecución original se completó en https://github.com/ProtectorRudo/Cotironda/actions/runs/40833901535.
- **PostgreSQL 17 real:** pruebas de la función interna de alta, rollback, RLS y concurrencia aprobadas en GitHub Actions (ver docs/17-db-pruebas-reales.md). Sigue sin haber tests reales de API, cookies/SSR ni Supabase Auth.

## Próximos pasos

1. Proyecto Supabase exclusivo de desarrollo, sin tocar bases ajenas; PostgreSQL de CI ya disponible.
2. Integrar el procedimiento SQL al backend y probar sesión Supabase Auth **verificada en servidor**.
3. Ruta backend con CSRF/origen, límites de frecuencia y autorización real.
4. Repetir pruebas A/B, roles y permisos con Supabase Auth real.
5. Alta por WhatsApp y consentimiento independiente para proveedores que no usarán portal.

Referencias: https://supabase.com/docs/guides/getting-started/tutorials/with-nextjs y https://supabase.com/docs/guides/auth/server-side/advanced-guide
