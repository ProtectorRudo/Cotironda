# MVP-082 — Cuenta técnica separada y prueba privada de conexión

**Fecha:** 02/11/2026 · Issue #378 · Rama `feat/mvp-082-piloto-login-privado`, apilada sobre PR #377.

## Decisión

No exponer las cotizaciones originales a un token Supabase público ni utilizar `postgres`/service-role desde el navegador. La base PILOTO tiene ya `cotironda_piloto_reader`, rol NOLOGIN con RLS y SELECT mínimos (MVP-081). MVP-082 agrega una **segunda identidad** LOGIN, sin privilegios heredados y sin contraseña inicialmente. Sólo esa identidad puede ejecutar `SET LOCAL ROLE cotironda_piloto_reader` dentro de la transacción `READ ONLY` del proceso server, nunca por solicitud libre del comprador.

## Entregables

- `supabase/piloto/mvp082_login_sin_password.sql`: rol `cotironda_piloto_reader_login` con `LOGIN PASSWORD NULL NOINHERIT`, sin BYPASSRLS, superusuario, creación de roles o bases, con máximo 2 conexiones y límite de tiempo. Se asigna membresía con `SET TRUE, INHERIT FALSE, ADMIN FALSE`. **No da privilegios SELECT directamente al LOGIN**.
- `apps/portal/server/lector-postgres-mvp081.ts`: dentro de la transacción READ ONLY ejecuta `SET LOCAL ROLE cotironda_piloto_reader`, verifica `current_user` antes de ejecutar la consulta SQL fija de MVP-080 y cierra conexión en `finally`. Sólo retorna plantilla anónima; se rechaza SHA erróneo y la falta de revisión de privacidad deja oferta retenida.
- `src/server/lector-pg-config-mvp081.ts`: permite Preview seguro con `NODE_ENV=production` y `VERCEL_ENV=preview` **únicamente si está expresamente habilitado**; bloquea Vercel Production incluso con flag activado, y valida usuario dedicado, nombre de base `/postgres`, SSL, host y puerto autorizado. Desarrollo local también requiere flag.
- `apps/portal/scripts/piloto-lector-smoke.mjs`: ensayo operator-only con el UUID del pedido suministrado por variable de entorno, siempre con revisiones de privacidad vacías; reporta **sólo cantidad de ofertas retenidas**, jamás nombre, fuente, precio, SHA, UUID ni teléfono. No hay ruta HTTP, webhook ni envío.
- `tests/unit/mvp082-login-privado-preflight.test.mjs`: casos Preview/Production, URL alterada, SQL de rol no heredado, obligación de transacción y verificación de rol.

## Validación y límites

Las pruebas CI deben aprobar antes de instalar migración; después auditar en PILOTO login flags, membresía `SET`, no herencia `USAGE`, y cero permisos DML heredados, más flags WhatsApp. No instalar ni cambiar roles en DEV histórica o producción.

**Login sin contraseña no es una conexión real.** No emitir una contraseña ni modificar secretos de Vercel sin un método verificado que los entregue cifrados y sin exposición en logs; la contraseña debe permanecer fuera de GitHub, chats, PR y ficheros descargables. Si se configura una credencial en el futuro, limitarla a Preview y revocarla después de pruebas. El smoke con una conexión PostgreSQL autenticada permanece pendiente mientras no se habilite este paso.

**Antes de mostrar presupuestos al arquitecto:** verificar una sesión de comprador válida y pertenencia al pedido, obtener aprobación de privacidad confiable por *todos* los renglones, comprobar originales PDF/Excel/imágenes, conservar extras, total declarado y anonimato de 4 días. No se agregó un endpoint público; no hay ganadores ni contactos revelados. No inventar que el sistema ya sirva presupuestos reales.

## Aceptación

- SQL limitado a la base PILOTO y migración con RLS, sin writes a fuentes, cron o outbox.
- 0 secretos en GitHub; 0 nuevas variables de conexión del navegador; Production bloqueado.
- Pruebas unitarias, PostgreSQL 17/PostgREST/Next.js y sitio 5/5 PASS; antes de afirmar conexion real, smoke remoto con rol LOGIN y prueba de denegación de escritura.
