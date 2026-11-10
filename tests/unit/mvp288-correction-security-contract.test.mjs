import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildFidelityCorrectionSql} from '../../scripts/piloto/mvp288-fidelity-correction-builder.mjs';
import {componerRevisionCompradorMvp279} from
 '../../supabase/functions/cotironda-piloto-whapi/ai-central-buyer-review-mvp279.ts';
test('MVP288 SQL references exact buyer confirmation code and atomically revokes old',()=>{
 const sql=readFileSync(new URL('../../supabase/piloto/mvp288_correccion_segura_con_revision_vinculada.sql',import.meta.url),'utf8');
 assert.match(sql,/old_review\.code_sha256=encode\(sha256\(convert_to/u);
 assert.match(sql,/old_review\.buyer_key=r\.buyer_key/u);
 assert.match(sql,/old_review\.chat_hmac=r\.chat_hmac/u);
 assert.match(sql,/old_review\.state='api_accepted'/u);
 assert.match(sql,/older\.state='draft'/u);
 assert.match(sql,/job\.request_id=older\.id/u);
 assert.match(sql,/expires_at=issued_at/u);
 assert.match(sql,/old_request_id,new_request_id,buyer_key/u);
 assert.match(sql,/RAISE EXCEPTION 'mvp288_old_review_race_requires_rollback'/u);
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/u);
 assert.match(sql,/TO service_role/u);
 assert.doesNotMatch(sql,/^\s*COMMIT\b/mi);
 assert.doesNotMatch(sql,/http_post|net\.http_post|messages\/text/u);
});
test('MVP288 preview instructs complete linked correction not vague partial edit',()=>{
 const text=componerRevisionCompradorMvp279({
  state:'issued',request_id:'00000000-0000-4000-8000-000000000001',
  code:'832F06B3F76149FB',city:'La Plata',note:null,
  items_count:1,items:[{
   lineNo:1,description:'bolsas de cemento CPC de 50 kg',
   quantity:'20.000',unit:'bag',rubro:'obra_gruesa'
  }]
 });
 assert.match(text,/CORREGIR COTI 832F06B3F76149FB: <pedido completo corregido>/u);
 assert.match(text,/20 bolsas — cemento CPC de 50 kg/u);
 assert.doesNotMatch(text,/20\.000|20 bag/u);
});
test('MVP288 CI one PostgreSQL 17 rollback with all preceding versions',()=>{
 const sql=buildFidelityCorrectionSql();
 const prior=sql.indexOf('\\ir ../../piloto/mvp287_receipt_avisos_whapi.sql');
 const migration=sql.indexOf('\\ir ../../piloto/mvp288_correccion_segura_con_revision_vinculada.sql');
 const checks=sql.indexOf('\\ir ./mvp288-material-correction-pg17.sql');
 const rollback=sql.indexOf('\nROLLBACK;\nSELECT');
 assert.ok(prior>0&&migration>prior&&checks>migration&&rollback>checks);
 assert.equal(sql.split(/^ROLLBACK;\s*$/gm).length,2);
});
