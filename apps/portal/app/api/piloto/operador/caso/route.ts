import {operarPiloto} from '@/lib/piloto-operador-http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;
// JWT of a provisioned AAL2 operator, plus SQL live-session verification.
export async function POST(req:Request):Promise<Response>{
 return operarPiloto(req,'case');
}
