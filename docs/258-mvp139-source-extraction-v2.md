# MVP139 — ampliar lectura comercial, sin alterar los originales

03/11/2026, issue #488. En la primera ejecución REAL de MVP138:
- El PDF de Ailín fue retenido como `missing_amount` por descuento 22,4% ubicado en objetos de texto/columna con precisión diferente.
- El Excel de Nahuel fue retenido como `unreadable` por la rigidez del parser de hojas, no por una discrepancia matemática detectada.
- No se publicó ninguno: la privacidad del sistema se mantuvo intacta.

**Revisión v2:** permite formato normal de hojas Excel (estilos, filtros, celdas vacías, encabezados fusionados y valores numéricos cacheados de fórmulas), sin ejecutar macros, fórmulas, vínculos externos ni omitir hojas. Para PDF, descuento en otra columna/objeto se acepta SOLO si su porcentaje aparece explícito en la fuente y coincide con la matemática determinista decimal de precios y cantidades, tolerando hasta 10 centavos de redondeo; jamás recalcula ni reemplaza el total o el importe del proveedor.

La revisión se re-ejecuta a través de la MISMA tarea cron/Edge autenticada y guarda una segunda versión de evidencia por fuente; conserva v1 inmutable. El seguimiento del arquitecto muestra solo `state=verified` de versión 2. Si falla, no publica y queda identificada la razón. No WhatsApp, sin pedir confirmación, sin manejar secretos manualmente, sin tocar producción. Se amplían pruebas de casos negativos y de autenticación original. Presupuestos recibidos no son ranking económico ni ganadores.
