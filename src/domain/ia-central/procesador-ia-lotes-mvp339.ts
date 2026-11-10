/**
 * MVP339 — Orquestación PRIVADA de interpretaciones IA por lotes.
 *
 * Entradas: evidencia original previamente acreditada (MVP338/MVP337),
 * identidad privada de una ronda y reservas inmutables del trabajador.
 * Salidas: SOLO lecturas propuestas para cotejo independiente posterior.
 * No SQL real, no Whapi, no ranking, no precios aprobados, no reintentos
 * automáticos ni registro de textos comerciales en logs.
 */
import {
 corroborarLecturasMvp337,
 type PlanMvp337,type LoteMvp337,type LecturaFilaMvp337
} from './ingesta-evidencia-flexible-mvp337.ts';

export type AmbitoMvp339=Readonly<{
 roundId:string;supplierId:string;messageHmac:string;chatHmac:string;
}>;
export type PresupuestoMvp339=Readonly<{
 maxModelCalls:number;maxInputChars:number;
}>;
export type PerspectivaMvp339='primary'|'corroboration';
export type LecturaLoteMvp339=Readonly<{
 sourceSha256:string;lotNumber:number;lotDigest:string;
 readings:readonly LecturaFilaMvp337[];
}>;
export type SolicitudLectorMvp339=Readonly<{
 sourceSha256:string;lotNumber:number;lotDigest:string;
 perspective:PerspectivaMvp339;rows:LoteMvp337['rows'];
}>;
export type ReservaMvp339=Readonly<{
 state:'reserved'|'already_processed'|'not_eligible';
 sourceSha256?:string;roundId?:string;supplierId?:string;
 messageHmac?:string;chatHmac?:string;receipt?:string;
}>;
export type FinalizacionMvp339=Readonly<{
 receipt:string;scope:AmbitoMvp339;sourceSha256:string;
 state:'analysis_ready_private'|'review_required';
 reason:string;modelCalls:number;agreedRows:number;totalRows:number;
}>;
export type ResultadoMvp339=Readonly<{
 state:'ready_for_independent_source_audit'|'review_required'|
  'already_processed'|'not_eligible'|'budget_limited'|'reconciliation_required';
 reason:string;sourceSha256:string|null;totalRows:number;
 agreedRows:number;modelCalls:number;readings:readonly LecturaFilaMvp337[]|null;
 economicPublicationAllowed:false;whatsappMessages:0;
}>;
const SHA=/^[a-f0-9]{64}$/u;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const RECEIPT=/^[A-Za-z0-9_-]{24,128}$/u;
const CONTROL=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const result=(state:ResultadoMvp339['state'],reason:string,
 sourceSha256:string|null,totalRows:number,modelCalls=0,
 agreedRows=0,readings:readonly LecturaFilaMvp337[]|null=null):
 ResultadoMvp339=>Object.freeze({
 state,reason,sourceSha256,totalRows,modelCalls,agreedRows,readings,
 economicPublicationAllowed:false,whatsappMessages:0
});
const validScope=(v:AmbitoMvp339):boolean=>!!v&&
 UUID.test(v.roundId)&&UUID.test(v.supplierId)&&
 SHA.test(v.messageHmac)&&SHA.test(v.chatHmac);
function validPlan(p:PlanMvp337):boolean{
 if(p?.state!=='planned'||!SHA.test(p.sourceSha256??'')||
    !Array.isArray(p.lots)||p.lots.length<1||p.lots.length>60||
    !Number.isInteger(p.totalRows)||p.totalRows<1||p.totalRows>1200||
    p.economicPublicationAllowed!==false)return false;
 let expected=1;
 for(let i=0;i<p.lots.length;i++){
  const lot=p.lots[i];
  if(lot?.number!==i+1||lot.sourceSha256!==p.sourceSha256||
     !Array.isArray(lot.rows)||lot.rows.length<1||lot.rows.length>20)
   return false;
  let chars=0;
  for(const row of lot.rows){
   if(row?.position!==expected++||
      typeof row.section!=='string'||!row.section||
      row.section.length>100||CONTROL.test(row.section)||
      typeof row.literal!=='string'||!row.literal||
      row.literal.length>4500||CONTROL.test(row.literal))
    return false;
   chars+=row.literal.length;
  }
  if(chars>4500)return false;
 }
 return expected===p.totalRows+1;
}
async function digestLot(hash:string,lot:LoteMvp337):Promise<string>{
 const payload=JSON.stringify([hash,lot.number,
  lot.rows.map(r=>[r.position,r.section,r.literal])]);
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(payload));
 return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}
function validModelResponse(reply:LecturaLoteMvp339,expected:{
 hash:string;number:number;digest:string;lot:LoteMvp337
}):boolean{
 if(!reply||reply.sourceSha256!==expected.hash||
    reply.lotNumber!==expected.number||reply.lotDigest!==expected.digest||
    !Array.isArray(reply.readings)||
    reply.readings.length!==expected.lot.rows.length)return false;
 return reply.readings.every((reading,i)=>reading&&
  reading.position===expected.lot.rows[i].position);
}
/**
 * Reserva DEBE ser duradera/atómica e identificar HMAC, proveedor, ronda y SHA.
 * No se provee reserva por defecto: sin integrarla a SQL privado este
 * orquestador no puede ejecutarse en el piloto.
 */
