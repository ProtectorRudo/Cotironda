# MVP143 — El total real del PDF no tiene etiqueta TOTAL detectable

03/11/2026. Issue #488. Diagnóstico autenticado y efímero en archivo original con SHA256: Ailín tiene 2 renglones con sumatoria exacta igual al total informado; importe total aparece 1 vez, con $ correcto y sin cargo ajeno; no hay etiqueta TOTAL reconocida en ninguna línea. El requisito de etiqueta textual era artificial. El endpoint temporal se eliminó y la función privada de diagnóstico se revocó/borró.

## Corrección
Aceptar el valor total inequívoco de la fuente PDF aunque falte la palabra «TOTAL» cuando: cada línea y precio está verificado; todas las cifras se suman exactamente al monto declarado; la cifra total figura solo una vez en una línea sin cargos ajenos; las condiciones de la línea están presentes en las aclaraciones; las demás líneas monetarias se comprueban y no se permiten montos ocultos. No inventar IVA, moneda ni ranking.

SQL append-only v6 sobre PILOTO; no tocar v1-v5, seguimiento selecciona la última revisión verificada. No publicar si falla un control.

## Aceptación
CI + Deno + PG17. SQL en transacción reversible. Probar PDF Ailín real y mantener Nahuel XLSX real verificado con v5. Tracking debe devolver 2 ofertas completas, fieles, anónimas, sin contactos ni ranking y 0 archivos pendientes. Si falla, no declarar terminado.
