/**
 * MVP295 — One-shot economic interpretation for a TEXT already uniquely
 * bound by MVP291/292, but missed MVP227's 10-minute real-time window.
 *
 * Source, round and recipient identity are chosen by PostgreSQL only. The
 * original is decrypted by MVP227, checked against SHA, read twice, and
 * economically qualified through deterministic rules. Nothing is sent over
 * Whapi and a private failed claim is NEVER automatically billed twice.
 */
import {
 procesarPresupuestoCentralMvp227,
 type EstadoProveedorMvp227
} from './ai-central-supplier-mvp227.ts';
type Modelo='gpt-6-luna'|'gpt-6.1-sol';
type Rpc=(name:string,args:Record<string,unknown>)=>
 Promise<{data:unknown;error:unknown}>;
type Decrypt=(nonce:string,ciphertext:string,aad:string)=>Promise<string>;
const HASH=/^[a-f0-9]{64}$/u;
const object=(v:unknown):v is Record<string,unknown>=>
 v!==null&&typeof v==='object'&&!Array.isArray(v);
export type ResultadoReprocesoMvp295=Readonly<{
 state:'disabled'|'empty'|'verified_private'|'review_private'|
  'uncertain_private'|'reconciliation_required';
 processed:0|1;
 outboundMessages:0;
}>;
const done=(state:ResultadoReprocesoMvp295['state'],processed:0|1):ResultadoReprocesoMvp295=>
 Object.freeze({state,processed,outboundMessages:0});
export async function procesarTextoVinculadoMvp295(args:{
 enabled:boolean;trustedInternalWorker:boolean;
 apiKey:string;model:Modelo;
 rpc:Rpc;decrypt:Decrypt;shaText:(text:string)=>Promise<string>;
 analyze?:typeof procesarPresupuestoCentralMvp227;
}):Promise<ResultadoReprocesoMvp295>{
 if(!args?.enabled)return done('disabled',0);
 if(!args.trustedInternalWorker||typeof args.rpc!=='function'||
    typeof args.decrypt!=='function'||typeof args.shaText!=='function'||
    typeof args.apiKey!=='string'||args.apiKey.length<18)
  return done('disabled',0);
 const db=async(name:string,params:Record<string,unknown>={})=>{
  const out=await args.rpc(name,params);
  if(out.error||!object(out.data)||typeof out.data.state!=='string')
   throw Error('private_rpc_unavailable');
  return out.data;
 };
 let claim:Record<string,unknown>;
 try{claim=await db('cotironda_piloto_claim_linked_text_mvp295')}
 catch{return done('reconciliation_required',0)}
 if(claim.state!=='claimed')
  return done(claim.state==='empty'?'empty':'disabled',0);
 const id=claim.message_hmac,chat=claim.chat_hmac;
 if(typeof id!=='string'||typeof chat!=='string'||
    !HASH.test(id)||!HASH.test(chat))
  return done('reconciliation_required',1);
 let status:EstadoProveedorMvp227|null=null;
 try{
  status=await (args.analyze??procesarPresupuestoCentralMvp227)({
   habilitado:true,webhookAutenticado:true,
   messageHmac:id,chatHmac:chat,
   apiKey:args.apiKey,model:args.model,rpc:args.rpc,
   decrypt:(nonce,ciphertext)=>args.decrypt(nonce,ciphertext,chat+'|'+id+'|text'),
   shaText:args.shaText,
   // Always meter the two commercial LLM calls; an UNKNOWN usage record
   // blocks fresh billable calls via MVP264. Also record source revisions.
   usageTraceEnabled:true,
   quoteVersioningEnabled:true,
   commercialMemoryEnabled:false
  });
 }catch{/* The source is not re-run after an uncertain model call. */}
 const state=status?.estado==='verificado_privado'?'processed':
  status?.estado==='requiere_revision'?'review':'uncertain';
 const reason=state==='processed'?'commercial_verified':
  state==='review'?'commercial_needs_review':'commercial_uncertain';
 try{
  const stored=await db('cotironda_piloto_finish_linked_text_mvp295',{
   p_message_hmac:id,p_state:state,p_reason_code:reason
  });
  if(stored.state!=='recorded')
   return done('reconciliation_required',1);
 }catch{return done('reconciliation_required',1)}
 return done(state==='processed'?'verified_private':
  state==='review'?'review_private':'uncertain_private',1);
}
