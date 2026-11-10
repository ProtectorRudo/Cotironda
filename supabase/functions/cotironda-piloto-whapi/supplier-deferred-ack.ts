/**
 * MVP181 / PILOTO ONLY. Delayed supplier receipt thanks after classified
 * PDF/XLSX/image, with explicit FUTURE-ONLY DB activation and no backfill.
 * The sender comes ONLY from the signed Whapi trigger, never AI or a quote.
 * Reservation is a one-way idempotency barrier: timeout == terminal uncertain.
 */
const HEX=/^[a-f0-9]{64}$/u;
const CHAT=/^[1-9][0-9]{7,16}@s\.whatsapp\.net$/u;
export const DEFERRED_SUPPLIER_THANKS=
 '¡Gracias! Recibimos tu presupuesto. Lo estamos procesando en Cotironda.';
type Rpc=Readonly<{data:unknown;error:unknown}>;
type Sent=Readonly<{sent:boolean;id:string|null}>;
export type DeferredAckIO=Readonly<{
 rpc:(name:string,params:Record<string,unknown>)=>Promise<Rpc>;
 sendText:(recipient:string,text:string)=>Promise<Sent>;
}>;
export type AckOutcome='disabled'|'invalid'|'not_eligible'|
 'reserved_unavailable'|'api_accepted'|'uncertain'|'reconciliation_required';

/** No automatic retry of a reserved message — duplicate sends are worse
 * than a missing thank-you. All failed delivery states require audit.
 */
export async function sendDeferredSupplierAckMvp181(input:{
 enabled:boolean;messageHmac:string;triggerChatHmac:string;
 recipientChatId:string;io:DeferredAckIO
}):Promise<AckOutcome>{
 if(input.enabled!==true)return 'disabled';
 if(!HEX.test(input.messageHmac)||!HEX.test(input.triggerChatHmac)||
  !CHAT.test(input.recipientChatId))return 'invalid';
 let reservation:Rpc;
 try{
  reservation=await input.io.rpc(
   'cotironda_piloto_reserve_deferred_supplier_ack_mvp181',{
    p_message_hmac:input.messageHmac,
    p_trigger_chat_hmac:input.triggerChatHmac
   });
 }catch{return 'reserved_unavailable'}
 if(reservation.error)return 'reserved_unavailable';
 if(reservation.data!==true)return 'not_eligible';
 // The reservation was persisted before ANY network call. Never reserve
 // again on Whapi transport error, timeout, malformed response or crash.
 let state:'api_accepted'|'uncertain'='uncertain';
 let whapiMessageId:string|null=null;
 try{
  const sent=await input.io.sendText(
   input.recipientChatId,DEFERRED_SUPPLIER_THANKS);
  if(sent?.sent===true){
   state='api_accepted';
   if(typeof sent.id==='string'&&
    /^[A-Za-z0-9_-]{8,160}$/u.test(sent.id))whapiMessageId=sent.id;
  }
 }catch{/* Unknown delivery is terminal, not a reason to repeat. */}
 try{
  const finish=await input.io.rpc(
   'cotironda_piloto_finish_supplier_ack_mvp104',{
    p_message_hmac:input.messageHmac,p_state:state
   });
  if(finish.error||finish.data!==true)return 'reconciliation_required';
  if(state==='api_accepted'&&whapiMessageId){
   const id=await input.io.rpc(
    'cotironda_piloto_record_supplier_ack_id_mvp119',{
     p_message_hmac:input.messageHmac,p_whapi_message_id:whapiMessageId
    });
   if(id.error||id.data!==true)return 'reconciliation_required';
  }
 }catch{return 'reconciliation_required'}
 return state;
}