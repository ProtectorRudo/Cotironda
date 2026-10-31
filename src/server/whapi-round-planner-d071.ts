/**
 * MVP-023 / D071: private server-side round planner.
 * Calls one committed PostgreSQL transaction: D065 matching + D070 queue.
 * Does NOT send WhatsApp, open round or connect to external services.
 * The injected committedRpc MUST use the dedicated NOLOGIN gateway,
 * never a buyer Supabase client, browser API or a service role JWT.
 */
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const CHANNEL=/^[A-Za-z0-9_-]{4,64}$/u;
const SQL='select cotironda_private.whapi_prepare_commercial_round_d071($1::uuid,$2::text) as payload';
const EXPECTED=['state','matchedSuppliers','prepared','alreadyPrepared',
 'pendingContact','pendingScope','messagesSent'];
const STATE=new Set(['queued_without_sending','needs_verified_location',
 'needs_catalog_mapping','no_eligible_suppliers']);
function object(v:unknown):v is Record<string,unknown>{
 return v!==null&&typeof v==='object'&&!Array.isArray(v);
}
function keys(v:unknown,wanted:readonly string[]):v is Record<string,unknown>{
 return object(v)&&Object.keys(v).length===wanted.length&&
  Object.keys(v).every(k=>wanted.includes(k));
}
function fail():never{throw new Error('d071_plan_unavailable')}
export function crearPlanificadorRondaD071(config:Readonly<{
 habilitado:boolean;
 channel:string;
 committedRpc:(sql:string,args:readonly unknown[])=>
  Promise<unknown>;
}>){
 if(!config||typeof config.habilitado!=='boolean'||
  typeof config.channel!=='string'||!CHANNEL.test(config.channel)||
  typeof config.committedRpc!=='function')fail();
 async function planificar(request:Readonly<{roundId:string}>){
  if(!keys(request,['roundId'])||
   typeof request.roundId!=='string'||!UUID.test(request.roundId))fail();
  if(config.habilitado!==true)return Object.freeze({estado:'desactivado' as const,
   mensajesEnviados:0 as const});
  let res:unknown;
  try{
   res=await config.committedRpc(SQL,[request.roundId,config.channel]);
  }catch{fail()}
  if(!keys(res,['payload'])||!keys(res.payload,EXPECTED))fail();
  const p=res.payload;
  if(typeof p.state!=='string'||!STATE.has(p.state)||
   !EXPECTED.slice(1).every(k=>Number.isSafeInteger(p[k])&&
    (p[k] as number)>=0)||
   p.messagesSent!==0||p.matchedSuppliers>10||
   p.prepared+p.alreadyPrepared+p.pendingContact+p.pendingScope
    !==p.matchedSuppliers||
   (p.state!=='queued_without_sending'&&p.matchedSuppliers!==0))fail();
  return Object.freeze({
   estado:p.state,
   proveedoresSeleccionados:p.matchedSuppliers as number,
   nuevasInvitaciones:p.prepared as number,
   invitacionesExistentes:p.alreadyPrepared as number,
   proveedoresPendientesContacto:p.pendingContact as number,
   proveedoresPendientesAlcance:p.pendingScope as number,
   mensajesEnviados:0 as const
  });
 }
 return Object.freeze({planificar});
}
