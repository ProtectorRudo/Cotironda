import {listarHistorialWhatsappD017} from '@/lib/piloto-v2-d016-http';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;
/** El historial requiere la cookie HttpOnly emitida por WhatsApp D016. */
export async function GET(req:Request):Promise<Response>{
 return listarHistorialWhatsappD017(req);
}
