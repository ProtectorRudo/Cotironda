# 51 — Migración 12: acceso comercial solo con sesión Auth vigente

**29/10/2026 · Issue #76 · PR #77 en borrador, sobre PR #75.**

## Hallazgo y alcance

En `cotironda-dev`, siete tablas comerciales tenían 23 políticas de RLS: **17 para `authenticated`** y seis exclusivas del rol privado `cotironda_registrar`. Antes de esta migración, las 17 políticas de usuarios no verificaban que el `session_id` del JWT siguiera presente en `auth.sessions`. Un token previamente firmado podía seguir consultando catálogos hasta expirar tras cerrar sesión.

La migración `supabase/migrations/20261029234236_commercial_session_guard.sql` agrega, sin cambiar los predicados existentes de miembro/rol/empresa, la condición `AND (select cotironda_private.storage_session_active())` a `USING` y `WITH CHECK` de esas 17 políticas, según la acción. Ese helper privado ya existe desde la migración 9 y valida identidad autenticada, correo confirmado, `auth.uid()`, sesión activa y estado actual de usuario.

Se mantienen intactas las **seis políticas internas del registrador**, cuyos accesos requieren la RPC privada que también comprueba sesión. Se exige registro comercial deshabilitado, siete tablas con RLS, inventario exacto 23/17/6, función privada existente/ejecutable por rol autorizado, cero políticas de escritura en Storage. Si cambia una precondición, la migración aborta. No añade roles, GRANTs, buckets, tablas ni permisos de carga.

## Generación, CI y sincronización de historial

1. En un runner GitHub efímero se ejecutó **Supabase CLI 2.122.0**, comando `supabase migration new commercial_session_guard`; generó `20261029233650_commercial_session_guard.sql`. Evidencia: https://github.com/ProtectorRudo/Cotironda/actions/runs/40974304389.
2. Se incorporó código SQL de migración conservador, tests deterministas y reconstrucción de 12 migraciones desde cero y en modo incremental sobre PostgreSQL 17; PostgREST real comprueba accesos y revocación con JWT **sintéticos firmados por CI**. El primer ensayo señaló un test de manifiesto antiguo (11 migraciones) y una asunción falsa de cero sesiones en un job que reutiliza fixtures CI; se corrigieron los tests sin alterar seguridad.
3. Con CI exitosas y preflight remoto read-only, se aplicó **solo a `cotironda-dev`** mediante el conector de migraciones Supabase. El servidor registró versión **`20261029234236`**, distinta al timestamp generado por CLI. Para **evitar drift histórico**, el archivo de GitHub y las referencias de tests/workflows se renombraron a `20261029234236_commercial_session_guard.sql` **sin cambiar la lógica auditada**. Quedan 12 versiones consecutivas en el historial de `cotironda-dev`.
4. No se aplicó a producción, no se fusionó `main` y no se publicó el portal o el dominio.

## Verificación real de `cotironda-dev`

Consulta SQL de solo lectura antes y después:

| Condición | Antes | Después |
| --- | --- | --- |
| Total políticas comerciales | 23 | 23 |
| Políticas de clientes | 17 sin guard de sesión | **17 con guard de sesión** |
| Políticas del registrador | 6 | 6, expresiones sin cambios |
| Huella MD5 de expresiones del registrador | `c02c800e08731739550b313489448309` | **la misma** |
| Registro SQL | disabled | disabled |
| Organizaciones / sesiones / objetos / jobs | 0 | 0 |
| Políticas de escritura Storage | 0 | 0 |

Security Advisor: continúa un WARN de protección de contraseñas filtradas deshabilitada y dos INFO por tablas privadas con RLS activa y sin políticas de clientes (intencionales). Esta migración no cambia opciones de Auth.

## Límites de evidencia y operaciones pendientes

La prueba con PostgREST real usa JWT firmados en CI, no JWT emitidos por Supabase Auth remoto. Aunque las políticas modificadas ya están instaladas, **falta comprobar vía HTTP que cerrar sesión en Supabase real revoca inmediatamente el acceso con un JWT auténtico anterior**, sin afectar otros usuarios, y probar cookies SSR en HTTPS.

Quedan pendientes de Etapa 01: E2E auténtico de logout/refresh SSR/HTTPS; HTTP 429 del gateway Supabase sin abrir el registro comercial; activar la protección de contraseñas filtradas según plan; revisión de los PR apilados y riesgo de despliegue automático de Vercel. La carga documental sigue cerrada, y ClamAV operativo corresponde a Etapa 02.

## Seguridad operativa y reversión

La migración usa un único bloque transaccional de Postgres; un error detiene el cambio sin completar parcialmente las 17 políticas. Si apareciera regresión real, **no desactivar RLS ni conceder permisos amplios**: preparar una nueva migración de reversión que restaure los predicados anteriores versionados y volver a probar la cadena. En producción solo con autorización explícita.

Ver Issue #76, PR #77 y `docs/50-session-aware-rls-ci.md` para antecedentes históricos.
