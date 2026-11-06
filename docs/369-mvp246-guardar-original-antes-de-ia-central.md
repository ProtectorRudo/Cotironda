# Decisión 369 — La fuente documental debe superar el publicador privado antes de IA Central

**Fecha:** 06/11/2026. **Etapa:** 3, refuerzo MVP246 sobre MVP245.
**Entorno:** desarrollo, no instalado en el piloto.

## Hallazgo de auditoría

El primer puente MVP245 comprobaba SHA binario, la lectura determinista
MVP106 y la asociación de una invitación. Pero el circuitro documental
existente tiene un **control adicional independiente**:
`cotironda_piloto_publish_source_text_mvp107` solo guarda un original
anónimo cuando coinciden:

- Fuente original SHA y cada renglón PDF/Office/TXT;
- dos lecturas que coinciden;
- importes **balanceados**;
- participante comprador y proveedor autorizados, invitación abierta
  y consentimiento vigente;
- privacidad de contenidos, descripción/cantidad/cargo, sin identidades
  ni enlaces;
- propuesta sin campos pendientes o ilegibles.

La mera respuesta `source_text_covered` **no alcanza** para presentar
el documento al comprador. Dos lecturas podían haber divergido o
el documento podía no superar la política de privacidad.

## Cambio

1. El webhook solamente llama al nuevo lector IA Central después de
   recibir `published_anonymous` o `already_published` del
   publicador antiguo, sin errores. Cualquier otra respuesta conserva
   el archivo en revisión.
2. El RPC de reserva MIME/empresa/ronda ahora exige un registro
   persistido de `anonymous_supplier_docs_mvp107` para EXACTAMENTE
   el mismo HMAC, request, proveedor y SHA, y además las filas de
   `supplier_reading_checks_mvp102` y
   `supplier_amount_checks_mvp103` en estado correcto.
3. Verifica en el momento de reserva que el comprador no haya revocado
   consentimiento. El finalizador también exige el registro anónimo
   vigente para la rama documental, preservando sin cambios el
   comportamiento existente para texto.
4. Notas con IVA/flete/pago en varias líneas se conservan completas
   y se cotejan por la semántica comercial, sin un formato rígido.
5. Archivo foto o escaneo sin comprobación independiente permanece en
   revisión, sin crear precio verificado por similitud GPT.

## Tests de aceptación

PG17 aislado y ROLLBACK sobre el circuito de dos proveedores:
- fuente cubierta sin publicación anónima ⇒ bloqueo;
- doble lectura disconforme ⇒ bloqueo;
- diferencia de importes ⇒ bloqueo;
- consentimiento del comprador revocado ⇒ bloqueo;
- MIME de imagen, SHA/hilo/empresa ajenos ⇒ bloqueo;
- eliminación de la publicación entre reserva y cierre ⇒ bloqueo;
- fuente publicada íntegra, misma ronda ⇒ reserva y resumen anónimo;
- text quote MVP227 mantiene resultado antiguo;
- roles `anon`/`authenticated` sin EXECUTE en reserva.

Node/Deno: lectura comercial multi-formato, notas multilínea,
duplicados, integridad de fuente, ausencia de WhatsApp.

La migración MVP245 se modifica **antes de instalarla por primera vez**;
la revisión real del piloto confirmó que aún no existe el RPC y que
los gates IA están apagados. No se ha modificado producción.
