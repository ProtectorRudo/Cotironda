/**
 * MVP245 — De archivo original validado a interpretación COMERCIAL por rubro.
 * Solo admitimos documentos cuyo SHA binario y cobertura de líneas fueron
 * corroborados independientemente de OpenAI por el lector PDF/Office/TXT.
 *
 * No reemplazar el original, no conceder moneda, nunca publicar desde un
 * borrador ni activar WhatsApp. La asociación de ronda la decide SQL.
 */
import type {DocumentDraft} from './document-ai-draft.ts';
import type {SourceCheckResult} from './supplier-source-text.ts';
import {
 interpretarPresupuestoConIAMvp225
} from '../../../src/domain/ia-central/lector-presupuesto-proveedor-mvp225.ts';
import {
 RUBROS_MVP216,type RubroMvp216
} from '../../../src/domain/rubros-comprador-mvp216.ts';
import {resumenPrivadoMvp245} from './ai-central-supplier-mvp227.ts';

const HASH=/^[a-f0-9]{64}$/u;
const VALID_MIME=new Set([
 'application/pdf',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 'text/plain','text/csv'
]);
const CONTROL=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const MONETARY=/(?:AR\$|US\$|U\$S|\$|\bARS\b|\bUSD\b)\s*\d/iu;
const typeRecord=(v:unknown):v is Record<string,unknown>=>
 v!==null&&typeof v==='object'&&!Array.isArray(v);
const sourceString=(x:unknown,max:number):x is string=>
 typeof x==='string'&&x.length>0&&x.length<=max&&
 !CONTROL.test(x)&&!/\r|\n/u.test(x);

/** Convierte campos corroborados en una FUENTE DE TRABAJO segura.
 * Los renglones se reconstruyen en texto, SIN hacer cálculos de precios.
 * El texto derivado NO sustituye al original binario ni su SHA.
 */
export function fuenteDeDocumentoMvp245(args:{
 mime:string;sha256:string;draft:DocumentDraft;
 comprobacion:SourceCheckResult;
}):string|null{
 const {mime,sha256,draft,comprobacion}=args;
 if(!VALID_MIME.has(mime)||!HASH.test(sha256)||
    comprobacion?.state!=='source_text_covered'||
    comprobacion.reason!=='covered'||
    comprobacion.sourceSha256!==sha256||
    draft?.status!=='review_required'||draft.kind!=='supplier_quote'||
    !Array.isArray(draft.lines)||draft.lines.length<1||
    draft.lines.length>25||!Array.isArray(draft.unanswered)||
    draft.unanswered.length>0||!sourceString(draft.total_declared,80)||
    comprobacion.lines!==draft.lines.length)return null;
 const rows:string[]=[];
 for(const line of draft.lines){
  if(!sourceString(line.original_description,1000)||
     (line.quantity!==null&&!sourceString(line.quantity,30))||
     (line.unit!==null&&!sourceString(line.unit,80))||
     (line.unit_price!==null&&!sourceString(line.unit_price,80))||
     (line.line_total!==null&&!sourceString(line.line_total,80))||
     line.ambiguity!==null||
     MONETARY.test(line.original_description))
   return null;
  // Un cargo adicional, descuento o pallet sin cargo puede tener SOLO
  // importe final, o carecer de cantidad/precio. No exigir ni inventar
  // un precio unitario de flete que el negocio nunca escribió.
  // Si la IA declaró unitario, debe haber cantidad y unidad literales.
  if(line.unit_price!==null&&line.quantity===null)return null;
  const literal=[
   ...(line.quantity===null?[]:[line.quantity]),
   ...(line.unit===null?[]:[line.unit]),
   line.original_description,
   ...(line.unit_price===null?[]:['unitario:',line.unit_price]),
   ...(line.line_total===null?[]:['total:',line.line_total])
  ];
  rows.push(literal.join(' '));
 }
 const note=draft.requested_delivery_note;
 // Las notas del proveedor pueden ser varias líneas de IVA, flete, pago
 // y vencimientos: no imponer un único renglón como si fuera plantilla.
 if(note!==null&&(typeof note!=='string'||note.length>4000||
    CONTROL.test(note)||note.split(/[;\r\n]+/u).length>30))return null;
 const safeNote=note?.replace(/\r\n|\r/gu,'\n')??'';
 const text=[...rows,...(safeNote?[safeNote]:[]),
  'TOTAL GENERAL '+draft.total_declared].join('\n');
 return text.length<=15000?text:null;
}
type Rpc=(name:string,params:Record<string,unknown>)=>
 Promise<{data:unknown;error:unknown}>;
