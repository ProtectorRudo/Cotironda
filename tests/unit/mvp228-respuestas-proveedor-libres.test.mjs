import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const edge=readFileSync(new URL('../../supabase/functions/cotironda-piloto-whapi/index.ts',import.meta.url),'utf8');
const sql=readFileSync(new URL('../../supabase/piloto/mvp228_proteger_respuestas_libres_ia_central.sql',import.meta.url),'utf8');

test('MVP228: proveedor IA se verifica independientemente de activar nueva IA de comprador',()=>{
 assert.match(edge,/let centralSupplier=false;\s*if\(!webLinkCode\)\{/u);
 assert.doesNotMatch(edge,/if\(centralConfigured&&supplierKnown&&row\.type==='text'\)/u);
 assert.match(edge,/p_city:supplierQuotedId\|\|centralSupplier/u);
 assert.match(sql,/j\.state IN\('pending','leased','api_accepted','uncertain'\)/u);
 assert.doesNotMatch(sql,/ai_central_control_mvp226/u);
});
test('MVP228: presupuesto libre sin $ o con abreviaciones se vincula si la ronda es única',()=>{
 assert.match(edge,/\['unmatched_quote','needs_review'\]\.includes\(outcome\(out\.data\)\)/u);
 assert.match(edge,/row\.type==='text'&&centralSupplier&&/u);
 assert.match(edge,/cotironda_piloto_ia_link_supplier_mvp225/u);
 assert.match(edge,/p_original_text:body/u);
 assert.match(edge,/trial\.quote_link===true/u);
 assert.match(edge,/cotironda_piloto_ia_trial_flags_mvp229/u);
 assert.match(edge,/if\(!quotedId&&verifiedSupplier&&!centralSupplier\)/u);
});
test('MVP228: datos personales y fuente económica permanecen en tablas privadas',()=>{
 assert.match(sql,/REVOKE ALL ON FUNCTION/u);
 assert.match(sql,/FROM PUBLIC,anon,authenticated/u);
 assert.match(sql,/TO service_role/u);
 assert.doesNotMatch(sql,/DROP TABLE|ALTER TABLE.*DISABLE ROW LEVEL SECURITY/iu);
});
