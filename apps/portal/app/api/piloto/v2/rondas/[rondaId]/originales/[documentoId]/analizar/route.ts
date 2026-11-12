import {responderAnalisisAutomaticaV2}
 from '@/lib/piloto-v2-analisis-http';

// V2 preview ONLY, release-SHA gated, no cookies and no body.
// A buyer's authenticated browser triggers this automatically after listing.
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;
export async function POST(
 req:Request,context:{params:Promise<{rondaId:string;documentoId:string}>}
):Promise<Response>{
 const {rondaId,documentoId}=await context.params;
 return responderAnalisisAutomaticaV2(req,rondaId,documentoId);
}
