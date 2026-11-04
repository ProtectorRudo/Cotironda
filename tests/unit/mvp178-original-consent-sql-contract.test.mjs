import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const sql=readFileSync(new URL("../../supabase/piloto/mvp178_original_share_consent_private.sql",import.meta.url),"utf8");
const guard=readFileSync(new URL("../../src/domain/descarga-originales-mvp161.ts",import.meta.url),"utf8");

test("MVP178: policy is disabled and never activates itself",()=>{
 assert.match(sql,/enabled boolean not null default false/i);
 assert.match(sql,/values\s*\(true,false,null\)/i);
 assert.doesNotMatch(sql,/values\s*\(true,true,/i);
});
test("MVP178: no publicly readable consent records",()=>{
 for(const table of ["original_share_policy_mvp178","original_share_consents_mvp178"]){
  assert.match(sql,new RegExp("alter table cotironda_piloto_privado\\."+table+"\\s+enable row level security","i"));
  assert.match(sql,new RegExp("revoke all on cotironda_piloto_privado\\."+table+"\\s+from public,anon,authenticated,service_role","i"));
 }
});
test("MVP178: historic rounds and expired consent cannot pass preflight",()=>{
 assert.match(sql,/r\.created_at>pol\.activated_at/i);
 assert.match(sql,/c\.accepted_at>=pol\.activated_at/i);
 assert.match(sql,/pol\.enabled=true/i);
 assert.match(sql,/c\.revoked_at is null/i);
});
test("MVP178: closed round after deadline only, not before",()=>{
 assert.match(sql,/r\.state='closed'/i);
 assert.match(sql,/r\.closed_at>=r\.closes_at/i);
 assert.match(sql,/clock_timestamp\(\)>=r\.closed_at/i);
});
test("MVP178: consent evidence belongs to the same invited supplier",()=>{
 assert.match(sql,/i\.request_id=c\.request_id and i\.supplier_key=c\.supplier_key/i);
 assert.match(sql,/i\.created_at>=c\.accepted_at/i);
 assert.match(sql,/msg\.participant_key=c\.supplier_key/i);
 assert.match(sql,/msg\.received_at=c\.accepted_at/i);
 assert.match(sql,/msg\.message_hmac=c\.consent_message_hmac/i);
});
test("MVP178: only service role can call the PRIVATE preflight",()=>{
 assert.match(sql,/security definer set search_path=''/i);
 assert.match(sql,/from public,anon,authenticated,service_role/i);
 assert.match(sql,/grant execute on function public\.cotironda_piloto_original_consent_preflight_mvp178\(uuid,text\)\s+to service_role/i);
});
test("MVP178: consent checker alone cannot release a storage document",()=>{
 assert.match(sql,/returns boolean/i);
 assert.doesNotMatch(sql,/createSignedUrl|signed_url|storage\.objects|https?:\/\//i);
 assert.match(guard,/s\.autenticada!==true/);
 assert.match(guard,/a\.sha256!==p\.sha256/);
 assert.match(guard,/c\.revocadoMs!==null/);
});
test("MVP178: consent is independent from contact disclosure",()=>{
 assert.match(sql,/original_identificable_tras_cierre/);
 assert.match(sql,/cotironda-originales-v1/);
 assert.doesNotMatch(sql,/contact_reveal_consents_mvp109|finalist_activation_mvp113|whapi_send/i);
});
