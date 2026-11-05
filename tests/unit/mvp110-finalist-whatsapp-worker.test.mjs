import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodeContacts,prepareMessage,hex} from
 '../../supabase/functions/_shared/cotironda-finalist-notice.ts';

const sql=readFileSync(new URL('../../supabase/piloto/mvp110_finalists_whapi_outbox.sql',import.meta.url),'utf8');
const smoke=readFileSync(new URL('../../supabase/piloto/mvp110_smoke_rollback.sql',import.meta.url),'utf8');
const worker=readFileSync(new URL('../../supabase/functions/cotironda-piloto-finalistas/index.ts',import.meta.url),'utf8');
const workflow=readFileSync(new URL('../../.github/workflows/cotironda-piloto-finalistas.yml',import.meta.url),'utf8');
const enc=new TextEncoder();

async function fixture(){
 const aes=await crypto.subtle.importKey('raw',new Uint8Array(32).fill(17),
  'AES-GCM',false,['encrypt','decrypt']);
 const hmac=await crypto.subtle.importKey('raw',new Uint8Array(32).fill(23),
  {name:'HMAC',hash:'SHA-256'},false,['sign']);
 const channel='pilot-test';
 const src=[['arquitecto','buyer','5492211111111'],
  ['corralon_ailin','supplier','5492212222222'],
  ['corralon_nahuel','supplier','5492213333333']];
 const contacts=[];
 for(const [participant_key,role,num] of src){
  const address=num+'@s.whatsapp.net';
  const sig=await crypto.subtle.sign('HMAC',hmac,
   enc.encode('cotironda|pilot|chat|'+channel+'|'+address));
  const chat_hmac=Buffer.from(sig).toString('hex');
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const cipher=await crypto.subtle.encrypt({
   name:'AES-GCM',iv,
   additionalData:enc.encode(chat_hmac+'|cotironda-contact-v1')
  },aes,enc.encode(address));
  contacts.push({participant_key,role,chat_hmac,
    nonce_b64:Buffer.from(iv).toString('base64'),
    ciphertext_b64:Buffer.from(cipher).toString('base64')});
 }
 return {aes,hmac,channel,contacts};
}
const authorization={
 state:'authorized',recipient_key:'arquitecto',buyer_key:'arquitecto',
 supplier_keys:['corralon_ailin','corralon_nahuel'],
 labels:{arquitecto:'Arquitecto',corralon_ailin:'Comercio A',corralon_nahuel:'Comercio B'},
 price_ranked:false
};
test('MVP110: real AES/HMAC validation and confidential WhatsApp recipients',async()=>{
 const data=await fixture();
 const contacts=await decodeContacts(
  {contacts_encrypted:data.contacts},data.aes,data.hmac,data.channel);
 assert.equal(contacts.length,3);
 assert.equal(contacts[0].phone,'5492211111111');
 const buyerMessage=prepareMessage(authorization,contacts);
 assert.equal(buyerMessage.to,'5492211111111');
 assert.match(buyerMessage.body,/Comercio A · WhatsApp: 5492212222222/);
 assert.match(buyerMessage.body,/Comercio B · WhatsApp: 5492213333333/);
 assert.match(buyerMessage.body,/No están ordenadas por menor precio/);
 const business=prepareMessage({...authorization,recipient_key:'corralon_ailin'},contacts);
 assert.equal(business.to,'5492212222222');
 assert.match(business.body,/Contacto del comprador: Arquitecto · WhatsApp: 5492211111111/);
 assert.doesNotMatch(business.body,/5492213333333/);
 assert.equal(hex('a'.repeat(64)).length,32);
 assert.equal(hex('nothex'),null);
});
test('MVP110: cannot decrypt if AAD chat or ciphertext was moved',async()=>{
 const d=await fixture();
 const tampered=d.contacts.map(x=>({...x}));
 tampered[0].chat_hmac=tampered[1].chat_hmac;
 await assert.rejects(decodeContacts(
  {contacts_encrypted:tampered},d.aes,d.hmac,d.channel));
 const changed=d.contacts.map(x=>({...x}));
 changed[0].nonce_b64=changed[1].nonce_b64;
 await assert.rejects(decodeContacts(
  {contacts_encrypted:changed},d.aes,d.hmac,d.channel));
});
test('MVP110: identity, business list and label tampering never creates a send',async()=>{
 const d=await fixture();
 const contacts=await decodeContacts(
  {contacts_encrypted:d.contacts},d.aes,d.hmac,d.channel);
 assert.throws(()=>prepareMessage({...authorization,recipient_key:'intruso'},contacts));
 assert.throws(()=>prepareMessage({...authorization,
  supplier_keys:['corralon_ailin','corralon_ailin']},contacts));
 assert.throws(()=>prepareMessage({...authorization,price_ranked:true},contacts));
 assert.throws(()=>prepareMessage({...authorization,
  labels:{...authorization.labels,corralon_ailin:'Comercio\nInyectado'}},contacts));
});
test('MVP110: SQL queue, one-time lease, consent recheck, terminal unknown response',()=>{
 for(const t of ['finalist_whapi_outbox_mvp110','whatsapp_outbound_enabled',
  'finalist_contacts_mvp109','candidate_count+1','on conflict do nothing',
  "state='pending'","state='leased'","'api_accepted'",
  'for update of o skip locked','contact_reveal_consents_mvp109',
  'consent_or_contact_missing','lease_token','to service_role',
  'enable row level security']){
  assert.ok(sql.includes(t),t);
 }
 assert.match(sql,/messages_sent',false/);
 assert.doesNotMatch(sql,/http_post|pg_net|https?:\/\/gate\.whapi\.cloud/i);
 for(const t of ['mvp110_no_consent_queued','mvp110_3_messages_not_queued',
  'mvp110_duplicate_queue','mvp110_wrong_lease_authorized',
  'mvp110_authorization_wrong','mvp110_double_finish',
  'mvp110_revoked_contact_was_authorized','mvp110_public_outbox_leak','rollback;']){
  assert.ok(smoke.includes(t),t);
 }
});
test('MVP110: network worker fail closed and no blind retries',()=>{
 assert.match(worker,/COTIRONDA_PILOT_FINALIST_WORKER_ENABLED/);
 assert.match(worker,/COTIRONDA_PILOT_FINALIST_WORKER_SECRET/);
 assert.match(worker,/cotironda_piloto_close_due_v1/);
 const planner=readFileSync(new URL(
  '../../supabase/functions/cotironda-piloto-finalistas/plan-only-mvp197.ts',
  import.meta.url),'utf8');
 assert.match(planner,/cotironda_piloto_commercial_due_mvp196/);
 assert.match(planner,/cotironda_piloto_commit_commercial_plan_mvp196/);
 assert.match(worker,/prepararPlanesPrivadosMvp197/);
 assert.match(worker,/COTIRONDA_PILOT_COMMERCIAL_SELECTOR_MVP196_ENABLED/);
 assert.match(worker,/COTIRONDA_PILOT_FINALIST_DISPATCH_MVP196_ENABLED/);
 assert.match(worker,/cotironda_piloto_source_plan_sendable_mvp196/);
 assert.equal(worker.includes("db.rpc('cotironda_piloto_prepare_finalists_due_mvp110'"),false);
 assert.match(worker,/cotironda_piloto_authorize_finalist_whapi_mvp110/);
 assert.match(worker,/cotironda_piloto_finish_finalist_whapi_mvp110/);
 assert.match(worker,/\.sent===true/);
 assert.match(worker,/AbortSignal\.timeout\(12000\)/);
 assert.match(worker,/catch\{\/\* no PII, no automatic retry/);
 assert.doesNotMatch(worker,/console\.log\(|console\.warn\(/);
 assert.match(workflow,/cron: '\*\/5 \* \* \* \*'/);
 assert.match(workflow,/vars\.COTIRONDA_PILOT_FINALIST_WORKER_ENABLED == 'true'/);
 assert.match(workflow,/--retry 0/);
});

test('MVP110: private buyer token unlocks finalist contacts only on closed consented round',()=>{
 const status=readFileSync(new URL(
  '../../supabase/piloto/mvp110_buyer_finalists_tracking.sql',import.meta.url),'utf8');
 const portal=readFileSync(new URL(
  '../../supabase/functions/cotironda-piloto-seguimiento/index.ts',import.meta.url),'utf8');
 for(const term of ['t.token_hash=p_token_hash','t.revoked_at is null',
  't.expires_at>clock_timestamp()',"req.state='closed'",
  'req.closes_at<=clock_timestamp()',"b.participant_role='buyer'",
  'b.consent_at is not null','b.opted_out_at is null',
  'cotironda_piloto_finalist_contacts_mvp109','to service_role']){
  assert.ok(status.includes(term),term);
 }
 assert.match(portal,/COTIRONDA_PILOT_FINALIST_VIEW_ENABLED/);
 assert.match(portal,/cotironda_piloto_tracking_finalists_mvp110/);
 assert.match(portal,/publicResult\?\.state==='closed'/);
 assert.match(portal,/decodeContacts\(finals\.data/);
 assert.match(portal,/publicResult=\{\.\.\.publicResult,finalists:list,/);
 assert.match(portal,/joint_supplier_coverage/);
 assert.match(portal,/targetFinalists\.replaceChildren\(\)/);
 assert.match(portal,/card\.textContent=finalist\.name/);
 assert.doesNotMatch(portal,/\binnerHTML\b/);
 for(const id of ['mvp110_premature_portal_contact_release',
  'mvp110_portal_reveal_not_authorized','mvp110_wrong_token_access_to_contacts',
  'mvp110_revoked_contact_visible_in_portal'])assert.ok(smoke.includes(id),id);
});
