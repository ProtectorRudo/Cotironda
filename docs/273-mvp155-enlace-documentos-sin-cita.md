# MVP155 — Asociación sin citar el mensaje original

03/11/2026 · Issue #513. Solo cotironda-piloto. Dos invitaciones abiertas por proveedor impiden que `reserve_media_mvp095` asigne el archivo, incluso si éste se recibió y archivó correctamente. El usuario no debe responder a un PDF específico ni repetir el presupuesto.

Una nueva función privada busca entre las solicitudes abiertas **realmente enviadas al mismo comercio** y coteja el nombre de todos los materiales del borrador con familias de catálogo curado, sin determinar precios, marca o ranking. Comprueba remitente autenticado, consentimiento de ambas partes, ciudad, archivo SHA en almacenamiento privado y fecha real de envío anterior a recepción. Exige **una coincidencia única**. Si no hay coincidencia o hay dos, devuelve estado privado y deja intacto el archivo.

Los renglones extras de pallet, flete, transporte, envase retornable y bolsón vacío no se utilizan para atribuir, pero **se preservan íntegros** para fidelidad del presupuesto y auditoría de importes posterior. Una referencia explícita de WhatsApp prevalece sobre el cotejo de materiales; si la cita es inválida, no se intenta inferir otra ronda. Ningún modelo ni RPC genera oferta comparable, revela contactos o envía WhatsApp por la atribución.

El webhook llama la función solamente tras un borrador guardado y antes de `record_supplier_media_mvp098`. Las recuperaciones futuras de archivos antiguos sin cita siguen pendientes de un mecanismo que conserve explícitamente ese contexto, sin inferirlo a posteriori.

Ensayos: SQL `BEGIN/ROLLBACK` con fuentes sintéticas, materiales del pedido actual vs anteriores, proveedor distinto, archivo incorrecto, duplicado, fuente ambigua y ACL; CI unitario y Deno. Aplicación únicamente en PILOTO tras prueba. No se toca producción; despliegue Whapi debe preservar 18 archivos y lector Office real. Rollback: restaurar Edge anterior y revocar/eliminar RPC, sin borrar ninguna fuente.
