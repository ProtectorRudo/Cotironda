import {revisarTerminosPiloto} from '@/lib/piloto-operador-terminos-http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;
// Solo JWT de operador PILOTO AAL2, verificado otra vez por SQL M267.
export async function POST(req:Request):Promise<Response>{
 return revisarTerminosPiloto(req,'preparar');
}
