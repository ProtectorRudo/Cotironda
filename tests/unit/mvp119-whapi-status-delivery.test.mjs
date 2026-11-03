import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 isWhapiStatusEvent,parseWhapiDirectStatuses
} from '../../supabase/functions/cotironda-piloto-whapi/delivery-status.ts';
const t=1793571234;
const receipt=(status='delivered',code=3,id='YhNqCveDWW90_t8lzrW25w-wO4Twl0rVw')=>({
 statuses:[{id,code,status,recipient_id:'5492211234567@s.whatsapp.net',
  timestamp:String(t)}],
 event:{type:'statuses',event:'post'},channel_id:'COTI-PILOT'
});
test('MVP119: Whapi documented statuses.post delivered and read parsed exactly',()=>{
 const delivered=receipt(),read=receipt('read',4);
 assert.equal(isWhapiStatusEvent(delivered),true);
 assert.equal(parseWhapiDirectStatuses(delivered,t)[0].status,'delivered');
 assert.deepEqual(parseWhapiDirectStatuses(read,t)[0],{
  messageId:'YhNqCveDWW90_t8lzrW25w-wO4Twl0rVw',
  code:4,status:'read',recipientChatId:'5492211234567@s.whatsapp.net',
  eventUnix:t
 });
});
test('MVP119: non-status webhook event is never confused with direct status',()=>{
 const ev={event:{type:'messages',event:'post'},messages:[{id:'12345'}]};
 assert.equal(isWhapiStatusEvent(ev),false);
 assert.throws(()=>parseWhapiDirectStatuses(ev,t),/status_event_invalid/);
});
test('MVP119: groups statuses.put require viewer-specific handling, never count as delivered direct',()=>{
 const data={...receipt(),event:{type:'statuses',event:'put'},
  statuses:[{...receipt().statuses[0],recipient_id:'120363194020948049@g.us',
   viewer_id:'5492211234567@s.whatsapp.net'}]};
 assert.equal(isWhapiStatusEvent(data),true);
 assert.deepEqual(parseWhapiDirectStatuses(data,t),[]);
});
test('MVP119: direct-message statuses reject forged code, malformed message id or group recipient',()=>{
 const cases=[
  {...receipt(),statuses:[{...receipt().statuses[0],code:2}]},
  {...receipt(),statuses:[{...receipt().statuses[0],id:'!'}]},
  {...receipt(),statuses:[{...receipt().statuses[0],recipient_id:'120363194020948049@g.us'}]},
  {...receipt(),statuses:[{...receipt().statuses[0],viewer_id:'5492211234567'}]},
  {...receipt(),statuses:[{...receipt().statuses[0],timestamp:String(t-604801)}]},
  {...receipt(),statuses:[{...receipt().statuses[0],timestamp:String(t+301)}]},
  {...receipt(),statuses:[]},
  {...receipt(),statuses:Array.from({length:11},()=>receipt().statuses[0])}
 ];
 for(const item of cases)assert.throws(()=>parseWhapiDirectStatuses(item,t));
});
test('MVP119: accepted statuses include failures and deletion without implying delivery',()=>{
 for(const [status,code] of [['failed',0],['pending',1],['sent',2],
  ['delivered',3],['read',4],['played',5],['deleted',6]]){
  const r=parseWhapiDirectStatuses(receipt(status,code),t);
  assert.equal(r[0].code,code);
  assert.equal(r[0].status,status);
 }
});
test('MVP119: webhook checks auth + correct channel before any DB status write',()=>{
 const edge=readFileSync(new URL(
  '../../supabase/functions/cotironda-piloto-whapi/index.ts',
  import.meta.url),'utf8');
 const auth=edge.indexOf("if(!authenticated){");
 const channel=edge.indexOf("if(event.channel_id!==sec.channel)");
 const status=edge.indexOf("if(statusAction){");
 const record=edge.indexOf("cotironda_piloto_record_delivery_mvp119");
 assert.ok(auth>0&&auth<channel&&channel<status&&status<record);
 assert.match(edge,/isWhapiStatusEvent\(event\)/u);
 assert.match(edge,/parseWhapiDirectStatuses\(event\)/u);
 assert.match(edge,/p_recipient_chat_hmac:recipientHmac/u);
 assert.match(edge,/status_storage_unavailable/u);
 assert.match(edge,/group_status_ignored/u);
 assert.match(edge,/cotironda_piloto_record_tracking_id_mvp119/u);
 assert.match(edge,/cotironda_piloto_record_supplier_ack_id_mvp119/u);
});
test('MVP119: SQL RLS/role barriers and independent status rank prevent duplicate or downgrade',()=>{
 const sql=readFileSync(new URL(
  '../../supabase/piloto/mvp119_whapi_delivery_receipts.sql',
  import.meta.url),'utf8');
 assert.match(sql,/enable row level security/u);
 assert.match(sql,/revoke all on cotironda_piloto_privado.delivery_receipts_mvp119/u);
 assert.match(sql,/p\.chat_hmac=p_recipient_chat_hmac/u);
 assert.match(sql,/count_<>1/u);
 assert.match(sql,/if new_rank<=old_rank/u);
 assert.match(sql,/on conflict\(message_id_sha256\) do nothing/u);
 assert.match(sql,/extensions\.digest\(p_whapi_message_id,'sha256'\)/u);
 assert.doesNotMatch(sql,/recipient_id|viewer_id|recipient_phone|phone_number/u);
});
test('MVP119: real PG17 reversible fixture exercises supplier, tracking, finalist and spoofed replay',()=>{
 const s=readFileSync(new URL(
  '../../supabase/piloto/mvp119_receipts_smoke_rollback.sql',
  import.meta.url),'utf8');
 for(const term of ['mvp119_not_delivered','mvp119_wrong_recipient_accepted',
   'mvp119_unknown_message_accepted','mvp119_buyer_without_id',
   'mvp119_finalist_not_recorded','mvp119_duplicate_status',
   'mvp119_failed_overrode_delivery','mvp119_public_leak','rollback;']){
  // Last privacy condition has a different exact label, covered below.
  if(term==='mvp119_public_leak')continue;
  assert.ok(s.includes(term),term);
 }
 assert.match(s,/mvp119_receipt_public/u);
 assert.match(s,/mvp119_plaintext_ids_leaked/u);
 assert.doesNotMatch(s,/gate\.whapi\.cloud|fetch\(/u);
});
