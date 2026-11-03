# MVP-100 — El arquitecto aclara únicamente lo que falta, sin reenviar la imagen

02/11/2026 · Issue #410 · **Solo Supabase Piloto**. No producción.

## Objetivo comercial
Un arquitecto envía una foto/PDF de una lista. Cotironda debe identificar todos los artículos y cantidades, preguntar solo lo indispensable que falte y continuar de manera autónoma con el documento original. Sin confirmación de lectura, sin reenvíos de archivo, sin que el cliente revise cada ítem cuando hay datos completos.

## Implementación
1. Se mantiene el original privado en Storage con su SHA256 y el plan por renglón `document_lines_mvp098`, sin cambiar ni descartar cantidades, nombres o evidencia. El acuerdo dual de lectura `document_agreements_mvp099` es condición necesaria para presentar aclaraciones materiales confiables; si las lecturas difieren, el documento se mantiene en revisión.
2. `cotironda_piloto_clarification_preview_mvp100` construye la pregunta exclusivamente desde los renglones y la localidad faltantes. Ejemplo de un único WhatsApp:

   «Cotironda recibió tu lista. Para pedir precios necesito estos datos:
   1. Cemento: unidad
   2. Arena: unidad y tipo de producto
   3. Huecos del 12: unidad
   Localidad de entrega
   Respondé por número, por ejemplo: 1 bolsas; 2 m3 gruesa; 3 unidades; entrega: La Plata.»

   La pregunta sale una sola vez por archivo mediante `ai_replies_mvp094`, con código fijo `zone` y mensaje contextual generado por SQL. No inventa unidad ni stock.
3. El parser `document-clarification.ts` interpreta un único mensaje breve que incluya unidades (bolsas, m³, unidades, etc.), arena fina/gruesa y localidad. Rechaza valores monetarios, cambios de cantidad, índices repetidos o desconocidos. Se invoca **solo tras recibir y registrar un WhatsApp autenticado**.
4. La RPC `cotironda_piloto_apply_clarification_mvp100` exige exactamente **un documento privado pendiente** del mismo comprador, el acuerdo doble de extracción y la pregunta enviada/aceptada anteriormente por Whapi. Verifica un número de línea vigente, que la unidad estuviera ausente, que la variante sea válida para «Arena», y que la localidad no cambie una existente. Registra la procedencia por HMAC en `clarified_lines_mvp100`, aplica solo los campos faltantes al plan operativo y **no modifica el archivo ni la propuesta IA originales**. Soporta aclaración posterior de variante si en la primera respuesta solo indicó unidad.
5. Si la respuesta completa las condiciones, la misma recepción llama a `cotironda_piloto_prepare_document_mvp099`, crea una solicitud con todos sus renglones y deja invitaciones por rubro/catálogo en cola privada, sujetas a controles de consentimiento y autorización antes del envío. Si siguen faltando datos, la ronda no se crea.
6. La respuesta simple «La Plata» aún sigue por el camino contextual MVP-097 y puede vincularse al documento único, sin volver a pagar por la lectura.
7. No se requiere confirmar cada presupuesto ni registrar el contacto nuevamente.

## Pruebas y límite de confianza
- `mvp100_smoke_rollback.sql` simula un documento con los tres artículos del ensayo real, acuerdo de doble lectura, mensaje único, respuesta `1 bolsas; 2 m3 gruesa; 3 unidades; entrega: La Plata`, enlace seguro al mismo archivo, solicitud global de 3 artículos, no modificación del JSON inicial, no duplicación, revocación a clientes, RLS y ROLLBACK sin WhatsApp real.
- `tests/unit/mvp100-aclaraciones-documentales.test.mjs` verifica parser, límites semánticos y wiring del receptor.
- En el piloto sigue existiendo un límite técnico de **8 líneas por documento para distribuir por PDF**; es una restricción conocida del generador actual, no una cuota comercial. No truncar silenciosamente listas de más artículos.
- La doble lectura de un mismo archivo no garantiza verificación absoluta del origen. IVA/flete, embalajes extras y total de un proveedor requieren todavía verificaciones de fuente, antes de ranking.
- No procesamos retroactivamente WhatsApps históricos ni enviamos nuevas invitaciones de ensayo; los mensajes pasados pueden permanecer pendientes en privado.

## Próximos pendientes para piloto comercial completo
- Soportar respuesta a aclaraciones en lenguaje plenamente libre, no solo numeración semiestructurada.
- Evitar cualquier límite técnico molesto para arquitectos reales (más de 8 ítems, documentos más grandes) con paginación de PDFs y presupuesto global.
- Incluir enlaces de seguimiento automáticos también al completar una lista documental, y avisos prudentes de pendientes múltiples.
- Convertir presupuesto PDF/foto del corralón en oferta **100% fiel** (todos los conceptos y totales, precio/IVA/flete/condiciones/extra pallets), luego ranking justo de cobertura versus competitividad, cierre a 4 días y hasta 2 finalistas.
