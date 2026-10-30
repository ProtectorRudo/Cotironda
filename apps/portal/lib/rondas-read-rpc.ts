/**
 * Adaptador RPC de solo lectura. No utiliza llaves secretas ni cliente administrador.
 * La función SQL en PostgreSQL valida sesión vigente + membresía actual.
 */
export function puertoRondasSoloLectura(cliente:{
  rpc(nombre:string,params:Record<string,unknown>):PromiseLike<{
    data:unknown;error:{code?:string;message?:string}|null;
  }>;
}){
  return {
    async leerPropia(roundId:string):Promise<unknown>{
      const {data,error}=await cliente.rpc('buyer_round_overview_v1',{p_round_id:roundId});
      if(error)throw new Error('ronda_rpc_no_disponible');
      if(!Array.isArray(data)||data.length>1)throw new Error('ronda_rpc_respuesta_invalida');
      return data.length===0?null:data[0];
    }
  };
}
