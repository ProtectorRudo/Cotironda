import {responderDescargaOriginalPiloto} from '@/lib/piloto-originales-http';

// Attachment-only after the same PILOT Auth, consent and SHA checks.
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;
export async function GET(req:Request,context:{params:Promise<{
 rondaId:string;documentoId:string
}>}):Promise<Response>{
 const {rondaId,documentoId}=await context.params;
 return responderDescargaOriginalPiloto(req,rondaId,documentoId);
}
