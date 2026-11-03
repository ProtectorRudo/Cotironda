# MVP142 — Correctivo de los documentos originales del piloto (03/11/2026)

Issue #488. Scope: `cotironda-piloto`, nunca producción.

**Evidencia de los archivos originales verificados por SHA256**, diagnóstico efímero autenticado sin extraer textos: PDF Ailín tiene 13 renglones; uno incluye exactamente el importe total pero además texto (etiqueta TOTAL se lee a 9 renglones de distancia). XLSX Nahuel tiene tres worksheets: las dos primeras no contienen filas; la tercera contiene ocho filas y los datos. No es error comercial de los proveedores.

- Excel: admitir hojas visibles realmente vacías (`<sheetData/>` o elemento vacío) mientras se inspeccionan todas las hojas y se descarta cualquier celda oculta o no leída. No omitir hojas con importes.
- PDF: permitir el total fuente-literal aislado aunque esté acompañado de un descriptor comercial como CONTADO, si la condición figura también en las aclaraciones verificadas; todas las líneas deben tener importe comprobado y suma exacta. Rechazar pallet, flete u otros cargos inadvertidos.
- Verificador versión 5 append-only: conserva evidencias anteriores, recupera automáticamente sin reenvío ni confirmación y deja intacta la presentación anónima y ranking separado.
- Diagnóstico temporal `shape` y función RPC fueron retirados tras el análisis; nunca devuelven documentos, montos ni identidad.
- Pruebas unitarias adversarias + CI y migración reversible obligatorias.

Éxito solo si la ejecución real en el PILOTO marca ambas `verified` y el estado del enlace comprador refleja 2 ofertas anónimas y 0 pendientes; si falla, no publicar cifras no acreditadas.
