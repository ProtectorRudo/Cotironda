import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildOperatorGateSql} from '../../scripts/piloto/mvp285-operator-gate-builder.mjs';
const source=readFileSync(new URL(
 '../../supabase/functions/cotironda-piloto-whapi/index.ts',import.meta.url),'utf8');
const ddl=readFileSync(new URL(
 '../../supabase/piloto/mvp285_piloto_revision_operador_sql_gate.sql',import.meta.url),'utf8');
test('operador SQL predeterminado OFF y sin permiso público',()=>{
 assert.match(ddl,/enabled boolean NOT NULL DEFAULT false/);
 assert.match(ddl,/GRANT EXECUTE ON FUNCTION[\s\S]*TO service_role/);
 assert.match(ddl,/REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC,anon,authenticated/);
 assert.match(ddl,/v_trial->>'buyer'='true'/);
 assert.match(ddl,/v_trial->>'dispatch'='true'/);
 assert.match(ddl,/p.key='arquitecto'/);
});
test('webhook usa autorización SQL independiente de entorno en las tres acciones',()=>{
 assert.match(source,/cotironda_piloto_ia_review_launch_mvp285/);
 assert.match(source,/allowBuyerReview/);
 assert.match(source,/allowBuyerConfirmation/);
 assert.match(source,/allowBuyerRelease/);
 assert.match(source,/if\(operator.error\|\|!operator.data/);
 assert.match(source,/value===undefined\|\|value==='true'/);
 assert.match(source,/reviewGate\.send===true/);
 assert.match(source,/reviewGate\.confirm===true/);
 assert.match(source,/reviewGate\.release===true/);
 assert.match(source,/!allowBuyerReview/);
 assert.match(source,/&&allowBuyerRelease/);
});
test('21 migraciones, escenario y operador se ejecutan antes del rollback',()=>{
 const s=buildOperatorGateSql();
 const i=s.indexOf('\\ir ./mvp284-roundtrip-e2e-pg17.sql');
 const j=s.indexOf('\\ir ../../piloto/mvp285_piloto_revision_operador_sql_gate.sql');
 const k=s.indexOf('\\ir ./mvp285-operator-gates-pg17.sql');
 const end=s.indexOf('\nROLLBACK;\nSELECT');
 assert.ok(i>0&&j>i&&k>j&&end>k);
 assert.equal(s.split(/^ROLLBACK;\s*$/gm).length,2);
});

test('comprador IA activo jamás cae al envío automático documental legacy',()=>{
 const pos=source.indexOf("'cotironda_piloto_plan_document_mvp098'");
 assert.ok(pos>0);
 const guard=source.slice(pos-570,pos);
 assert.match(guard,/else if\(centralConfigured\|\|/u);
 assert.match(guard,/COTIRONDA_PILOT_BUYER_REVIEW_REQUIRED_ENABLED/u);
 assert.match(guard,/independent_source_required/u);
});
