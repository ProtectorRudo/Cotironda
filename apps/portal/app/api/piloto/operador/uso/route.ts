import {operarPiloto} from '@/lib/piloto-operador-http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;
// Read-only aggregate usage. No prices or per-user data.
export async function GET(req:Request):Promise<Response>{
 return operarPiloto(req,'usage');
}
