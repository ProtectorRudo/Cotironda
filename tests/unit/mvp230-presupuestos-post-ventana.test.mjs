import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../../supabase/piloto/mvp230_respuestas_proveedor_tras_vencimiento.sql',import.meta.url),'utf8');
const edge=readFileSync(new URL('../../supabase/functions/cotironda-piloto-whapi/index.ts',import.meta.url),'utf8');

test('MVP230: expira creación/envío pero deja respuestas de PDF Whapi aceptado',()=>{
 assert.match(sql,/v_buyer:=coalesce\(v_trial,false\)/u);
 assert.match(sql,/v_dispatch:=v_buyer/u);
 assert.match(sql,/j\.state='api_accepted'/u);
 assert.match(sql,/j\.finished_at IS NOT NULL/u);
 assert.match(sql,/r\.closes_at>clock_timestamp\(\)/u);
 assert.match(sql,/WHEN v_supplier THEN 'reply_only'/u);
 assert.doesNotMatch(sql,/j\.state IN\('pending','leased','api_accepted'\)/u);
});
test('MVP230: texto libre y archivo siguen asociados tras vencimiento',()=>{
 assert.match(edge,/const centralConfigured=sec\.outbound&&trialActive&&trial\.buyer===true/u);
 assert.match(edge,/\['unmatched_quote','needs_review'\]\.includes\(outcome\(out\.data\)\)/u);
 assert.match(edge,/!legacySupplierQuoteLinked&&\s*trial\.quote_link===true/u);
 assert.match(edge,/if\(trial\.quote_analysis===true\)/u);
 assert.match(edge,/if\(status==='stored'&&centralSupplier&&\s*trial\.quote_link===true\)/u);
 assert.doesNotMatch(edge,/trialActive&&trial\.quote_link===true/u);
 assert.doesNotMatch(edge,/trialActive&&trial\.quote_analysis===true/u);
});
test('MVP230: identidades/ACL no se relajan tras el cierre',()=>{
 assert.match(sql,/p\.key='arquitecto'/u);
 assert.match(sql,/p\.key IN\('corralon_ailin','corralon_nahuel'\)/u);
 assert.match(sql,/buyer\.opted_out_at IS NULL/u);
 assert.match(sql,/p\.consent_at IS NOT NULL/u);
 assert.match(sql,/REVOKE ALL ON FUNCTION/u);
 assert.match(sql,/FROM PUBLIC,anon,authenticated/u);
 assert.match(sql,/TO service_role/u);
 assert.doesNotMatch(sql,/DROP TABLE|DISABLE ROW LEVEL SECURITY/iu);
});
