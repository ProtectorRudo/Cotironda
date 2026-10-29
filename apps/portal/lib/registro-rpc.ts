import type { AltaEmpresaPort } from '../../../src/domain/onboarding.ts';

/** La RPC valida un JWT auténtico y aplica una cuota transaccional por actor.
 * No se expone user_id ni se usan claves de servicio desde el navegador.
 * Los estados son públicos, acotados y NO contienen detalles SQL. */
export function puertoRegistroRpc(cliente:{
 rpc(nombre:string,params:Record<string,unknown>):PromiseLike<{
  data:unknown; error:{code?:string;message?:string}|null; status?:number;
 }>
}): AltaEmpresaPort {
 return {
  async crearEmpresaConPropietario(input) {
   const {data,error,status}=await cliente.rpc('register_company_for_current_user',{
     p_request_id:input.idempotencyKey,
     p_name:input.nombre,
     p_type:input.tipo,
     p_trade_name:input.nombreComercial
   });
   // El HTTP status vive en PostgrestResponse; NO en PostgrestError.
   // Un 429 puede tener error sin código o un cuerpo que no nombre la cuota.
   if(status===429) throw new Error('limite_intentos');
   if(error) {
     // No inferir privilegios ni causas de mensajes remotos no confiables.
     throw new Error('registro_rpc_no_disponible');
   }
   if(!Array.isArray(data)||data.length!==1)throw new Error('respuesta_rpc_invalida');
   const row=data[0] as {organization_id?:unknown;replay?:unknown;registration_status?:unknown}|null;
   if(!row || typeof row.registration_status!=='string')
     throw new Error('respuesta_rpc_invalida');
   switch(row.registration_status){
     case 'ok':
       if(typeof row.organization_id!=='string'||typeof row.replay!=='boolean')
         throw new Error('respuesta_rpc_invalida');
       return {organizationId:row.organization_id,replay:row.replay};
     case 'rate_limited': throw new Error('limite_intentos');
     case 'organization_quota': throw new Error('limite_registros');
     case 'idempotency_conflict': throw new Error('request_id_conflictivo');
     case 'invalid_request': throw new Error('solicitud_invalida');
     default: throw new Error('registro_rpc_no_disponible');
   }
  }
 };
}
