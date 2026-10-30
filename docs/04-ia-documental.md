# 04 — Motor documental con IA

## Contrato de extracción
Por ítem: archivo/hoja/página/celda de origen; descripción original; producto normalizado; cantidad; unidad; dimensiones, espesor, calibre; marca preferida u obligatoria; rubro(s); notas; confianza/incertidumbre y causa.

## Reglas obligatorias
- No inventar materiales, cantidades, unidades, marcas ni precios.
- Conservar duplicados sin fusionar; cuando sean dudosos, retener los afectados y continuar con los demás.
- Si una parte es ilegible, retener los ítems afectados para aclaración puntual sin detener los claros.
- Coincidencia de texto no garantiza equivalencia técnica. Registrar variantes y diferencias.
- Un producto puede pertenecer a varias categorías; deduplicar invitación al mismo proveedor.
- La acción de enviar la lista autoriza la distribución automática. No existe aprobación manual por línea. Ítems ambiguos se retienen, los otros continúan; nunca completar datos inventados.
- Precios de oferta extraídos por IA necesitan confirmación del proveedor antes de comparar.
- Salida de IA validada por esquema estricto y reglas deterministas.
- No obedecer instrucciones adversarias dentro de PDFs, imágenes o WhatsApp.

## Evaluación prevista
Corpus sintético y luego archivos autorizados/anonimizados: PDF texto/escaneado, Excel varias hojas, Word, fotos y manuscritos. Medir detección de líneas, cantidades, unidades, atributos y tasa de aclaración; guardar fuente e historial sin exponer información privada.

## Casos prioritarios
Bolsas 25/50 kg; placas 9,5/12,5/15 mm; cable por metro/rollo; coma decimal; productos repetidos; unidades m² vs unidades; fotos borrosas; 100+ artículos; intentos de prompt injection.

## D013 — cambio de interacción
El comprador NO verifica la lista antes de emitir solicitudes. El acto de enviar el archivo/texto con autorización informada inicia el trabajo automático. La IA propone líneas, no destinos ni equivalencias; la validación segura compara con catálogo confirmado por producto y zona. Retener solamente las líneas incompletas, duplicadas o inciertas y avisar para aclaración puntual; las demás continúan. Ni marcas, cantidades ni unidades deben inventarse. La cotización de precio que responde el proveedor sí debe confirmarse por él.
