# MVP166 — Prueba documental y aritmética de descuentos comerciales por renglón

**04/11/2026. Issue #535; plan #529; antecedente MVP157, MVP162–165. Desarrollo sin publicación.**

## Por qué

MVP157 puede certificar que el archivo PDF y la propuesta del proveedor incluyen porcentajes de descuento y montos consistentes. MVP163 localiza las presentaciones y menciones de condiciones. Ninguno produce todavía un dato económico respaldado por ubicación que sirva directamente al adaptador MVP162. En la ronda real de Ailín y Nahuel existen descuentos explícitos; pero IVA, entrega, precio base fiscal, disponibilidad y variedades técnicas no se deben suponer. Una cotización documentalmente correcta no equivale a una oferta económicamente comparable.

## Implementación

El módulo puro src/domain/auditoria-descuentos-mvp166.ts toma:

1. El documento v9 **vigente**, con todas sus líneas, total y prueba fuente/verificación.
2. Filas de texto posicionadas extraídas del archivo original por un servicio **privado**: página, fila y texto literal. Los datos de Excel/DOCX hoy poseen ordinal de extracción virtual; **no** equivalen a una celda exacta.
3. El SHA-256 comprobado sobre los **bytes originales** por el llamador privado, no por una propuesta IA ni un navegador.

Comprueba SHA, versión, vigencia, suma declarada y suma de líneas; exige correspondencia unívoca de descripción, cantidad, unitario e importe en **un mismo renglón fuente**; rechaza duplicados y porcentajes ambiguos. Acepta la columna Dscto de PDF y XLSX, una tasa etiquetada en el renglón y un descuento global único cuando la aritmética exacta lo corrobora.

Con BigInt calcula:

- porcentaje comercial de 0 a menos de 100, con dos decimales como máximo;
- importe unitario comercial tras descuento redondeado a centavos;
- producto de precio unitario descontado por cantidad y conciliación **exacta** con importe literal de línea.

Si no hay porcentaje pero la multiplicación de lista por cantidad coincide, etiqueta «importe sin ajuste conciliado» sin afirmar que no existe descuento, IVA o recargo. Si difiere, no reconstruye ni reescribe el original. Por compatibilidad, no se aceptan redondeos de documento superiores a la aritmética comprobada en este nuevo contrato económico (un PDF v9 puede seguir visible aunque su redondeo no permita deducir un unitario a centavos).

La salida **no** exporta texto fuente, nombres, SHA, teléfono ni el archivo, y siempre declara rankingHabilitado=false, ivaAcreditado=false. El unitario comercial **no es todavía el precio unitario neto sin IVA** requerido por MVP162. Está expresamente prohibido pasarlo como TerminosAuditados.precios hasta corroborar base imponible, tasa y tratamiento de IVA. Tampoco se deducen stock, flete, plazos, pago, mínimos ni variantes técnicas.

## Pruebas

tests/unit/mvp166-auditoria-descuentos.test.mjs aporta 14 escenarios de importes comerciales representativos del PDF real de Ailín (22,4%) y Nahuel (0,0%); fuente sin descuento; ambiguos con IVA en el renglón; SHA/revisión; una fila duplicada; total y cantidad adulterados; hojas con columnas; tasas imposibles; renglón faltante. Los valores de tests son **sintéticos** y no constituyen una ejecución contra la base del piloto.

## Próximas entregas

- Probar un lector privado con bytes descargados de Storage y hash **verificado**, sin alterar ni reenviar documentos; conservar localizador real de hoja/celda en XLSX.
- Construir auditoría de IVA, tratamiento de descuentos y flete: cuando se demuestre el **precio neto sin IVA** desde fuente, producir TerminosAuditados auditables. Nunca asumir 0% por ausencia de tasa.
- Probar descuentos sobre PDF/Excel/Word/imágenes y escaneos, incluyendo totales no desglosados; cuando no haya evidencia comparable, mostrar la oferta original intacta sin ranking.
- Conectar de manera segura al comparador y al cierre de **rondas nuevas**, con permisos y consentimiento #525; no activar finalistas ni contactos históricos.

**Seguridad:** no SQL, Edge, Whapi, Supabase, originales, cierre ni producción modificados por este PR. No se declara terminado el issue #535.
