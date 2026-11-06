import {bearerPiloto} from '../../../src/server/originales-piloto-http-runtime.ts';
import {operadorPilotoHabilitado,responderOperadorPiloto}
 from '../../../src/server/operador-piloto-http-mvp267.ts';
import {puertosOperadorSupabasePiloto} from './piloto-operador-cliente.ts';
type Action='queue'|'usage'|'case'|'review';
export async function operarPiloto(req:Request,action:Action):Promise<Response>{
 if(!operadorPilotoHabilitado(process.env))
  return responderOperadorPiloto(req,action,process.env);
 const jwt=bearerPiloto(req);
 if(!jwt)return responderOperadorPiloto(req,action,process.env);
 try{
  return await responderOperadorPiloto(req,action,process.env,
   puertosOperadorSupabasePiloto(jwt));
 }catch{
  return new Response(JSON.stringify({state:'operador_no_disponible'}),{
   status:503,headers:{'content-type':'application/json',
    'cache-control':'private, no-store','x-content-type-options':'nosniff'}
  });
 }
}
