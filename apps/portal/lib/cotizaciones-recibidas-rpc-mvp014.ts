/**
 * Authenticated SSR client only. D025/D060 SQL enforce current session and
 * actual buyer-org membership; do not send user IDs or a service-role key.
 */
export function puertoPreciosDeclaradosMvp014(client:{
 rpc(name:string,params:Record<string,unknown>):PromiseLike<{
  data:unknown;error:{code?:string;message?:string}|null
 }>
}){
 return Object.freeze({
  async leerOfertas(roundId:string):Promise<unknown>{
   const {data,error}=await client.rpc('buyer_quoted_prices_d060',{p_round:roundId});
   if(error||!Array.isArray(data))throw new Error('mvp014_rpc_no_disponible');
   return data;
  }
 });
}
