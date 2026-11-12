import {responderListadoV2} from '@/lib/piloto-v2-respondedores-http';

// Candidato V2-03a. El feature flag + exact SHA preview son obligatorios.
// Nunca exponer el endpoint como una descarga de originales.
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;
export async function GET(
 req:Request,context:{params:Promise<{rondaId:string}>}
):Promise<Response>{
 const {rondaId}=await context.params;
 return responderListadoV2(req,rondaId);
}
