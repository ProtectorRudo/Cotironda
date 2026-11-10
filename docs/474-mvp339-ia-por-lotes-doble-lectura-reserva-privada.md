# Decisión 474 — MVP339: IA Central por lotes, doble lectura y contención de costos

**Fecha:** 10/11/2026. **Estado:** solo desarrollo y CI sintético, sin publicar.
**Dependencias:** PR #742 (MVP336), PR #743 (MVP337), PR #745 (MVP338).

## Requisito del negocio

El proveedor envía su presupuesto como siempre (PDF, Excel, Word, imagen, texto, etc.).
No se le exige un formato ni se pierden renglones. IA Central interpreta; **la
aprobación de precios necesita corroboración independiente del original**, y el
ranking económico es determinista, separado de la interpretación semántica.

## Hallazgos del código anterior

- La API documental heredada tiene `maxItems:25` y `fuenteDeDocumentoMvp245`
  exige <=25 líneas y un total declarado para pasar al procesamiento comercial;
  simplemente elevar `maxItems` no resolvería límites de la respuesta,
  precios no cubiertos ni documentos complejos.
- MVP337 ofrece planificaciones 1–1 por fila, lotes de 20 y contraste literal
  de dos lecturas. MVP338 aporta extracción de bytes privados reales
  PDF/DOCX/XLSX/TXT/CSV, preservando SHA y firma.
- La IA Central MVP225 y el RPC MVP245 siguen vigentes y **no se sustituyen**.
  El nuevo MVP339 no se importa por el webhook ni se conecta al ranking.

## Implementación nueva

### Procesador de IA por lotes, sin escritura implícita

`src/domain/ia-central/procesador-ia-lotes-mvp339.ts` orquesta:

1. **Identidad de alcance**: UUID de ronda y proveedor + HMAC de mensaje y chat.
   Requiere plan válido con SHA-256 de fuente y posiciones consecutivas;
   rechaza lotes alterados y filas omitidas.
2. **Presupuesto previo**: exige `maxModelCalls >= 2 × totalDeLotes` y
   `maxInputChars >= 2 × caracteres`. No empieza ninguna llamada si
   no alcanza para el documento entero. Cotas duras: 60 lotes,
   120 invocaciones y 900.000 caracteres presupuestados (no equivalen a
   tokens reales). Los costos reales aún requieren cuota SQL por empresa.
3. **Reserva privada previa a la IA**: `reserve` **obligatorio** debe ser
   un gate externo atómico, persistente, por ronda, proveedor, mensaje y SHA.
   Una respuesta `already_processed` o `not_eligible` no ejecuta IA;
   cualquier diferencia de alcance/hmac/recibo queda en conciliación.
   **NO se implementó aún el RPC/ledger SQL de la reserva**: no usar
   funciones simuladas en el piloto.
4. **Dos interpretaciones separadas por lote**: perspectivas `primary`
   y `corroboration`, misma evidencia, SIN pasar el resultado de la
   primera lectura a la segunda. Cada lote tiene un SHA digest adicional
   de fuente, número de lote, posición, sección y texto.
5. **Control de cobertura y exactitud literal**: ambos modelos deben
   devolver 1:1 las posiciones originales y los hashes exactos.
   `corroborarLecturasMvp337` coteja de forma determinista cada número,
   unidad y texto propuesto con el original, y exige igualdad entre
   lecturas. La existencia de dos lecturas acordes **NO equivale**
   a verificación independiente de píxeles, fórmulas, IVA o cálculos.
6. **Sin reintentos ciegos**: un error de respuesta, cuota o transporte
   consume la llamada contabilizada y termina en `review_required` sin
   reenviarla automáticamente (podría haberse completado remotamente).
   El resultado solo es utilizable internamente si `finish` del gate
   persistente devuelve `recorded`. Error de commit => conciliación.
7. **Privacidad**: el resultado permanece `economicPublicationAllowed:false`
   y `whatsappMessages:0`, sin mostrar textos o errores externos.
   Nunca llama RPC, Whapi ni calcula una oferta por sí mismo.

### Adaptador de OpenAI Responses API (desconectado)

`supabase/functions/cotironda-piloto-whapi/lector-ia-lote-mvp339.ts` usa
Responses API con `store:false`, `tools:[]`, salida JSON Schema estricta
con máximo 20 lecturas, `max_output_tokens:5000`, límite HTTP 30 s y
respuesta máxima 48 kB. No realiza llamadas si `enabled !== true` o
faltan credenciales internas. Las filas se transmiten **solo** al endpoint
de OpenAI configurado cuando un worker autorizado lo invoque; hoy no
se ha conectado. Los tests usan `fetch` simulado, cero gasto.

La IA nunca debe inferir ARS desde «$», ni IVA, flete, cantidades, marcas
obligatorias o alícuotas. El resultado de este adaptador es una lectura
privada que requiere cotejo original y validación económica posterior.

## Pruebas y criterios de aceptación

- 192 presupuestos sintéticos de MVP337 pasan por la orquestación:
  cada renglón conserva su posición y clase, con 2 lecturas por lote.
- Un documento de 87+ renglones, condiciones, descuentos y totales no
  pierde datos ni se recorta en el lote 25.
- DOCX y XLSX **binarios de prueba** pasan desde MVP338 a MVP339; el XLSX
  contiene 2 hojas y 40 renglones.
- No se mezclan dos rondas con mismo proveedor. HMAC, SHA, proveedor,
  ronda o recibo cruzado bloquea la IA sin gasto.
- Sin presupuesto de llamadas suficiente, no se inicia procesamiento.
- Una lectura incompleta, con duplicados, numérica inventada, discrepante,
  con respuesta incompleta o un timeout no produce oferta.
- Una reserva duplicada no relanza modelos; sin confirmación `finish`
  no entrega lecturas para análisis.
- Pruebas del adaptador con respuesta HTTP simulada verifican esquema
  estricto, dos perspectivas, errores seguros y `store:false`.
- No tocar archivos congelados de WhatsApp, no cambiar tablas ni gates
  del piloto, no activar cron ni publicar. CI Deno+Node+Next+PG17.

## Qué falta antes de publicar

**Bloqueantes:**
1. Implementar y auditar el ledger/RPC **persistente** de reservas y
   finalización, vinculado al original cifrado real, envío autenticado,
   invitaciones vigentes y cupo de IA por empresa. No usar el mock.
2. Integrar el worker MVP339 con MVP338/337 y persistencia de cada lote:
   idempotencia entre máquinas y caídas, conciliación por SHA y
   control de caracteres/tokens/importe realmente facturado.
3. Corroborar contra el PDF/Excel/imagen original de manera
   independiente y aplicar validación aritmética, IVA, flete,
   parciales, distintas monedas, descuento, cobertura, marca y pago
   **sin recálculos de IA**, incluso con 25+ líneas y total ausente.
4. Agregar OCR independiente para imágenes/escaneos y leer DOC/XLS
   heredados, Word con tablas y Excel con fórmulas sin ejecutar macros.
5. Ensayar >=150 documentos comerciales genuinos anonimizados con
   oráculo humano y medir errores graves. Luego prueba real de WhatsApp
   -> IA -> ronda correcta -> vista anónima -> cierre.

**Decisión:** MVP339 es un paso de integración **privado**; no significa
que la ronda de Ailín esté resuelta ni que la vista del arquitecto muestre
estos datos. Exige «Publicalo» y preflight técnico separado para cada
despliegue futuro, exclusivamente al piloto autorizado.
