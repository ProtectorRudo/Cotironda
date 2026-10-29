# 28 — Cuota persistente y atómica de intentos de registro

**29/10/2026. Estado:** séptima migración aplicada exclusivamente en `cotironda-dev` y CI aprobado. Sin registros comerciales. No fusionar los PR apilados ni desplegar producción.

## Problema corregido
La barrera de cinco empresas exitosas por usuario/24 h no limita solicitudes fallidas ni accesos directos a Supabase PostgREST. Un contador sólo en Next.js podría eludirse llamando a la RPC con el JWT propio. Además, un `RAISE EXCEPTION` que ocurre después de actualizar una cuota revierte **también** ese incremento. Los intentos inválidos quedarían sin contar.

## Solución implementada
- Migración oficial `20261029140422_registration_attempt_rate_limiter.sql`, creación documentada por servicio Supabase `apply_migration`. La versión proviene del historial real de `cotironda-dev`.
- `cotironda_private.registration_attempt_quotas`: una fila por usuario, FK con `auth.users` (`ON DELETE CASCADE`), `window_started_at` y `request_count` saturado en 21. **Límite inicial: 20 llamadas autenticadas por usuario por ventana fija de 60 minutos**. No almacena direcciones IP, mensajes ni contenido de formularios.
- Actualización única `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`: el bloqueo por clave primaria serializa la concurrencia. La función es `SECURITY INVOKER` privada y no invocable por clientes. La tabla privada tiene RLS; sólo `cotironda_registrar`, rol NOLOGIN/NOBYPASSRLS, recibe privilegios mínimos.
- La RPC pública sigue `SECURITY INVOKER` y conserva nombre y parámetros (nunca recibe `user_id` del navegador). Su salida añade `registration_status`. La función privada `SECURITY DEFINER` sigue perteneciendo al rol segregado.
- **Primero se incrementa el contador; después empieza un bloque PL/pgSQL con manejo de excepciones.** Si el alta falla por validación, idempotencia, permisos o por sesión revocada, el subbloque revierte las escrituras comerciales, pero el contador del bloque externo sigue dentro de la transacción, que puede hacer COMMIT.
- Al agotar cuota se devuelve `registration_status='rate_limited'` sin `RAISE` y se establece `response.status=429` para PostgREST. Igualmente se devuelven estados acotados para `identity_invalid`, `session_invalid`, `idempotency_conflict`, `invalid_request`, `organization_quota`, `internal_error`; jamás detalles SQL sensibles. Otras fallas reciben 400/403/500 según código estructurado.
- El adaptador de Next.js mapea estas respuestas a errores HTTP sin exponer detalles y conserva el bloqueo preventivo de `autorizarIntentoDeRegistro`, que hoy **sigue rechazando** altas por falta de un contrato de habilitación integral. Esto es intencional hasta superar el E2E real.

## Pruebas realizadas
1. CI PostgreSQL 17: cuota en 20, rechazo número 21, saturación, alta normal, replay idempotente, error de negocio contabilizado, conflicto de idempotencia, dos empresas/actores A/B, ventana expirada, sesión revocada, denegación de acceso a la tabla/función, RLS y flag cerrado.
2. CI de concurrencia REAL: 40 conexiones contra PostgreSQL, 8 simultáneas; **exactamente 20** respuestas iniciales de petición inválida y **20** rechazadas por cuota; contador final =21, cero empresas de esas peticiones.
3. Supabase dev antes de aplicar: DDL + suite completa con `BEGIN/ROLLBACK`, aprobada. Sin dejar tabla ni datos de prueba.
4. Supabase dev después de aplicar: misma suite real dentro de `BEGIN/ROLLBACK`, aprobada. Luego se comprobó `registration_settings.enabled=false`, 0 usuarios, 0 sesiones, 0 organizaciones, 0 membresías y 0 filas de cuota.
5. GitHub Actions sobre HEAD probado: **108/108 unitarias**, PostgreSQL, Next.js (TypeScript/build/smoke HTTP) y sitio, cuatro workflows `success`.
6. Supabase Security Advisor: 0 WARN/ERROR; una observación INFO previa sobre `cotironda_private.supplier_contacts` con RLS sin policies. Performance: tres índices aún sin uso (normal en tablas sin tráfico).

## Límites y bloqueos
- **No se probó todavía el HTTP 429 de PostgREST con un JWT real**, porque el Custom Access Token Hook todavía no está activado en el proyecto. La prueba SQL confirma `set_config` y el contador; no sustituye un test HTTP Auth completo.
- El token legítimo pero revocado, la expiración real, las cookies SSR y la renovación siguen pendientes de E2E.
- Una cuota **por usuario** no impide abuso con numerosas cuentas, tráfico anónimo hacia Auth o solicitudes rechazadas antes de llegar a SQL. Evaluar barrera pre-Auth/por IP, presupuesto y controles específicos de Auth sin asumir que WAF Vercel cubre la API directa Supabase.
- Requiere prueba HTTP real de que `supabase-js` interpreta el 429 con el contrato del adaptador; **no desactivar el stub fail-closed del portal** hasta verificarlo.
- La ventana fija no se desplaza con cada intento: una nueva ventana se abre después de 60 minutos desde su comienzo.
- Evitar aplicar la migración dos veces o modificar la función privada sin revisión. No crear usuarios comerciales ni activar banderas SQL/Vercel sin validación y autorización de producción.

## Evidencia y referencias
- [Issue #29](https://github.com/ProtectorRudo/Cotironda/issues/29)
- [PR #30](https://github.com/ProtectorRudo/Cotironda/pull/30)
- [PostgREST: transacciones y response.status](https://postgrest.org/en/stable/references/transactions.html)
- [Supabase: acceso a Data API y RLS](https://supabase.com/docs/guides/api/securing-your-api)
