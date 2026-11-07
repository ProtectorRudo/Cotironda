/** Respuestas de aclaración explícitas: la identidad de la ronda NO se deduce
 * de estas palabras, sino del ID Whapi del pedido original citado y del RPC.
 */
export function respuestaCitaPedidoMvp239(raw:unknown):boolean{
 if(typeof raw!=='string'||raw.length<5||raw.length>80)return false;
 const text=raw.normalize('NFD').replace(/[\u0300-\u036f]/gu,'')
  .toLowerCase().trim().replace(/[.!]+$/u,'').trim();
 return /^(?:es (?:de |para )?(?:este|esta)(?: pedido| solicitud| cotizacion)?|de este pedido|corresponde a (?:este pedido|esta solicitud)|este pedido|esta solicitud)$/u.test(text);
}
/** El texto fijo no nombra clientes, precios ni materiales y requiere citar
 * el mensaje ORIGINAL de Cotironda, no contestar al recordatorio.
 */
export const CONSULTA_RONDA_MVP239=
 '¿A qué solicitud corresponde este presupuesto? Respondé citando el mensaje ORIGINAL del pedido de Cotironda (la solicitud que te enviamos). No hace falta reenviar el presupuesto.';
