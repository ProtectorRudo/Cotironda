import {responderDescargaV2} from '@/lib/piloto-v2-descarga-http';

// Descarga V2 solo buyer Auth, preview y SHA release. Sin URL firmada.
// El guard siempre revalida el origen y registra auditoria ANTES de bytes.
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;
export async function GET(
 req:Request,
 context:{params:Promise<{rondaId:string;documentoId:string}>}
):Promise<Response>{
 const {rondaId,documentoId}=await context.params;
 return responderDescargaV2(req,rondaId,documentoId);
}
