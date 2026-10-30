# 64 — Auditoría REMOTA de autorregistro Supabase Auth, GET-only desde GitHub Actions

**Etapa 01 · 30/10/2026 · Issue #98 · rama `security/01-auth-settings-remote-probe` · PR DRAFT · Sin publicación**

## Riesgo y por qué el test anterior no alcanzaba

El registro comercial de Cotironda está deshabilitado por el interruptor SQL `cotironda_private.registration_settings.enabled=false` y la interfaz Next en modo login-only no contiene `signUp`. No obstante, **eso no prueba que alguien no pueda llamar directamente a `POST /auth/v1/signup`** y crear usuarios en Supabase Auth, aunque no pueda crear una organización de Cotironda. La API pública de GoTrue ofrece una lectura oficial de esa configuración mediante `GET /auth/v1/settings`.

El PR #95 implementó un comprobador que interpreta el booleano `disable_signup` sin realizar escrituras, pero la cuota Vercel impidió desplegar su botón. El agente no puede abrir el endpoint desde su contenedor (DNS externo no disponible) y el navegador/lector web tampoco pudo obtener el recurso. **No usar esos fallos de red para suponer que el autorregistro está cerrado.**

## Procedimiento autorizado y automatizado, sin secretos

`scripts/ci/auth-settings-remote-probe.mjs` reutiliza `src/server/auth-signup-readonly-audit.ts`, el evaluador existente y ya probado, para realizar **como máximo un GET a `https://qkercsoqhehbenbbncwk.supabase.co/auth/v1/settings`**.

Se limita a una ejecución de PR con **todas** estas barreras:
- `GITHUB_ACTIONS=true`, `GITHUB_EVENT_NAME=pull_request`, repositorio `ProtectorRudo/Cotironda`.
- `GITHUB_HEAD_REF=security/01-auth-settings-remote-probe` exactamente, sin prefijos ni otras ramas. En GitHub Actions, además exige que el repositorio del PR head sea el mismo (no un fork).
- `COTIRONDA_CI_AUTH_REMOTE=true` y una clave pública de formato `sb_publishable_...`. Se usa la publishable existente de Cotironda dev, **no** una clave secret ni `service_role`.
- Método GET solamente, `Accept: application/json`, `credentials: omit`, cache no-store, redirects prohibidos, referer omitido, timeout de 6,5 s, URL exacta y límite de tamaño de respuesta.
- **Nunca** se usa email, password, JWT, refresh token, sesión, datos de otras empresas, ni se envía `POST signup`.
- Solo loguea el estado sanitizado `COTIRONDA_AUTH_SIGNUP=PASS|FAIL|INCONCLUSO` y un código de motivo fijo. No guarda body JSON, headers completos, ni la apikey en un artifact o un log.

`tests/unit/auth-settings-remote-probe.test.mjs` intercepta el transporte y prueba respuestas `true`, `false`, ausente, HTTP 503, HTML, fallo de conexión, contextos no autorizados, ramas equivocadas y claves secretas. Importar el módulo en CI **no realiza red** por el guard de ejecución del script.

## Resultado: estados y significado

| Código | Salida | Interpretación |
|---|---|---|
| `PASS` + exit 0 | `disable_signup:true` | GoTrue público informa que **no permite autorregistro general** |
| `FAIL` + exit 1 | `disable_signup:false` | **El autorregistro general está permitido**. No abre empresas por sí solo, pero crea riesgo de cuentas/cuotas |
| `INCONCLUSO` + exit 2 | HTTP no 200, CORS, timeout, campo ausente, JSON inválido | No declarar seguro; la configuración remota no se pudo verificar |
| `INCONCLUSO` + exit 3 | Entorno o rama no autorizados | No hacer ninguna petición externa |

El gate **falla intencionalmente cuando detecta un riesgo real**. Un workflow rojo en ese caso no significa que los tests unitarios hayan fallado; el log permite distinguir riesgo Auth de defecto de código. No eliminar el gate ni degradarlo a un aviso verde para ocultar el riesgo.

## Si el resultado remoto es FAIL