export async function procesarLotesIAInternosMvp339(args:{
 plan:PlanMvp337;scope:AmbitoMvp339;budget:PresupuestoMvp339;
 reserve:(v:{scope:AmbitoMvp339;sourceSha256:string})=>Promise<ReservaMvp339>;
 finish:(v:FinalizacionMvp339)=>Promise<'recorded'>;
 interpret:(v:SolicitudLectorMvp339)=>Promise<LecturaLoteMvp339>;
}):Promise<ResultadoMvp339>{
 const {plan,scope,budget}=args??{};
 const hash=SHA.test(plan?.sourceSha256??'')?plan.sourceSha256!:null;
 const total=Number.isInteger(plan?.totalRows)&&plan.totalRows>0?
  plan.totalRows:0;
 if(!validPlan(plan)||!validScope(scope)||
    typeof args.reserve!=='function'||
    typeof args.finish!=='function'||typeof args.interpret!=='function')
  return result('review_required','invalid_plan_or_scope',hash,total);
 const requiredCalls=plan.lots.length*2;
 const sumChars=plan.lots.reduce((acc,l)=>acc+
  l.rows.reduce((n,r)=>n+r.literal.length,0),0);
 if(!budget||!Number.isSafeInteger(budget.maxModelCalls)||
    !Number.isSafeInteger(budget.maxInputChars)||
    budget.maxModelCalls<requiredCalls||budget.maxModelCalls>120||
    budget.maxInputChars<sumChars*2||budget.maxInputChars>900000)
  return result('budget_limited','preflight_budget_missing',hash,total);
 let reservation:ReservaMvp339;
 try{reservation=await args.reserve({scope,sourceSha256:hash!})}
 catch{return result('reconciliation_required','reserve_unavailable',hash,total)}
 if(reservation?.state==='already_processed')
  return result('already_processed','already_reserved',hash,total);
 if(reservation?.state==='not_eligible')
  return result('not_eligible','source_not_eligible',hash,total);
 if(reservation?.state!=='reserved'||!RECEIPT.test(reservation.receipt??'')||
    reservation.sourceSha256!==hash||
    reservation.roundId!==scope.roundId||
    reservation.supplierId!==scope.supplierId||
    reservation.messageHmac!==scope.messageHmac||
    reservation.chatHmac!==scope.chatHmac)
  return result('reconciliation_required','reservation_scope_mismatch',hash,total);
 let calls=0;let reason='all_rows_preserved';
 let primary:LecturaFilaMvp337[]=[];
 let secondary:LecturaFilaMvp337[]=[];
 let agreed=0;let completed=false;
 try{
  for(const lot of plan.lots){
   const lotDigest=await digestLot(hash!,lot);
   const rows=Object.freeze(lot.rows.map(row=>Object.freeze({...row})));
   const replies:LecturaLoteMvp339[]=[];
   for(const perspective of ['primary','corroboration'] as const){
    // No prior model output is ever passed into the independent read.
    calls++;
    const reply=await args.interpret(Object.freeze({
     sourceSha256:hash!,lotNumber:lot.number,lotDigest,perspective,rows
    }));
    if(!validModelResponse(reply,{
     hash:hash!,number:lot.number,digest:lotDigest,lot
    })){
     reason='incomplete_or_cross_source_model_response';
     break;
    }
    replies.push(reply);
   }
   if(replies.length!==2)break;
   primary.push(...replies[0].readings);
   secondary.push(...replies[1].readings);
  }
  if(primary.length===total&&secondary.length===total){
   const checked=corroborarLecturasMvp337(plan,primary,secondary);
   if(checked.state==='ready_for_independent_source_audit'){
    completed=true;agreed=checked.agreed;reason=checked.reason;
   }else{agreed=checked.agreed;reason=checked.reason}
  }else if(reason==='all_rows_preserved'){
   reason='unread_source_lot';
  }
 }catch{
  // No automatic retry: a paid call may have succeeded remotely even if
  // its response was lost. The source must be reconciled by a durable worker.
  reason='model_or_evidence_unavailable';
 }
 const finalization:FinalizacionMvp339={
  receipt:reservation.receipt!,scope,sourceSha256:hash!,
  state:completed?'analysis_ready_private':'review_required',
  reason,modelCalls:calls,agreedRows:agreed,totalRows:total
 };
 try{
  const recorded=await args.finish(finalization);
  if(recorded!=='recorded')
   return result('reconciliation_required','finish_not_recorded',hash,total,calls);
 }catch{
  return result('reconciliation_required','finish_unavailable',hash,total,calls);
 }
 if(!completed)
  return result('review_required',reason,hash,total,calls,agreed);
 return result('ready_for_independent_source_audit',
  'all_rows_preserved',hash,total,calls,agreed,Object.freeze(primary));
}
