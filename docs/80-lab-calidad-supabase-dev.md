# 80 — Laboratorio IA-first de calidad en Supabase DEV sin envíos (Issue #133)

**Fecha:** 30/10/2026. **Estado:** fuente de desarrollo en PR draft hija de #132; NO desplegada, NO gastó tokens.

## Estado de credenciales

El usuario confirmó que eliminó `COTIRONDA_IA_DEV_SMOKE_ENABLED` de Supabase DEV después del primer `smoke_completed` (43 tokens entrada + 36 salida). **El conector no puede verificar los nombres/valores de Edge Secrets; falta una comprobación de `mode:status` que devuelva `smoke_enabled:false`**. Se mantiene `OPENAI_API_KEY` en el servidor; jamás leerla o duplicarla en Vercel/frontend.

## Riesgo que se corrige

Hasta ahora `cotironda-ia-dev` solo hacía un "smoke" técnico con la frase "Respondé solamente OK". Esa prueba comprueba conectividad, **no** extracción de materiales, calidad ni selección correcta de proveedores. No debemos adjudicar a la IA capacidades no medidas.

## Contrato del nuevo laboratorio

Un modo adicional, `quality_case`, permite **solamente seis casos sintéticos predeterminados** por `case_id` de un conjunto conocido y fijo. No acepta `texto`, `prompt`, listas de proveedores, SKU, email, datos de comprador o variaciones de modelo recibidas de la red.

Este modo está **deshabilitado por defecto**. Para un ensayo dev futuro requeriría un segundo secreto independiente en Supabase `cotironda-dev`:

- `COTIRONDA_IA_DEV_QUALITY_ENABLED=AUTORIZADO_DEV`
- Mantener `COTIRONDA_IA_DEV_SMOKE_ENABLED` eliminado. Los permisos son independientes.

El gateway `cotironda-ia-dev` continúa protegido por `withSupabase({auth:'secret'})` y proyecto exacto `qkercsoqhehbenbbncwk`, con `verify_jwt=false` porque `sb_secret_...` **no** es un JWT. Nunca entregar API Key de Supabase al navegador.

Ejemplo de payload **futuro y solo tras autorización de pruebas pagas DEV**:

```json
{"mode":"quality_case","case_id":"dos_productos_misma_linea"}
```

La función ejecuta el **motor real D015/D016**, sin reemplazarlo por lógica ad-hoc en Supabase: `simularRondaConCalidadIA` → `extraerMaterialesConIA` con esquema JSON estricto y evidencia original → taxonomía curada → `planificarInvitacionesPorProducto` con catálogo ficticio/consentimiento/zona. Después `evaluarCalidadInvitacionesPorProducto` compara el resultado de IA con una respuesta **gold independiente**. Las respuestas gold solo se usan **después** de recibir la inferencia, nunca se mandan a OpenAI.

El informe resultante **solo presenta**: caso, `status:quality_case_completed`, modelo, tokens, puertas PASS/FAIL de seguridad/cobertura, materiales correctos/omitidos/alterados, proveedores correctos/faltantes/incorrectos, estados de línea, `envio_habilitado:false`, `proveedores_reales:0`, `mensajes_whatsapp:0`. No devuelve la extracción cruda, prompts, marcas, contactos, identidad comercial ni secretos.

Si falla el modelo, la red, el esquema o la validación, retorna error controlado sin reintentos. No escribe en PostgreSQL ni crea mensajes. El motor preserva los máximos: 25 líneas, 9.000 caracteres, 75 ítems, 3.500 tokens de salida y timeout 18 s. Estos límites **no garantizan máximo de gasto mensual** ni impiden repetir llamadas autorizadas. Todavía falta límite de uso con persistencia/idempotencia y cuotas por empresa antes de usuarios reales.

## Fuentes compartidas, sin divergencias

Para desplegar en Deno, el código del motor se empaqueta bajo `supabase/functions/cotironda-ia-dev/core`. Cada módulo es una copia **byte-exacta** de `src/domain` y `src/server`; el gold es copia de `tests/fixtures/gold-invitaciones-producto-v1.mjs`. `scripts/dev/sync-edge-quality-core.mjs` regenera el empaquetado sin leer secretos y `tests/unit/supabase-quality-lab.test.mjs` falla CI si se edita una copia sin editar la otra. No generar una taxonomía separada para Edge.

## Escenarios sintéticos

- Cemento Loma Negra mencionado, alternativa Avellaneda 25kg.
- Cemento genérico.
- Cemento CPC 50kg, envase de proveedor de 25kg.
- Cemento y pintura en **la misma línea** (omisión detectada).
- Marca Loma Negra expresamente exclusiva.
- Placa de yeso RH solicitada vs RF del proveedor como **consulta alternativa no equivalente**.

Estos materiales/catálogos y los proveedores son ficticios. El código no lee tablas reales de proveedores ni muestra contactos.

## Pruebas

`tests/unit/supabase-quality-lab.test.mjs`: paridad de fuente, flag deshabilitado, permisos separados, cuerpo no ampliable por el caller, casos permitidos, mock con motor real, caso omitido, cantidad inventada, error 429/no reintentar, errores sin secretos. **Estas pruebas MOCK solo garantizan el contrato**, no precisión comercial real de GPT-6 Luna.

La primera ejecución LIVE del laboratorio **aún NO se hizo**, y el modo nuevo **NO se desplegó** en Supabase. Hace falta verificar el empaquetado en Deno, CI completa y autorización expresa para despliegue DEV y llamadas pagas. Mantener fuera de producción.

## Próximos hitos

1. Confirmar `smoke_enabled:false` con `mode:status` sin gastos cuando el usuario quiera. 
2. Completar CI 5/5 y verificar empaquetado real en Deno antes de desplegar laboratorio DEV.
3. Autorizar un ensayo live de calidad acotado, analizar falsos positivos/negativos y costo real.
4. Integrar después el flujo de comprador autenticado, presupuesto por empresa, protección de archivos, catálogo real, límites/idempotencia y WhatsApp. **Ni el laboratorio ni el benchmark son una API comercial.**
