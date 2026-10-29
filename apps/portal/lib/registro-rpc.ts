import type { AltaEmpresaPort } from '../../../src/domain/onboarding.ts';

/** Solo se usa con el cliente SSR del usuario autenticado.
 * La función SQL deriva su user_id del JWT firmado por Supabase/PostgREST. */
export function puertoRegistroRpc(cliente:{
 rpc(nombre:string,params:Record<string,unknown>):PromiseLike<{
  data:unknown; error:{code?:string;message?:string}|null;
 }>
}): AltaEmpresaPort {
 return {
  async crearEmpresaConPropietario(input) {
   const {data,error}=await cliente.rpc('register_company_for_current_user',{
     p_request_id:input.idempotencyKey,
     p_name:input.nombre,
     p_type:input.tipo,
     p_trade_name:input.nombreComercial
   });
   if(error){
     if(error.code==='23505')throw new Error('request_id_conflictivo');
     if(error.message==='limite_registros' || error.code==='P0001')
       throw new Error('limite_registros');
     throw new Error('registro_rpc_no_disponible');
   }
   if(!Array.isArray(data)||data.length!==1)throw new Error('respuesta_rpc_invalida');
   const row=data[0];
   if(!row || typeof row.organization_id!=='string' ||
     typeof row.replay!=='boolean')throw new Error('respuesta_rpc_invalida');
   return {organizationId:row.organization_id,replay:row.replay};
  }
 };
}
