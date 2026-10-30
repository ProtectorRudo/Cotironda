# 79 — Integración OpenAI vía Supabase Edge Secrets (solo DEV, Issue #131)

**30/10/2026 — Etapa 02.** Proyecto Supabase verificado: `cotironda-dev` — `qkercsoqhehbenbbncwk`, región `sa-east-1`, estado `ACTIVE_HEALTHY`. Se constataron **0 Edge Functions desplegadas** antes de este PR. No se inspeccionó el valor de secretos.

## Decisión de arquitectura

La API key de OpenAI **no se guarda en SQL, Storage, frontend ni GitHub**. Se configura como **Edge Function Secret** `OPENAI_API_KEY` exclusivamente en el proyecto Supabase DEV. Una función de Supabase que actúe como backend puede leerla con `Deno.env.get('OPENAI_API_KEY')` y llamar a OpenAI sin transmitir la clave al comprador ni al servidor web.

Referencias actualizadas (30/10/2026): [Supabase Edge Secrets](https://supabase.com/docs/guides/functions/secrets), [Autenticación de Edge Functions](https://supabase.com/docs/guides/functions/auth), [Headers y JWT](https://supabase.com/docs/guides/functions/auth-headers).

**Atención a la infraestructura existente:** El adaptador `src/server/openai-extraccion.ts` todavía ejecuta desde la capa servidor de Next.js/Vercel. **Guardar un secreto en Supabase no lo inyecta automáticamente en Vercel.** Si decidimos que Supabase sea el único custodio de la clave, las llamadas a OpenAI tendrán que ejecutarse dentro de la Edge Function, y Next deberá usar un endpoint servidor autenticado en Supabase. Este PR prepara el primer escalón, NO cambia aún el adaptador completo ni los flujos comerciales.

## Entrega de este PR — etapa de conexión segura

- `supabase/functions/cotironda-ia-dev/index.ts`: Edge Function que usa `withSupabase({auth:'secret'})` de `npm:@supabase/server@1.9.2` para autenticación **servidor a servidor**, solo con key secreta Supabase (`apikey`). Las nuevas claves `sb_secret_...` NO son JWT: la configuración `supabase/config.toml` establece `verify_jwt=false`. **Nunca invocar desde navegador ni darle una key secreta al comprador.**
- `logic.ts`: limita el entorno al host exacto `https://qkercsoqhehbenbbncwk.supabase.co` para impedir despliegue accidental en producción. Requiere POST JSON de tamaño acotado; rechaza parámetros arbitrarios, documentos de clientes y prompts libres.
- Modo `status`: devuelve únicamente los booleanos `openai_secret_configured` y `smoke_enabled`; nunca devuelve clave ni fragmentos del secreto. Solo servidor con autenticación `secret` puede consultarlo.
- Modo `smoke`: **deshabilitado por defecto**. Solo si además `COTIRONDA_IA_DEV_SMOKE_ENABLED=AUTORIZADO_DEV` está presente en los secretos de desarrollo y `OPENAI_API_KEY` tiene formato válido, envía una única consulta con material totalmente ficticio, máximo 512 tokens de salida, `store:false`, `tools:[]`, timeout 12 s, sin reintentos. Devuelve uso de tokens, no texto generado. No hace matching, no crea presupuestos, no despacha mensajes.
- `tests/unit/supabase-ia-dev.test.mjs`: pruebas de host DEV, métodos, esquemas, secretos, falta de autorización, error OpenAI, límite, respuestas sanitizadas y request mock autorizado.

## Único paso manual ahora

En la consola, abrir:
https://supabase.com/dashboard/project/qkercsoqhehbenbbncwk/settings/functions

Seleccionar **Edge Function Secrets** y agregar:

- **Key**: `OPENAI_API_KEY`
- **Value**: la clave que el propietario ya generó en el proyecto OpenAI **Cotironda DEV**.

Presionar **Save**. **No compartir el valor por chat, screenshots, GitHub, SQL Editor ni logs.** El conector Supabase disponible en esta conversación no ofrece funciones para crear/verificar nombres de Edge Secrets. No afirmar que quedó configurada hasta que el propietario lo confirme y se ejecute un test autorizado.

## Para el próximo despliegue/prueba DEV

El primer despliegue de la función deberá dirigirse **únicamente** a `qkercsoqhehbenbbncwk`, con `verify_jwt=false` y autenticación de la librería `auth:'secret'`, y **solo cuando esté autorizado desplegar la función DEV**. El caller debe ser una capa servidor con una key secreta Supabase — jamás el navegador. Primero comprobar el modo `status`. Antes de cualquier llamada paga, agregar `COTIRONDA_IA_DEV_SMOKE_ENABLED=AUTORIZADO_DEV` con aprobación explícita y comprobar el proyecto OpenAI con límite de gasto.

**Importante:** No crear ni entregar una key `sb_secret` en el chat. No usar la key de OpenAI como `apikey` de Supabase: son secretos distintos.

## Lo que todavía NO está integrado

- Invocación de `extraerMaterialesConIA` desde Next a esta función, autenticación por empresa, cuotas con límites rígidos, idempotencia, métricas económicas y respuesta normalizada.
- Procesamiento comercial de PDFs, Word, Excel, fotos u otras listas reales, catálogo confirmado de proveedores, matching y WhatsApp. El esquema Supabase DEV muestra cero organizaciones/miembros y cero SKUs reales: no podemos ensayar selección comercial auténtica.
- No hay ningún deploy de Edge Function en este PR, ninguna inferencia OpenAI real, factura, mutación de base ni envío. La clave tampoco fue transferida o leída por esta sesión.

**Siguientes hitos:** confirmar el secreto en DEV; verificar prueba de estado con función protegida; habilitar smoke tras permiso; después portar el adaptador real con autorización por empresa, guardas de costo y evaluación de calidad. No modificar producción ni fusionar PRs apilados sin autorización.
