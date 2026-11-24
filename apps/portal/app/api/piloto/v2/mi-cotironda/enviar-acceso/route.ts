import {enviarNuevoAccesoWhatsappD016} from '@/lib/piloto-v2-d016-http';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;
/** POST desde el mismo navegador con sesión privada. No acepta destinatarios. */
export async function POST(req:Request):Promise<Response>{
 return enviarNuevoAccesoWhatsappD016(req);
}
