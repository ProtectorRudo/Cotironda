import {responderInformeFinalWhatsappD016}
 from '@/lib/piloto-v2-d016-http';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;
// Sin parámetros de comprador ni autenticación de SMS: cookie privada RLS.
export async function GET(
 req:Request,context:{params:Promise<{rondaId:string}>}
):Promise<Response>{
 const {rondaId}=await context.params;
 return responderInformeFinalWhatsappD016(req,rondaId);
}
