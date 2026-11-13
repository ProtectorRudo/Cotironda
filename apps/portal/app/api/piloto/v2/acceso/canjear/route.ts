import {canjearAccesoPortalD016} from '@/lib/piloto-v2-d016-http';

// Canje D016: GET/previsualización nunca consume tickets.
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;
export async function POST(req:Request):Promise<Response>{
 return canjearAccesoPortalD016(req);
}
