/**
 * MVP278 — authenticated binary source -> independent proof -> SQL
 * attestation -> IA Central shadow round. No supplier message or publication.
 *
 * Only the trusted webhook is permitted to invoke the service_role RPC.
 * Original bytes are read by MVP277; a model cannot create an attestation.
 */
import type {DownloadedMedia} from './whapi-media-archive.ts';
import type {DocumentDraft} from './document-ai-draft.ts';
import {
 contrastarDocumentoCompradorMvp277
} from './ai-central-buyer-binary-mvp277.ts';
import {
 procesarCompradorCentralMvp226
} from './ai-central-buyer-mvp226.ts';

type Rpc=(name:string,params:Record<string,unknown>)=>
 Promise<{data:unknown;error:unknown}>;
type Model='gpt-6-luna'|'gpt-6.1-sol';
type State='apagado'|'no_autorizado'|'requiere_revision'|
 'requiere_zona'|'ronda_en_sombra'|'conciliacion_requerida';
type Result=Readonly<{
 estado:State;codigo:string;originalAutorizado:boolean;
 rondaPublicada:false;whatsappEnviado:false;
 contactosRevelados:false;
}>;
const HASH=/^[a-f0-9]{64}$/u;
const mime=new Set([
 'application/pdf',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]);
const finish=(estado:State,codigo:string,verified=false):Result=>Object.freeze({
 estado,codigo,originalAutorizado:verified,
 rondaPublicada:false,whatsappEnviado:false,contactosRevelados:false
});
export async function prepararDocumentoBinarioCompradorMvp278(args:{
 habilitado:boolean;
 autenticadoPorWebhook:boolean;compradorAutorizado:boolean;
 chatHmac:string;messageHmac:string;
 original:DownloadedMedia;primera:DocumentDraft|null;
 segunda:DocumentDraft|null;
 apiKey:string;model:Model;rpc:Rpc;
 contrastar?:typeof contrastarDocumentoCompradorMvp277;
 broker?:typeof procesarCompradorCentralMvp226;
}):Promise<Result>{
 if(args?.habilitado!==true)return finish('apagado','flag_disabled');
 if(!args.autenticadoPorWebhook||!args.compradorAutorizado||
    !HASH.test(args.chatHmac)||!HASH.test(args.messageHmac)||
    !args.original||!mime.has(args.original.mime)||
    !['gpt-6-luna','gpt-6.1-sol'].includes(args.model)||
    typeof args.rpc!=='function')
  return finish('no_autorizado','webhook_or_buyer_not_authorized');
 let checked;
 try{
  checked=await (args.contrastar??contrastarDocumentoCompradorMvp277)({
   habilitado:true,original:args.original,
   primera:args.primera,segunda:args.segunda
  });
 }catch{return finish('requiere_revision','independent_reader_failed')}
 if(checked.estado==='requiere_zona')
  return finish('requiere_zona','locality_not_in_original');
 if(checked.estado!=='fuente_contrastada_privada'||
    checked.origenIndependiente!==true||
    checked.rondaCreada!==false||checked.whatsappEnviado!==false||
    checked.soloVistaPrivada!==true||
    !HASH.test(checked.sha256Original??'')||
    !HASH.test(checked.sha256TextoDerivado??'')||
    checked.sha256Original!==args.original.sha256||
    !Number.isInteger(checked.renglonesAcreditados)||
    checked.renglonesAcreditados<1||checked.renglonesAcreditados>25||
    typeof checked.textoFuentePrivado!=='string'||
    checked.textoFuentePrivado.length<10||
    checked.textoFuentePrivado.length>4000)
  return finish('requiere_revision','binary_source_not_proven');
 const derived=checked.textoFuentePrivado;
 let attested;
 try{
  attested=await args.rpc('cotironda_piloto_ia_attest_binary_mvp278',{
   p_chat_hmac:args.chatHmac,
   p_message_hmac:args.messageHmac,
   p_original_sha256:checked.sha256Original,
   p_derived_text:derived,
   p_mime:args.original.mime,
   p_verified_items:checked.renglonesAcreditados
  });
 }catch{
  // An ambiguous RPC response may mean the attestation committed.
  // Do not retry a financial workflow after a network failure.
  return finish('conciliacion_requerida','attestation_uncertain');
 }
 if(attested.error!==null&&attested.error!==undefined)
  return finish('conciliacion_requerida','attestation_uncertain');
 const data=attested.data;
 const state=(data&&typeof data==='object'&&!Array.isArray(data))?
  (data as Record<string,unknown>).state:null;
 if(state!=='attested'&&state!=='already_attested')
  return finish('requiere_revision','sql_original_not_authorized');
 try{
  const broker=await (args.broker??procesarCompradorCentralMvp226)({
   habilitado:true,
   // No buyer-signed review confirmation yet. NEVER publish a binary
   // document from automatic webhook processing on this bridge.
   publicar:false,
   autenticadoPorWebhook:true,
   chatHmac:args.chatHmac,messageHmac:args.messageHmac,
   fuente:derived,sourceSha256:checked.sha256TextoDerivado!,
   apiKey:args.apiKey,model:args.model,rpc:args.rpc
  });
  if(broker.whatsappEnviado!==false||
     broker.estado==='ronda_publicada')
   return finish('conciliacion_requerida','unexpected_publication',true);
  if(broker.estado==='ronda_en_sombra')
   return finish('ronda_en_sombra','verified_source_staged',true);
  if(broker.estado==='requiere_zona')
   return finish('requiere_zona','delivery_city_missing',true);
  if(broker.estado==='conciliacion_requerida')
   return finish('conciliacion_requerida','broker_uncertain',true);
  return finish('requiere_revision','semantic_or_catalogue_review',true);
 }catch{
  return finish('conciliacion_requerida','broker_uncertain',true);
 }
}
