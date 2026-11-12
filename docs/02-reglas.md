# 02 — Reglas funcionales V2 (12/11/2026)

> **Vigente:** [Contrato V2](COTIRONDA-V2-CONTRATO.md) prevalece si hubiera una diferencia. Las reglas de anonimato/ganadores/confirmación anteriores quedaron reemplazadas por D012.

## Solicitud y distribución
- Comprador autenticado envía PDF/Excel/Word/imagen/texto; IA identifica materiales, cantidades, rubros, unidades y variantes. No inventar datos. Preguntar localidad de entrega **solo si falta**; no exigir correcciones o confirmaciones por cada pedido en el flujo normal.
- **D013 obligatoria:** negocios seleccionados **por coincidencia de cada artículo solicitado con productos de su catálogo individual y zona**, nunca por rubro/nicho; catálogo no garantiza stock. Interpretar sinónimos y equivalencias técnicamente sustentadas, con marcas flexibles salvo marca obligatoria y presentaciones convertidas correctamente. Enviar solo artículos compatibles de cada comercio, incluso de rubros diferentes, con referencia única y consentimiento WhatsApp. Detalle: [D013](V2-D013-CATALOGOS-EQUIVALENCIAS.md).
- Admitir múltiples rondas de diferentes arquitectos **simultáneamente para un mismo negocio**. La asociación se fundamenta en referencia/mensaje citado/procedencia, no en bloquear al proveedor ni elegir automáticamente por fecha.

## Respuesta y original
- Respuestas libres por WhatsApp (texto o adjuntos, formatos habituales). Preservar original inmutable, fecha, remitente, SHA y versiones. Conservar ítems adicionales, descuentos y condiciones incluso si no están en la solicitud.
- Webhook autenticado, deduplicación y vínculo inequívoco por fuente. Ante varias rondas posibles, **revisión interna**; jamás reasignar histórico sin evidencia. No pedir al negocio reenvío por una limitación interna.
- Al comprador se le muestra el documento original **tan pronto está asociado y autorizado**, independientemente de que IA haya finalizado su análisis.

## Durante la ronda
- Mostrar solo comercios que **respondieron**, nombre, rubro, fecha, original y comentario individual. **Prohibido** mostrar lista/número de invitados, nombres de pendientes, cuántos faltan, ranking u ofertas de otras empresas. Si nadie respondió: «Todavía no recibimos cotizaciones».
- Análisis breve orientativo 70–110 palabras: cobertura y faltantes, diferencia de presentación/unidad/marca, condiciones relevantes, conclusión práctica. Debe aportar valor sin ser un testamento. Si IA falla, original permanece y comentario pendiente/no disponible.
- Identidad de comercios que respondieron visible al comprador destinatario bajo términos de participación informados; archivos privados y descargas autenticadas. No mostrar a proveedores cotizaciones de otros.

## Cierre y análisis general
- Plazo predeterminado **dos días hábiles**; fecha/hora fijadas y visibles, huso Argentina, feriados y excepciones probados. Hora 18:00 del segundo día hábil siguiente propuesta para el piloto, calendario por validar.
- A la hora de cierre comparar únicamente respuestas válidas en plazo, por **rubro, cobertura y productos equivalentes**. Precio por unidad normalizada con cálculo determinista; descuentos, IVA, flete, disponibilidad y forma de pago SOLO cuando aparecen de modo explícito.
- Si no consta IVA/flete/pago, informar «No informado», no «incluido», «gratis» o «sin IVA». Ofertas parciales deben diferenciarse de compras completas. Sin un número de ofertas comparable, indicar limitaciones. Recomendación IA justificada, no adjudicación automática.

## Seguridad
- Términos claros a comercios sobre exhibición de identidad comercial y originales al comprador de la ronda; revisar datos personales/bancarios y base legal antes de activar. Evitar consentimiento adicional por mensaje.
- Comprador autenticado, RLS por empresa, Storage privado, URLs firmadas temporales, opt-out WhatsApp, anti-spam, auditoría y mínimos privilegios. No considerar pertenencia a Cotironda como permiso ilimitado para todos los usos.
- Prohibidos secretos/PII en repo público. Sin despliegue con «Avanza» o «Documentalo».

**Fuente operativa:** [Plan maestro V2](PILOTO-100-PLAN-MAESTRO.md) y [Estado](PILOTO-100-ESTADO.md).