type Modelo='gpt-6-luna'|'gpt-6.1-sol';
type Resultado=Readonly<{
 estado:'apagado'|'no_aplica'|'ya_procesado'|'requiere_revision'|
  'verificado_privado'|'conciliacion_requerida';
 codigo:string;whatsappEnviado:false;
}>;
const done=(estado:Resultado['estado'],codigo:string):Resultado=>({
 estado,codigo,whatsappEnviado:false
});

/** Reserva de SQL atada a HMAC+SHA del archivo, proveedor y ronda.
 * Sin archivos fuente corroborados no se invoca SQL ni LLM.
 */
export async function procesarDocumentoCentralMvp245(args:{
 habilitado:boolean;webhookAutenticado:boolean;
 messageHmac:string;chatHmac:string;
 sha256:string;mime:string;draft:DocumentDraft;
 comprobacion:SourceCheckResult;
 apiKey:string;model:Modelo;rpc:Rpc;
 interpretar?:typeof interpretarPresupuestoConIAMvp225;
}):Promise<Resultado>{
 if(args?.habilitado!==true)return done('apagado','flag_disabled');
 if(args.webhookAutenticado!==true||
    !HASH.test(args.messageHmac)||!HASH.test(args.chatHmac)||
    typeof args.rpc!=='function')
  return done('no_aplica','identity_invalid');
 const source=fuenteDeDocumentoMvp245(args);
 if(source===null)return done('requiere_revision','source_not_covered');
 let reserved=false;
 const db=async(name:string,params:Record<string,unknown>)=>{
  const response=await args.rpc(name,params);
  if(response.error!==null&&response.error!==undefined||
     !typeRecord(response.data)||typeof response.data.state!=='string')
   throw Error('sql_reconciliation_required');
  return response.data;
 };
 const finish=async(state:'verified'|'review',reason:string,
  summary:Record<string,unknown>|null)=>{
  const r=await db('cotironda_piloto_ia_finish_quote_mvp227',{
   p_message_hmac:args.messageHmac,p_chat_hmac:args.chatHmac,
   p_state:state,p_reason:reason,p_summary:summary
  });
  if(r.state!=='saved_private')throw Error('finish_not_committed');
 };
 try{
  const booked=await db('cotironda_piloto_ia_reserve_media_mvp245',{
   p_message_hmac:args.messageHmac,p_chat_hmac:args.chatHmac,
   p_source_sha256:args.sha256,p_line_count:args.draft.lines.length
  });
  if(booked.state==='already_reserved')
   return done('ya_procesado','existing_analysis');
  if(booked.state==='quota_exceeded')
   return done('no_aplica','quota_exceeded');
  if(booked.state!=='reserved')
   return done('no_aplica','document_not_linked');
  reserved=true;
  if(booked.source_sha256!==args.sha256||
     !Array.isArray(booked.items)||booked.items.length<1||
     booked.items.length>25)
   throw Error('request_document_mismatch');
  const pedido=booked.items.map(v=>{
   if(!typeRecord(v)||typeof v.id!=='string'||
      !/^item_[1-9][0-9]{0,2}$/u.test(v.id)||
      typeof v.descripcion!=='string'||v.descripcion.length>500||
      typeof v.cantidad!=='string'||v.cantidad.length>40||
      typeof v.unidad!=='string'||v.unidad.length>20||
      typeof v.rubro!=='string'||
      !Object.hasOwn(RUBROS_MVP216,v.rubro))
    throw Error('request_lines_invalid');
   return {id:v.id,descripcion:v.descripcion,cantidad:v.cantidad,
    unidad:v.unidad,rubro:v.rubro as RubroMvp216};
  });
  const analyzed=await (args.interpretar??interpretarPresupuestoConIAMvp225)({
   fuente:source,pedido,etiquetaAnonima:'Presupuesto privado',
   apiKey:args.apiKey,model:args.model
  });
  const summary=resumenPrivadoMvp245(analyzed);
  if(!summary){
   await finish('review','semantic_review_required',null);
   return done('requiere_revision','source_kept_private');
  }
  const valid=summary.estado==='verificada_para_comparacion'&&
   ['ARS','USD'].includes(String(summary.moneda));
  await finish(valid?'verified':'review',
   valid?'source_and_math_checked':'conditions_need_review',summary);
  return done(valid?'verificado_privado':'requiere_revision',
   valid?'comparable_by_rubro':'conditions_need_review');
 }catch{
  if(reserved){
   try{await finish('review','processing_unavailable',null)}
   catch{/* No retries: SQL may already have committed. */}
  }
  return done('conciliacion_requerida','manual_source_reconciliation');
 }
}
