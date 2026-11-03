/**
 * Authenticated Whapi direct-message status parser. No recipient or message
 * identifiers are logged, returned to the buyer, or sent to OpenAI.
 *
 * Source: Whapi status webhooks: event {type:"statuses",event:"post"},
 * statuses[{id,code,status,recipient_id,timestamp}].
 * Group statuses.put have per-viewer semantics and are intentionally excluded.
 */
export type DirectDeliveryStatus=Readonly<{
 messageId:string;status:'failed'|'pending'|'sent'|'delivered'|'read'|'played'|'deleted';
 code:number;recipientChatId:string;eventUnix:number
}>;
const statuses=['failed','pending','sent','delivered','read','played','deleted'] as const;
const messageId=/^[A-Za-z0-9_-]{8,160}$/u;
const directChat=/^[0-9-]{10,31}@(s\.whatsapp\.net|c\.us)$/u;
type Record_=Record<string,unknown>;
const isRecord=(x:unknown):x is Record_=>x!==null&&
 typeof x==='object'&&!Array.isArray(x);
export function isWhapiStatusEvent(input:unknown):boolean{
 if(!isRecord(input)||!isRecord(input.event))return false;
 return input.event.type==='statuses'&&
   (input.event.event==='post'||input.event.event==='put');
}
export function parseWhapiDirectStatuses(input:unknown,nowUnix=Math.floor(Date.now()/1000)
):readonly DirectDeliveryStatus[]{
 if(!isRecord(input)||!isRecord(input.event)||
    input.event.type!=='statuses')throw new TypeError('status_event_invalid');
 // Groups have a viewer_id per recipient and no single delivered state.
 if(input.event.event==='put')return [];
 if(input.event.event!=='post'||!Array.isArray(input.statuses)||
    input.statuses.length<1||input.statuses.length>10)
   throw new TypeError('status_batch_invalid');
 const out:DirectDeliveryStatus[]=[];
 for(const raw of input.statuses){
  if(!isRecord(raw)||typeof raw.id!=='string'||!messageId.test(raw.id)||
    typeof raw.status!=='string'||!statuses.includes(raw.status as typeof statuses[number])||
    !Number.isInteger(raw.code)||raw.code!==statuses.indexOf(raw.status as typeof statuses[number])||
    typeof raw.recipient_id!=='string'||!directChat.test(raw.recipient_id)||
    typeof raw.timestamp!=='string'||!/^[0-9]{10,11}$/u.test(raw.timestamp)||
    raw.viewer_id!==undefined)
   throw new TypeError('status_entry_invalid');
  const eventUnix=Number(raw.timestamp);
  if(!Number.isSafeInteger(eventUnix)||eventUnix>nowUnix+300||
     eventUnix<nowUnix-604800)throw new TypeError('status_time_invalid');
  out.push({messageId:raw.id,status:raw.status as DirectDeliveryStatus['status'],
   code:raw.code as number,recipientChatId:raw.recipient_id,eventUnix});
 }
 return out;
}
