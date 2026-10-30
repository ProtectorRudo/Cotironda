# 59 — Inicio de sesión real comprobado en Preview de Cotironda

**30/10/2026 · Etapa 01 · Issue #88 · PR #89 en borrador**

## Evidencia del navegador

El responsable envió una captura del navegador Android dentro de la Preview SSO de `cotironda-portal-dev`. Muestra la página privada «Sesión de prueba activa», el texto de verificación de identidad por Supabase Auth y el botón «Cerrar sesión de prueba». **No muestra formulario de alta comercial ni cargas documentales**.

Según `apps/portal/app/alta/page.tsx`, esta pantalla exige una respuesta positiva del servidor `auth.getUser()` y, en modo Preview, un usuario confirmado y no anónimo.

La captura se conserva solo en la conversación; no se versiona en GitHub.

## Auditoría independiente Supabase, datos agregados

Consultas de logs agregados realizadas para 30/10/2026 UTC 08:00 a 12:00, sin obtener credenciales ni identificadores personales:

| Acción | Resultado |
| --- | --- |
| POST /auth/v1/token | 1 HTTP 200 |
| GET /auth/v1/user | 2 HTTP 200 |
| GET /auth/v1/.well-known/jwks.json | 1 HTTP 200 |
| Auth Audit login | 1 evento |

Estos resultados concuerdan con la captura y corroboran un **inicio de sesión auténtico** y validaciones de identidad del servidor Next.

## Alcance aprobado

- **Aprobado:** login con cuenta existente desde navegador real, acceso a página protegida, sin formulario empresarial.
- **Pendiente:** comprobar logout mediante el botón y que reabrir `/alta` sin autenticación redirija a `/ingresar`.
- **No certificado desde navegador:** atributos específicos de cookies ni HTTP 503 real del endpoint comercial; ambos tienen pruebas CI con Auth sintético.
- **No cerrar la Etapa 01 completa:** quedan otras auditorías, backups, HTTP 429 y controles comerciales.

Protocolo de cierre: tocar «Cerrar sesión de prueba», comprobar regreso a ingreso, volver a `/alta` y verificar que no se muestre la sesión. Compartir únicamente el resultado, sin credenciales ni datos del dispositivo.

No se modificaron Supabase Auth, SQL, producción, DNS o proyectos comerciales para generar esta documentación.

## Segunda evidencia real — salida global y redirección de la Preview (30/10/2026)

El propietario compartió una **segunda captura desde Chrome de escritorio**, correspondiente a la misma Preview del portal. Tras pulsar «Cerrar sesión de prueba», la página visible es **«Ingresá a tu empresa»**, con los campos de correo, contraseña y botón «Ingresar a prueba». No se ven datos privados de la sesión anterior ni formulario empresarial. **La captura completa no se sube a GitHub**, porque incluye contenido privado de otra ventana que es ajeno al ensayo.

### Corroboración independiente en Auth, exclusivamente agregada

Consulta de logs de Supabase dev, ventana UTC **2026-10-30 09:45–10:40**:

| Evidencia | Resultado |
| --- | --- |
| POST `/auth/v1/logout` | **1 × HTTP 204** |
| Auth Audit `logout` | **1** |
| POST `/auth/v1/token` | **1 × HTTP 200** |
| GET `/auth/v1/user` | **2 × HTTP 200** |

La consulta SQL de lectura `SELECT count(*) FROM auth.sessions` arrojó **0 sesiones restantes**. Otra consulta de lectura confirmó `registration_settings.enabled=false`, **0 organizaciones** y **0 objetos Storage**. No se solicitaron, almacenaron ni versionaron correos de los usuarios, contraseñas, JWT, refresh tokens, IDs o IP.

### Decisión de auditoría

- **ACEPTADO:** login genuino en Preview, acceso a vista privada sin alta empresarial, logout global ejecutado por Auth (**HTTP 204** y evento de auditoría), regreso del navegador al formulario de ingreso y **0 sesiones** en `auth.sessions`.
- **PENDIENTE:** comprobar que escribir directamente `/alta` nuevamente después del cierre fuerza `/ingresar` en la **misma Preview**, sin volver a introducir contraseña. La captura de retorno al login **no prueba por sí sola** esta protección contra acceso directo, por lo que no se declara terminada.
- **PENDIENTE:** inspección efectiva de atributos de cookies en HTTPS público del Preview. GitHub CI ya comprobó `Secure`, `SameSite=Lax`, `no-store` y refresh usando Auth sintético, pero no sustituye a una inspección remota.
- **PENDIENTE GENERAL:** HTTP 429 remoto, protección de contraseñas filtradas, backup/restauración y revisión de PR apilados. Etapa 01 no concluida.

**Sin cambios SQL, Auth, secretos, DNS ni producción:** se consultaron datos y se registró evidencia. El PR sigue draft y el Issue #88 permanece abierto hasta completar la prueba de reingreso directo.
