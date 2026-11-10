# Decisión 412 — MVP287: falso desacuerdo IA y estados Whapi de avisos

Fecha: 07/11/2026, segunda prueba real del piloto a las 06:35:34 AR. Issue #675.

## Hechos observados en cotironda-piloto (solo lectura)

El mensaje nuevo del arquitecto fue recibido, con fuente original válida y contenido comprobado por comparación SHA256 contra **el mismo texto de prueba recomendado previamente**. El pedido sí contenía dos materiales con cantidades y zona La Plata. Resultado: `ai_central_attempts_mvp226.state=review`, `failure_code=lecturas_discrepan_en_articulo`; 0 rondas, 0 revisión, 0 despacho.

La IA Central usa dos lecturas independientes. El contrato anterior exigía `segunda.evidencia === primera.evidencia` (citas literalmente idénticas), aunque ambas pudieran apuntar al mismo renglón real de origen. También exigía texto exacto de unidad (por ejemplo `bolsas` contra `bag`). Esto **puede generar falsos rechazos**. Las salidas originales de ambos modelos no fueron preservadas; no afirmar que alguno de esos dos detalles específicos sea la causa comprobada de la diferencia. El código de error sí permite ubicar la rama de validación.

El intento de aviso MVP286 se guardó como `api_accepted`, con ID Whapi estructuralmente válido, a las 06:35:44 AR. El comprador manifestó no haberlo recibido. **No hay prueba de entrega** en `delivery_receipts_mvp119` ni `uncertain_whapi_receipts_mvp257`. Esos registros tenían **0 comprobantes incluso para mensajes anteriores** y no soportaban origen `buyer_review_notice`. La respuesta de API con ID confirma aceptación por el transporte, NO entrega a WhatsApp; Whapi devuelve estados posteriores por webhook. No se deben atribuir mensajes recibidos ni inventar un fallo de canal sin datos.

## Cambios propuestos

- Contrato de origen: permite citas literales de distinto largo únicamente si ambas se encuentran en el texto original, se solapan con el mismo renglón y respaldan la **misma cantidad positiva**. La unidad puede variar solamente entre convenciones ortográficas y conteo de envases expresos. **Nunca equivale kg, m3, metros, litros a bolsas por intuición**. Rubro, cantidad y número de ítems deben coincidir. Las cantidades discordantes, las citas inventadas o extraídas de otro renglón, rubros diferentes o citas sin cifra cuando había una requieren revisión.
- Whapi: una respuesta HTTP 2xx con un `sent:false` explícito, `status:'failed'`, o ID ausente no puede marcarse aceptada. `api_accepted` continúa significando aceptación y nunca `delivered`.
- Se actualiza la RPC de recepción de estados (MVP119) para asociar únicamente avisos de revisión previos, con HMAC del mismo comprador, ID Whapi único, avance monotónico de `pending/sent/delivered/read` y registro privado del hash del ID. **Sin ningún reenvío**. Un estado falso, fuera de orden o de otro contacto no podrá marcar entrega.
- Pruebas Node con el texto idéntico a la recomendación y casos extremos; PostgreSQL 17 acumulativo con un único ROLLBACK y estados de recepción sintéticos.

## Límites

La ausencia de eventos de estado **no permite asegurar** que Whapi no enviara, que lo entregara o que fallara. Se necesita comprobar en Whapi.Cloud el estado del canal y que el webhook tenga eventos `statuses` configurados. Si siguen sin llegar eventos, el conector disponible no tiene herramienta para consultar el mensaje directamente con el token de Whapi, por lo que puede ser necesaria intervención puntual desde el panel. No se deben enviar mensajes de prueba sin aprobación adicional ni reprocesar los dos originales.

No se aumentan cuotas de OpenAI, no se exponen claves, no se contratan servicios. El resguardo previo sigue interno, no es backup independiente.

## Pruebas de aceptación

El nuevo mensaje sólo deberá habilitar revisión si el contenido original está completo y los dos lectores coinciden semánticamente bajo equivalencias controladas. No enviar PDFs antes de `CONFIRMAR COTI`. El aviso de error debe distinguir aceptación por API de entrega real; no prometer una respuesta visible hasta ver un estado `delivered/read` o confirmación del comprador. En cualquier discrepancia genuina, conservar el pedido y solicitar aclaración, nunca ocultarla.
