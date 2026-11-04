# MVP-136: reclasificación automática, privada y auditable de Excel de proveedor

03/11/2026. Issue #485. Bloqueo real: XLSX de Nahuel 9696 bytes, participante proveedor registrado e invitado a la ronda, tiene dos renglones con precio unitario y total de línea, un total declarado y cero dudas; pero la lectura IA declaró buyer_request y no creó un registro de presupuesto. El PDF de Ailín es otro caso, retenido por precios de lista y condiciones no resueltas.

## Resolución y fricción
El recuperador ya existente autenticado con Vault procesa primero documentos nuevos. Cuando no hay, inspecciona un documento de proveedor archivado cuya IA atribuyó erróneamente la función buyer_request. El selector interno requiere invitación activa, proveedor habilitado y consentido, fuente en Storage privado, SHA256, cantidad máxima 25 líneas, TODAS las líneas con cantidad descriptiva, precios unitarios e importes literales y total declarado. No hay reenvíos, nuevas llamadas OpenAI, nuevas invitaciones, respuestas Whapi ni confirmaciones.

El trabajador descarga el original de Storage, comprueba su tamaño, cabecera de PDF/ZIP y SHA256 antes de hacer una única llamada RPC. Esta guarda el borrador original íntegro en tabla append-only, cambia únicamente la etiqueta kind del borrador de buyer_request a supplier_quote y ejecuta el espejo original que guarda cabecera y TODOS los renglones. La operación es una transacción atómica: si falla el espejo, no queda ningún cambio parcial. La fuente real sigue íntegra en Storage con el mismo hash.

**El resultado es stored_unverified; source_verified=false y ranking_allowed=false.** El fallo de clasificación ya no impide recibir y registrar la cotización, pero la comparación económica, una segunda lectura independiente y la auditoría de fuente quedan pendientes. No se modifican puertas MVP102, 103, 106, 107 ni se declara ganador. La clasificación no convierte en verdadero ningún dato comercial de IA.

## Pruebas y alcance
PG17 aislado: proveedor válido, rol privado, hash incorrecto, doble llamada, doble publicación evitada, baja de consentimiento, ronda vencida, ruta Storage alterada, auditoría inmutable. Node unit: SHA real de bytes, tamaño, magic de PDF/ZIP, no exponer contenidos, recuperación priorizada.
No enviar ni mostrar contactos, precios sin comprobar o nombres en logs. Desplegar exclusivamente a cotironda-piloto tras CI y probar el XLSX original archivado en el piloto. No desplegar a producción ni modificar el webhook Whapi activo.
