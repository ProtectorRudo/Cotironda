import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../../supabase/piloto/mvp155_autolink_unquoted_supplier_media.sql',import.meta.url),'utf8');
const edge=readFileSync(new URL('../../supabase/functions/cotironda-piloto-whapi/index.ts',import.meta.url),'utf8');
test('MVP155: vincular un archivo al pedido único, nunca a la ronda más reciente',()=>{
 assert.match(sql,/from candidates/u);
 assert.match(sql,/candidate_count<>1/u);
 assert.match(sql,/candidate_count>1 then 'ambiguous'/u);
 assert.doesNotMatch(sql,/order by r\.created_at desc\s+limit 1/u);
});
test('MVP155: comprobar identidad, origen, catálogo, plazo y envío verdadero',()=>{
 for(const fragment of [
  "inbox.message_hmac=a.message_hmac",
  "supplier.chat_hmac=a.chat_hmac",
  "inbox.processing_state='needs_review'",
  "a.state='stored' and a.review_state='suggested_only'",
  "a.ai_reserved_at is not null",
  "a.storage_path='media/'||a.message_hmac",
  "o.state='api_accepted'",
  "o.whapi_message_id is not null",
  "o.sent_at<=source.reserved_at",
  "r.closes_at>clock_timestamp()",
  "c.recognition_state='curated_family'",
  "buyer.opted_out_at is null"
 ]) assert.ok(sql.includes(fragment),fragment);
});
test('MVP155: conservar pallets y fletes completos como renglones extras',()=>{
 assert.match(sql,/pallets\?/u);assert.match(sql,/flete\|transporte/u);
 assert.match(sql,/where not p\.extra/u);
 assert.doesNotMatch(sql,/delete from|truncate|update .*proposal=/iu);
});
test('MVP155: asociación tras borrador IA, antes del recibo de presupuesto',()=>{
 const a=edge.indexOf("}else if(proposal.kind==='supplier_quote')");
 const b=edge.indexOf('cotironda_piloto_autolink_unquoted_media_mvp155',a);
 const c=edge.indexOf('cotironda_piloto_record_supplier_media_mvp098',a);
 assert.ok(a>=0&&b>a&&c>b);
 assert.match(edge,/if\(!quotedId&&verifiedSupplier&&!centralSupplier\)/u);
});
test('MVP155: acceso privado y no publicar resultados comerciales por atribución',()=>{
 assert.match(sql,/security definer set search_path=''/u);
 assert.match(sql,/from public,anon,authenticated;/u);
 assert.match(sql,/to service_role;/u);
 assert.doesNotMatch(sql,/cotironda_piloto_publish|cotironda_piloto_claim_whapi|messages\/document/u);
});
