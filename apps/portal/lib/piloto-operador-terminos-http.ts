import {bearerPiloto} from '../../../src/server/originales-piloto-http-runtime.ts';
import {revisionMfaHTTPHabilitada,responderRevisionMfaOperadorP0}
 from '../../../src/server/whapi-terms-mfa-http-p0.ts';
import {puertosOperadorSupabasePiloto} from './piloto-operador-cliente.ts';

type Action='bandeja'|'preparar'|'decidir';
/** Existing M267 auth adapter: no service_role, no passwords in server logs. */
export async function revisarTerminosPiloto(
 req:Request,action:Action
):Promise<Response>{
 if(!revisionMfaHTTPHabilitada(process.env))
  return responderRevisionMfaOperadorP0(req,action,process.env);
 const jwt=bearerPiloto(req);
 if(!jwt)return responderRevisionMfaOperadorP0(req,action,process.env);
 try{
  const port=puertosOperadorSupabasePiloto(jwt);
  return await responderRevisionMfaOperadorP0(req,action,process.env,{
   getUser:port.getUser,
   authenticatedRpc:async(name,args)=>{
    const {data,error}=await port.rpc(name,{...args});
    if(error||!data)throw Error('p0_terms_rpc_unavailable');
    return data;
   }
  });
 }catch{
  return new Response(JSON.stringify({state:'revision_no_disponible'}),{
   status:503,headers:{
    'content-type':'application/json; charset=utf-8',
    'cache-control':'private, no-store',
    'referrer-policy':'no-referrer','x-frame-options':'DENY',
    'x-content-type-options':'nosniff'
   }
  });
 }
}
