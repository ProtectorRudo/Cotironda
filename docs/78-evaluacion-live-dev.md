# 78 — Primer ensayo OpenAI real D015/D016: preparación segura, sin ejecutarlo

**30/10/2026 · Etapa 02 · Issue #129 · rama `feat/02-safe-live-product-eval` sobre PR #128.**

## Estado verdadero
Se verificaron en Vercel, **sin desencriptar ni visualizar ningún valor secreto**, los proyectos del equipo:
- `cotironda` (`prj_gcJ44fDzmkHuZCdggE9jHrTG9zm8`).
- `cotironda-portal-dev` (`prj_d13rTHxJADvP2K9PcrM0CJQD9Zok`).

**No figura `OPENAI_API_KEY` en los nombres de las variables de ninguno de esos proyectos.** Por lo tanto, no se ejecutó ninguna inferencia real, ni se comprobó disponibilidad para la cuenta OpenAI o su forma de pago. La suscripción a ChatGPT no aporta por sí sola créditos de API.

## Modelo y tarifas verificadas
- El modelo inicial para el benchmark es `gpt-6-luna`. Confirmado en la documentación oficial de modelos de OpenAI (30/10/2026): https://developers.openai.com/api/docs/models.
- Tarifa *Standard* publicada: **USD 0,10 por millón de tokens de entrada** y **USD 0,50 por millón de tokens de salida**, antes de impuestos, descuentos, cargos adicionales o futuras modificaciones: https://developers.openai.com/api/docs/pricing.
- Los costes se estiman a partir de `usage.input_tokens` y `usage.output_tokens` de la respuesta; un **soft cap local NO sustituye un límite de gasto configurado en OpenAI**.

## Runner de evaluación preparado
`npm run benchmark:producto:live -- --live` corre únicamente **en una computadora de desarrollo local y Node 22+**, con las variables de entorno privadas requeridas:

- `OPENAI_API_KEY`: clave de proyecto API asignada de forma segura; **nunca en chat, repo, archivo git, URL, formulario público o frontend**.
- `COTIRONDA_IA_LIVE_EVAL=AUTORIZADO_DEV`: habilitación manual exacta.
- `COTIRONDA_IA_MAX_USD=0.02`: autorización exacta de límite *soft* por ejecución; cualquier otro monto queda bloqueado.

Además exige `--live`; si falta, informa `BLOQUEADO_sin_red` y sale sin llamadas. Se bloquea en `GITHUB_ACTIONS`, `CI`, cualquier `VERCEL_ENV` y `NODE_ENV=production`. El evaluador no se carga hasta pasar las guardas; en errores no se reintenta. Todos los inputs son **sintéticos y predefinidos**, sin contactos, números, PDFs comerciales ni datos privados.

**Máximo:** seis solicitudes en una corrida de laboratorio. Cada llamada a Responses tiene `max_output_tokens=3500`, tiempo límite de 18 segundos, `store:false`, `tools:[]`. Se reserva preventivamente el precio de 10.000 tokens de entrada y 3.500 de salida por caso (USD 0,00275 al precio Standard usado). La reserva de seis casos suma USD 0,0165, por debajo del límite soft USD 0,02. **No es garantía matemática del gasto:** un texto puede tokenizar distinto, las tarifas pueden cambiar y fallos de red pueden facturarse. La cuota efectiva se configura en la cuenta OpenAI.

## Qué se evalúa
Solo seis escenarios **positivos del gold independiente** de `tests/fixtures/gold-invitaciones-producto-v1.mjs`, sin pasar los resultados gold o respuestas mock a la IA:

1. Cemento Loma Negra mencionado, corralón que trabaja Avellaneda.
2. Cemento genérico, sin especificación inventada.
3. Cemento CPC de 50 kg, proveedor con presentación alternativa de 25 kg.
4. Cemento y pintura en una misma línea.
5. Marca expresamente exclusiva.
6. Placa RH solicitada, proveedor con RF (consulta distinta, no equivalencia).

El modelo devuelve extracción estructurada y se ejecuta el coordinador IA-first y el mismo scorer gold D015/D016. Se registran **solamente por caso** exactos, omitidos, proveedores correctos/falsos/omitidos, seguridad/cobertura, tokens y costo estimado. No se imprime el texto, clave, prompt, respuesta cruda, datos de proveedores reales ni información del comprador.

## Qué necesita realizar el propietario
**Solo los pasos externos de cuenta, si no están hechos:**

1. Ingresar a https://platform.openai.com/ con la cuenta/organización que facturará Cotironda. Verificar proyecto de API y facturación; si no existe, crear un proyecto dedicado a **Cotironda DEV**.
2. En la configuración del proyecto OpenAI → **Límites**, establecer un límite de gasto mensual bajo (por ejemplo, USD 2 para comenzar), alertas y activar **«Aplicar un límite estricto»** si aparece. OpenAI aclara que los límites estrictos no son instantáneos y pueden excederse ligeramente; no confundirlos con el soft USD 0,02 del script. [Guía oficial](https://help.openai.com/es-419/articles/9186755-managing-projects-in-the-api-platform).
3. Crear una **API key restringida al proyecto DEV**, guardarla como secreto privado en el entorno donde se ejecutará el benchmark. NO pegar la clave en el chat ni colocarla en archivos del repositorio. La variable en Vercel Preview podrá servir para la futura integración del portal, pero **no ejecuta este script local** ni activa automáticamente pruebas. Un runner autorizado/aislado deberá poder recibirla de manera segura.
4. Avisar **solo** que la credencial y la facturación DEV quedaron configuradas; no compartir el valor de la clave.

**Lo que puede hacer el asistente sin intervención:** preparar código, tests, documentación, auditoría de GitHub, y más adelante conectar un runner autorizado. **Lo que no puede hacer:** crear una credencial API en nombre del propietario sin acceso autorizado al proyecto OpenAI o recargar su cuenta, ni ejecutar un test de pago sin secreto disponible en un entorno ejecutable.

## Pruebas y despliegue
`tests/unit/guardia-live-producto.test.mjs` valida denegaciones, secreto ausente, ejecución en CI/producción, formato de presupuesto, cálculo de coste, reserva y CLI sin red. Se conserva `npm run benchmark:producto:offline` para los 12 escenarios MOCK independientes. Ningún despliegue de preview o producción, ni envío Whapi, ni cambio a Supabase está implícito en preparar el ensayo.

**Siguiente hito:** montar el runner DEV privado con permiso explícito, clave protegida y registro de costos; ejecutar una sola corrida real, inspeccionar errores y ampliar datasets de forma acotada. Se requiere autorización concreta para cualquier deploy/merge.