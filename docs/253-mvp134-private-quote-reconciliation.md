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

## Ejecución real en PILOTO, verificada 03/11/2026

Solo proyecto Supabase cotironda-piloto (ref ilggkalaafhtiysyzlmg). La migración de diagnóstico privado MVP134 se aplicó correctamente y su RPC devuelve un candidato de 2 líneas con 3 preguntas, rechazando a usuarios anon/authenticated y dejando acceso exclusivo a service_role. La Edge Function cotironda-piloto-document-recovery se desplegó v4 ACTIVE desde merge commit 5fd0e82722f3ea161747f9ef13c9fadd5171013e. El webhook WhatsApp permanece v39, seguimiento v7, finalistas v1. No se modificó el sitio público.

La invocación interna autenticada por token Vault mediante pg_net devolvió HTTP 200 y estado de trabajo privado. El PDF real de Ailín (12.725 bytes) sigue con review_state=suggested_only y cotización awaiting_fidelity_check; la nueva fila de diagnóstico privado indica state=needs_review, reason=unresolved, question_count=3, model_line_count=2. **No hay presupuesto publicado en el ranking.** Verificación de autenticación tras despliegue: POST sin clave, GET sin clave y POST con clave falsa respondieron HTTP 401, las tres comprobaciones aprobadas en GitHub Actions.

Investigación económica solo lectura: el total declarado coincide con la suma de ambos importes de línea, pero en las 2 líneas el precio unitario declarado multiplicado por cantidad difiere del importe de línea, de forma proporcional muy similar. El borrador menciona precios de lista y pago contado en efectivo; ambas unidades de renglón están sin unidad literal. Las tres dudas son IVA no declarado, disponibilidad no indicada y moneda no explícita (símbolo $ sin código de divisa). Por ello no corresponde corregir precios, suponer descuento/IVA/ARS, ni considerar comparable la oferta sin evidencias. Issue #482 detalla la solución de precio condicional, verificación independiente de columnas y cálculo monetario determinista.

El job existente cada cinco minutos permite diagnosticar documentos retenidos sin pedir reenvíos, pero este caso está deliberadamente retenido para revisión económica. **Piloto completo end-to-end NO verificado**: faltan validación de precio de lista/contado, cantidad sin unidad explícita, condiciones comerciales y moneda; dos oferentes, ranking comparable y revelación/avisos de finalistas en una ronda real. Ningún resultado de CI ni HTTP permite afirmar finalización comercial.
