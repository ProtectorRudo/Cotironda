# 83 — D020: ejecución autónoma del laboratorio de calidad (Supabase DEV)

**30/10/2026 · Issue #139 · PR apilado sobre #138 · NO habilitado por defecto.**

## Propósito y decisión
Eliminar la intervención manual en cada `quality_case` manteniendo la regla de seguridad del Issue #129: **NUNCA ejecutar OpenAI pagado desde GitHub Actions, Vercel, navegador ni producción**. Las CI de GitHub siguen siendo offline. Supabase Database Cron + pg_net puede llamar a la Edge Function existente **dentro del proyecto de desarrollo**, sin extraer `OPENAI_API_KEY` de Edge Secrets.

No se alteran D015/D016 ni el motor, la clave OpenAI, los casos gold, ni la función pública. Se reutiliza `cotironda-ia-dev` v6 protegida por `withSupabase({auth:'secret'})`, `quality_case`, el ledger D018 y resultados D019.

## Diseño
Archivo `supabase/sql/dev_quality_auto_dispatch.sql`:
- Instala extensiones `pg_net` y `pg_cron` en DEV y crea el mecanismo. **NO crea un cron job** ni habilita tráfico.
- Control único `cotironda_private.dev_quality_auto_control.enabled=false` por defecto.
- Cola cerrada de cinco IDs sintéticos en `cotironda_private.dev_quality_auto_runs` con secuencia fija, comenzando con `dos_productos_misma_linea`. No reejecuta `cemento_cpc_50_a_avellaneda_25`.
- Despachador `SECURITY DEFINER`, propietario postgres, `search_path` vacío y `EXECUTE` revocado a PUBLIC, anon, authenticated y service_role. Dos tablas privadas con RLS y privilegios revocados a esos roles. Lock transaccional evita despachos concurrentes.
- Consulta una **credencial Supabase `sb_secret_` de DEV** en Vault bajo nombre fijo `cotironda_quality_dev_invoker`, solo al despachar; no puede recibir URL, ID, prompt ni header arbitrario.
- `pg_net` encola un único POST al URL exacto de la Edge Function de DEV. La reserva D018 se hace de modo atómico **en Edge antes de gastar OpenAI**, no en el scheduler.
- Solo avanza si el resultado anterior quedó guardado como `edge_runtime`, con seguridad/cobertura PASS y productos/proveedores completos. Un FAIL, omisión, registro ausente, claim incierto o envío sin resultado a los 12 min marca `needs_review` y **no se reintenta**.
- La API key de OpenAI permanece exclusiva de Edge Secrets. La key Supabase alojada en Vault tiene permisos administrativos dentro del proyecto DEV: **no es inocua ni una clave publicable**. La tabla interna `net.http_request_queue` conserva transitoriamente headers para ejecutar el POST; solo personal autorizado debe tener acceso.

## Operativa de una sola configuración (cuando se autorice activar)
1. Verificar el límite real de gastos y alertas del proyecto OpenAI DEV, flag `COTIRONDA_IA_DEV_QUALITY_ENABLED` activo, función Edge correcta y cola de cinco casos sin consumir. No copiar credenciales a mensajes.
2. En **Supabase DEV → Vault**, crear un secreto llamado `cotironda_quality_dev_invoker` con una **Supabase secret API key del mismo proyecto DEV**, idealmente una nueva clave separada para este laboratorio. No usar la key `OPENAI_API_KEY`; no guardar la key en SQL literal, código, GitHub o chat. Si no hay clave compatible, no activar.
3. Aplicar/verificar SQL **exclusivamente** en `qkercsoqhehbenbbncwk`. Con `enabled=false`, `select cotironda_private.dev_quality_dispatch_next();` debe devolver `disabled` y no generar requests. No confundir esta prueba sin red con ensayo real.
4. Auditar permisos y existencia de extensiones, comprobar que la cola solo tiene cinco `pending`, registrar conteo de claims/results antes de la activación.
5. Con aprobación de ejecución real y credencial almacenada, habilitar desde una conexión administrativa **sin pasar el secreto en texto**:
   ```sql
   update cotironda_private.dev_quality_auto_control
     set enabled = true where singleton = true;
   select cron.schedule(
     'cotironda-ia-dev-quality-auto',
     '*/2 * * * *',
     $$select cotironda_private.dev_quality_dispatch_next();$$
   );
   ```
   El job despacha a lo sumo un caso por paso; no configura reintentos HTTP. La siguiente ejecución solo procede tras resultado persistido correcto. Caso `dos_productos_misma_linea`: deben figurar 2 productos exactos y 2 proveedores sintéticos correctos.
