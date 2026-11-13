import {responderDiagnosticoSmsV2}
 from '../../../../../../../src/server/v2-20-diagnostico-sms-http.ts';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;

/** SOLO GET público de ajustes Auth, nunca SMS real ni credenciales. 
 * Requiere SSO habilitado para ALL en el proyecto Vercel.
 * Restringido por configuración/SHA al entorno PREVIEW del PILOTO.
 */
export async function GET(req:Request):Promise<Response>{
 return responderDiagnosticoSmsV2(req,process.env);
}
