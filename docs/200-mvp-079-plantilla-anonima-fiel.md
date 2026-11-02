# MVP-079 — Plantilla propia, fiel y anónima para compradores

**Fecha:** 02/11/2026. **Issue:** #372. **Rama:** feat/mvp-079-plantilla-anonima-fiel, apilada sobre el PR #371. **Alcance:** demo offline en el portal y dominio auditable; **NO** Supabase real, Whapi, producción ni extracción de PDF/Excel.

## Decisión de producto
El arquitecto no ve el archivo, logo, marca comercial, teléfono ni formato del corralón mientras la ronda sea anónima. Ve una plantilla uniforme de Cotironda, generada a partir de contenido económico cuyo vínculo literal con la fuente fue comprobado. El original inmutable del proveedor queda resguardado, no se altera ni se sustituye por un resumen.

**Fidelidad no equivale a normalizar o adivinar:** el texto comercial de cada renglón se conserva literalmente y en su posición original. Los extras, pallets, flete, descuentos, impuestos, subtotales y notas se incluyen aunque el comprador no los haya solicitado. El TOTAL declarado se exhibe como fue enviado, distinto de cualquier suma de auditoría y de un futuro costo comparable. Cuando un importe es ambiguo, el renglón se muestra literal y el importe auditado se informa como «sin verificar».

## Funcionalidad creada
- Dominio \`src/domain/plantilla-cotizacion-mvp079.ts\`: exige correlación de **todos** los renglones de una fuente textual, una etiqueta interna «privacidad revisada por servidor», evita dos clasificaciones iguales, y rechaza montos que se intentan ocultar bajo «privado».
- Bloquea publicación de una oferta completa ante filas faltantes, teléfonos, email, CUIT, enlaces, WhatsApp o textos asociados a identidades comerciales. La detección automática por expresiones regulares es una defensa parcial: **no constituye por sí sola una garantía de anonimización**; el proceso de revisión/autorización del servidor es requisito obligatorio previo a cualquier exposición real.
- No duplica logos o adjuntos; la vista final contiene únicamente etiqueta anónima, categorías, textos comerciales fuente, importes comprobables separados, total literal y estado IVA/flete. Nunca sale el original completo ni el ID interno.
- Los datos fuente son pasados explícitamente por una ruta offline; **no existe endpoint público**, lectura autenticada a la tabla privada ni transformación de adjuntos reales. No hay ranking, contacto o WhatsApp saliente.
- Ruta de demo \`/probar/plantilla\`, con interfaz propia y responsive, y un enlace desde \`/probar\`. Robots noindex. Dos presupuestos **ficticios** ilustran ofertas diferentes (pallets, flete, descuento, IVA no informado, flete a convenir). No utilizar esos importes como cotizaciones reales del piloto.
- Las notas comerciales sin monto no se descartan, y el sistema retiene la oferta si no se puede demostrar que es seguro divulgar el texto.

## Criterios y controles
1. Reproducir **todos** los renglones comerciales de una cotización de texto preservando literalmente palabras, cantidades, envases y montos. Permitir ocultar solo cabecera/identidad comercial revisada.
2. Mostrar total declarado separado de monto calculado; si no es numéricamente seguro, conservar literal sin inferir separadores o IVA.
3. Impedir exposición de identificadores, incluso en notas o ítems; no publicar parcialmente cuando exista una línea sin clasificación, o línea monetaria privada.
4. No afirmar que documentos PDF, Excel, imágenes y Word están soportados por el piloto: falta cadena de custodia de archivo, extracción determinista/IA revisada y auditoría de todos los renglones sin pérdida.
5. No declarar ranking, ganadores, ni adjudicación ni enviar WhatsApp por la mera publicación de esta maqueta.
6. Pruebas automatizadas: \`tests/unit/mvp079-plantilla-anonima-fiel.test.mjs\` (fidelidad, extras, descuentos, privacidad, totales ambiguos/repetidos, subtotales, concurrencia multi-proveedor, entrada adulterada y retención completa). Verificar typecheck y build Next.js en CI.

## Limitaciones y próxima etapa
- Esta **no es aún** una pantalla real del arquitecto autenticado: es una demostración reproducible. La fuente original ya está en piloto en \`offer_versions\`, pero falta una lectura autorizada por empresa y revisión (MVP078b pendiente), un proceso independiente de revisión de privacidad, una tabla de evidencia comercial versionada, y un endpoint estrictamente aislado de compradores.
- Archivos PDF/Excel/Word/fotos: sin lector completo confiable, no se pueden mostrar como «100% fieles». **Nunca presentar extracción parcial como presupuesto completo**, ni inventar totales ni eliminar silenciosamente renglones que no coincidan con el pedido.
- En el piloto real, la cotización de Ailín con importes ambiguos permanece en estado no comparable. La demostración contiene datos exclusivamente ficticios.
- Los 4 días de anonimato, hasta dos finalistas consentidos y outbox de avisos son otra etapa que requiere validación específica. Sin cambio en la instalación Cron ni Whapi.
