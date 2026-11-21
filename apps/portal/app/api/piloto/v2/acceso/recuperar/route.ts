import {solicitarAccesoPilotoSinSesionD016} from '@/lib/piloto-v2-d016-http';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;
// Un POST no autenticado no crea sesión ni accede a originales:
// solo pide un enlace nuevo al WhatsApp acreditado del ÚNICO comprador piloto.
export async function POST(req:Request):Promise<Response>{
 return solicitarAccesoPilotoSinSesionD016(req);
}
