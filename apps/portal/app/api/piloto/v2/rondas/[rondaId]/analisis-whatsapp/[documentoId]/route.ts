import {analizarOriginalWhatsAppPortalD016}
 from '@/lib/piloto-v2-d016-http';

// Sin botón del arquitecto: el cliente solicita análisis cuando abre el pedido.
// Cookie HttpOnly + Origin + Sec-Fetch-Site, SQL lease y consentimiento.
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;
export async function POST(
 req:Request,context:{params:Promise<{rondaId:string;documentoId:string}>}
):Promise<Response>{
 const {rondaId,documentoId}=await context.params;
 return analizarOriginalWhatsAppPortalD016(req,rondaId,documentoId);
}
