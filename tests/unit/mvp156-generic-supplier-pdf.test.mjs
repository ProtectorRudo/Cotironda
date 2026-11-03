import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../../supabase/piloto/mvp156_generic_supplier_pdf_matching.sql',import.meta.url),'utf8');
test('MVP156: vínculo basado en dos o más familias distintas y sus cantidades reales',()=>{
 assert.match(sql,/count\(distinct split_part\(l2\.family_code,'_',1\)\)/u);
 assert.match(sql,/join products p2 on p2.quantity=l2.quantity and not p2.extra/u);
 assert.match(sql,/p.quantity=l.quantity/u);
 assert.match(sql,/>=2/u);
 assert.match(sql,/candidate_count<>1/u);
});
test('MVP156: no inferir material equivalente a partir de nombre genérico',()=>{
 for(const x of ['arena_fina','arena_gruesa','piedra_partida','cemento_gris_obra'])
  assert.ok(sql.includes(x),x);
 assert.match(sql,/gruesa\(\$\|\[\^a-z\]\)/u);
 assert.match(sql,/laja\|rodada\|rodado/u);
 assert.doesNotMatch(sql,/set .*family_code|update .*request_lines|update .*unit|update .*quantity/iu);
});
test('MVP156: documentos con separadores ambiguos no se reinterpretan',()=>{
 assert.match(sql,/\[0-9\]\{1,2\}/u);
 assert.match(sql,/replace\(x->>'quantity',',','\.'\)::numeric/u);
 assert.match(sql,/else null/u);
});
test('MVP156: conservar identidad, privacidad y ausencia de envío/confirmaciones',()=>{
 for(const x of [
  "a.request_id is null and inbox.request_id is null",
  "supplier.chat_hmac=a.chat_hmac",
  "a.content_sha256 ~ '^[a-f0-9]{64}$'",
  "a.state='stored' and a.review_state='suggested_only'",
  "o.state='api_accepted' and o.whapi_message_id is not null",
  "r.state='prepared' and r.closes_at>clock_timestamp()",
  "from public,anon,authenticated;",
  "to service_role;"
 ])assert.ok(sql.includes(x),x);
 assert.doesNotMatch(sql,/messages\/document|gate\.whapi|delete from|truncate/u);
});
