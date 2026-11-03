import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseBuyerPilot,canPrepareBuyerPilot,standaloneDeliveryCity}
 from '../../supabase/functions/cotironda-piloto-whapi/core.ts';

const sql=readFileSync(new URL(
 '../../supabase/piloto/mvp122_text_zone_context.sql',import.meta.url),'utf8');
const edge=readFileSync(new URL(
 '../../supabase/functions/cotironda-piloto-whapi/index.ts',import.meta.url),'utf8');

test('MVP122: WhatsApp split request retains exact source quantities',()=>{
 const original='Hola, necesito cotizar 20 bolsas de cemento CPC 50 kg y 5 litros de hidrófugo.';
 const previous=parseBuyerPilot(original);
 const city=standaloneDeliveryCity('Entrega: La Plata');
 assert.equal(previous.city,null);
 assert.deepEqual(previous.unresolved,[]);
 assert.equal(previous.items.length,2);
 assert.deepEqual(previous.items.map(i=>[i.quantity,i.unit,i.family]),[
  [20,'bag','cemento_gris_obra'],[5,'l','hidrofugo']
 ]);
 assert.equal(city,'La Plata');
 assert.equal(canPrepareBuyerPilot({...previous,city}),true);
});

test('MVP122: never fill an already given or conflicting city',()=>{
 const original=parseBuyerPilot('20 bolsas cemento CPC 50 kg. Entrega: Berisso');
 assert.equal(original.city,'Berisso');
 assert.notEqual(original.city,null);
 assert.equal(standaloneDeliveryCity('20 bolsas cemento'),null);
 assert.equal(standaloneDeliveryCity('Hola Cotironda'),null);
});

test('MVP122: SQL binds reply to authenticated same buyer and unique accepted zone question',()=>{
 assert.match(sql,/p\.participant_role='buyer'/u);
 assert.match(sql,/p\.opted_out_at is null/u);
 assert.match(sql,/src\.chat_hmac=p_chat_hmac/u);
 assert.match(sql,/reply\.reply_code='zone' and reply\.state='api_accepted'/u);
 assert.match(sql,/v_n<>1/u);
 assert.match(sql,/ambiguous_pending_text/u);
 assert.match(sql,/src\.received_at<v_reply\.received_at/u);
 assert.match(sql,/p_reply_hmac/u);
 assert.match(sql,/extensions\.digest\(p_original_text,'sha256'\)/u);
 assert.match(sql,/on conflict\(source_hmac\) do nothing/u);
 assert.match(sql,/candidate_suppliers/u);
 assert.match(sql,/processing_state='recorded'/u);
});

test('MVP122: decrypt authenticated archived source and strictly validate before creating round',()=>{
 assert.match(edge,/const aes=await crypto\.subtle\.importKey\('raw',new Uint8Array\(rawAes\)\.buffer,'AES-GCM',false,\['encrypt','decrypt'\]\)/u);
 assert.match(edge,/crypto\.subtle\.decrypt\(/u);
 assert.match(edge,/chatHash\+'\|'\+source\.source_hmac\+'\|text'/u);
 assert.match(edge,/await sha\(original\)===source\.sha256/u);
 assert.match(edge,/const prior=parseBuyerPilot\(original\)/u);
 assert.match(edge,/prior\.city===null&&canPrepareBuyerPilot\(completed\)/u);
 assert.match(edge,/cotironda_piloto_complete_text_zone_mvp122/u);
 assert.match(edge,/preparedDocumentSourceHmac=source\.source_hmac/u);
 assert.match(edge,/linked\.data\?\.state==='no_pending_document'/u);
 assert.doesNotMatch(sql,/\b(?:pg_net|http_post|dblink)\b/iu);
});

test('MVP122: only backend can call context RPC and source stays immutable',()=>{
 assert.match(sql,/revoke all on function public\.cotironda_piloto_text_zone_candidate_mvp122\(text,text\)/u);
 assert.match(sql,/revoke all on function public\.cotironda_piloto_complete_text_zone_mvp122\(/u);
 assert.match(sql,/grant execute on function public\.cotironda_piloto_complete_text_zone_mvp122\([\s\S]+?to service_role;/u);
 assert.match(sql,/values\(v_key,btrim\(p_city\),p_original_text,p_source_hmac,'prepared'\)/u);
 assert.doesNotMatch(sql,/grant execute [\s\S]*?to (?:anon|authenticated);/iu);
});