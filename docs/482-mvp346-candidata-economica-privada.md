# Acta 482 — MVP346: revisión económica privada desde el PDF original

**Fecha:** 10/11/2026. **Estado:** únicamente desarrollo. Sin publicación, SQL real ni llamadas pagas a modelos. **Base:** MVP345 (#755), MVP344 (#754), MVP343 (#752) y MVP336 (#742).

## Diagnóstico del bloqueo

MVP101 mantiene inmutables los renglones originales. MVP102, MVP103 y MVP106 consultan esas mismas líneas; si la primera lectura confundió una columna de unitarios, la segunda lectura no puede modificar silenciosamente el presupuesto ni dejarlo publicable. No se debe retirar el disparador de inmutabilidad ni sobrescribir las propuestas viejas. Tampoco crear una recepción Whapi ficticia.

## Solución acotada

El worker MVP292 ya obtiene el PDF archivado desde Storage y verifica sus bytes contra el SHA-256. Con esa **misma** segunda lectura, y solamente para documentos PDF, MVP346:

1. Exige que materiales, cantidades y unidades sean idénticos entre lecturas, aunque los importes/condiciones puedan discrepar. No infiere presentaciones ni altera el pedido.
2. Comprueba enteros en centavos y cantidades con hasta tres decimales, sin usar `Number` de coma flotante. Exige suma exacta de renglones y total declarado. Conserva literales de moneda y condiciones, y no resuelve automáticamente descuentos.
3. Comprueba el candidato contra **el PDF original** mediante el verificador independiente `checkSupplierPdfSource`, usando los bytes ya validados por SHA. Su lector conservador puede rechazar tablas complejas, columnas no atribuibles o notas con importes sin cubrir: la duda queda privada.
4. Cuando todo lo anterior pasa, llama una sola vez a una nueva RPC, que revisa nuevamente la aritmética y las autorizaciones, vigencia de ronda, proveedor, invitación, HMAC, SHA y alcance de materiales. La RPC inserta en una tabla privada e inmutable `supplier_revision_candidates_mvp346` la propuesta **original** y la **nueva candidata** por separado.
5. La candidata **NO modifica** `media_archive`, `supplier_quote_lines_mvp101`, los dictámenes ya registrados, las ofertas anónimas, el ranking, el contacto o el estado de ronda. La lectura original permanece disponible para auditoría. Cuando la comparación estricta MVP102 rechaza una diferencia, el replay devuelve el motivo privado `economic_revision_candidate_private`, nunca éxito comercial.

No hay una segunda llamada a IA: se utiliza la lectura de corroboración del worker que ya estaba prevista. El costo detallado sigue siendo secundario a la funcionalidad, pero las reservas únicas y validaciones existentes siguen activas.

## Criterios de aceptación

- Dos lecturas idénticas: ninguna RPC adicional y sin nueva versión.
- Precio unitario incorrecto que no balancea: rechazo, aunque el total declarado coincida con la suma de renglones.
- Lectura corregida con fuente completa, SHA correcto, descripción/cantidad/unidad idénticas y aritmética balanceada: una candidata privada por HMAC, sin publicación ni WhatsApp.
- Cambios en cantidades, archivo alterado, números ambiguos, condiciones económicas no cubiertas, permiso revocado o ronda vencida: sin candidata publicable.
- Operación repetida idéntica: idempotencia; propuesta distinta para el mismo HMAC: conflicto, sin sobrescritura.
- PostgreSQL 17: ejecución en entorno sintético con transacción y ROLLBACK, incluido bloqueo a `anon` y `authenticated`.

## Limitación expresa

Esto crea la **pista de corrección auditable**, NO la promoción económica de esa candidata a oferta. Aún falta diseñar y validar un registro de versión aprobada que sea consumido por controles económicos independientes y por el seguimiento anónimo, sin romper las tablas inmutables actuales. También debe comprobarse si la segunda lectura del PDF real de Ailín efectivamente produce una interpretación diferente, completa y cubierta por el verificador. El SQL nuevo NO está en el piloto y la fuente real no fue leída por estas herramientas.

**Sin orden «Publicalo»: ninguna migración ni actualización del webhook/worker/cron en Supabase; no enviar mensajes ni pedir a Ailín reenvío.**
