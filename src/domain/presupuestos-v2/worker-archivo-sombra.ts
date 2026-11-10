/**
 * Cotironda Presupuestos V2 B2 — one authorized shadow read of a historical
 * original archived in PRIVATE Supabase Storage. NO WhatsApp or publication.
 *
 * Service role RPC claims with old review, sender permission and delivery
 * evidence; storage download & SHA are verified a second time here.
 * The V2 model can only write an UNVERIFIED private candidate, never offers.
 */
import {
 leerPresupuestoSombraV2,type ShadowReadResultV2
} from './lector-sombra.ts';

type Rpc=(name:string,args:Record<string,unknown>)=>
 Promise<{data:unknown;error:unknown}>;
type Storage={from:(bucket:string)=>{download:(path:string)=>
 Promise<{data:Blob|null;error:unknown}>}};
type Read=(args:Parameters<typeof leerPresupuestoSombraV2>[0])=>
 Promise<ShadowReadResultV2>;
type Model='gpt-6-luna'|'gpt-6.1-sol';
export type ShadowWorkerOutcomeV2=Readonly<{
 state:'disabled'|'empty'|'candidate_private'|
  'review_required'|'reconciliation_required';
 reason:string;processed:0|1;outboundMessages:0;publishedOffers:0;
}>;
const HEX=/^[a-f0-9]{64}$/u;
const MIME=new Set([
 'application/pdf','image/jpeg','image/png','image/webp',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 'text/plain','text/csv'
]);
const o=(v:unknown):v is Record<string,unknown>=>v!==null&&
 typeof v==='object'&&!Array.isArray(v);
const done=(state:ShadowWorkerOutcomeV2['state'],reason:string,
 processed:0|1):ShadowWorkerOutcomeV2=>
 Object.freeze({state,reason,processed,outboundMessages:0,publishedOffers:0});
const digest=async(bytes:Uint8Array):Promise<string>=>{
 const out=new Uint8Array(await crypto.subtle.digest('SHA-256',
  Uint8Array.from(bytes).buffer));
 return Array.from(out,n=>n.toString(16).padStart(2,'0')).join('');
};
async function checkedRpc(rpc:Rpc,name:string,args:Record<string,unknown>={}):
 Promise<Record<string,unknown>>{
 const result=await rpc(name,args);
 if(result.error||!o(result.data)||typeof result.data.state!=='string')
  throw Error('db_outcome_uncertain');
 return result.data;
}

/** May be called by a future authenticated Edge handler only.
 * Do not attach it to existing scheduled cron until reviewed separately.
 * A result of candidate_private is NOT a quotation or model correctness.
 */
export async function procesarSombraArchivadaV2(args:{
 enabled:boolean;trustedInternalWorker:boolean;rpc:Rpc;storage:Storage;
 apiKey:string;model:Model;read?:Read;
}):Promise<ShadowWorkerOutcomeV2>{
 if(!args?.enabled)return done('disabled','flag_off',0);
 if(!args.trustedInternalWorker||typeof args.rpc!=='function'||
    !args.storage||typeof args.storage.from!=='function'||
    typeof args.apiKey!=='string'||args.apiKey.length<18)
  return done('disabled','invalid_worker',0);

 let claim:Record<string,unknown>;
 try{claim=await checkedRpc(args.rpc,'cotironda_piloto_claim_v2_shadow_b2')}
 catch{return done('reconciliation_required','claim_uncertain',0)}
 if(claim.state==='empty')return done('empty','queue_empty',0);
 if(claim.state==='disabled')return done('disabled','shadow_disabled',0);
 if(claim.state==='quota')return done('disabled','shadow_quota',0);
 if(claim.state!=='claimed')return done('reconciliation_required','claim_not_ready',0);

 const source=String(claim.source_hmac??'');
 const sha=String(claim.source_sha256??'');
 const mime=String(claim.mime??'');
 const size=claim.size_bytes;
 // Invalid claim must NEVER use arbitrary storage paths or call the model.
 if(!HEX.test(source)||!HEX.test(sha)||!MIME.has(mime)||
    !Number.isSafeInteger(size)||(size as number)<8||
    (size as number)>8388608||
    claim.processor_version!=='v2_b2_20261110')
  return done('reconciliation_required','claim_metadata_invalid',1);

 let state:'candidate_private'|'review'|'uncertain'='uncertain';
 let reason='shadow_source_unavailable';
 let candidate:Record<string,unknown>|null=null;
 let diagnostics:unknown=null;
 let completeness:string|null=null;
 let userState:ShadowWorkerOutcomeV2['state']='reconciliation_required';
 try{
  const download=await args.storage.from('cotironda-piloto-originals')
   .download('media/'+source);
  if(download.error||!(download.data instanceof Blob)||
    download.data.size!==size)throw Error('storage_unavailable');
  const bytes=new Uint8Array(await download.data.arrayBuffer());
  if(bytes.length!==size||await digest(bytes)!==sha){
   state='review';reason='shadow_sha_mismatch';
   userState='review_required';
  }else{
   const response=await (args.read??leerPresupuestoSombraV2)({
    enabled:true,trustedInternalWorker:true,bytes,
    mime,sha256:sha,apiKey:args.apiKey,model:args.model
   });
   if(!o(response)||response.can_publish!==false||
     response.can_rank!==false||response.outbound_messages!==0||
     response.always_private!==true||
     response.source_sha256!==sha||
     !['review_required','private_extraction_unverified'].includes(response.state))
    throw Error('reader_contract_unknown');
   if(response.state==='private_extraction_unverified'&&
       response.document&&Array.isArray(response.line_diagnostics)&&
       ['candidate_only','incomplete_source',
        'spreadsheet_requires_cell_audit'].includes(response.code)){
    state='candidate_private';reason=
     response.code==='candidate_only'?'shadow_candidate_unverified':
     response.code==='incomplete_source'?'shadow_source_incomplete':
      'shadow_spreadsheet_requires_audit';
    candidate=response.document as unknown as Record<string,unknown>;
    diagnostics=response.line_diagnostics;
    completeness=response.completeness;
    userState='candidate_private';
   }else{
    state='review';reason='shadow_reader_review_required';
    userState='review_required';
   }
  }
 }catch{
  // Never return original bytes, source text, private contacts or API errors.
  state='uncertain';reason='shadow_read_uncertain';
  userState='reconciliation_required';
 }

 try{
  const recorded=await checkedRpc(args.rpc,'cotironda_piloto_finish_v2_shadow_b2',{
   p_source_hmac:source,p_source_sha256:sha,
   p_state:state,p_reason_code:reason,
   p_candidate:candidate,p_line_diagnostics:diagnostics,
   p_completeness:completeness
  });
  if(recorded.state!=='recorded')
   return done('reconciliation_required','shadow_finish_unconfirmed',1);
 }catch{return done('reconciliation_required','shadow_finish_unconfirmed',1)}
 return done(userState,reason,1);
}
