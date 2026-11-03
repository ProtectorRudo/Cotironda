# MVP-134 — conciliación privada autónoma de documentos archivados

03/11/2026. Issue #480. Rama del piloto. Los nuevos documentos siguen teniendo prioridad; cuando no quedan pendientes, el cron existente de cinco minutos consulta una cotización retenida por diferencias entre lecturas y ejecuta una comprobación independiente del PDF archivado.

## Propósito y límites
La función recupera exclusivamente el original privado bajo la ruta media/ seguida del HMAC del mensaje; comprueba SHA-256, MIME PDF, tamaño, consentimiento y estado de invitación/ronda. Realiza la comprobación documental independiente del PDF para DIAGNÓSTICO, incluso si la IA enumeró dudas. Si existen dudas se registra needs_review, jamás una oferta. Sin dudas, si la fuente coincide se registra únicamente source_candidate, que tampoco equivale a aprobación: las dos lecturas originales siguen discrepando y las puertas MVP102/MVP103/MVP106/MVP107 permanecen intactas. El resultado es inmutable, sin texto, teléfonos, proveedores, cantidades ni importes. No consume una nueva lectura IA.

## Seguridad
- Selector de rol servicio: proveedor asociado, hash, Storage privado, ronda vigente, autorización no revocada, original PDF y lectura retenida. Máximo un documento, procesado una vez.
- Registro por RPC de servidor, RLS y trigger inmutable. No elimina ni modifica el rechazo de doble lectura existente.
- Con documentos nuevos pendientes, estos tienen prioridad. El mismo cron y token Vault puede auditar una oferta archivada sin reenvío.
- No se modifica producción ni hay envío WhatsApp o publicación. Una evidencia indicativa nunca equivale a fuente comprobada comercialmente.

## Criterios de aceptación
- PostgreSQL17 sintético: rol privado, selección elegible, baja, vencimiento, path alterado, hash y duplicados.
- Tests Node/Deno: SHA original, desacuerdo en IVA/producto/stock, fuente no soportada, bloqueo de ranking.
- Mantener privado el PDF real de Ailín hasta resolver las dudas y verificar términos, unidades, IVA, disponibilidad, gastos, sumas y equivalencias; el piloto no es 100% hasta ejercicio completo real.
