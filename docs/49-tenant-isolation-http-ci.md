# 49 — E2E HTTP RLS multiempresa sobre PostgREST real (solo CI)

**Etapa 01 · 29/10/2026 · Issue #72 · PR en borrador.**

## Por qué se agrega esta prueba

Cotironda maneja catálogos, productos, zonas de reparto y membresías de múltiples empresas. Las pruebas RLS de PostgreSQL emulado son necesarias, pero también debemos verificar las políticas **por HTTP contra el PostgREST verdadero**, con tokens firmados y peticiones GET/POST/PATCH/DELETE, no asumir que un HTTP 200 implica que se modificó la fila.

## Entorno y fronteras

- Se reutiliza el workflow aislado de **PR #71**, PostgreSQL 17 descartable, once migraciones oficiales y PostgREST 12.2.12 por digest. La clave JWT es efímera y firmada en GitHub Actions; **NO es Supabase Auth real**.
- El fixture `supabase/tests/ci/99_tenant_http_fixture.sql` exige `current_database()='cotironda_ci_http'`, registro apagado y tablas vacías tras el E2E anterior. Crea exactamente dos proveedores ficticios con catálogos, productos y zonas; dos propietarios A/B, un lector C de A y un gerente suspendido D de A. Sin correos, números, secretos o datos de usuarios reales.
- `tests/integration/postgrest-tenant-http-real.mjs` verifica 5 relaciones por rol: organizaciones, perfiles, rubros, productos y zonas. También comprueba que cada usuario solo vea su propia fila de membresía (restricción de lectura actual, puede afectar UX futura).
- Pruebas positivas y adversariales: propietario A puede actualizar/agregar **solo** sus productos; A no puede leer, editar ni borrar productos de B; el miembro C puede leer A pero no escribir; el suspendido D no ve A ni puede modificarlo; `user_metadata` falsificada con empresa y rol ajeno no altera autorización; se impiden inserciones y zonas cruzadas. Los conteos y cambios se comprueban en SQL después de HTTP.
- El fixture se elimina en `finally`: ninguna empresa, producto, usuario o sesión queda en el runner. El registro permanece en `false`. GitHub destruye igualmente la BD y el contenedor.

## Criterios de aceptación

- [ ] HTTP real A/B y lector/suspendido conforme, con pruebas positivas y negativas.
- [ ] Catálogos, zonas y membresías no revelan datos de otras empresas.
- [ ] Ningún PATCH/DELETE prohibido modifica filas aun si responde 200 vacío.
- [ ] 0 empresas y sesiones tras limpiar; flag SQL sigue `false`.
- [ ] Suite CI original, unitarias, portal y PostgreSQL sin regresiones.

## Límites

Este E2E **no** usa Supabase Auth, Storage HTTP, HTTPS ni cookies reales; por lo tanto, siguen pendientes los ensayos remotos JWT revocado y HTTP 429 del gateway de Supabase, y el warning de protección de contraseñas filtradas. El portal y el registro comercial siguen apagados. No fusionar a `main` ni desplegar Vercel sin la autorización `Publicalo`.

Documentación: [Issue #72](https://github.com/ProtectorRudo/Cotironda/issues/72) y [PR #71](https://github.com/ProtectorRudo/Cotironda/pull/71).
