# MVP137: contextualizar la lectura de una cotización con proveedor verificado

Fecha: 03/11/2026, SOLO PILOTO. El Excel real de Nahuel llegó y se interpretaron sus dos líneas con importes y total, pero el modelo clasificó el documento como buyer_request. No hay que hacer que el proveedor reenvíe la cotización. El tratamiento del caso archivado sigue identificado en issue #485 / PR #486 (migración MVP136 bloqueada por seguridad del conector); este cambio corrige la causa en futuras entradas sin migración ni cambios en datos históricos.

## Regla operacional
El webhook Whapi conoce por variables privadas (allowlist de destinatarios consentidos) los dos proveedores piloto y calcula sus chat HMAC con la clave interna. **Solo si** el número de origen autenticado por la firma Whapi coincide criptográficamente con un proveedor de ese listado, después de pasar el gate existente cotironda_piloto_reserve_media_mvp095 que valida autorización, identidad e invitación, el lector de documentos recibe la pista PROVEEDOR VERIFICADO.

Si la IA devuelve buyer_request pero el documento tiene por cada artículo precio unitario, importe de línea, evidencia y un total declarado, se cambia SOLO el tipo del borrador privado a supplier_quote. Se conserva la totalidad de los renglones, notas y precios originales; el modelo no decide si la cotización está económicamente validada. Una hoja sin precios, una condición ambigua o un remitente no registrado no se promocionan. Una hoja con precios de referencia reenviada por proveedor queda únicamente como borrador privado, sin adjudicaciones ni divulgación automática.

La normalización independiente se aplica también a la segunda lectura por el modelo; si hay divergencias económicas, la puerta de cotejo original seguirá reteniendo la oferta. No se desactiva control de fuente, aritmética, privacidad, consentimiento, cierre o revelación. Sin mapeo de número Whapi activo, el sistema falla cerrado, no presume el rol.

## Pruebas
Ejemplos positivos/negativos con dos artículos, precio lista vs total contado, notas de flete y retorno de pallets, origen comprador, fecha y evidencia ausentes, números/código falsos, propuesta inalterada, ausencia de influencia de texto enviado por usuario. Deno y Node CI, PostgreSQL 17 y Auth guardrails. Despliegue autorizado solo del webhook cotironda-piloto-whapi a PILOTO desde commit exacto tras CI.
