import {operarPiloto} from '@/lib/piloto-operador-http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;
// Unknown costs stay unknown after an authorized review.
export async function POST(req:Request):Promise<Response>{
 return operarPiloto(req,'review');
}
