/** Cotironda V2 D013: PDF/DOCX/XLSX ya corroborados -> preparación
 * original verificable -> liberación atómica privada V2, SIN MVP280.
 * Reutiliza MVP277/278 inmutables. Nunca envía WhatsApp ni publica si
 * falla la lectura, HMAC, custodia, política o autorización de la fuente.
 * SOLO apto para documentos con localidad explícita en el original.
 */
import type {DownloadedMedia} from './whapi-media-archive.ts';
import type {DocumentDraft} from './document-ai-draft.ts';
import {prepararDocumentoBinarioCompradorMvp278}
 from './ai-central-buyer-binary-broker-mvp278.ts';
import {procesarCompradorCentralMvp226 as procesarCompradorV2D013}
 from './ai-central-buyer-v2-d013.ts';

type Rpc=(name:string,params:Record<string,unknown>)=>
 Promise<{data:unknown;error:unknown}>;
type State='apagado'|'no_autorizado'|'requiere_revision'|'requiere_zona'|
 'ronda_en_sombra'|'ronda_publicada'|'conciliacion_requerida';
type Model='gpt-6-luna'|'gpt-6.1-sol';
export type ResultadoDocumentoBinarioV2D013=Readonly<{
 estado:State;codigo:string;requestId:string|null;
 originalVerificado:boolean;whatsappEnviado:false;
}>;
const H=/^[a-f0-9]{64}$/u;
const U=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const result=(estado:State,codigo:string,id:string|null=null,
 verified=false):ResultadoDocumentoBinarioV2D013=>Object.freeze({
 estado,codigo,requestId:id,originalVerificado:verified,whatsappEnviado:false
});
export async function prepararDocumentoBinarioV2D013(args:{
 enabled:boolean;autenticadoPorWebhook:boolean;compradorAutorizado:boolean;
 chatHmac:string;messageHmac:string;
 original:DownloadedMedia;primera:DocumentDraft|null;
 segunda:DocumentDraft|null;apiKey:string;model:Model;
 rpc:Rpc;
 preparar?:typeof prepararDocumentoBinarioCompradorMvp278;
}):Promise<ResultadoDocumentoBinarioV2D013>{
 if(args?.enabled!==true)return result('apagado','gate_off');
 if(!args.autenticadoPorWebhook||!args.compradorAutorizado||
    !H.test(args.chatHmac)||!H.test(args.messageHmac)||
    !args.original||typeof args.rpc!=='function')
  return result('no_autorizado','identity_invalid');
 let staged;
 try{
  staged=await (args.preparar??prepararDocumentoBinarioCompradorMvp278)({
   habilitado:true,autenticadoPorWebhook:true,
   compradorAutorizado:true,chatHmac:args.chatHmac,
   messageHmac:args.messageHmac,original:args.original,
   primera:args.primera,segunda:args.segunda,
   apiKey:args.apiKey,model:args.model,rpc:args.rpc,
   broker:async params=>{
    // MVP278 solamente solicita sombra. No promover desde el callback:
    // primera se archiva la atestación SQL del original completo.
    const {planificar:legacyPlanner,...sourceParams}=params;
    if(params.publicar!==false||legacyPlanner!==undefined)
     throw Error('v2_binary_broker_contract_invalid');
    return procesarCompradorV2D013({...sourceParams,publicar:false});
   }
  });
 }catch{return result('conciliacion_requerida','binary_broker_uncertain')}
 if(staged.estado==='requiere_zona')
  return result('requiere_zona','binary_city_missing');
 if(staged.estado==='requiere_revision')
  return result('requiere_revision','binary_original_needs_review');
 if(staged.estado==='no_autorizado')
  return result('no_autorizado','binary_source_not_authorized');
 if(staged.estado!=='ronda_en_sombra'||
    staged.originalAutorizado!==true||
    staged.rondaPublicada!==false||
    staged.whatsappEnviado!==false)
  return result('conciliacion_requerida','binary_staging_not_confirmed');

 // El original ya fue contrastado por lector independiente, atestado por SQL
 // y guardado en sombra. La publicación V2 hace una sola transacción.
 let release;
 try{
  release=await args.rpc('cotironda_piloto_v2_auto_release_d013',{
   p_chat_hmac:args.chatHmac,p_source_hmac:args.messageHmac
  });
 }catch{return result('conciliacion_requerida','v2_release_uncertain',null,true)}
 if(release.error!==null&&release.error!==undefined||
    !release.data||typeof release.data!=='object'||
    Array.isArray(release.data))
  return result('conciliacion_requerida','v2_release_uncertain',null,true);
 const data=release.data as Record<string,unknown>;
 if(['ready_for_delivery','already_published'].includes(String(data.state))){
  if(typeof data.request_id!=='string'||!U.test(data.request_id))
   return result('conciliacion_requerida','wrong_publication_request',null,true);
  return result('ronda_publicada','v2_atomic_release',data.request_id,true);
 }
 if(['invalid','disabled','calendar_not_installed','calendar_disabled',
  'originals_disabled','source_not_eligible','v2_timing_invalid',
  'deadline_not_verified','calendar_revision_invalid',
  'auto_release_not_authorized'].includes(String(data.state)))
  return result('ronda_en_sombra','v2_policy_off',null,true);
 return result('conciliacion_requerida','unknown_release_state',null,true);
}
