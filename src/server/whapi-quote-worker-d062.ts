/**
 * MVP-012. Server-only single-unit queue worker.
 * No background loop, no cron, no env vars, no direct Whapi, no IA provider.
 * A trusted scheduler may call runOnce/runBatch AFTER D062 is deployed.
 * SQL handles lock leases, ordering, idempotency, retry and dead-letter.
 * Producer is the D028 SQL inbox trigger; this worker only consumes its IDs.
 */
import type {DbRecepcionD059} from './whapi-quote-direct-postgres-d059.ts';

type ProcesamientoD061 = Readonly<{
 procesar:(channel:string,messageKey:string)=>Promise<
  | Readonly<{estado:'cotizacion_recibida';version:number;repetido:boolean;
    precios:number;datosNoInformados:number}>
  | Readonly<{estado:'sin_precio_atribuible'}>
  | Readonly<{estado:'no_disponible_o_no_habilitado'}>
 >;
}>;
const CLAIM='select cotironda_private.whapi_claim_quote_d062() as payload';
const FINISH='select cotironda_private.whapi_finish_quote_d062($1::text,$2::text,$3::uuid,$4::text) as payload';
const CHANNEL=/^[A-Za-z0-9_-]{4,64}$/u;
const HASH=/^[a-f0-9]{64}$/u;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
function deny():never{throw new Error('d062_worker_unavailable')}
function obj(v:unknown):v is Record<string,unknown>{
 return v!==null&&typeof v==='object'&&!Array.isArray(v);
}
function exact(v:unknown,keys:readonly string[]):v is Record<string,unknown>{
 return obj(v)&&Object.keys(v).length===keys.length&&
  Object.keys(v).every(k=>keys.includes(k));
}
function int(v:unknown,a:number,b:number):v is number{
 return typeof v==='number'&&Number.isSafeInteger(v)&&v>=a&&v<=b;
}
export function crearWorkerCotizacionesD062(db:DbRecepcionD059,handler:ProcesamientoD061){
 if(!db||typeof db.query!=='function'||
  !handler||typeof handler.procesar!=='function')deny();
 async function query(sql:string,params:readonly unknown[]):Promise<unknown>{
  try{
   const value=await db.query(sql,params);
   if(!obj(value)||!Array.isArray(value.rows)||value.rows.length!==1||
     !exact(value.rows[0],['payload']))deny();
   return value.rows[0].payload;
  }catch{deny()}
 }
 async function procesarUno(){
  const job=await query(CLAIM,[]);
  if(job===null)return Object.freeze({estado:'cola_vacia'} as const);
  if(!exact(job,['channel','messageKey','leaseToken','attempt'])||
   typeof job.channel!=='string'||!CHANNEL.test(job.channel)||
   typeof job.messageKey!=='string'||!HASH.test(job.messageKey)||
   typeof job.leaseToken!=='string'||!UUID.test(job.leaseToken)||
   !int(job.attempt,1,4))deny();
  // Do not use raw exceptions as a result code, DB logs or reply to supplier.
  let action:'received'|'no_price'|'not_eligible'|'retry'='retry';
  try{
   const result=await handler.procesar(job.channel,job.messageKey);
   if(result.estado==='cotizacion_recibida')action='received';
   else if(result.estado==='sin_precio_atribuible')action='no_price';
   else if(result.estado==='no_disponible_o_no_habilitado')action='not_eligible';
  }catch{
   action='retry';
  }
  // If the DB write committed but HTTP/connection failed, retry is safe:
  // D060 returns the original receipt on next attempt; no duplicate version.
  const ack=await query(FINISH,[job.channel,job.messageKey,job.leaseToken,action]);
  if(!exact(ack,['state','attempts'])||
    !['pending','done','manual_review','discarded','dead'].includes(String(ack.state))||
    !int(ack.attempts,1,4)||ack.attempts!==job.attempt)deny();
  return Object.freeze({
   estado:'procesado' as const,
   cola:ack.state as 'pending'|'done'|'manual_review'|'discarded'|'dead',
   intento:job.attempt as number
  });
 }
 async function procesarLote(max=8){
  if(!int(max,1,20))deny();
  const summary={tomados:0,registrados:0,revisionManual:0,descartados:0,
    pendientes:0,agotados:0};
  for(let i=0;i<max;i++){
   const result=await procesarUno();
   if(result.estado==='cola_vacia')break;
   summary.tomados++;
   switch(result.cola){
    case 'done':summary.registrados++;break;
    case 'manual_review':summary.revisionManual++;break;
    case 'discarded':summary.descartados++;break;
    case 'pending':summary.pendientes++;break;
    case 'dead':summary.agotados++;break;
   }
  }
  return Object.freeze(summary);
 }
 return Object.freeze({procesarUno,procesarLote});
}
