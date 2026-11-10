/**
 * MVP275 — IA Central read-only bridge for authenticated buyer TXT/CSV.
 *
 * Original media bytes, not an LLM reconstruction, are the planning source.
 * The independent two-read diagnostic is only corroboration, not a grant
 * to send WhatsApp, create rounds, reveal offers or publish the document.
 *
 * PDF, spreadsheets, Office and photos still need a trustworthy binary
 * text/layout reader before ANY commercial preparation. Fail closed.
 */
import type {DocumentDraft} from './document-ai-draft.ts';
import type {DownloadedMedia} from './whapi-media-archive.ts';
import {
 planificarMensajeAutenticadoMvp220,type PlanMvp220
} from '../../../src/domain/ia-central/planificador-piloto-mvp220.ts';

const HASH=/^[a-f0-9]{64}$/u;
const MIME=new Set(['text/plain','text/csv']);
const CONTROL=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const MAX_BYTES=4096;
const MAX_ITEMS=25;
const hex=(bytes:Uint8Array)=>Array.from(bytes,v=>v.toString(16).padStart(2,'0')).join('');
type Rpc=(name:string,params:Readonly<Record<string,string>>)=>
 Promise<{data:unknown;error:unknown}>;
type Model='gpt-6-luna'|'gpt-6.1-sol';
type State='apagado'|'no_aplica'|'requiere_revision'|'requiere_zona'|
 'plan_privado_validado'|'plan_privado_rechazado';
export type ResultadoPuenteCompradorMvp275=Readonly<{
 estado:State;codigo:string;
 fuenteOriginalVerificada:boolean;
 lecturasConcordantes:boolean;
 rondaCreada:false;whatsappEnviado:false;
 autorizacionPublicacion:false;datosComercialesExpuestos:false;
}>;
const result=(estado:State,codigo:string,original=false,dual=false):
 ResultadoPuenteCompradorMvp275=>Object.freeze({
 estado,codigo,fuenteOriginalVerificada:original,
 lecturasConcordantes:dual,rondaCreada:false,whatsappEnviado:false,
 autorizacionPublicacion:false,datosComercialesExpuestos:false
});
type Line=DocumentDraft['lines'][number];
const canonicalLine=(l:Line)=>[
 l.original_description,l.quantity,l.unit,
 l.unit_price,l.line_total,l.ambiguity
];
const signature=(d:DocumentDraft)=>JSON.stringify({
 kind:d.kind,city:d.delivery_city,note:d.requested_delivery_note,
 total:d.total_declared,lines:d.lines.map(canonicalLine),
 unanswered:d.unanswered
});
const textField=(value:unknown,max:number):value is string=>
 typeof value==='string'&&value.trim().length>0&&
 value.length<=max&&!CONTROL.test(value);
const literalToken=(row:string,value:string,boundary:RegExp):boolean=>{
 let at=row.indexOf(value);
 while(at>=0){
  const before=at===0?'':row[at-1],after=row[at+value.length]??'';
  if(!boundary.test(before)&&!boundary.test(after))return true;
  at=row.indexOf(value,at+1);
 }
 return false;
};
const decimalInRow=(row:string,quantity:string):boolean=>
 literalToken(row,quantity,/[0-9.,]/u);
const unitInRow=(row:string,unit:string):boolean=>
 literalToken(row.toLocaleLowerCase('es-AR'),
  unit.toLocaleLowerCase('es-AR'),/[\p{L}\p{N}]/u);