1. Comprobar que el único campo utilizado fue `disable_signup:false` del proyecto dev exacto y confirmar que Auth de Cotironda aún admite las dos cuentas de ensayo actuales.
2. Mantener registro comercial `false`, portal Preview SSO y acceso a `main` bloqueado.
3. Evaluar cambiar **Authentication → General → Allow new users to sign up** en el Dashboard de **cotironda-dev** para impedir nuevas cuentas, sin desactivar sign-in de usuarios existentes. Confirmar según la [guía oficial de configuración Auth](https://supabase.com/docs/guides/auth/general-configuration) y el alcance de invitaciones/usuarios anónimos. **No aplicar sin revisar impacto y autorización sobre Auth**.
4. Una vez autorizada la corrección, volver a ejecutar **GET /settings**, verificar `disable_signup:true`, 2 usuarios, 0 empresas y sin cambios en RLS. No probar creando cuentas.
5. Mantener abierta la decisión de Auth leaked-password protection (Security Advisor WARN) y los límites de Auth (emails/rate limits).

## Limitaciones

- No sirve para demostrar la denegación efectiva de un POST signup específico, sino la configuración pública informada por GoTrue. No se realiza POST porque crearía usuarios o consumiría recursos de forma innecesaria.
- No prueba HTTP 429 real de la RPC empresarial: el flag comercial `false` evita que se llegue al contador de 20/60. Esa prueba requiere un diseño independiente que no abra empresas.
- No sustituye Auth con permisos de proyecto por usuario/empresa, ni demuestra continuidad de backups o cookie attributes de un Preview remoto.
- La URL Auth es pública, la publishable key ya se distribuye con el frontend. No se habilitan roles altos ni secretos.
- No desplegar a Vercel ni cambiar DNS, SSO, Auth hospedado, SQL, `main` o producción con este PR.

## Fuente de verificación

- [Supabase Auth: General Configuration](https://supabase.com/docs/guides/auth/general-configuration), opción de nuevos usuarios.
- [GoTrue GET /settings](https://supabase.com/docs/reference/self-hosting-auth/returns-the-configuration-settings-for-the-gotrue-server), devuelve el campo `disable_signup`.
- [Supabase CLI / auth.enable_signup](https://supabase.com/docs/guides/local-development/config), registro de proyecto local y distinción de Auth gestionado.
- [docs/62](62-auth-signup-readonly-audit.md), diagnóstico de lectura de navegador.

**Estado del resultado remoto real: PENDIENTE de la ejecución de GitHub Actions del PR exacto.** Dejar evidencia del resultado sin imprimir datos sensibles.

## Resultado AUTÉNTICO de Supabase Auth — 30/10/2026

**Riesgo confirmado: `disable_signup=false` en `cotironda-dev`.** GitHub Actions ejecutó el helper **una sola vez**, desde la rama y el repositorio previstos, con `GET /auth/v1/settings`. El resultado de su contrato booleano estricto fue `COTIRONDA_AUTH_SIGNUP=FAIL / autorregistro_auth_habilitado`, paso con `exitCode=1`: https://github.com/ProtectorRudo/Cotironda/actions/runs/41060813027

**Corroboración independiente de Supabase Logs, UTC 12:50–13:25 del 30/10/2026:** 1 solicitud **GET /auth/v1/settings, HTTP 200**, sin POST Auth signup ni operaciones de escritura. Los logs de gateway corroboran método y estado HTTP, **no** el cuerpo; el booleano específico proviene del validador de GitHub ejecutado sobre la respuesta recibida. No se recuperaron ni compartieron claves privadas, emails, JWT, sesión o cuerpo JSON de Auth.

**Regresión real al mismo momento, solo lectura:** `registration_settings.enabled=false`, 2 usuarios Auth existentes (1 con email confirmado), **0** sesiones, organizaciones y objetos Storage. No se creó ninguna cuenta nueva al realizar la auditoría. No se ha efectuado una llamada POST /signup: el resultado acredita **configuración que permite el registro**, no un alta efectiva probada con correo.

**Pruebas y separación de resultados:** las **245/245 unitarias pasaron** en el mismo run, así como las otras cuatro workflows de Next, PG17, PostgREST y sitio. **1 de 5 workflows figura FAILURE a propósito** porque el gate de seguridad detectó la configuración insegura, no por una regresión de TypeScript/Node. No convertir este FAIL en verde artificialmente.

### Decisión y remediación pendiente

1. **Mantener abierto Issue #94** por autorregistro Auth permitido. El cierre del registro comercial en Cotironda SQL **continúa activo y es independiente**.
2. Opción de mitigación preferida para `cotironda-dev`: en el [Dashboard del proyecto](https://supabase.com/dashboard/project/qkercsoqhehbenbbncwk/auth), ir a **Authentication → General**, desactivar **«Allow new users to sign up»**, guardar. La documentación oficial confirma que, al desactivarlo, **los usuarios existentes pueden continuar iniciando sesión**; las cuentas nuevas solo se habilitan por flujos administrativos autorizados. No desactivar email/password sign-in ni borrar/banear las dos cuentas.
3. **Esta modificación NO se realizó**: el conector disponible permite lectura/SQL, pero no editar la configuración gestionada de GoTrue. No cambiar SQL, tablas del esquema Auth ni usar service_role como sustituto.
4. Tras la intervención autorizada, volver a ejecutar el workflow fallido para demostrar `disable_signup=true` (PASS), corroborar 2 usuarios/0 empresas y, si se considera necesario, volver a comprobar el login de una cuenta de prueba. Mantener SSO en Vercel y registro comercial false.
5. Mantener separado el aviso del Security Advisor: `auth_leaked_password_protection` todavía WARN, y dos INFO por RLS intencional deny-all en tablas privadas.

**Conclusión de Issue #98 (evidencia): COMPLETADO. Conclusión de Issue #94 (protección efectiva): PENDIENTE.** Etapa 01 y PRs siguen abiertos hasta completar otras verificaciones y la aprobación de cambios.
