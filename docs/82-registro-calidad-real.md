# 82 — D019: resultados de calidad del modelo persistidos y auditables

**30/10/2026 · Etapa 02 · Issue #137 · rama `feat/02-quality-audit-ledger` hija de PR #136.**

## Problema

El benchmark D018 reserva un solo intento por caso en Supabase DEV, pero no almacenaba el resultado. Un fallo de captura podía impedir evaluar si el motor omitió productos o proveedores. **El propietario mantiene habilitado el flag temporal de evaluación** para evitar configurarlo entre pruebas. Esto no autoriza producción, WhatsApp ni gastar fuera de los seis casos predefinidos.

## Solución

`public.dev_ia_quality_results` almacena solamente métricas agregadas por `case_id`: PASS/FAIL de seguridad/cobertura, productos esperados/exactos/omitidos/alterados, proveedores esperados/correctos/omitidos/incorrectos, tokens entrada/salida, fecha y `source`. La llave primaria enlaza por FK con `dev_ia_quality_claims`; no guarda documentos, prompts, respuesta original, marcas, contactos ni ninguna credencial.

La tabla tiene RLS habilitada y revoca privilegios a `anon`, `authenticated` y `PUBLIC`. Solo `service_role` recibe SELECT e INSERT. El caller sigue usando `withSupabase({auth:'secret'})`; la función no es pública, no acepta archivos, catálogos, solicitudes comerciales ni texto libre.

Antes de OpenAI el handler verifica la existencia de ambos callbacks (reserva y registro), y **reserva el caso de forma persistente**. Después de recibir y evaluar la respuesta, guarda un resumen numérico una sola vez. La respuesta añade `auditoria_persistida` para distinguir registro confirmado de error en DB. Si falla el guardado devuelve métricas + `auditoria_persistida:false`, **sin reintentar** ni liberar la reserva. Si falla OpenAI no inventa métricas; permanece únicamente el intento reservado.

## Origen de los datos

- `edge_runtime`: generado por la propia Edge Function después de la inferencia real.
- `reported_by_owner`: transcripción identificada explícitamente de un JSON proporcionado por el propietario, con correlación independiente de ID y hora de reserva. **No etiquetarlo como observado directamente en el runtime**.

La primera prueba `cemento_cpc_50_a_avellaneda_25` fue informada por el propietario como PASS/PASS, 1/1 artículo, 1/1 proveedor sintético, 551/189 tokens, y la tabla de reservas + HTTP200 de Supabase corroboran una única invocación. Se puede registrar históricamente **con `source=reported_by_owner`**, no `edge_runtime`.

## Cómo interpretar seis casos

La métrica es cobertura exacta por caso en un dataset **sintético pequeño**. Un 6/6 no prueba aún precisión representativa de todos los materiales de obra, variantes de marcas o formas de escritura. Para un piloto comercial se necesitan muestras autorizadas independientes, catálogos confirmados por proveedor/empresa y seguridad documental y presupuestos por cliente.

**Límite de gasto:** mantener el presupuesto y alertas en OpenAI. El flag de calidad puede seguir habilitado en DEV según solicitud del propietario, pero la reserva atómica D018 sigue imponiendo como máximo un intento para cada ID. Dejar el flag activo **no sería apropiado en producción** y tampoco representa una cuota monetaria estricta.

## Pruebas y alcance

Tests Node/Edge de guardado después del request, fallos de DB sin retry, fallo OpenAI sin datos falsos, FAIL cobertura persistido y permisos SQL. GitHub CI incluye Deno check, Next/TS, Postgres17, PostgREST y sitio. Ningún deploy de producción ni WhatsApp; la integración de extracción con compradores reales continúa pendiente.

**Siguiente prueba recomendada:** `dos_productos_misma_linea`. Es un caso difícil con dos materiales y dos proveedores sintéticos. Una vez habilitado y desplegado el registro de métricas en **DEV**, el propietario solo tendrá que reemplazar `Request Body` en su panel de Supabase; **no debe copiar claves ni reconfigurar Secrets**.

## Implementación verificada en Cotironda DEV (30/10/2026)

Los **6/6 workflows GitHub Actions** del código de D019 (`b8f53dfadfe72db0ce3bd77de0787d974e49e8a0`) finalizaron SUCCESS, incluyendo **540/540 unitarias** y `deno check` de la Edge Function: [PR #138](https://github.com/ProtectorRudo/Cotironda/pull/138).

La migración `dev_quality_results_ledger` se aplicó **exclusivamente** al proyecto `cotironda-dev` (`qkercsoqhehbenbbncwk`). Consulta real: RLS=true, PK=true, FK a claims=true, `anon` sin SELECT, `authenticated` sin INSERT, `service_role` con INSERT. La advertencia `rls_enabled_no_policy` del asesor Supabase para tablas servidor-only es INFO deliberada; no se agregó política pública.

Se cargó un único registro histórico `cemento_cpc_50_a_avellaneda_25`, proveniencia `reported_by_owner`, PASS/PASS, 1/1 productos, 1/1 proveedores **ficticios**, tokens 551/189, coincidente con el JSON del propietario y una reserva+HTTP200 de Supabase. No se hizo inferencia ni gasto para registrarlo.

**Edge Function DEV actualizada a versión 6, ACTIVE**, con 14 archivos versionados y `deno.json`, sin cambios en Vercel/producción ni WhatsApp. Verificación SQL posterior: **1 claim utilizado, 1 resultado guardado, 5 casos disponibles**. No hubo invocación nueva del modelo durante la migración o el deploy. El código D019 compiló en CI, pero **todavía falta un ensayo live posterior al despliegue para demostrar que el nuevo writer persiste métricas desde el propio runtime**, sin intervención del propietario en la base.

Por pedido expreso del propietario **no se retiró la bandera temporal de evaluación**. Se mantiene la cuota persistente D018 de un intento máximo por caso. Próximo ensayo para validar writer + calidad real: `dos_productos_misma_linea`; si responde `auditoria_persistida:true`, comparar sus métricas con la segunda fila en Supabase. No volver a ejecutar el mismo caso si falla.
