# 170 — MVP-050: permisos reales para la conexión privada de Whapi

**01/11/2026 · Issue #313 · Solo GitHub y PostgreSQL17 CI. Ningún acceso nuevo a Supabase DEV.**

## Para qué sirve

El receptor Next.js `/api/integraciones/whapi` del MVP-048 ya valida el encabezado secreto y usa el broker HMAC + AES-GCM. Sigue devolviendo 503 porque no tiene una conexión SQL privada instalada. Conectar el usuario administrador de Supabase o el `service_role` para destrabarlo sería innecesario y peligroso.

Este incremento prepara la **identidad de permisos mínimos** que utilizará el receptor HTTP, sin crear todavía una credencial. Supabase recomienda un usuario técnico diferente por servicio, con los privilegios expresamente necesarios. Ver [Roles PostgreSQL](https://supabase.com/docs/guides/database/postgres/roles).

## Implementación D084

`supabase/sql/whapi_http_gateway_role_d084.sql` crea `cotironda_whapi_http_gateway_d084`, rol `NOLOGIN NOINHERIT NOBYPASSRLS`, sin contraseña, sin membresía en el antiguo gateway general D030 y sin permisos de SELECT/INSERT/UPDATE/DELETE de las tablas privadas.

**Concede exactamente seis RPC privadas necesarias para el flujo AES versionado**:

- Proveedor: `whapi_resolve_active_contact_v1`, `whapi_inbox_record_keyed_v1`, `whapi_record_optout_v1`.
- Comprador: `whapi_resolve_buyer_d074`, `whapi_record_buyer_d074`, `whapi_buyer_optout_d074`.

No concede la RPC legada de escritura del proveedor, la lectura de pedidos D076, el seguimiento de zona D077, la creación de ronda D081, la cola D082, la lectura de presupuestos D061 ni el envío Whapi D070. Tampoco tiene acceso a usuarios de Auth ni a tablas públicas comerciales por pertenecer a otro grupo.

La propia implementación de cada RPC sigue validando identidad HMAC, consentimiento, ronda y datos cifrados bajo un dueño NOLOGIN y sin `BYPASSRLS`. El rol externo no puede inspeccionar datos fuera de esas funciones.

## Prueba PostgreSQL17 (no simulación de permisos)

`supabase/tests/ci/133_whapi_http_gateway_role_d084.sql` ejecuta contra la base PostgreSQL17 descartable de GitHub, con `ROLLBACK`:

- Inspecciona explícitamente flags de rol, seis permisos positivos y permisos negativos de tablas/colas/lectura y funciones de trabajo.
- Crea un login de ensayo **sin contraseña** dentro de una transacción temporal, con membresía heredable únicamente del rol D084. Verifica que pueda ejecutar las dos funciones de resolución segura para contactos inexistentes y que no pueda hacer SELECT del inbox, leer proveedores ni reclamar trabajos.
- Comprueba que el login temporal y todos sus cambios desaparecen con ROLLBACK; no se exporta una credencial, ni se genera un puerto público.

## Qué falta para activar el piloto real

1. **#175:** respaldar y restaurar en forma aislada cotironda-dev, sin pegar DSN, claves AGE o contraseñas en el chat. MVP-049 ya dejó el ensayo local preparado, pero aún no ejecutado sobre copia real.
2. Instalar D024+ y D084 después de verificar migraciones, permisos y compatibilidad de Supabase. Ninguna de estas migraciones está instalada hoy en DEV.
3. Crear **en el entorno autorizado**, por un operador con acceso privado, un login técnico separado con contraseña fuerte/rotación; heredar solo D084, restringir conexiones y utilizar TLS. No escribir ni distribuir esa contraseña en el repositorio, Vercel Preview público o logs.
4. Instalar y verificar un cliente PostgreSQL versionado en servidor (hoy no existe en `apps/portal`). Conectarlo a D083 **únicamente** en Preview controlada, con números en allowlist y flags desactivados por defecto.
5. Conectar después los workers D082/D077/D081/D071 con **otras identidades privadas**, respetando separación de funciones. Una identidad de receptor no debe poder invocar workers, extraer ofertas ni enviar mensajes.

Sin esos pasos, la ruta HTTPS existente sigue rechazando la recepción con 503. **Este incremento no habilita WhatsApp, no instala SQL en Supabase DEV y no cambia producción.**

## Por qué no abrimos un proyecto nuevo

Se inspeccionaron los proyectos actuales de la organización; existe `cotironda-dev` y otro proyecto activo. Crear una instancia o rama adicional puede generar costos o requerir otra cuota. No se creó una instancia porque primero habría que confirmar el costo y la autorización; la alternativa segura inmediata sigue siendo cerrar el control de respaldo y después habilitar DEV o un entorno de ensayo expresamente aprobado.