6. Consultar `dev_quality_auto_runs` y `dev_ia_quality_results` después de cada caso. Si hay `needs_review`, NO borrar reservas ni volver a ejecutar casos; investigar Edge logs, `net._http_response` y métricas. Evitar publicar headers o secretos contenidos en `net.http_request_queue`.
7. Finalizada la secuencia o ante cualquier anomalía, **desactivar y quitar cron**:
   ```sql
   update cotironda_private.dev_quality_auto_control set enabled = false where singleton = true;
   select cron.unschedule('cotironda-ia-dev-quality-auto');
   ```
   Revocar/rotar la secret API key dedicada y eliminar el secreto Vault del laboratorio cuando ya no se necesite. Mantener el historial inmutable de reservas y resultados.

## Consultas de control seguras
```sql
select ordinal, case_id, state, submitted_at, updated_at
from cotironda_private.dev_quality_auto_runs order by ordinal;
select count(*) as reservas from public.dev_ia_quality_claims;
select case_id, source, security_pass, coverage_pass,
       products_expected, products_exact, suppliers_expected, suppliers_correct,
       tokens_input, tokens_output
from public.dev_ia_quality_results order by created_at;
```

## Pruebas y limitaciones
- Tests unitarios sin red en `tests/unit/dev-quality-auto-dispatch.test.mjs` comprueban orden, URL, puerta OFF, ausencia de activación cron en migración, RLS, protección de secreto y rutas de detención. **No sustituyen integración real**.
- Antes de activar, verificar ejecución de la función administrativa con flag OFF en Supabase DEV y permiso denegado a roles cliente; comparar claims/results antes y después.
- Una respuesta HTTP enviada por pg_net no garantiza inferencia: registrar y cruzar `request_id`, reserva, resultado Edge, logs y cuota OpenAI. Si un resultado queda pendiente después de 12 minutos se detiene toda la cola.
- Seis casos no prueban calidad comercial general. **No habilita** PDF comercial, WhatsApp, proveedores reales, sitio Vercel, pagos ni producción.
- El flujo autónomo exige una **única configuración privada en Vault**; el conector actual no puede crear ni leer secretos de forma segura ni invocar directamente una Edge protegida. No ocultar esta limitación.

## Verificación real sin tráfico pagado (30/10/2026)
- Migración `dev_quality_auto_dispatch_d020` aplicada **solo** a `qkercsoqhehbenbbncwk`. Se instalaron `pg_cron` y `pg_net`, tablas y función de control, **sin programar ningún job**.
- Primera prueba en PostgreSQL: `enabled=false`; `dev_quality_dispatch_next()` respondió `disabled`, sin invocar Edge.
- Segunda prueba con `BEGIN; UPDATE enabled=true; SELECT dispatch_next(); ROLLBACK;`, previamente comprobado Vault vacío: respondió `blocked_missing_dev_invoker`; la transacción revertida dejó `enabled=false`.
- Postflight: 0 jobs en `cron.job`, 1 claim, 1 resultado y 5 casos `pending`. Permisos reales: `anon_exec=false`, `auth_exec=false`, `service_exec=false`, `anon_read=false`, `auth_change=false`, RLS de cola activa.
- La instalación inicial de `pg_net` sin esquema explícito produjo un WARN `extension_in_public`. Se comprobó extensión no relocatable, **cero jobs, cero colas/respuestas HTTP y cero dependencias externas**, se reinstaló **exclusivamente en DEV** mediante `dev_quality_pg_net_nonpublic_d020` en esquema `extensions` y se verificó con catálogo. El advisor dejó de listar `extension_in_public`. Se versionó corrección en `supabase/sql/dev_quality_pg_net_nonpublic.sql`; nueva instalación ya emplea `WITH SCHEMA extensions`.
- Queda un WARN anterior de Auth por protección de contraseñas filtradas desactivada, independiente de D020. Las observaciones `rls_enabled_no_policy` son INFO intencional de tablas server-only con grants revocados: [linter de Supabase](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
- **No existe todavía secreto `cotironda_quality_dev_invoker` en Vault**, no se programó cron y **no se probó** envío de POST real ni ejecución desatendida. Eso exige una configuración privada inicial por el propietario; no solicitar el valor por chat.

## 30/10/2026 — Clave dedicada: diagnóstico HTTP real y corrección
- La creación de `cotironda_quality_dev_invoker` en Supabase Vault se verificó solo por nombre y booleanos de formato, **sin transmitir ni mostrar su contenido**.
- Primer POST `mode:status` sin consumo OpenAI: respuesta real HTTP **401 INVALID_API_KEY** con pista explícita de `@supabase/server`: la credencial corresponde a la clave nombrada `cotironda_quality_lab`, pero la autenticación `auth:'secret'` de la versión 7 aceptaba solamente `default`.
- Corrección versionada en `index.ts`: `auth:['secret:default','secret:cotironda_quality_lab']`. Evita `secret:*` y conserva la clave previa usada por las pruebas manuales. Se comprueba por test estático y luego una nueva invocación `mode:status` autenticada; **ninguna prueba pagada hasta HTTP 200**.
- El permiso `COTIRONDA_IA_DEV_QUALITY_ENABLED`, la cuota SQL D018 y el writer D019 no cambian. Ninguna clave se copia a GitHub, al chat o a Vercel.
