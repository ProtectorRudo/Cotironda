# 189 — MVP-069: cargar listados de materiales de dos corralones (ensayo móvil)

**01/11/2026 · Issue #351 · PR en desarrollo.**

## Problema que resuelve

El motor comercial D065/D080 NO puede seleccionar un negocio solo por estar marcado como corralón. Debe tener **materiales concretos** que venda, aprobados, con producto canónico verificado, localidad de entrega y consentimiento. Hasta aquí el prototipo WhatsApp tenía catálogos predefinidos; faltaba probar la entrada del negocio.

## Funcionalidad de esta iteración

Ruta de prueba `/probar/catalogos` (disponible **en código**, no confundir con URL desplegada):

- Dos comercios ficticios, sin nombres, teléfonos ni credenciales reales.
- Cada comercio puede **subir archivo CSV o TXT UTF-8** de hasta 64 KB, o **pegar texto** (máximo 500 filas). Exportar desde Excel como **CSV UTF-8** si el proveedor tiene una planilla. XLSX, PDF, DOCX, JPG y PNG **NO** se admiten todavía: necesitan procesamiento privado de bytes, validaciones y almacenamiento seguro.
- CSV tiene que incluir un encabezado `producto`, `material`, `articulo` o `descripcion`. Delimitador punto y coma, coma o tabulador; celdas con comillas escapadas. La columna `rubro` es opcional. Columnas de precios se ignoran **sin importar ningún valor**.
- Clasificación **determinista y conservadora** con `identificarProducto` de D015 y seis familias de materiales curadas: cemento gris de obra, hidrófugo, látex, placa de yeso, cable unipolar, caño PVC. No es una IA general entrenada ni una certificación de equivalencia técnica. Cualquier material fuera de esas familias aparece pendiente; no se inventan coincidencias.
- Maneja descripciones inseguras/fórmulas, rubro incompatible, duplicados y productos parecidos pero excluidos. Ni los errores ni los datos excedentes pueden activar solicitudes.
- El arquitecto pega su pedido con cantidades y localidad. Simulación compara familias reconocidas con dos catálogos **provisionales** y su zona declarada. Muestra los ítems de la consulta para cada negocio y los ítems sin proveedor; **0 mensajes reales enviados**.

## Riesgo y límites explícitos

La pantalla funciona **en el navegador** y no guarda datos en Supabase ni publica productos. No marca productos como activos/confirmados en el backend D080. Esa activación exige alta empresarial autenticada, identidad telefónica verificada, consentimiento, persistencia con RLS y curaduría segura. No reutilizar esta función de navegador como fuente autorizada de invitaciones a producción.

Los campos de precio que vengan junto a una lista son *ignorados deliberadamente*; el precio y el total se reciben solamente como oferta en la ronda, y se conservan literalmente (D093, pendiente vista íntegra real). Tampoco se pide al proveedor que confirme cada cotización: la revisión de catálogo es una operación distinta.

## Criterios verificados por pruebas

`tests/unit/mvp069-catalogos-piloto.test.mjs`: texto de proveedor, CSV delimitado por coma y punto y coma, precios ignorados, excluidos (cemento blanco/de contacto, guantes de látex, coaxial), fórmulas/URL, duplicados, rubro erróneo, archivos invalidos/gigantes, coincidencias A/B, desconocidos y zona fuera de cobertura. Los ejemplos de catálogo no representan negocios reales.

## Pendientes de un E2E Whapi real

- #175: respaldo auténtico/restauración o ambiente de prueba nuevo aislado y recuperable. Supabase DEV histórica no se modifica sin esa garantía.
- Migraciones comerciales D024–D093 y RLS probadas, registro de los tres números ya suministrados (sin incorporarlos al repositorio), verificación de control/consentimiento y alta de negocios en el backend.
- **Carga verdadera de catálogos** por WhatsApp y/o portal, ingreso privado de XLSX/PDF/imagen, extracción IA + curaduría del producto en D080. Subir CSV a esta demo NO equivale a registrar el catálogo en la base.
- Preview actual HTTPS verificada, webhook de Whapi + header secreto, colas, worker D082 y distribuidor D071/D070 con listas de destinatarios limitadas.
- Presupuestos íntegros visibles y anónimos al comprador, cobertura/totales justos y revelación consentida de hasta dos finalistas.

**No se instaló SQL ni se habilitaron envíos ni se conectaron los números.** Este incremento permite probar y auditar la regla de catálogo antes de arriesgar el piloto.
