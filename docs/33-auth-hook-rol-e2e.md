# 33 — Auth Hook activado: comprobación de rol y preparación de JWT reales

**29/10/2026 · Etapa 01 · sin publicación ni habilitación de registro.**

## Evidencia confirmada
- El propietario activó mediante dashboard **Authentication → Auth Hooks → Customize Access Token (JWT) Claims**, tipo Postgres, esquema `cotironda_private`, función `email_verified_access_token`, en proyecto de desarrollo **`cotironda-dev`**. La pantalla mostró **ENABLED** y notificación de creación exitosa.
- Comprobación SQL de solo lectura sobre el Supabase real: `email_verified_access_token` devolvió `cotironda_email_verified=false` para un UUID inexistente. No se insertaron cuentas, sesiones ni empresas.
- Supabase dev: 7 migraciones aplicadas, `registration_settings.enabled=false`, 0 usuarios, 0 sesiones y 0 empresas al comprobar; Security Advisor sin WARN/ERROR (único INFO conocido sobre tabla privada con RLS sin policy por diseño).
- **No se probó aún la emisión de JWT por el servidor Auth ni la firma en un login real**. El estado ENABLED del dashboard y la función SQL aislada son evidencias diferentes.

## Prueba automatizada nueva
El archivo `supabase/tests/ci/70_invoker_email_hook.sql` ahora hace `SET LOCAL ROLE supabase_auth_admin` dentro de un fixture reversible en PostgreSQL efímero. Con ese rol restringido invoca **realmente** la función SQL `SECURITY INVOKER` con cuatro entradas: cuenta confirmada con metadata falsa (claim verdadero), pendiente con metadata falsa positiva (claim falso), anónima confirmada (falso) e inexistente (falso). Se verifica que el hook preserve el `sub` y no cambie `user_metadata`, y que los permisos de ejecución de clientes sigan revocados.

Este ensayo **emula** únicamente el rol de Auth y el esquema de `auth.users` en PostgreSQL 17: no crea una sesión ni verifica la firma real de Supabase Auth. Se ejecuta en el job PostgreSQL existente y se conservan el segundo job de reconstrucción de siete migraciones, los tests de aislamiento, Next y sitio.

## Higiene del runner E2E auténtico
El runner manual `apps/portal/scripts/auth-real-smoke.mjs` ahora pide al servidor `auth.signOut({scope:'global'})` en lugar de cerrar sólo localmente. **Usar exclusivamente dos cuentas dedicadas de prueba**, porque el cierre global revoca refresh tokens de todas sus sesiones. Comprueba que el SDK deje la sesión local vacía y reporta solo resultados PASS/FAIL, nunca tokens ni contraseñas.

Importante: JWT ya firmados pueden conservar validez criptográfica hasta exp; `signOut` **no demuestra** por sí solo que un JWT capturado no pueda usarse. La base tiene un guard SQL específico contra sesiones revocadas, probado con sesiones emuladas; falta la evidencia E2E sobre Auth real, cookies SSR y 429 auténtico de PostgREST.

## Próximo ensayo Auth real: preparación mínima y segura
Este ensayo **no** se inició. Los conectores habilitados no ofrecen una acción de gestión de usuarios/Auth Hooks y no vamos a crear cuentas escribiendo directamente en `auth.users` con SQL. Hace falta preparar dos cuentas dedicadas en **Authentication → Users** de `cotironda-dev` mediante un flujo genuino de Supabase Auth: una cuenta confirmada y otra sin confirmar. Las contraseñas se cargan únicamente en entorno local privado, **nunca** en GitHub, Issues, capturas, chats ni logs de CI.

Una vez preparadas y comprobadas las credenciales de ensayo:
1. Confirmar proyecto dev y que `registration_settings.enabled=false`; mantener el portal cerrado.
2. Configurar localmente las ocho variables `COTIRONDA_E2E_*` listadas en `docs/24-auth-e2e-seguridad.md`, sin imprimirlas ni guardarlas en control de versiones.
3. Ejecutar desde `apps/portal`, con dependencias exactas instaladas: `node --experimental-strip-types scripts/auth-real-smoke.mjs`.
4. Exigir JWT genuino de cuenta confirmada con `cotironda_email_verified=true`, rechazo de cuenta sin confirmar/claim false, rechazo de RPC anon, denegación SQL `registro_no_habilitado`, y rechazo por **firma** del token manipulado (no basta con un 403 por el flag SQL).
5. Ante falla, no habilitar registros; verificar logs acotados sin secretos y, si el hook interrumpe el login, desactivarlo temporalmente **solo en cotironda-dev**, documentando el incidente.
6. Inspeccionar que no se crearon empresas, revisar sesiones de ensayo y cerrar sesión del usuario. La prueba de expiración y revocación JWT auténtica sigue en una etapa aislada.

**Prohibido** para este paso: poner `registration_settings.enabled=true`, habilitar el registro en Vercel, usar credenciales comerciales, service role, cambiar la rama `main` o publicar producción.

## Entrega
- [Issue #40](https://github.com/ProtectorRudo/Cotironda/issues/40)
- Nueva rama hija de [PR #39](https://github.com/ProtectorRudo/Cotironda/pull/39)
- El workflow de CI final, commit y PR se registran después de ejecutar y revisar resultados reales.
