# Cotironda V2-04c — PDF real al análisis del arquitecto

**Fecha:** 12/11/2026. **Estado:** propuesta de desarrollo, NO desplegada. Apilada sobre [PR #825](https://github.com/ProtectorRudo/Cotironda/pull/825) que ya conecta TXT/CSV/DOCX/XLSX a la guía privada.

## Problema y solución

Cotironda ya recibe PDF auténticos por Whapi (Ailín tiene un original PDF en histórico), pero el portal Next.js V2-04b no podía generar análisis de PDF porque el lector comprobado usa `npm:unpdf@2.1.0` dentro de Supabase Edge/Deno. Importarlo directamente en Next (Node 22) sería un cambio de runtime y dependencias con alto riesgo.

El incremento **NO toca Edge Whapi v76**. Crea una función nueva, aislada `cotironda-piloto-v2-pdf-reader`, que reutiliza exactamente la extracción posicionada `readPdfPositioned` de `supplier-source-pdf-general.ts` (máximo 12 páginas, 300 filas, rechazo de páginas escaneadas o ambiguas). La ejecución del lector es Deno, igual que en Whapi; el portal sigue corriendo Node.

La secuencia, cuando esté instalada y habilitada por un release autorizado, será:

1. Buyer con Supabase Auth se autentica en el portal. Se comprueba que la ronda y el PDF sean suyos y que el proveedor tenga consentimiento prospectivo para compartir el original.
2. SQL reserva el análisis por (ronda, documento, hash) evitando cobros IA repetidos. Portal descarga los **bytes PDF originales** desde Storage PRIVADO.
3. Portal calcula SHA-256 local del archivo y solo llama por HTTPS al lector Edge con el encabezado `X-Original-SHA256`. El servidor Edge exige secreto servidor-servidor de al menos 40 caracteres alfanuméricos, guiones o guiones bajos. Hash del secreto comparado en tiempo aproximadamente constante. Ninguna API pública ni cliente navegador puede obtener ese secreto. `verify_jwt=false` en el config **porque se usa un secreto opaco verificado dentro de la función**, y la función sigue cerrada por defecto.
4. Edge vuelve a comprobar el SHA de los bytes y que sea PDF; lee posiciones reales sin ejecutar JavaScript incrustado, rechaza escaneados y limita a 8 MiB, 12 páginas, 300 renglones y 24.000 caracteres. No guarda ni registra ni envía mensajes.
5. Edge devuelve texto y SHA de ese texto. El servidor del portal comprueba **por segunda vez** que corresponda al archivo original y recalcula el SHA textual; solo entonces la IA Central produce observaciones cortas citando trozos exactos, nunca totales inventados.
6. Una RPC privada guarda la guía, revalida la autorización del comprador y la vigencia del consentimiento y solo la muestra junto al PDF que ese comprador ya podía descargar. Si falla cualquier paso, el PDF original se mantiene disponible y el análisis queda pendiente.

## Protección y límites

- **Desactivado hasta publicar expresamente:** `COTIRONDA_PILOT_V2_PDF_ENABLED=false`; `COTIRONDA_PILOT_V2_ANALYSIS_ENABLED=false` por defecto, más guard de ambiente `preview` y SHA exacta. No exponer el secreto al cliente ni en logs.
- El secreto `COTIRONDA_PILOT_V2_PDF_SHARED_SECRET` debe establecerse **en dos servicios privados** de PILOTO: Vercel backend (no `NEXT_PUBLIC_*`) y Supabase Edge. Su creación/configuración requiere `Publicalo`; no se inventó ni escribió ninguna clave.
- Fuente PDF de texto real: sin OCR. Si es imagen escaneada o lector no puede reconocerla, **NO** fabricar información; el original sigue descargable. Adaptador de OCR/documento multimodal de origen verificable queda pendiente.
- El análisis es orientativo, el original prevalece; no se afirma que todo texto posicionado represente íntegramente la disposición visual ni que la extracción haya comparado productos equivalentes.
- **No resuelve por sí solo** ofertas de WhatsApp solo texto sin archivo, Auth comprador 0 en piloto, consentimiento no instalado, migraciones SQL #816–#825, cierre a dos días hábiles ni informe general.
- Preflight del Edge v76 actual obligatorio antes de cualquier instalación. No publicar en producción. **No se lanzó ninguna ronda ni mensaje real con este PR.**

## Pruebas

- Node: portal → cliente → Edge handler sintético con bytes SHA y secreto; bloqueo de secret incorrecto, PDF alterado, texto alterado, escaneado, función OFF y accesos no autorizados; integración hasta guía original.
- Deno: `deno check` de la nueva función y **lectura real de PDF sintético válido** con unpdf 2.1.0 (misma librería de Whapi), más un documento corrupto rechazado.
- Build Next.js de portal y batería de regresión GitHub.
- FALTA: ensayo con los PDFs auténticos del piloto y comprobación E2E Whapi→Storage→buyer Auth→PDF original + guía, bajo `Publicalo` y sin alterar históricos.

**Siguiente prioridad tras CI:** publicación controlada de SQL, Auth/consentimiento y portal, no nuevas capas de procesamiento. Faltan costos y cuota de IA por cliente y un caso real de extremo a extremo.
