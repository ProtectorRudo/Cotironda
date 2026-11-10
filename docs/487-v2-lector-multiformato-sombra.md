# Acta 487 — V2 B1, lector multiformato en sombra y sin publicación

**Fecha:** 10/11/2026. **Autorización:** luz verde, desarrollo/CI/documentación solamente; **no desplegar**. **Dependencias:** ADR 486 y PR #761, incidente PDF archivado #759, trabajo central #760. **Rama:** `feat/presupuestos-v2-lector-multiformato-sombra`.

## Objetivo

Dar a Cotironda una función real invocable de lectura de un archivo de proveedor a JSON privado, sin volver a exigir dos lecturas globales ni romper el ingreso WhatsApp existente. El resultado es un BORRADOR, no una oferta ni un dato económico acreditado.

## Implementado

- `src/domain/presupuestos-v2/lector-sombra.ts`: función `leerPresupuestoSombraV2()` que toma un archivo en memoria, `mime`, SHA256 del original y credenciales **solo de trabajador interno**; verifica tamaño, firma mágica PDF/imagen/Office cuando corresponde, MIME permitido y SHA calculado, ANTES de consultar la API.
- OpenAI **Responses API**, modelo permitido en la configuración interna (`gpt-6-luna` o `gpt-6.1-sol`), `store:false`, `tools:[]`, JSON Schema estricto basado en el contrato V2, archivo sin nombres privados, `input_file` con PDF visual de alta definición, `input_image` para imagen; TXT/CSV en texto UTF-8 completo hasta límite fijado. DOC/DOCX y XLS/XLSX se pasan por `input_file` sin disfrazarlos de PDF.
- Prompt comercial: respeta todos los materiales/cargos/descuentos/bolsones/pallets, precio unitario **de lista** vs **efectivo**, flete, IVA, entrega y condiciones, no completa unidades ausentes ni inferencia ARS. Cada línea exige texto original y referencia de página/hoja/celda cuando sea visible.
- Envoltorio de resultado con `more_content_unread`, `unread_reason` para la **autodeclaración del modelo** sobre contenido ilegible o incompleto. Aunque diga completo, NO acredita cobertura original. El contrato validador devuelve diagnóstico privado por línea, conservando otras líneas no dudosas.
- El resultado no expone acciones de publicación, ranking ni WhatsApp: siempre `always_private=true`, `can_publish=false`, `can_rank=false`, `outbound_messages=0`. Falla de API, error de documento, SHA distinto, modelo incompleto o JSON inválido -> estado de revisión con código estable, sin texto fuente ni secretos.
- No se añadió endpoint, RPC SQL, job, Storage download ni integración con el webhook. El piloto sigue ejecutando el worker anterior. El lector V2 en sombra puede utilizarse mediante integración futura controlada que verifique identidad/invitación antes de consumir IA.

## Compatibilidad y límites confirmados contra documentación actual

- La API Responses extrae **texto e imágenes de página en PDF**; modo `detail:'high'` para tablas pequeñas.
- En planillas la API aplica **spreadsheet augmentation** y ve como máximo las primeras **1000 filas por hoja**, pudiendo resumir el resto. Por eso esta ruta NO puede certificar que Excel esté completo. En la siguiente versión se requiere extracción determinista de TODAS las celdas (con límites y revisión) antes de atribuir cobertura o publicar.
- DOC/DOCX pasa contenido textual pero no imágenes incrustadas; fuentes con imágenes y tablas complejas requieren validación PDF o lector nativo de origen. Los ZIP/Office se deben auditar antes de cualquier aprobación económica.
- El contrato JSON Schema estricto garantiza forma de salida, **no exactitud de valores**. `source_location_raw` es una cita propuesta por el modelo, no evidencia independiente.
- Restricciones de tamaño privadas: 8 MiB binarios, TXT/CSV 160 KiB para texto directo y respuesta máxima de 800000 caracteres. Documentos superiores o salida truncada -> revisión, sin omisión silenciosa ni aceptación como completa.

## Criterios y pruebas

1. Sin flag habilitado, sin trabajador interno o credencial válida: cero red.
2. Archivo corrupto, MIME disfrazado o hash incorrecto: cero API y revisión segura.
3. PDF → input_file y detalle alto; imagen → input_image; Word/Excel → extensión legítima; CSV/TXT → texto íntegro dentro del límite.
4. El modelo solo puede producir campos del contrato; no introducir identidades o acciones de publicación.
5. Si tiene tres renglones, uno ilegible no borra los otros dos. Si reporta contenido sin leer, se conserva candidato privado marcado incompleto.
6. Lista/contado/IVA/flete no se calculan ni inventan; la posterior validación económica por campo sigue pendiente.
7. Evaluar con tests Node y Deno de casos sintéticos, luego CI global. Sin token real, sin archivos reales ni WhatsApp en pruebas.

## Qué falta y por qué no está resuelto el PDF de Ailín

- El lector ahora puede **construir la solicitud real a la API**, pero NO se llamó con el PDF archivado de Ailín ni se verificaron sus precios. En esta conexión no existe una acción que descargue blobs de Storage protegidos; no se va a omitir seguridad usando SQL para sacar bytes del archivo.
- Para piloto se requiere un **ejecutor sombra privado** que descargue Storage autorizado, verifique SHA, invoque B1 una única vez, persista la candidata versionada sin reemplazar originales y la confronte contra un conjunto de renglones revisados manualmente.
- El lease histórico MVP292 de ese PDF fue consumido y termina `review`. La nueva entrada debe ser **independiente y versionada**, nunca resetear el ledger ni enviar WhatsApp otra vez.
- Después: verificador económico/sourcing por campo, asociación única con ronda, vista preliminar de líneas verificadas, comparación justa y cierre. Sin `Publicalo` no despliegue. Nada de esto se declara terminado por probar el adaptador.

## Reversión y protección de funcionalidades

La rama es aditiva; no cambia imports del worker activo ni SQL. Reversión = no integrar el PR o revertir el módulo sin impacto en piloto. Se conservarán los gates antiguos mientras una ejecución sombra compare resultados con corpus de verdad y seguridad.

**Fuentes externas consultadas:** OpenAI Responses API `https://developers.openai.com/api/docs/guides/file-inputs` y `https://developers.openai.com/api/docs/guides/structured-outputs`, 10/11/2026. Test actual sin costo de IA ni tokens de usuarios.