/**
 * MVP-094: Cotironda business voice. THE MODEL NEVER WRITES THE REPLY.
 * Intent classification and extraction are proposals, not authorizations.
 * The only outgoing texts are curated in this module, to avoid hallucinations.
 */
import {parseBuyerPilot,canPrepareBuyerPilot,type ParsedBuyer} from './core.ts';
import {validateAiBuyerProposal,type AiBuyerProposal} from './ai-contract.ts';
export type Intent='quote_request'|'business_question'|'greeting'|'status_question'|'other';
export type Topic='how_it_works'|'supplier_pricing'|'buyer_pricing'|
 'privacy'|'timing'|'other';
export type AiIntent=Readonly<{
 intent:Intent;topic:Topic;
 city:string|null;delivery_note:string|null;
 items:AiBuyerProposal['items'];unresolved:readonly string[];
}>;
export type Decision=Readonly<{
 action:'ready_to_distribute'|'ask_zone'|'ask_material'|'answer_faq'|'ignore';
 replyCode:'zone'|'materials'|'how_it_works'|'supplier_pricing'|
   'buyer_pricing'|'privacy'|'timing'|'status'|null;
 parsed:ParsedBuyer|null;
 reason:string;
}>;
/** Only product truths that are explicitly supported by current business rules. */
const FIXED_RESPONSES={
 zone:'¿En qué localidad se entregan los materiales?',
 materials:'No pude identificar todos los materiales o cantidades. ¿Podés aclarar lo que falta?',
 how_it_works:'Mandá los materiales y la localidad de entrega. Cotironda consulta a los negocios del rubro y reúne las cotizaciones.',
 supplier_pricing:'Para los proveedores, Cotironda es gratis y no cobra comisiones.',
 buyer_pricing:'Estamos en etapa piloto. Te informaremos el precio del servicio cuando esté confirmado.',
 privacy:'Las cotizaciones permanecen anónimas durante la ronda. Los datos de contacto se revelan solo según las reglas del cierre.',
 timing:'Cada ronda tiene un plazo. Podés ver las cotizaciones recibidas desde tu enlace de seguimiento.',
 status:'En tu enlace privado podés ver cuántas cotizaciones llegaron. Los presupuestos se abren cuando termina el plazo.'
} as const;
export type ReplyCode=keyof typeof FIXED_RESPONSES;
export function shortBusinessReply(code:ReplyCode):string{
 return FIXED_RESPONSES[code];
}
const silent=(reason:string):Decision=>({
 action:'ignore',replyCode:null,parsed:null,reason
});
/** Buyer only. No supplier quote, seller details or new contacts are sent here. */
export function decidePilotAIAction(
 raw:string,proposal:AiIntent|null,role:'buyer'|'supplier'|'unknown'
):Decision{
 if(role!=='buyer')return silent('not_buyer');
 if(!proposal||!['quote_request','business_question','greeting',
     'status_question','other'].includes(proposal.intent))return silent('no_safe_intent');
 if(proposal.intent==='greeting'||proposal.intent==='other')return silent('no_action_needed');
 if(proposal.intent==='business_question'){
  const topic=proposal.topic;
  if(!['how_it_works','supplier_pricing','buyer_pricing','privacy','timing'].includes(topic))
   return silent('business_fact_not_confirmed');
  return {action:'answer_faq',replyCode:topic as ReplyCode,parsed:null,
   reason:'approved_business_fact'};
 }
 if(proposal.intent==='status_question')return {
  action:'answer_faq',replyCode:'status',parsed:null,reason:'private_link_only'
 };
 const candidate:AiBuyerProposal={
  intent:'quote_request',city:proposal.city,
  delivery_note:proposal.delivery_note,
  items:proposal.items,unresolved:proposal.unresolved
 };
 // Under this safe pilot version, an AI extraction may initiate distribution
 // ONLY when independently corroborated by the deterministic input parser.
 const review=validateAiBuyerProposal(candidate,raw);
 const independent=parseBuyerPilot(raw);
 if(review.state==='source_verified_text'&&canPrepareBuyerPilot(independent))
  return {action:'ready_to_distribute',replyCode:null,parsed:independent,
   reason:'independent_source_coverage'};
 if(review.state==='missing_zone' || (independent.items.length>0 &&
   independent.city===null && independent.unresolved.length===0)){
  return {action:'ask_zone',replyCode:'zone',parsed:null,reason:'delivery_zone_missing'};
 }
 if(independent.unresolved.length>0||proposal.unresolved.length>0 ||
   review.state==='review_required')
  return {action:'ask_material',replyCode:'materials',parsed:null,
   reason:'source_evidence_incomplete'};
 return silent('not_a_complete_request');
}
