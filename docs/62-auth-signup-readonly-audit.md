# 62 — Auditoría de alta de cuentas Supabase Auth: lectura sin efectos

**Etapa 01 · 30/10/2026 · Issue #94 · PR hijo de #93 · rama `security/01-auth-signup-readonly-check` · SIN PUBLICAR**

## Hallazgo: dos registros diferentes

La pantalla `/ingresar` de Cotironda en modo Preview SSO no incluye `signUp` ni «Crear cuenta», y `cotironda_private.registration_settings.enabled` está en **false**. Esto bloquea el **registro comercial de empresas** mediante las rutas protegidas y la RPC `public.register_company_for_current_user`. **NO prueba** que Supabase Auth bloquee que un tercero cree una cuenta **directamente** usando `/auth/v1/signup`.

Un atacante no necesita el portal Next para comunicarse con los endpoints públicos de Auth si la configuración hospedada `disable_signup=false` lo permite. Eso podría generar cuentas Auth y consumir cuota de correos, incluso con **0 empresas** en Cotironda. El campo `external.email=true` por sí solo no determina el estado de autorregistro; no confundirlo con `disable_signup`.

**Lecturas reales, sin mutaciones, en `cotironda-dev` (30/10/2026):**
- Flag comercial de SQL `false`, dos usuarios de ensayo, 0 empresas, 0 sesiones, 0 filas de intentos.
- `public.register_company_for_current_user`: `anon_execute=false`, `authenticated_execute=true`, `security_definer=false`. Es accesible a autenticados, pero el interruptor SQL deniega la ejecución comercial.
- `cotironda_private.register_company_with_verified_claim`: `authenticated_execute=true` y propietario restringido `security_definer=true`, tras comprobar el flag SQL, claims firmados y sesión; no expuesto como RPC pública del esquema `public`.
- `cotironda_private.consume_registration_attempt`: ejecución denegada a `anon`, `authenticated` y `service_role` directamente; disponible para el registrador limitado.
- La migración 7 implementó **20 intentos por usuario cada 60 minutos, con respuesta 429 desde PostgREST** si se agota el cupo, solo **después** de abrir el flag comercial. El código Next de cuotas `src/server/limite-intentos.ts` continúa fallando cerrado; no hay forma autorizada de probar ese 429 **remoto** mientras el registro siga cerrado. CI sí ejecuta PostgREST 429 con JWT ficticios, no el gateway remoto.

**Estado real del autorregistro Auth:** **INCONCLUSO** hasta recibir lectura auténtica de `/auth/v1/settings` o verificar Auth config vía el Dashboard. El acceso SQL no revela automáticamente la configuración gestionada de GoTrue. **No se envió un POST signup ni se crearon cuentas.**

## Herramienta propuesta y desarrollada

Se implementa `src/server/auth-signup-readonly-audit.ts`, un helper puro que consume **solo GET**:

`https://qkercsoqhehbenbbncwk.supabase.co/auth/v1/settings`

Con cabecera `apikey` **publishable** (nunca JWT, service role, correo o contraseña), `Accept: application/json`, `credentials:'omit'`, `redirect:'error'`, `cache:'no-store'`, `referrerPolicy:'no-referrer'`, timeout de 6,5 segundos y URL exacta del proyecto. No hay POST, creación, login ni RPC. La respuesta se limita a un objeto de estado/síntesis; **no imprime ni persiste** el JSON crudo ni valores de la configuración.

El campo público GoTrue `disable_signup`, documentado oficialmente, determina el resultado:

| Respuesta de `/settings` | Resultado y significado |
| --- | --- |
| HTTP 200 JSON con `disable_signup:true` | **PASS:** GoTrue informa que el autorregistro general está bloqueado |
| HTTP 200 JSON con `disable_signup:false` | **FAIL:** la API Auth informa que el autorregistro general está permitido; **SQL de empresas sigue cerrado por separado** |
| Campo ausente, valor no booleano, error HTTP, CORS, JSON inválido, redirect, body excesivo, proyecto/clave incorrectos | **INCONCLUSO:** no declarar Auth cerrado sin evidencia |

