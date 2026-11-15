import {listarPorWhatsappD016} from '@/lib/piloto-v2-d016-http';

// Catálogo solo de respondedores bajo cookie D016, sin JWT de SMS.
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;
export async function GET(
 req:Request,context:{params:Promise<{rondaId:string}>}
):Promise<Response>{
 const {rondaId}=await context.params;
 return listarPorWhatsappD016(req,rondaId);
}
