# Acta 473 — MVP338: puente de originales binarios a evidencia trazable

**Fecha:** 10/11/2026. **Modo:** «Luz verde» desarrollo y pruebas, sin integración al piloto ni publicación.  
**Dependencias:** MVP336 PR #742, MVP337 PR #743. El presente cambio mantiene intactos los módulos históricos Whapi y su manifiesto MVP332.

## Objetivo

Cotironda acepta el modo en que cada proveedor cotiza sin imponer formato ni solicitar confirmación rutinaria. Este bloque aporta la **primera lectura REAL de bytes de documentos**, anterior a la extracción semántica y **sin publicar precios**.

## Auditoría del baseline

- El MIME permitido en Whapi es PDF, JPEG/PNG/WebP, XLS/XLSX, DOC/DOCX, CSV/TXT, con límite de 8 MB.
- El extractor PDF existente `readPdfPositioned` usa `unpdf@2.1.0`; controla páginas 1–12, filas 1–300, geometría, capas invisibles y posible PDF escaneado. Es texto posicional extraído del PDF, no OCR.
- El lector Office `readOfficeVisibleRows` lee ZIP/XLSX/DOCX, comprueba CRC, inflación acotada, XML, vínculos externos, formulas/hojas ocultas y contenido ejecutable. DOCX en esta versión solo acepta párrafos sencillos (hasta 26); XLSX filas simples (hasta 300) y hojas visibles reconocidas. El lector devuelve **orden global visible**, no coordenadas exactas de hoja o celda.
- El pipeline de lectura documental económico y los RPC existentes aún tienen barrera de 25 renglones; este desarrollo NO la elimina.
- Imágenes, escaneos y formatos binarios heredados DOC/XLS carecen de corroborador independiente conectado; nunca deben recibir precios publicados mediante coincidencia de dos lecturas IA solamente.

## Implementado

`src/domain/ia-central/fuente-binaria-privada-mvp338.ts` con inyección estricta de lectores autorizados desde `supabase/functions/cotironda-piloto-whapi/lector-evidencia-binaria-mvp338.ts`:

1. Recibe `{mime, bytes, sha256}` de un original **ya adquirido por la ruta segura**, con máximo físico de 8 MB. Compara SHA-256 computado del binario contra el declarado y valida firma de archivo, antes de invocar lectores.
2. Para PDF válido, usa `readPdfPositioned`; respeta página real de cada fila. Rechaza capas/escaneo sospechosos, páginas o filas fuera de las cotas preexistentes, sin registrar datos comerciales en logs.
3. Para XLSX/DOCX, reutiliza `readOfficeVisibleRows` y mantiene todas las filas visibles extraídas. Marca sección explícita `xlsx:visible_row_order` o `docx:visible_row_order` para **no inventar** una hoja/página/celda desconocida.
4. Para TXT/CSV, decodifica UTF-8 en modo estricto y pasa las líneas literales por el adaptador MVP337, sin interpretar ni transformar cifras.
5. Para imagen PNG/JPEG/WebP, PDF escaneado y formatos OLE2 DOC/XLS, retorna `review_required` con motivo privado y preserva evidencia original; OCR/decodificador independiente **pendiente**.
6. Envía filas verificadas contra bytes al planificador MVP337, que divide en lotes y registra ubicación, fuente original y orden. Devuelve siempre `economicPublicationAllowed=false` y `whatsappMessages=0`. No modifica tablas ni llama RPC/IA.

## Separación arquitectónica verificada

La primera versión del PR hizo fallar el build TypeScript Next.js: el dominio compartido importaba directamente `supplier-source-pdf-general.ts`, que depende de `npm:unpdf@2.1.0` (válido para Deno, **no** para el compilador Next.js). No era un fallo de lectura del PDF sino una **fuga de dependencia de entorno**.

Se corrigió dividiendo el código:
- Dominio compartido: nunca importa módulos Edge y recibe `readPdfPositioned` y `readOfficeVisibleRows` exclusivamente como capacidades inyectadas. Sin lectores internos => `review_required` (fail-closed).
- Adaptador privado Edge: enlaza implementaciones reales y mantiene las verificaciones de SHA, tipo, páginas, ZIP y seguridad; **todavía no importado por el webhook publicado**.
- Pruebas Node: inyectan el lector Office real y un PDF simulado de posicionamiento. Prueba Deno: usa el adaptador real y un PDF binario con dos páginas. El ensamble del portal no necesita resolver `npm:unpdf`.

## Pruebas

- `tests/unit/mvp338-binary-evidence-private.test.mjs`: archivos DOCX/XLSX **ZIP binarios generados para CI**, incluida planilla de dos hojas con 35 filas, texto TXT/CSV real, imágenes con firmas válidas que quedan en revisión, formatos DOC/XLS heredados retenidos, macros, fórmula, hoja oculta, XML externo, SHA incorrecto, MIME falso, tamaño excesivo y PDF lector inyectado con páginas.
- `tests/unit/mvp338-real-pdf-deno.smoke.ts`: documento PDF auténtico a nivel binario de dos páginas, **generado sintéticamente**, leído a través de `unpdf` en Deno; corroboración de filas comerciales y de la página correcta. Un SHA incorrecto debe impedir procesamiento.
- Workflow `cotironda-mvp338-originales-binarios-privados.yml`: Node, Deno typecheck, PDF binario real y regresión del corpus MVP337. Sin credenciales ni envíos.

## Criterios de aceptación

- Verificar el SHA exacto y firma ANTES de procesar el archivo, rechazar lecturas incompatibles o peligrosas con estado privado.
- Conservar TODO lo que devuelve el lector: material, total, descuento, cargo y condiciones, sin perder renglones silenciosamente.
- Probar XLSX de dos hojas y más de 25 filas reales con plan de lotes, sin afirmar que el puente económico publicado ya admite más de 25 ítems.
- Conservar las páginas verdaderas de PDF; no inventar hoja exacta de Excel cuando la interfaz existente no la devuelve.
- No dar por verificados escaneos, capturas, fotografías o formatos antiguos sin lector independiente.
- CERO envíos WhatsApp, CERO gastos OpenAI, CERO escrituras SQL, CERO publicaciones.
- Ninguna modificación en webhook histórico ni en Supabase/Vercel bajo autorización de desarrollo.

## Bloqueantes que siguen

- Integrar el puente en worker real con archivo privado cifrado, lease, control de costos y análisis idempotente.
- Adaptadores específicos que ubiquen hoja/celda real de Excel y párrafo/tablas complejas de Word.
- OCR independiente de imágenes/PDF escaneados y cotejo de píxeles; manejo de archivos grandes y formatos legados sin ejecutar macros.
- Compatibilizar 25+ filas con la auditoría de precios y persistencia SQL sin perder IVA/flete/descuentos; las dos lecturas IA por lote se mantienen bajo prueba.
- Validar presupuesto auténtico de proveedores reales; oráculo humano y riesgo de citas falsas, cambios de importes o asociaciones equivocadas.
- Revisión de CI definitiva, revisión PR, preflight de bundles Edge y eventual autorización separada «Publicalo», exclusiva al entorno identificado.

## Decisión

El puente real de bytes crea **evidencia privada**, no presupuesto aprobado. El proveedor no reenvía archivos por inconvenientes del sistema. Priorizar exactitud y trazabilidad sobre publicar cifras dudosas o totales incomparables.
