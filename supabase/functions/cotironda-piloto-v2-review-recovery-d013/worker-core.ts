/** D013: control de UNA operación privada, después del guard Vault MVP132.
 * No habilita nuevos envíos ni autenticación del navegador. Sólo check/execute.
 */
export const SQL_D013_APPROVED_COMMIT='2fdc9288c7a3d6f53f3f4281150197a7a4fc897b';
type Resultado=Readonly<{estado:string;requestId:string|null;outboundSent:false}>;
type Recover=(execute:boolean)=>Promise<Resultado>;
const body=(status:number,state:string)=>new Response(JSON.stringify({state}),{
 status,headers:{'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store','x-content-type-options':'nosniff'}
});
async function readBounded(req:Request):Promise<unknown>{
 const declared=req.headers.get('content-length');
 if(declared!==null&&(!/^[0-9]{1,3}$/u.test(declared)||Number(declared)>64))
  return null;
 if(!/^application\/json(?:;|$)/iu.test(req.headers.get('content-type')??''))
  return null;
 const reader=req.body?.getReader();
 if(!reader)return null;
 const parts:Uint8Array[]=[];let bytes=0;
 try{
  while(true){
   const part=await reader.read();
   if(part.done)break;
   bytes+=part.value.length;
   if(bytes>64){await reader.cancel();return null}
   parts.push(part.value);
  }
 }finally{reader.releaseLock()}
 const data=new Uint8Array(bytes);let offset=0;
 for(const chunk of parts){data.set(chunk,offset);offset+=chunk.length}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data))}
 catch{return null}
}
/** La autorización Vault de 96 hex + SQL debe haberse verificado antes de
 * esta función. La operación jamás recibe teléfono, HMAC ni texto del cliente.
 */
export async function ejecutarRecuperacionVaultD013(req:Request,args:{
 enabled:boolean;recover:Recover
}):Promise<Response>{
 if(req.method!=='POST')return body(405,'method_not_allowed');
 if(args.enabled!==true)return body(503,'recovery_disabled');
 const value=await readBounded(req);
 if(!value||typeof value!=='object'||Array.isArray(value)||
  Object.keys(value).length!==1||
  !Object.hasOwn(value,'action'))return body(400,'invalid_action');
 const action=(value as Record<string,unknown>).action;
 if(action!=='check'&&action!=='execute')return body(400,'invalid_action');
 if(action==='execute'&&
  req.headers.get('x-cotironda-d013-release')!==SQL_D013_APPROVED_COMMIT)
  return body(403,'release_not_authorized');
 try{
  const state=await args.recover(action==='execute');
  // El ID de ronda y los mensajes originales NO salen por la API del worker.
  if(state.outboundSent!==false)return body(503,'unexpected_dispatch');
  if(action==='check')return state.estado==='source_verified'
    ?body(200,'source_verified'):body(409,'source_not_verified');
  return state.estado==='staged_no_send'
   ?body(200,'draft_created_no_dispatch')
   :body(409,'recovery_requires_review');
 }catch{return body(503,'recovery_unavailable')}
}
