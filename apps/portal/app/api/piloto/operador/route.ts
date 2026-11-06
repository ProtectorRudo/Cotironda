import {operarPiloto} from '@/lib/piloto-operador-http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;
// Read-only sanitized alerts; no operator or participant identifiers.
export async function GET(req:Request):Promise<Response>{
 return operarPiloto(req,'queue');
}