La UI `AuditoriaRegistroAuth` se muestra **exclusivamente después de `auth.getUser()` exitoso** en el bloque `if(entornoAuthSoloIngresoPreview())` de `/alta`, no en `/ingresar` ni en registro comercial. Botón: **«Comprobar autorregistro Auth»**. El resultado no muestra correos, claves, IDs, tokens ni JSON crudo.

### Aislamiento

La compuerta server-only de la Preview exige:
- `VERCEL_ENV=preview`;
- `COTIRONDA_AUTH_PREVIEW_ENABLED=true` y `COTIRONDA_REGISTRATION_ENABLED=false` literales;
- referencia exacta `cotironda-dev` y clave publicable, sin service role;
- rama `VERCEL_GIT_COMMIT_REF` en lista cerrada: `test/01-auth-only-preview`, `security/01-browser-cookie-cache-audit` o **`security/01-auth-signup-readonly-check`**.

Esta incorporación no cambia las Previews anteriores ni habilita el autorregistro real; necesita un deployment Vercel **nuevo** de la rama exacta. El último intento de nueva Preview fue bloqueado por cuota diaria `402 api-deployments-free-per-day`. **No reintentar Vercel mientras continúe ese límite ni sortear SSO con share-link.**

## Pruebas y límites

`tests/unit/auth-signup-readonly-audit.test.mjs` prueba respuestas true/false/ausente, esquemas anómalos, HTML, 401/403/429/500, CORS/timeouts, tamaño excesivo, claves incorrectas/secretas, ningún request remoto fuera del origen, ausencia de body o datos sensibles en salida y guard de rama. `apps/portal/scripts/smoke-https-ssr.mjs` exige botón en HTML de ruta privada después de Auth ficticio; `.github/workflows/portal-ci.yml` compila y prueba un **cuarto contexto** de Next real HTTPS TLS loopback con credenciales CI ficticias.

Estas pruebas NO certifican que el valor `disable_signup` actual sea verdadero o falso en Supabase hospedado. La lectura real necesita conexión directa a la API Auth y debe hacerse solo **una vez** desde la Preview SSO o desde un entorno autorizado; no se autoriza un POST de alta como prueba.

### Verificación posterior necesaria

1. Confirmar 5/5 CI del commit exacto.
2. Cuando Vercel permita una Preview, crear únicamente el proyecto correcto `cotironda-portal-dev`, con rama autorizada, `target=null`, SSO `all` y guard `ALLOW`. No cambiar DNS ni producción.
3. En un navegador autenticado de ensayo, pulsar **«Comprobar autorregistro Auth»** y compartir **solo PASS/FAIL/INCONCLUSO**. No mandar contraseñas ni capturas de DevTools.
4. Si da **FAIL**, revisar configuración oficial **Authentication → General → Allow new users to sign up**, evaluar deshabilitar el autorregistro mientras se hacen pruebas con cuentas preexistentes y conservar alta comercial cerrada. **No cambiar Auth hospedado sin verificación de impacto y autorización**.
5. Si da INCONCLUSO, inspeccionar CORS/GET público o configuración por canal oficial, sin usar APIs de escritura.

## Referencias oficiales

- [Supabase Auth — General configuration](https://supabase.com/docs/guides/auth/general-configuration): «Allow new users to sign up» es independiente del portal de Cotironda.
- [Supabase Auth REST — GET /settings](https://supabase.com/docs/reference/self-hosting-auth/returns-the-configuration-settings-for-the-gotrue-server): expone `disable_signup` como booleano público.
- [Supabase Auth source — endpoint GET /settings](https://github.com/supabase/auth): endpoint con respuesta pública y sin acción de creación.
- [Supabase Auth — Password security](https://supabase.com/docs/guides/auth/password-security): protección contra contraseñas filtradas requiere tratamiento separado; Security Advisor del proyecto la informa como WARN.

**Pendientes independientes:** HTTP 429 auténtico de PostgREST con registro cerrado, continuidad real de backups (Issue #90), cookies HTTPS observadas (Issue #80/#92), advertencia leaked-password-protection (plan/costo), y consolidación de PRs. **Etapa 01 no está lista para piloto**.