function csvCells(row:string):string[]|null{
 // Delimited Argentina CSV uses ';'; RFC4180 CSV uses ',' plus quotes.
 const delimiter=row.includes(';')?';':',';
 const fields:string[]=[];let field='',quoted=false,closed=false;
 for(let i=0;i<row.length;i++){
  const ch=row[i];
  if(ch==='"'){
   if(quoted){
    if(row[i+1]==='"'){field+='"';i++;}
    else {quoted=false;closed=true;}
   }else if(field.trim()===''&&!closed)quoted=true;
   else return null;
  }else if(ch===delimiter&&!quoted){
   fields.push(field.trim());field='';closed=false;
  }else if(!quoted&&closed&&!/^[ \t]$/u.test(ch))return null;
  else field+=ch;
 }
 if(quoted)return null;
 fields.push(field.trim());
 return fields.length>=2&&fields.length<=40?fields:null;
}
function literalRowMatches(row:string,line:DocumentDraft['lines'][number],
 mime:string):boolean{
 if(mime==='text/csv'){
  const cells=csvCells(row);
  return !!cells&&cells.some(cell=>cell.toLocaleLowerCase('es-AR').includes(
   line.original_description.toLocaleLowerCase('es-AR')))&&
   cells.includes(line.quantity!)&&
   cells.some(cell=>cell.toLocaleLowerCase('es-AR')===
    line.unit!.toLocaleLowerCase('es-AR'));
 }
 return row.toLocaleLowerCase('es-AR').includes(
  line.original_description.toLocaleLowerCase('es-AR'))&&
  decimalInRow(row,line.quantity!)&&unitInRow(row,line.unit!);
}
function corroboratedLines(source:string,read:DocumentDraft,mime:string):boolean{
 if(read.lines.length<1||read.lines.length>MAX_ITEMS||
    read.unanswered.length!==0)return false;
 const rows=source.split(/\r\n|\n|\r/u);
 if(rows.length>30)return false;
 let lastRow=-1;
 for(const line of read.lines){
  if(!textField(line.original_description,500)||
     !textField(line.quantity,30)||!textField(line.unit,60)||
     line.ambiguity!==null||
     typeof line.evidence_location!=='string'||
     line.evidence_location.trim().length===0)return false;
  let found=-1;
  for(let i=lastRow+1;i<rows.length;i++){
   if(literalRowMatches(rows[i],line,mime)){found=i;break;}
  }
  if(found<0)return false;
  lastRow=found;
 }
 return true;
}
export async function previsualizarDocumentoCompradorMvp275(args:{
 habilitado:boolean;webhookAutenticado:boolean;
 participanteComprador:boolean;messageHmac:string;chatHmac:string;
 original:DownloadedMedia;primera:DocumentDraft|null;
 segunda:DocumentDraft|null;apiKey:string;model:Model;
 rpc:Rpc;planificar?:typeof planificarMensajeAutenticadoMvp220;
}):Promise<ResultadoPuenteCompradorMvp275>{
 if(args?.habilitado!==true)return result('apagado','flag_disabled');
 if(!args.webhookAutenticado||!args.participanteComprador||
    !HASH.test(args.messageHmac)||!HASH.test(args.chatHmac)||
    typeof args.rpc!=='function'||
    !['gpt-6-luna','gpt-6.1-sol'].includes(args.model))
  return result('no_aplica','identity_or_model_invalid');
 const input=args.original;
 if(!input||!MIME.has(input.mime)||
    !(input.bytes instanceof Uint8Array)||
    input.bytes.length<10||input.bytes.length>MAX_BYTES||
    !HASH.test(input.sha256))
  return result('requiere_revision','independent_binary_reader_missing');
 let sha:string;
 try{
  sha=hex(new Uint8Array(await crypto.subtle.digest('SHA-256',
   Uint8Array.from(input.bytes))));
 }catch{return result('requiere_revision','original_digest_unavailable')}
 if(sha!==input.sha256)
  return result('requiere_revision','original_digest_conflict');
 let source:string;
 try{
  source=new TextDecoder('utf-8',{fatal:true}).decode(input.bytes);
 }catch{return result('requiere_revision','original_utf8_invalid')}
 if(source.length<10||source.length>MAX_BYTES||
    CONTROL.test(source)||source.includes('\uFFFD')||
    source.trim().length===0)
  return result('requiere_revision','original_text_invalid');
 const first=args.primera,second=args.segunda;
 if(!first||!second||first.kind!=='buyer_request'||
    second.kind!=='buyer_request'||
    first.status!=='review_required'||second.status!=='review_required'||
    signature(first)!==signature(second))
  return result('requiere_revision','independent_readings_disagree',true);
 if(!corroboratedLines(source,first,input.mime))
  return result('requiere_revision','literal_rows_not_correlated',true,true);
 if(!textField(first.delivery_city,80)||
    !source.toLocaleLowerCase('es-AR').includes(
     first.delivery_city.toLocaleLowerCase('es-AR')))
  return result('requiere_zona','delivery_city_missing_from_original',true,true);
 try{
  const planned=await (args.planificar??planificarMensajeAutenticadoMvp220)({
   chatHmac:args.chatHmac,messageHmac:args.messageHmac,
   textoOriginal:source,autenticadoPorWebhook:true,
   apiKey:args.apiKey,model:args.model,
   rpc:async(name,params)=>{
    // No RPC allowed to write a round, schedule WhatsApp or reserve a job.
    if(name!=='cotironda_piloto_ia_catalogo_mvp220')
     throw Error('mvp275_readonly_rpc_guard');
    return args.rpc(name,params);
   }
  });
  if(planned.whatsappEnviado!==false||planned.baseModificada!==false)
   return result('plan_privado_rechazado','planner_side_effect_claim',true,true);
  if(planned.estado==='plan_validado_sin_envio'&&planned.pedido&&
     planned.ruteo?.estado==='ruteo_valido_para_preparacion')
   return result('plan_privado_validado','readonly_central_plan',true,true);
  if(planned.estado==='requiere_aclaracion')
   return result('requiere_revision','central_clarification_required',true,true);
  return result('plan_privado_rechazado','semantic_or_catalogue_review',true,true);
 }catch{
  // Never log original text, LLM plan, supplier catalogue, keys or contacts.
  return result('plan_privado_rechazado','readonly_planner_unavailable',true,true);
 }
}
