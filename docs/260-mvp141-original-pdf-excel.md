# MVP141 — Revisión con fuentes originales de Ailín y Nahuel

03/11/2026. Issue #488. Corrección PILOTO, nunca producción.

## Diagnóstico real sin exposición de datos

Verificador v3 procesó ambos originales por Storage privado con SHA256: PDF `missing_total`, XLSX `unreadable`. Un diagnóstico efímero mediante el cron ya autenticado devolvió solamente estadísticas de disposición, jamás textos ni importes: PDF 1 página/13 renglones, cifra total única y exacta encontrada, pero a 9 renglones de la etiqueta; XLSX rechazado por `unsupported_layout` en línea de validación de cantidad de etiquetas `row`. El endpoint temporal y su RPC privada fueron retirados, comprobando que no permanecen activos.

## Correcciones sin aumentar fricción

- PDF: admitir un único importe total aislado y fuente-literal solo si todas las líneas están verificadas y la suma decimal exacta iguala el total; los demás importes y condiciones adicionales siguen siendo obligatorios.
- XLSX: aceptar etiquetas `<row ... />` vacías que Excel genera para filas formateadas, contando todas las etiquetas, sin omitir filas ocultas ni las que contienen valores.
- SQL v4: evidencia immutable adicional, revisa archivos existentes sin reenvíos; mantiene v1/v2/v3 intactas, tracking selecciona una sola revisión verificada.
- Pruebas nuevas normales y adversarias. Archivo original preservado. Ningún ranking económico, contacto, nombre, moneda ni IVA supuesto.

## Éxito exigido

CI verde, Deno y PG17. Verificar SQL con transacción ROLLBACK antes del despliegue. Desplegar solo al proyecto `cotironda-piloto`; ejecutar recuperación desde cron original y comprobar 2 ofertas anónimas verificadas visibles al comprador, 0 pendientes. En caso de nuevo rechazo, no publicar ni falsificar ni solicitar reenvíos.
