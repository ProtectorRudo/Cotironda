# 81 — D018: presupuesto de calidad IA real con una reserva persistente por caso

**30/10/2026 — Etapa 02. Issue #135. Rama hija de PR #134.**

## Decisión de auditoría

El usuario autorizó realizar consultas pagas para obtener calidad verificada, **pero una bandera de habilitación y una clave del backend no alcanzan** como prevención del gasto reiterado. Se conserva el motor D015/D016, el gold independiente y el acceso privado por Supabase Edge, pero se añade el límite persistente de **una única oportunidad de inferencia por cada uno de los seis casos sintéticos**.

## Arquitectura de cuota

- \`supabase/sql/dev_quality_once_only.sql\`: tabla \`public.dev_ia_quality_claims\` en **\`cotironda-dev\` exclusivamente**, con \`case_id\` como **PRIMARY KEY**, \`CHECK\` de los seis identificadores permitidos y timestamp. No guarda texto, nombre de empresa, contacto, respuesta, clave, prompts ni proveedor real.
- RLS activada. Los roles \`PUBLIC\`, \`anon\` y \`authenticated\` tienen privilegios revocados. El único permiso explícito es \`SELECT, INSERT\` para \`service_role\`; el backend usa \`ctx.supabaseAdmin\`.
- \`handleCotirondaDevAi\` exige la bandera separada \`COTIRONDA_IA_DEV_QUALITY_ENABLED=AUTORIZADO_DEV\`, key OpenAI, ID de caso fijo válido y una función \`claimCase\` de cuota. **Inserta ANTES de llamar OpenAI**.
- Si se repite un caso, el \`PRIMARY KEY\` deniega la inserción de forma atómica, incluso con concurrencia. Si la BD falla, el modo se rechaza por seguridad y **no llama a OpenAI**. Una llamada 429 o una desconexión **consume la reserva**: nunca reintentar automáticamente bajo incertidumbre sobre la facturación.
- Se admiten como máximo **seis invocaciones en toda la vida del ledger**, una por caso. No borrar ni reiniciar el ledger sin auditoría, aunque un caso haya fallado.

## Límites y costos

Seis ejemplos son **sintéticos**, no enviados por compradores. El adaptador de IA fija \`max_output_tokens=3500\`, \`store:false\`, no usa herramientas y establece timeout. Cada caso contiene muy poco texto y catálogos ficticios. Sin embargo, el tamaño real de tokenización de entrada, variación de tarifas y facturación tras errores **no pueden garantizarse por un límite en código**. Mantener **hard limit** y alertas del proyecto OpenAI Cotironda DEV.

Este registro NO es un sistema de facturación para producción. Para compradores reales necesitaremos presupuestos por organización, cuotas, conciliación de tokens y manejo de reintentos con idempotencia.

## Despliegue y verificación

El código debe pasar:
- 526 pruebas unitarias de PR #134 **más nuevos casos** de reserva, repetición, carrera, fallo de DB, error de API y privilegios;
- Deno \`check\` (verdadera resolución npm + Typescript) junto con Next/TS, Postgres, PostgREST, sitio;
- migración aplicada **solo en Supabase DEV**, seguida de consulta de catálogo \`information_schema\`, comprobación RLS/grants y advisors de seguridad;
- deployment **solo DEV** del Edge \`cotironda-ia-dev\`, con bandera \`quality\` ausente y \`smoke\` eliminado (confirmado por usuario, falta verificación runtime).

**Importante:** tener la función desplegada, o pasar CI, **NO significa que se haya ejecutado ninguna prueba real del modelo**. El siguiente paso comercial es invocarla una vez por cada caso con una credencial privada de Supabase desde un runner de servidor autorizado, registrar métricas y evaluar hallazgos. No exponer nunca la \`sb_secret_\` en frontend ni chat.

## Referencias
Supabase [Edge Functions auth](https://supabase.com/docs/guides/functions/auth), [Edge Secrets](https://supabase.com/docs/guides/functions/secrets), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Verificación REAL de DEV y despliegue (30/10/2026)

Se ejecutó la migración de Supabase **solo en proyecto `cotironda-dev` ref `qkercsoqhehbenbbncwk`** mediante `apply_migration(name=dev_quality_once_only)`. Está registrada con versión **`20261030182413`**. SQL confirmado desde GitHub.

Consulta directa a catálogos y permisos PostgreSQL: `rls_enabled=true`, `has_primary_key=true`, `has_allowlist=true`, `anon_can_insert=false`, `authenticated_can_insert=false`, `service_role_can_insert=true`, `claims_used=0`. Es una **comprobación del esquema y grants**, no una invocación real de consumo concurrente.

Los **6/6 GitHub Actions** del commit de código `9d792201ea4d9d15864d598cc03b43046d8cd77e` finalizaron con SUCCESS, incluyendo **534/534 unitarias**, Deno 2, Next/TypeScript, PostgreSQL17, PostgREST HTTP y sitio.

**Edge Function REAL**: `cotironda-ia-dev` se actualizó solamente en proyecto Supabase DEV con los **14 archivos versionados**, autenticación server-to-server `withSupabase({auth:'secret'})` y `verify_jwt=false` porque Supabase usa claves secret que no son JWT. En el primer intento de deploy Supabase conservaba un import map temporal de una versión previa y falló; se reintentó **especificando `import_map_path:"deno.json"`**, que corrigió la importación. La función figura **versión 4, ACTIVE, hash `3ee5e7b2...`**, y el código recuperado confirma la llamada a `ctx.supabaseAdmin.from('dev_ia_quality_claims').insert({case_id:caseId})`.

**IMPORTANTE:** la función **NO ha sido invocada con `quality_case`**, no se habilitó `COTIRONDA_IA_DEV_QUALITY_ENABLED`, no se gastaron nuevos tokens, y el contador real sigue en `0`. Aunque el usuario confirmó eliminar el permiso del smoke, todavía no hay respuesta `status` posterior que verifique `smoke_enabled:false`. El último log de llamada real a Edge es el smoke anterior HTTP 200, no el laboratorio nuevo. Deploy/CI/ledger confirmado **no** equivale a ejecución del modelo real de extracción.

Asesores Supabase: aparece `rls_enabled_no_policy` nivel INFO para tres tablas (incluida la nueva), por diseño: ninguna política para anon/authenticated; service_role es el único con grants. Permanece un aviso **WARN anterior** sobre protección de contraseñas filtradas deshabilitada, a evaluar separadamente: [referencia](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

**Bloqueo técnico restante**: el conector Supabase disponible permite desplegar/consultar esquema pero NO invocar la Edge Function con `apikey` de servicio ni gestionar Edge Secrets. El contenedor del asistente tampoco tiene DNS hacia Supabase. La cuenta del propietario debe proporcionar la invocación protegida en su Dashboard o autorizar un runner server-side conectado con clave guardada, sin enviar secretos por chat.

### Primera prueba de calidad real, todavía pendiente

En Supabase DEV, antes de habilitar el laboratorio, `POST {"mode":"status"}` debería responder `smoke_enabled:false`. Con el control dev y el límite real de OpenAI confirmados, se habilitaría **temporalmente** `COTIRONDA_IA_DEV_QUALITY_ENABLED=AUTORIZADO_DEV` en Edge Function Secrets. Una llamada autorizada al `quality_case` sintético `cemento_cpc_50_a_avellaneda_25` consumiría **para siempre esa reserva**, y la respuesta entregaría cantidad de artículos exactos, omitidos, proveedores correctos/falsos, tokens y PASS/FAIL sin exponer el texto. Luego se elimina el flag. **No repetir el mismo case_id, incluso ante error de OpenAI.**
