# 47 — Auditoría read-only de la Etapa 01: puertas de seguridad de desarrollo

**29/10/2026 · Issue #68 · rama `test/01-readonly-security-readiness` hija de PR #63.** Solo auditoría de desarrollo; sin merge, deploy, modificaciones a Supabase ni a DNS.

## Alcance exacto

La consulta versionada `supabase/tests/manual/14_etapa01_guardrails_readonly.sql` verifica 17 invariantes sobre el proyecto **`cotironda-dev`** (ref `qkercsoqhehbenbbncwk`), mediante `SELECT`, sin transacciones de escritura. No ingresa archivos ni usa contraseñas, JWT, API keys o usuarios comerciales. `tests/unit/etapa01-readiness.test.mjs` fija que la auditoría no pueda incorporar DML/DDL o múltiples sentencias por accidente.

## Resultado realmente ejecutado

La consulta original de los **17 controles** se ejecutó directamente contra `cotironda-dev` mediante el conector de Supabase, antes de su incorporación al repositorio. Resultado: **17/17 PASS**, sin modificar filas. Las siguientes propiedades quedaron corroboradas en la instancia real:
- `registration_settings.enabled=false`, cero organizaciones, membresías, cuotas, sesiones, objetos y trabajos de ingestión.
- Los buckets `cotironda-buyer-drafts` y `cotironda-upload-quarantine` son privados y limitados a 10 MiB.
- `storage.objects` no tiene ninguna política INSERT, UPDATE, DELETE o ALL; la única SELECT existente exige el helper `storage_session_active()`.
- El ledger privado de cuarentena tiene RLS activa y no tiene políticas de acceso de clientes.
- `anon` no puede ejecutar la RPC de alta; la envoltura pública es `SECURITY INVOKER`; `authenticated` no puede ejecutar el helper privado de sesiones.
- El Auth Hook se puede ejecutar mediante `supabase_auth_admin`, pero no mediante `authenticated`.

**Los 17 controles comprueban configuración y aislamiento SQL; NO equivalen a 17 E2E HTTP.** La verificación fue read-only sobre la base remota; el archivo versionado reproduce la misma consulta, con formato ajustado. La CI del nuevo PR será evidencia adicional de sintaxis/regresión, no reemplaza el ensayo remoto.

## Advertencias del Security Advisor verificadas

En el momento de la auditoría, `cotironda-dev` mantiene:
- **1 WARN:** `auth_leaked_password_protection`, protección de contraseñas filtradas deshabilitada. Remediación oficial: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
- **2 INFO:** `rls_enabled_no_policy` sobre `cotironda_private.supplier_contacts` y `cotironda_private.document_intake_jobs`. Son tablas privadas deliberadamente sin acceso directo; no crear políticas abiertas solo para borrar INFO. Ver: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy

La protección de contraseñas es un **pendiente genuino**, no un fallo de esta consulta SQL. Su configuración corresponde a Auth/administración del proyecto, no se modifica mediante el PR.

## Qué falta para cerrar Etapa 01 (no declarar finalizada)

1. Prueba E2E reproducible de JWT legítimo después de cerrar/revocar sesión y HTTP real de `auth.sessions`/PostgREST sin dejar registros ni abrir producción.
2. Verificar HTTP 429 auténtico de PostgREST contra un límite persistente sin crear empresas. La guardia de Next continúa fail-closed; no sortearla para forzar resultados verdes.
3. E2E de login, renovación de cookie HTTPS SSR y cierre efectivo con cuentas exclusivas de prueba en entorno aislado.
4. Revisar el WARN de contraseñas filtradas y aplicar la configuración autorizada si está disponible.
5. Integrar cuidadosamente la cadena de PR apilados y revalidar las 11 migraciones. **No fusionar `main` mientras su integración a Vercel pueda desplegar cambios sin autorización.**

**ClamAV real, subida y análisis de archivos corresponden a la Etapa 02**, y deben permanecer bloqueados hasta disponer de escáner operativo y controles de ingesta. El PR #65 prepara un adaptador con antivirus simulado, pero no está desplegado.

## Cómo volver a ejecutar

1. Seleccionar explícitamente el proyecto **`cotironda-dev`** por su ID, nunca otro negocio.
2. Verificar que no hay una prueba Auth/Storage concurrente que esté usando fixtures.
3. Ejecutar el contenido exacto del SQL manual de este PR mediante consulta de solo lectura.
4. Exigir **17 filas y 17 PASS**. Todo FAIL bloquea declarar cierre; revisar definición de migración, permisos y derivación de la discrepancia.
5. Revisar aparte Supabase Security Advisor y el estado de la CI del PR; no sumar resultados distintos como si fueran un único E2E.

## Control de publicación

Solo archivos de pruebas y documentación en una **rama de desarrollo**. Ningún cambio de Supabase, Auth, RLS, buckets, Vercel, `main`, DNS ni Hostinger. Ver [Issue #68](https://github.com/ProtectorRudo/Cotironda/issues/68).
