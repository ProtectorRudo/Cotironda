/**
 * MVP276: strict original-byte buyer TXT/CSV -> IA Central transactional broker.
 *
 * Reuses the already validated, read-only semantic plan from MVP275.
 * SQL reserve/shadow/publish/dispatch must independently verify the archived
 * source via MVP276. Never bypasses kind=media or fabricates a text inbox.
 *
 * OFF by default and never performs WhatsApp calls itself.
 */
import type {DocumentDraft} from './document-ai-draft.ts';
import type {DownloadedMedia} from './whapi-media-archive.ts';
import {
 previsualizarDocumentoCompradorMvp275
} from './ai-central-buyer-document-mvp275.ts';
import {
 procesarCompradorCentralMvp226
} from './ai-central-buyer-mvp226.ts';
import {
 planificarMensajeAutenticadoMvp220,type PlanMvp220
} from '../../../src/domain/ia-central/planificador-piloto-mvp220.ts';

type Rpc=(name:string,params:Record<string,unknown>)=>
 Promise<{data:unknown;error:unknown}>;
type Modelo='gpt-6-luna'|'gpt-6.1-sol';
type State='apagado'|'requiere_revision'|'requiere_zona'|
 'ronda_en_sombra'|'ronda_publicada'|'conciliacion_requerida';
export type ResultadoDocumentoCentralMvp276=Readonly<{
 estado:State;codigo:string;origenArchivadoValidado:boolean;
 rondaPublicada:boolean;whatsappEnviado:false;
 contactosRevelados:false;
}>;
const done=(estado:State,codigo:string,verified=false):
 ResultadoDocumentoCentralMvp276=>Object.freeze({
 estado,codigo,origenArchivadoValidado:verified,
 rondaPublicada:estado==='ronda_publicada',whatsappEnviado:false,
 contactosRevelados:false
});
export async function procesarDocumentoCompradorCentralMvp276(args:{
 habilitado:boolean;publicar:boolean;autenticadoPorWebhook:boolean;
 compradorAutorizado:boolean;messageHmac:string;chatHmac:string;
 original:DownloadedMedia;primera:DocumentDraft|null;
 segunda:DocumentDraft|null;apiKey:string;model:Modelo;
 rpc:Rpc;planificar?:typeof planificarMensajeAutenticadoMvp220;
 procesar?:typeof procesarCompradorCentralMvp226;
}):Promise<ResultadoDocumentoCentralMvp276>{
 if(!args?.habilitado)return done('apagado','flag_disabled');
 const planBox:{plan:PlanMvp220|null}={plan:null};
 const preview=await previsualizarDocumentoCompradorMvp275({
  habilitado:true,webhookAutenticado:args.autenticadoPorWebhook,
  participanteComprador:args.compradorAutorizado,
  messageHmac:args.messageHmac,chatHmac:args.chatHmac,
  original:args.original,primera:args.primera,segunda:args.segunda,
  apiKey:args.apiKey,model:args.model,
  rpc:async(name,params)=>{
   const result=await args.rpc(name,params);
   return {data:result.data,error:result.error};
  },
  planificar:async params=>{
   // Called only after raw bytes/digest and two readings were accepted.
   // MVP275 wraps this callback's RPC and forbids every write.
   const r=await (args.planificar??planificarMensajeAutenticadoMvp220)(params);
   planBox.plan=r;
   return r;
  }
 });
 if(preview.estado==='requiere_zona')
  return done('requiere_zona','delivery_city_missing');
 if(preview.estado!=='plan_privado_validado'||!planBox.plan||
    preview.fuenteOriginalVerificada!==true||
    preview.lecturasConcordantes!==true)
  return done('requiere_revision','original_or_semantic_source_unverified');
 let source:string;
 try{
  source=new TextDecoder('utf-8',{fatal:true}).decode(args.original.bytes);
 }catch{return done('requiere_revision','original_decode_failed')}
 const planned=planBox.plan;
 // We do not recompute, rephrase or reuse the plan for another document.
 // SQL independently proves SHA(source)==media_archive.content_sha256.
 let processed;
 try{
  processed=await (args.procesar??procesarCompradorCentralMvp226)({
   habilitado:true,publicar:args.publicar===true,
   autenticadoPorWebhook:true,chatHmac:args.chatHmac,
   messageHmac:args.messageHmac,sourceSha256:args.original.sha256,
   fuente:source,apiKey:args.apiKey,model:args.model,rpc:args.rpc,
   planificar:async params=>{
    if(params.textoOriginal!==source||
       params.chatHmac!==args.chatHmac||
       params.messageHmac!==args.messageHmac||
       params.autenticadoPorWebhook!==true)
     throw Error('mvp276_source_changed_between_verify_and_broker');
    return planned;
   }
  });
 }catch{return done('conciliacion_requerida','broker_unavailable',true)}
 if(processed.whatsappEnviado!==false)
  return done('conciliacion_requerida','unexpected_broker_side_effect',true);
 if(processed.estado==='ronda_publicada')
  return done('ronda_publicada','published_by_sql',true);
 if(processed.estado==='ronda_en_sombra')
  return done('ronda_en_sombra','staged_by_sql',true);
 if(processed.estado==='requiere_zona')
  return done('requiere_zona','delivery_city_missing',true);
 if(processed.estado==='conciliacion_requerida')
  return done('conciliacion_requerida','sql_or_original_reconciliation',true);
 return done('requiere_revision','broker_rejected',true);
}
