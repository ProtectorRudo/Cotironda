import {revisarTerminosPiloto} from '@/lib/piloto-operador-terminos-http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;
// Bandeja minimizada; solo operador con JWT PILOTO AAL2 vigente.
export async function POST(req:Request):Promise<Response>{
 return revisarTerminosPiloto(req,'bandeja');
}
