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

## D014 — separación de responsabilidades en identidad del producto
La IA debe extraer el **producto solicitado, el uso previsto, los atributos críticos, marca solicitada y si es obligatoria, cantidad y unidad**, conservando evidencia de origen. La identidad comercial y sus alias se resuelven contra diccionario versionado/curado; el modelo no puede certificar equivalencias ni designar proveedores. El motor de servidor busca primero identidad canónica+compatibilidad, luego trata marca y envase como variantes. No presupone que placas RH/RF, tipos de cemento, cables de otra sección/aislación o pinturas de uso distinto sean idénticos. Las alternativas y dudas aparecen en cotizaciones posteriores, no en una revisión previa del comprador. Ver docs/71.

## D015 — lenguaje genérico y marcas comerciales
La IA debe interpretar solicitudes corrientes sin exigir nomenclatura técnica: «cemento», «cemento común», «cemento Loma Negra 50 kg» describen la **búsqueda del producto**; no completar silenciosamente «CPC», resistencia o norma si no figuran. Extraer marca nombrada como preferencia, salvo expresiones inequívocas «solo», «obligatoria», «sin sustitutos». Proponer alias/familias para consulta a catálogo canónico revisado, **no afirmar equivalencia por inferencia IA**. Identificación por familia permite invitar a marcas y presentaciones diferentes; una discrepancia técnica declarada se etiqueta al solicitar la cotización y se verifica en el análisis posterior. Documento fuente y cantidad/unidad se conservan. Ver docs/72.

## Etapa 02 — puente taxonómico D015 para IA
Se implementó una taxonomía argentina local y versionada con seis familias piloto de cinco rubros (`src/domain/taxonomia-materiales.ts`). El modelo debe extraer literalmente texto, cantidad, unidad, atributos y marca; el **resolvedor controlado** mapea a producto canónico y analiza marcas exclusivas expresas. No se presupone CPC, resistencia ni presentación cuando el pedido solo dice «cemento». Sin coincidencia exacta en la taxonomía o rubro incoherente, se retiene esa línea. Los SKU del proveedor confirmados, zona y consentimiento se controlan luego en el planificador D015. Ver docs/73; no es aún una evaluación real de GPT ni un catálogo exhaustivo.


## D016 — pruebas de calidad end-to-end y omisiones visibles
El nuevo coordinador `simularRondaConCalidadIA` prioriza IA por defecto (solo cuando esté autorizada en entorno DEV), y después aplica validación de evidencia, taxonomía y D015. Resume cada línea no vacía como preparada, parcial, retenida, omitida o sin proveedor; no declara procesamiento completo cuando faltan líneas. Textos como «Necesito 20 bolsas de Cemento CPC 50 kg» pueden verificarse sin descartar el prefijo coloquial, pero «Cemento CPC 50 kg» no puede recortarse a «Cemento». La ruta local sin tokens permanece secundaria hasta medición independiente. Ver docs/75.
