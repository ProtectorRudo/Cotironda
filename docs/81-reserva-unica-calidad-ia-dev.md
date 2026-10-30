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
