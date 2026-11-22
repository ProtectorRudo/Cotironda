import {consultarPerfilComercialWhatsappD022} from '@/lib/piloto-v2-d016-http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;
export async function GET(
 req:Request,context:{params:Promise<{rondaId:string;documentoId:string}>}
):Promise<Response>{
 const {rondaId,documentoId}=await context.params;
 return consultarPerfilComercialWhatsappD022(req,rondaId,documentoId);
}
