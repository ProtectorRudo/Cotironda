/**
 * MVP305: aviso empresarial claro y fijo en TODAS las invitaciones
 * a proveedores (webhook legacy, IA Central y recuperador programado).
 * Se agrega al PDF en el mismo mensaje; NO es un WhatsApp adicional.
 * No declara que exista adjudicación ni permite compartir teléfonos.
 */
export const AVISO_NOMBRE_AL_CIERRE_MVP305 =
 'Al finalizar el plazo y cerrarse la ronda, el comprador verá el nombre comercial de TODOS los proveedores invitados, aunque no hayan cotizado. Los teléfonos de WhatsApp solo se comparten con autorización específica de cada proveedor.';

export const CAPTION_PEDIDO_COTIRONDA_MVP305 =
 'Cotironda · Nueva solicitud de cotización.\n\n'+
 AVISO_NOMBRE_AL_CIERRE_MVP305;

// PDF footer is deliberately short and printable at 8pt in WinAnsi.
// The WhatsApp caption above explains the full policy without a new message.
export const PIE_PDF_PROVEEDORES_MVP305 =
 'Al cierre, el comprador verá el nombre comercial de todos los invitados.';
