import {responderCatalogoOriginalesPiloto} from '@/lib/piloto-originales-http';

// Pilot originals are disabled at runtime unless the exact SHA and environment
// have been explicitly authorised. No route uses DEV Auth or WhatsApp tokens.
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;
export async function GET(req:Request,context:{params:Promise<{rondaId:string}>}):Promise<Response>{
 const {rondaId}=await context.params;
 return responderCatalogoOriginalesPiloto(req,rondaId);
}
