# MVP163 — Segunda lectura de unidades y condiciones en archivos originales

**03/11/2026 · Issue #536 · Primera etapa de P0-B2 (#535) y plan #529. PILOTO solamente.**

## Motivo

En los dos presupuestos PDF reales de Ailín y Nahuel, la fidelidad documental v9 quedó verificada y ambas ofertas son anónimas y visibles, pero las seis unidades `supplier_quote_lines_mvp101.unit_literal` son nulas. Por lo tanto no pueden compararse directamente con el pedido de arena fina 1 m³, piedra partida 2 m³ y 25 bolsas de cemento. El presupuesto puede expresar BIG BAG o "25 kg" como presentación del producto sin indicar un volumen en m³ ni una unidad de cantidad.

## Diseño

- Un lector **independiente del modelo** reabre el archivo privado de Supabase Storage `cotironda-piloto-originals` y comprueba tamaño y SHA256 contra el archivo archivado. Usa PDF.js posicionado (página/renglón), lector de filas visibles DOCX/XLSX ya existente o texto plano.
- Busca cada artículo del borrador en **un único renglón original** con cantidad, precio unitario e importe exactos; no admite dos coincidencias indistinguibles. El patrón de unidad solo se verifica **fuera** de la descripción y de precios: `2 m³ arena fina` se reconoce; `cemento 25 kg` no se convierte por sí solo en `25 kg` de cantidad. BIG BAG se guarda como **presentación**, nunca como m³ ni flete.
- Los términos IVA, flete y pago se guardan como **categorías de presencia textual** (ej. `to_agree`), NO como tasa/precio/stock/costo total comprobado. Sin prueba explícita la categoría es `not_stated`; disponibilidad siempre `not_proven`.
- Nuevo ledger privado append-only `cotironda_piloto_privado.supplier_source_facts_mvp163`, con RLS, RPC exclusivamente service_role y control de SHA, versión v9 vigente, invitación, consentimiento, cotización y archivo exactos. Solo contiene estados, unidades canónicas y localizadores numéricos, no guarda contactos ni texto original.
- Se conecta a `cotironda-piloto-document-recovery` **solo cuando no hay documento principal pendiente**. Procesa como máximo un archivo por tick (cron existente), sin nuevas llamadas OpenAI ni mensajes WhatsApp. Un archivo ilegible produce `unreadable`, nunca un ranking simulado.
- Para PDF, `page` indica página real del extractor. Para DOCX/XLSX, `page=1` identifica únicamente el **grupo de extracción virtual** y `row` es ordinal entre filas visibles; **NO es una cita a una hoja/celda real**. La atribución exacta de hoja/celda sigue pendiente en #535.

## Límites y permisos

No se modifica ninguna cotización existente, importes, descuentos, totales, oferta visible, ranking, configuración de finalistas, contactos, almacenamiento fuente ni su versión v9. Nunca se exporta esta evidencia a la API pública y `rankingAllowed=false`. Un contador de unidades reconocidas **no convierte automáticamente una oferta en comparable**: todavía exige verificador comercial con descuentos/IVA y condiciones, equivalencia técnica y stock independiente (MVP162). Los archivos de imagen/escaneos no se procesan por esta ruta y necesitan su propio método de evidencia; no se ocultan ni rechazan por ello.

## Pruebas y aceptación

- 11 tests Node: BIG BAG de proveedores, m³ explícito, peso 25 kg en descripción, columnas Excel visibles, unidad contradictoria, filas duplicadas, IVA/flete/pago en categorías, valores ausentes, fuente ilegible, SHA de bytes almacenados y privacidad de salida.
- SQL PostgreSQL17 `BEGIN/ROLLBACK` contra metadatos de un documento real (nunca fuente privada): creación de ledger/RPC, payload categórico válido, rechazo de extras y unidades no admitidas, idempotencia, permisos anon/auth y no activación finalistas.
- Revisión de compatibilidad de archivos Edge en vivo ANTES de desplegar, conservación completa del parser Excel específico del piloto; ejecución controlada del recuperador y verificación de hechos efectivamente insertados en `cotironda-piloto`. Ninguna notificación real.

**Pendiente:** alimentar MVP162 con estas evidencias solo después de probar equivalencia técnica y condiciones económicas, así como lectura de imagen/escaneo y citas por celda Excel. No declarar ranking ni dos recomendados aún.
