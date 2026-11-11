# Acta 503 — B5l: censo conservador de cobertura de filas PDF originales

Fecha: 11/11/2026. Autorización: «Luz verde», solo desarrollo y pruebas. No desplegar.

## Hechos verificados
- B5j del piloto observó suma privada coincidente en PDF 1 y moneda ambigua en PDF 2. Ninguno obtuvo verificación integral.
- B5k PR #775 fue desarrollado y probado, pero sigue sin instalarse en piloto.
- Una suma correcta y filas conocidas cotejadas no demuestran que la IA haya extraído todos los artículos, cargos, IVA, descuentos, flete y condiciones del original.

## Cambio B5l
1. Se incorpora un módulo puro de atribución de filas originales PDF.js, sin nuevas llamadas IA, nuevo cron o WhatsApps.
2. Cada fila visible debe corresponder de forma única a material, cargo, descuento, nota completa, condición comercial textual, encabezado estructural o única celda de importe final.
3. Se rechaza artículo extra en otra página, importe separado o incrustado en el material, IVA/flete/porcentaje ajeno al modelo, cláusulas desconocidas, condiciones incompletas, duplicados y PDF escaneado/no corroborado por SHA.
4. El resultado del barrido es un código privado con contadores limitados de filas atribuidas, líneas y condiciones. Nunca devuelve precios, texto del proveedor, coordenadas ni datos personales.
5. Un resultado visible_rows_accounted_private significa solamente que el texto visible *extraído* por PDF.js está atribuido. NO demuestra que PDF.js haya capturado todos los elementos gráficos o páginas: source_verified=false, full_document_covered=false, can_publish=false, can_rank=false, can_reveal_contacts=false.
6. El trabajador B5k de la rama incorpora el censo B5l reutilizando su lectura PDF original y SHA. El SQL B5k, todavía no publicado, agrega códigos/counters a la tabla privada ya prevista; conserva RLS, service_role, cuota 1, flag OFF y selección de únicamente el PDF 2 histórico. No se crean otra cola ni otra Edge.

## Criterios de aceptación
- Tests Node: encabezados habituales, material y condiciones, información extra sin precio, extras con precio, importes en la misma fila, IVA/flete/porcentajes, notas sin precio, PDF multipágina, texto no reconocido, duplicados, escaneo/geométrico incorrecto, confidencialidad.
- Deno: PDF.js con archivo PDF sintético real en memoria, cotejo y prohibición de publicación.
- PG17 ROLLBACK: código cerrado, contadores coherentes, rechazo de falsificación y datos personales, roles privados y aislamiento de fuentes.
- CI de Node, Deno, PG17, regresión y Next.js; sin merge hasta estar verde.

## Limitación y salida comercial
La cobertura visible es una BARRERA NEGATIVA contra omisiones; no una certificación del documento completo. Las ofertas al arquitecto requieren comprobar moneda, totales, impuestos/flete, cobertura documental integral y comparabilidad de artículos, con ranking determinista y anonimato según reglas. No exigir al proveedor que edite documentos ni nuevas confirmaciones.

Al aprobarse el desarrollo, el siguiente paso necesita autorización distinta «Publicalo» para actualizar solamente el piloto B5k+B5l, ejecutar una relectura privada sobre el PDF 2 y apagar las banderas después. No tocar producción, Vercel ni Whapi.

Estado: sin despliegue y sin nuevos mensajes; PR apilado sobre #775.
