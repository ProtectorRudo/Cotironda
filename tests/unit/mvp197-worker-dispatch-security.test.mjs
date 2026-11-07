import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const worker=readFileSync(new URL(
 '../../supabase/functions/cotironda-piloto-finalistas/index.ts',import.meta.url),'utf8');
const sql=readFileSync(new URL(
 '../../supabase/piloto/mvp196_commercial_finalists_source_plan_off.sql',
 import.meta.url),'utf8');
const planning=readFileSync(new URL(
 '../../supabase/functions/cotironda-piloto-finalistas/plan-only-mvp197.ts',
 import.meta.url),'utf8');

test('MVP197: con despacho OFF, planificador se ejecuta antes de acceder al token Whapi',()=>{
 const at=(s)=>worker.indexOf(s);
 const auth=at('const mode=await verificarModoWorkerMvp209(');
 const database=at('const db=createClient(');
 const plans=at('const planned=await prepararPlanesPrivadosMvp197(');
 const dispatch=at("if(Deno.env.get('COTIRONDA_PILOT_FINALIST_DISPATCH_MVP196_ENABLED')!=='true')");
 const outbound=at("if(Deno.env.get('COTIRONDA_PILOT_WHAPI_OUTBOUND_ENABLED')!=='true')");
 const token=at("const token=Deno.env.get('COTIRONDA_PILOT_WHAPI_TOKEN')");
 const aes=at("const aes=await crypto.subtle.importKey");
 const network=at("fetch('https://gate.whapi.cloud/messages/text'");
 assert.ok(auth>0&&database>auth&&plans>database&&dispatch>plans&&
  outbound>dispatch&&token>outbound&&aes>token&&network>aes);
 assert.match(worker,/state:'planned_no_whatsapp'|JSON\.stringify\(planned\)/);
 assert.doesNotMatch(planning,/WHAPI_TOKEN|WHAPI_OUTBOUND|gate\.whapi\.cloud|decodeContacts|prepareMessage/);
});
test('MVP197: la fuente vigente se recoteja en el último instante antes de enviar',()=>{
 const fn=sql.slice(sql.indexOf(
  'CREATE OR REPLACE FUNCTION public.cotironda_piloto_source_plan_sendable_mvp196'),
  sql.indexOf('REVOKE ALL ON FUNCTION public.cotironda_piloto_source_plan_sendable_mvp196'));
 for(const term of [
  'cotironda_piloto_private_round_inputs_mvp172',
  "v_snapshot->>'state'<>'private_inputs'",
  'supplier.opted_out_at IS NULL',
  'buyer.opted_out_at IS NULL',
  'supplier_media_quotes_mvp098 newer',
  'offer_versions later',
  'newer.received_at<=r.closes_at',
  "current_->'doc'->>'sourceSha256'=src.sha",
  "current_->'doc'->'prueba'->>'version'='9'",
  "current_->'doc'->'prueba'->>'revisionVigente'='true'",
  'proof.verifier_version=196',
  "r.state='closed'",
  'r.created_at>=a.activated_at'
 ])assert.ok(fn.includes(term),term);
 assert.match(sql,/AND public\.cotironda_piloto_source_plan_sendable_mvp196\(req\.id\)/);
 assert.match(worker,/if\(v196\.error\|\|v196\.data!==true\)/);
});
