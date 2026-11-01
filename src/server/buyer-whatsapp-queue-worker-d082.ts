/**
 * MVP-047: one worker tick for the ENCRYPTED buyer inbox D074 -> D077/D081.
 * SQL D082 does trigger queue/claim/finish; this module sends NOTHING.
 * No implicit database connection, no timers, no global fetch or Whapi.
 */
import type {ResultadoCompradorD073} from './buyer-whatsapp-ingress-d073.ts';
type Db=Readonly<{query:(sql:string,params:readonly unknown[])=>
 Promise<Readonly<{rows:readonly Record<string,unknown>[]}>>}>;
type Handler=Readonly<{procesar:(messageKey:string)=>Promise<ResultadoCompradorD073>}>;
const CLAIM='select cotironda_private.whapi_claim_buyer_d082($1::text) as payload';
const FINISH='select cotironda_private.whapi_finish_buyer_d082($1::text,$2::text,$3::uuid,$4::text) as payload';
const CH=/^[A-Za-z0-9_-]{4,64}$/u;
const SHA=/^[a-f0-9]{64}$/u;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const STATES=new Set(['pending','done','manual_review','discarded','dead']);
function denied():never{throw Error('d082_buyer_queue_unavailable')}
function obj(v:unknown):v is Record<string,unknown>{
 return v!==null&&typeof v==='object'&&!Array.isArray(v);
}
function exact(v:unknown,keys:readonly string[]):v is Record<string,unknown>{
 return obj(v)&&Object.keys(v).length===keys.length&&
  Object.keys(v).every(k=>keys.includes(k));
}
export function crearWorkerPedidosWhatsappD082(cfg:Readonly<{
 habilitado:boolean;channel:string;db:Db;handler:Handler;
}>){
 if(!cfg||typeof cfg.habilitado!=='boolean'||!CH.test(cfg.channel)||
  !cfg.db||typeof cfg.db.query!=='function'||!cfg.handler||
  typeof cfg.handler.procesar!=='function')denied();
 async function rpc(sql:string,params:readonly unknown[]){
  let raw:unknown;
  try{
   const result=await cfg.db.query(sql,params);
   if(!obj(result)||!Array.isArray(result.rows)||
    result.rows.length!==1||!exact(result.rows[0],['payload']))denied();
   raw=result.rows[0].payload;
  }catch{denied()}
  return raw;
 }
 async function procesarUno(){
  // No leases, SELECT or queries when the pilot is OFF.
  if(!cfg.habilitado)return Object.freeze({estado:'desactivado' as const});
  const claim=await rpc(CLAIM,[cfg.channel]);
  if(claim===null)return Object.freeze({estado:'cola_vacia' as const});
  if(!exact(claim,['channel','messageKey','leaseToken','attempt'])||
   claim.channel!==cfg.channel||typeof claim.messageKey!=='string'||
   !SHA.test(claim.messageKey)||typeof claim.leaseToken!=='string'||
   !UUID.test(claim.leaseToken)||typeof claim.attempt!=='number'||
   !Number.isSafeInteger(claim.attempt)||claim.attempt<1||claim.attempt>4)
   denied();
  let action:'zone_queued'|'round_saved'|'requires_review'|'no_auth'|'retry'='retry';
  try{
   const result=await cfg.handler.procesar(claim.messageKey);
   if(!obj(result)||result.mensajesWhatsappEnviados!==0)denied();
   switch(result.estado){
    case 'zona_solicitada_en_cola':action='zone_queued';break;
    case 'ronda_registrada_consultas_en_cola':
    case 'ronda_registrada_sin_consultas':action='round_saved';break;
    case 'sin_entrada_verificada':
    case 'consentimiento_contacto_pendiente':action='no_auth';break;
    case 'esperando_extraccion_segura':
    case 'requiere_revision_interna':action='requires_review';break;
    case 'ronda_registrada_preparacion_pendiente':
    case 'desactivado':action='retry';break;
    default:action='retry';
   }
  }catch{action='retry'}
  // COMMITTED finish; if confirmation is lost, DB lease prevents a second
  // destructive effect. D077/D081/D071 are each idempotent on replay.
  const ack=await rpc(FINISH,[
   cfg.channel,claim.messageKey,claim.leaseToken,action
  ]);
  if(!exact(ack,['state','attempts'])||!STATES.has(String(ack.state))||
   typeof ack.attempts!=='number'||ack.attempts!==claim.attempt)
   denied();
  return Object.freeze({estado:'procesado' as const,
   cola:ack.state as 'pending'|'done'|'manual_review'|'discarded'|'dead',
   intento:claim.attempt});
 }
 async function procesarLote(max=8){
  if(!Number.isSafeInteger(max)||max<1||max>20)denied();
  const totals={procesados:0,finalizados:0,enRevision:0,descartados:0,
   pendientes:0,agotados:0};
  if(!cfg.habilitado)return Object.freeze(totals);
  for(let i=0;i<max;i++){
   const item=await procesarUno();
   if(item.estado==='cola_vacia')break;
   if(item.estado!=='procesado')break;
   totals.procesados++;
   if(item.cola==='done')totals.finalizados++;
   else if(item.cola==='manual_review')totals.enRevision++;
   else if(item.cola==='discarded')totals.descartados++;
   else if(item.cola==='pending')totals.pendientes++;
   else if(item.cola==='dead')totals.agotados++;
  }
  return Object.freeze(totals);
 }
 return Object.freeze({procesarUno,procesarLote});
}
