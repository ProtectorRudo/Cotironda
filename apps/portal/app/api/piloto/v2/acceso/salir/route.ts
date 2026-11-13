import {cerrarSesionPortalD016} from '@/lib/piloto-v2-d016-http';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;
export async function POST(req:Request):Promise<Response>{
 return cerrarSesionPortalD016(req);
}
