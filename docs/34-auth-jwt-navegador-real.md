# 34 — Primera prueba de Auth REAL desde el navegador, Cotironda dev

**Fecha:** 29/10/2026 — Etapa 01. **Evidencia aportada por el propietario + comprobaciones independientes de solo lectura.**

## Resultado y alcance preciso
El propietario ejecutó desde Chrome el HTML de diagnóstico local `Cotironda-Prueba-Auth-Local.html` con **dos cuentas exclusivas de ensayo** ya creadas en Supabase Auth. Entregó una captura de los resultados (sin contraseñas ni JWT), donde aparecen todos los controles verdes:

1. RPC sin sesión rechazada (el código del HTML solo exige HTTP >= 400, no distingue motivo criptográfico de rechazo).
2. Supabase Auth devolvió un access token con `role=authenticated`, `is_anonymous=false`, `session_id` y `cotironda_email_verified=true`; en el HTML el payload JWT se **decodifica** (no se verifica su firma localmente).
3. Consulta posterior a `/auth/v1/user` con el bearer respondió HTTP 200 y el identificador coincidió con el `sub` del JWT.
4. RPC de registro con JWT válido devolvió rechazo SQL **específico** (`code=42501` o `registro_no_habilitado`).
5. La misma RPC con JWT de `sub` adulterado y **sin nueva firma** devolvió HTTP 401/403 con indicador de error por JWT, token o firma (no se considera éxito si la rechaza el SQL o por nombre inválido).
6. Supabase Auth rechazó iniciar sesión por contraseña con la cuenta de correo **sin confirmar**, con error `email_not_confirmed`/equivalente.
7. El HTML registró éxito final y luego `/auth/v1/logout?scope=global` para la cuenta confirmada; muestra petición de cierre global aceptada por Auth.

**Referencia exacta del diagnóstico:** SHA-256 del HTML utilizado `26c803472222efb274e94056e7a35dd5f453a822abe7cb659f432bc40f940f5f`. Se inspeccionó su fuente local para corroborar qué valida cada mensaje. El archivo *no* se subió al repositorio ni las credenciales se transmitieron a GitHub/ChatGPT. No hay test E2E con JWT real en CI; la evidencia HTTP es la captura del navegador del propietario y la lógica auditada del HTML, **no una ejecución en el runner de GitHub**.

## Corroboración independiente por Supabase SQL de solo lectura, después de la prueba
- `auth.users`: **2** filas, 1 confirmado y 1 sin confirmar, 0 anónimos; **1** cuenta con `last_sign_in_at` presente.
- `auth.sessions`: **0** filas al consultar.
- `public.organizations`: **0** filas; `public.organization_members`: **0** filas.
- `cotironda_private.registration_attempt_quotas`: **0** filas.
- `cotironda_private.registration_settings.enabled`: **false**.
- `supabase_auth_admin` posee EXECUTE del hook y `authenticated` no; `anon` no puede ejecutar la RPC pública.
- Se comprobó previamente el hook real sobre ambos usuarios: confirmado claim true y pendiente false, 0 discrepancias.

**Conclusión:** quedan validados con la evidencia disponible el login real de la cuenta confirmada, emisión de JWT con claim del hook, identidad reconocida por servidor Auth, denegación de RPC con registro apagado, rechazo por token adulterado, rechazo de login no confirmado, logout global solicitado y cierre sin persistencia de empresa. No hubo acceso al secreto de firma y no se imprimieron credenciales ni identificadores.

## Límites y próximas acciones
- El flujo se ejecutó localmente en Chrome; falta **reproducción automatizada** desde un runner seguro con cuenta de ensayo privada, evitando credenciales en CI de repositorio público sin controles.
- **No** se probó la expiración natural de JWT firmado, refresh token real ni la invalidación inmediata de un access token ya emitido tras logout; una fila de sesión ausente no prueba por sí sola el comportamiento del endpoint si la barrera SQL sigue apagada.
- **No** se probaron SSR de Next.js, renovación/cookies HTTPOnly ni la carga real de la UI de un portal habilitado. El portal continúa cerrado y no debe activarse para estas pruebas sin revisión independiente.
- **No** se probó un HTTP 429 real de PostgREST remoto: la cuota SQL y el SDK con fetch simulado sí están cubiertos por CI.
- **No** se validó la creación de una empresa: continúa prohibida mientras siga `registration_settings.enabled=false` y el portal apagado.
- Revisar más adelante anonimización de resultados y tests reproducibles de JWT caducado/revocado, sin publicar ni habilitar compras.

## Integración y resguardo
- Estado del desarrollo: PR #41 **draft**, hijo de PR #39 y el resto del stack. No fusionar a `main` ni desplegar.
- La rama `main` dispone de ruleset activo, pero Vercel tiene conexión con rama productiva; cualquier integración/publicación requiere autorización separada.
- [PR #41](https://github.com/ProtectorRudo/Cotironda/pull/41), [Issue #40](https://github.com/ProtectorRudo/Cotironda/issues/40).
