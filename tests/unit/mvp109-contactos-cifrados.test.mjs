import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL(
 '../../supabase/piloto/mvp109_encrypted_contacts_consents.sql',
 import.meta.url),'utf8');
const edge=readFileSync(new URL(
 '../../supabase/functions/cotironda-piloto-whapi/index.ts',
 import.meta.url),'utf8');
const smoke=readFileSync(new URL(
 '../../supabase/piloto/mvp109_smoke_rollback.sql',
 import.meta.url),'utf8');
test('MVP109: encrypted contact binding only after authenticated inbox and consent',()=>{
 assert.match(edge,/cotironda_piloto_bind_contact_mvp109/);
 assert.match(edge,/cotironda_piloto_contact_command_mvp109/);
 assert.match(edge,/chatHash\+'\|cotironda-contact-v1'/);
 assert.match(edge,/\^\[1-9\]\[0-9\]\{7,16\}@s/);
 assert.match(edge,/COTI CONTACTOS \(SI\|NO\)/);
 assert.ok(edge.indexOf('cotironda_piloto_contact_command_mvp109')<
    edge.indexOf('cotironda_piloto_receive_whapi_v1'));
 assert.match(sql,/m\.message_hmac=p_message_hmac and m\.chat_hmac=p_chat_hmac/);
 assert.match(sql,/p\.consent_at is not null and p\.opted_out_at is null/);
 assert.match(sql,/identity_conflict/);
 assert.match(sql,/participant_channels_mvp109\s+enable row level security/);
 assert.match(sql,/contact_reveal_consents_mvp109\s+enable row level security/);
 assert.match(sql,/from public,anon,authenticated,service_role/);
 assert.match(sql,/before update or delete/);
});
test('MVP109: consent commands never create supplier quote or bypass end time',()=>{
 assert.match(sql,/COTI CONTACTOS SI/);
 assert.match(sql,/COTI CONTACTOS NO/);
 assert.match(sql,/extensions\.digest/);
 assert.match(sql,/revoked_at is null/);
 assert.match(sql,/r[q]?\.closes_at<=clock_timestamp\(\)/);
 assert.match(sql,/plan\.state in/);
 assert.match(sql,/consent_or_contact_missing/);
 assert.match(sql,/messages_sent',false/);
 assert.doesNotMatch(sql,/insert into cotironda_piloto_privado\.offer_versions/);
 assert.doesNotMatch(sql,/http_post|pg_net|gate\.whapi\.cloud/);
});
test('MVP109: reversible SQL covers opt-in, audit, tamper and withdrawal',()=>{
 for(const s of ['mvp109_unconsented_contact_available','mvp109_valid_consent_refused',
   'mvp109_consent_command_replayed','mvp109_contact_identity_mutable',
   'mvp109_private_contacts_unavailable','mvp109_revocation_not_effective',
   'mvp109_plaintext_leaked','mvp109_exposed_contact','rollback;'])
   assert.ok(smoke.includes(s),s);
});
test('MVP109: AES-GCM authenticated-data binding prevents moving encrypted contact to another chat',async()=>{
 const key=await crypto.subtle.importKey('raw',new Uint8Array(32).fill(9),
   'AES-GCM',false,['encrypt','decrypt']);
 const iv=new Uint8Array(12).fill(7),text='5491111111111@s.whatsapp.net';
 const aad=new TextEncoder().encode('chat-hash-A|cotironda-contact-v1');
 const cipher=await crypto.subtle.encrypt(
   {name:'AES-GCM',iv,additionalData:aad},key,new TextEncoder().encode(text));
 const original=await crypto.subtle.decrypt(
   {name:'AES-GCM',iv,additionalData:aad},key,cipher);
 assert.equal(new TextDecoder().decode(original),text);
 await assert.rejects(crypto.subtle.decrypt(
   {name:'AES-GCM',iv,additionalData:new TextEncoder().encode(
   'chat-hash-B|cotironda-contact-v1')},key,cipher));
});
