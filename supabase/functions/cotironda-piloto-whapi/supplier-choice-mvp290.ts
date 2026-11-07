/** MVP290. Never guess the owner of an unquoted supplier offer.
 * A Whapi-signed sender gets private, opaque per-source choices only when
 * >1 round was independently delivered BEFORE the original was received.
 * A timeout is terminal and is NOT retried automatically.
 */
const HASH=/^[a-f0-9]{64}$/u;
const WA=/^[1-9][0-9]{7,16}@s\.whatsapp\.net$/u;
const CODE=/^[a-f0-9]{10}$/u;
const ID=/^[A-Za-z0-9._:-]{8,160}$/u;
type Rpc=(fn:string,args:Record<string,unknown>)=>Promise<{data:unknown;error:unknown}>;
type Send=(to:string,body:string)=>Promise<{accepted:boolean;messageId:string|null}>;
const obj=(x:unknown):x is Record<string,unknown>=>x!==null&&typeof x==='object'&&!Array.isArray(x);
export type ChoiceResultMvp290=Readonly<{state:
 'off'|'invalid'|'not_eligible'|'accepted'|'uncertain'|'reconciliation_required';
 attempts:0|1;choices:number}>;
const result=(state:ChoiceResultMvp290['state'],attempts:0|1=0,choices=0):
 ChoiceResultMvp290=>Object.freeze({state,attempts,choices});
export function esCodigoDeRondaMvp290(body:unknown):body is string{
 return typeof body==='string'&&/^COTI [a-f0-9]{10}$/u.test(body);
}
function printable(v:unknown,max:number):string|null{
 if(typeof v!=='string'||v.length<1||v.length>max||
  /[\u0000-\u001f\u007f]|[<>]/u.test(v))return null;
 return v;
}
export function construirConsultaRondaMvp290(options:unknown):string|null{
 if(!Array.isArray(options)||options.length<1||options.length>24)return null;
 const seen=new Set<string>();
 const labels:string[]=[];
 for(const item of options){
  if(!obj(item)||!CODE.test(String(item.code))||seen.has(String(item.code)))return null;
  seen.add(String(item.code));
  const date=printable(item.date,5),city=printable(item.city,50),
   material=printable(item.material,65);
  if(!date||!/^\d{2}\/\d{2}$/u.test(date)||!city||!material)return null;
  labels.push('• Pedido '+date+', '+city+' — '+material+
   '\n  Respondé: COTI '+item.code);
 }
 const message='Cotironda: recibimos tu presupuesto y guardamos el archivo. '+
  'Tenés varias solicitudes que podrían corresponder. Para no mezclar pedidos, '+
  'elegí UNA opción respondiendo exactamente su código:\n\n'+
  labels.join('\n\n')+
  '\n\nNo hace falta reenviar el presupuesto. '+
  'Si ninguna coincide, respondé citando el pedido original de Cotironda.';
 return message.length<=3900?message:null;
}
export async function consultarRondaMvp290(args:{
 enabled:boolean;trustedSupplier:boolean;sourceHmac:string;chatHmac:string;
 recipient:string;rpc:Rpc;send:Send;
}):Promise<ChoiceResultMvp290>{
 if(!args?.enabled)return result('off');
 if(!args.trustedSupplier||!HASH.test(args.sourceHmac)||!HASH.test(args.chatHmac)||
  !WA.test(args.recipient)||typeof args.rpc!=='function'||
  typeof args.send!=='function')return result('invalid');
 let decision:Record<string,unknown>|null=null;
 try{
  const r=await args.rpc('cotironda_piloto_reserve_supplier_choice_mvp290',{
   p_source_hmac:args.sourceHmac,p_chat_hmac:args.chatHmac
  });
  if(r.error)return result('reconciliation_required');
  decision=obj(r.data)?r.data:null;
 }catch{return result('reconciliation_required')}
 if(!decision||typeof decision.state!=='string')
  return result('reconciliation_required');
 if(decision.state!=='reserved')return result('not_eligible');
 const text=construirConsultaRondaMvp290(decision.options);
 let accepted=false,id:string|null=null;
 if(text){
  try{
   const r=await args.send(args.recipient,text);
   id=r.accepted===true&&typeof r.messageId==='string'&&ID.test(r.messageId)?
    r.messageId:null;
   accepted=id!==null;
  }catch{/* Network response unknown. Never reissue. */}
 }
 const choices=Array.isArray(decision.options)?decision.options.length:0;
 try{
  const saved=await args.rpc('cotironda_piloto_finish_supplier_choice_mvp290',{
   p_source_hmac:args.sourceHmac,p_state:accepted?'api_accepted':'uncertain',
   p_whapi_message_id:id
  });
  if(saved.error||!obj(saved.data)||saved.data.state!=='recorded')
   return result('reconciliation_required',text?1:0,choices);
 }catch{return result('reconciliation_required',text?1:0,choices)}
 return result(accepted?'accepted':'uncertain',text?1:0,choices);
}
export type ChosenSourceMvp290=Readonly<{
 state:'resolved_private'|'not_eligible'|'reconciliation_required';
 sourceHmac:string|null;sourceKind:'text'|'image'|'document'|null;
}>;
export async function resolverEleccionMvp290(args:{
 enabled:boolean;trustedSupplier:boolean;
 chatHmac:string;replyHmac:string;body:string;rpc:Rpc;
}):Promise<ChosenSourceMvp290>{
 const fail=(state:ChosenSourceMvp290['state'])=>Object.freeze({
  state,sourceHmac:null,sourceKind:null
 });
 if(!args?.enabled||!args.trustedSupplier||!HASH.test(args.chatHmac)||
  !HASH.test(args.replyHmac)||!esCodigoDeRondaMvp290(args.body)||
  typeof args.rpc!=='function')return fail('not_eligible');
 try{
  const r=await args.rpc('cotironda_piloto_resolve_supplier_choice_mvp290',{
   p_reply_hmac:args.replyHmac,p_chat_hmac:args.chatHmac,
   p_original_text:args.body
  });
  if(r.error||!obj(r.data)||typeof r.data.state!=='string')
   return fail('reconciliation_required');
  if(r.data.state!=='resolved_private')return fail('not_eligible');
  if(!HASH.test(String(r.data.source_hmac))||
    !['text','image','document'].includes(String(r.data.source_kind)))
   return fail('reconciliation_required');
  return Object.freeze({state:'resolved_private',
   sourceHmac:r.data.source_hmac as string,
   sourceKind:r.data.source_kind as 'text'|'image'|'document'});
 }catch{return fail('reconciliation_required')}
}
