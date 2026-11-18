/**
 * Cotironda V2 — continue a supplier ORIGINAL already linked to a real RFQ.
 * This is intentionally NOT another document parser or an attribution model.
 * The existing MVP292 replay owns SHA verification, immutable transcription,
 * independent economic/source checks, one-shot lease and private publication.
 * No Whapi message or buyer data is returned.
 */
import {reprocesarOriginalHistoricoMvp292} from './supplier-archive-replay-mvp292.ts';
type Modelo='gpt-6-luna'|'gpt-6.1-sol';
type Rpc=(name:string,args:Record<string,unknown>)=>
 Promise<{data:unknown;error:unknown}>;
type Download=(path:string)=>Promise<{data:Blob|null;error:unknown}>;
const HASH=/^[a-f0-9]{64}$/u;
const object=(v:unknown):v is Record<string,unknown>=>
 v!==null&&typeof v==='object'&&!Array.isArray(v);
export type LinkedDocumentResultV2=Readonly<{
 state:'disabled'|'empty'|'published_private'|'review_private'|
  'reconciliation_required';
 processed:0|1;outboundMessages:0
}>;
const done=(state:LinkedDocumentResultV2['state'],processed:0|1):
 LinkedDocumentResultV2=>Object.freeze({state,processed,outboundMessages:0});
export async function procesarArchivoVinculadoV2(args:{
 enabled:boolean;trustedInternalWorker:boolean;
 apiKey:string;model:Modelo;documentSemanticEnabled:boolean;
 rpc:Rpc;download:Download;
 replay?:typeof reprocesarOriginalHistoricoMvp292;
}):Promise<LinkedDocumentResultV2>{
 if(!args?.enabled||!args.trustedInternalWorker||
  typeof args.rpc!=='function'||typeof args.download!=='function'||
  typeof args.apiKey!=='string'||args.apiKey.length<18)return done('disabled',0);

 let data:unknown;
 try{
  const r=await args.rpc('cotironda_piloto_next_linked_supplier_document_v2',{});
  if(r.error||!object(r.data)||typeof r.data.state!=='string')
   return done('reconciliation_required',0);
  data=r.data;
 }catch{return done('reconciliation_required',0)}
 if(!object(data))return done('reconciliation_required',0);
 if(data.state==='empty')return done('empty',0);
 if(data.state==='disabled')return done('disabled',0);
 if(data.state!=='eligible'||typeof data.source_hmac!=='string'||
    typeof data.chat_hmac!=='string'||
    !HASH.test(data.source_hmac)||!HASH.test(data.chat_hmac))
  return done('reconciliation_required',0);
 // Selection is read-only. Only MVP292 reserve performs the atomic one-shot
 // lease. Concurrent workers may select the same source; only one can reserve.
 try{
  const outcome=await (args.replay??reprocesarOriginalHistoricoMvp292)({
   enabled:true,trustedInternalWorker:true,
   sourceHmac:data.source_hmac,chatHmac:data.chat_hmac,
   apiKey:args.apiKey,model:args.model,
   documentSemanticEnabled:args.documentSemanticEnabled,
   rpc:args.rpc,download:args.download
  });
  if(outcome.state==='published_private')return done('published_private',1);
  if(outcome.state==='review_required'||outcome.state==='not_eligible'||
     outcome.state==='disabled')return done('review_private',1);
  return done('reconciliation_required',1);
 }catch{return done('reconciliation_required',1)}
}
