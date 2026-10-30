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
