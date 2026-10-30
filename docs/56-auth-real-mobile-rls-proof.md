# 56 — Evidencia real: revocación de sesión en Chrome Android

**30/10/2026 · Etapa 01 · Cotironda DEV · Issues #78 y #84 · PR #85 draft**

## Resultado: control JWT real validado en desarrollo

El responsable ejecutó el diagnóstico de Cotironda con dos cuentas de ensayo desde Chrome Android, abriendo un archivo local. Compartió una captura donde se ven **ocho PASS y ningún FAIL**:

1. Supabase emitió JWT para la cuenta confirmada.
2. Identidad, correo confirmado y sesión JWT verificados.
3. Catálogo visible antes de cerrar sesión (HTTP 200).
4. Logout global reconocido por Supabase.
5. JWT original aún no vencido.
6. **Mismo JWT después del logout: HTTP 200 y catálogo vacío por RLS**.
7. Cuenta sin confirmar rechazada por Auth.
8. Diagnóstico completo sin errores.

**Límite de evidencia:** el contenido de las respuestas del catálogo (filas antes y lista vacía después) se observa en el resultado del diagnóstico del dispositivo, no en logs del gateway. Estos últimos confirman las rutas, códigos y eventos pero no el cuerpo JSON.

## Corroboración independiente en Supabase

Se consultaron exclusivamente **logs agregados**, sin pedir correos, IP, contraseñas, JWT, identificadores personales o cuerpos de respuesta. Ventana UTC 2026-10-30 06:50 a 08:00:

| Fuente | Operación | Evidencia |
|---|---|---|
| Auth Audit | login | 1 |
| Auth Audit | logout | 1 |
| Gateway | POST /auth/v1/token | 1 HTTP 200 |
| Gateway | POST /auth/v1/token | 1 HTTP 400 |
| Gateway | GET /auth/v1/user | 1 HTTP 200 |
| Gateway | POST /auth/v1/logout | 1 HTTP 204 |
| Gateway | GET /rest/v1/catalog_categories | **2 HTTP 200** |

También hubo preflight OPTIONS CORS normales.

Consulta SQL posterior (solo lectura):

| Verificación | Valor |
|---|---|
| Registro de empresas habilitado | **No** |
| Cuentas Auth | 2 (1 confirmada) |
| Sesiones Auth | **0** |
| Empresas | **0** |
| Objetos Storage | **0** |
| Rubros semilla activos | 5 |
| Políticas SELECT de catálogo con guardia de sesión | 1 |

Security Advisor: sigue un WARN por protección de contraseñas filtradas desactivada y dos INFO de tablas privadas con RLS sin políticas públicas.

## Interpretación

El token original seguía dentro de su período de validez. Al revocar la sesión, el guard de autorización RLS pasó de permitir las categorías a no mostrar ninguna, aunque el GET mantuviera HTTP 200. **Un HTTP 401, 403 o expiración del JWT no habrían demostrado esto**. Se usó catálogo semilla, no la RPC de registro bloqueada por la bandera comercial, evitando falsos positivos.

## Decisión

- Issue #78, revocación JWT genuino: **criterio concreto alcanzado en DEV**; cerrar después de registrar evidencia.
- Issue #84, diagnóstico navegador con credenciales solo locales: **ejecutado y corroborado**; cerrar después de registrar evidencia.
- **Etapa 01 general todavía abierta**: faltan pruebas de navegador/Next bajo HTTPS Preview autorizado, HTTP 429 remoto sin abrir registro, decisión sobre WARN de password leakage, auditoría de backup/recuperación y consolidar PRs apilados.
- Ninguna imagen de dispositivo ni datos de cuentas se subirán al repositorio. Se conserva evidencia técnica agregada.
- Sin cambiar Supabase, usuarios, passwords, migraciones, Storage, DNS, Vercel, main ni producción por esta documentación. PR draft sin merge.

Documentos antecedentes: docs/52-auth-real-revoked-catalog-e2e.md y docs/55-browser-auth-dev-diagnostic.md.
