import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseBuyerPilot} from '../../supabase/functions/cotironda-piloto-whapi/core.ts';
import {verifyAiBuyerSourceEvidence} from '../../supabase/functions/cotironda-piloto-whapi/ai-evidence.ts';
import {decidePilotAIAction} from '../../supabase/functions/cotironda-piloto-whapi/business-ai-policy.ts';
const source='Hola, ¿me cotizás 10 bolsas de cemento CPN 50 kg y 2 m³ de piedra partida?\nEntrega: La Plata';
const families=['cemento_gris_obra','piedra_partida','ladrillo_hueco'];
const proposal={intent:'quote_request',topic:'other',city:'La Plata',delivery_note:null,
 items:[{description:'cemento CPN 50 kg',quantity:'10',unit:'bag',family:'cemento_gris_obra',source_evidence:'10 bolsas de cemento CPN 50 kg'},
 {description:'piedra partida',quantity:'2',unit:'m3',family:'piedra_partida',source_evidence:'2 m³ de piedra partida'}],unresolved:[]};
test('MVP152: natural request passes independently evidenced AI without rigid regex',()=>{
 assert.ok(parseBuyerPilot(source).unresolved.length>0);
 const verified=verifyAiBuyerSourceEvidence(source,proposal,families);
 assert.equal(verified.state,'verified',verified.reason);
 assert.deepEqual(verified.parsed?.items.map(x=>[x.quantity,x.unit,x.family]),[
  [10,'bag','cemento_gris_obra'],[2,'m3','piedra_partida']]);
 assert.equal(decidePilotAIAction(source,proposal,'buyer',families).action,'ready_to_distribute');
});
test('MVP152: never omit quantities or products',()=>{
 const more=source.replace('piedra partida?','piedra partida y 6 bolsas de algo desconocido?');
 assert.equal(verifyAiBuyerSourceEvidence(more,proposal,families).state,'review');
 assert.notEqual(decidePilotAIAction(more,proposal,'buyer',families).action,'ready_to_distribute');
});
test('MVP152: no hallucinated source, family or price',()=>{
 const fake={...proposal,items:[{...proposal.items[0],family:'inventada'},proposal.items[1]]};
 assert.equal(verifyAiBuyerSourceEvidence(source,fake,families).state,'review');
 const wrong={...proposal,items:[{...proposal.items[0],quantity:'11'},proposal.items[1]]};
 assert.equal(verifyAiBuyerSourceEvidence(source,wrong,families).state,'review');
 const desc={...proposal,items:[{...proposal.items[0],description:'cemento de contacto'},proposal.items[1]]};
 assert.equal(verifyAiBuyerSourceEvidence(source,desc,families).state,'review');
});
test('MVP152: no invented delivery zone or packaging confusion',()=>{
 assert.equal(verifyAiBuyerSourceEvidence(source,{...proposal,city:'Berisso'},families).state,'review');
 assert.equal(verifyAiBuyerSourceEvidence(source,{...proposal,items:[{...proposal.items[0],quantity:'50',unit:'kg'},proposal.items[1]]},families).state,'review');
 const withoutZone=source.replace('Entrega: La Plata','');
 assert.notEqual(decidePilotAIAction(withoutZone,{...proposal,city:null},'buyer',families).action,'ready_to_distribute');
});
test('MVP152: only approved buyer may use catalogue and original intake remains guarded',()=>{
 const sql=readFileSync(new URL('../../supabase/piloto/mvp152_catalogue_ai_families.sql',import.meta.url),'utf8');
 const edge=readFileSync(new URL('../../supabase/functions/cotironda-piloto-whapi/index.ts',import.meta.url),'utf8');
 assert.match(sql,/b.consent_at is not null and b.opted_out_at is null/u);
 assert.match(sql,/s.consent_at is not null and s.opted_out_at is null/u);
 assert.match(sql,/from public,anon,authenticated;/u);
 assert.match(sql,/to service_role;/u);
 assert.match(edge,/cotironda_piloto_curated_families_mvp152/u);
 assert.match(edge,/cotironda_piloto_receive_whapi_v1/u);
 assert.match(edge,/!canPrepareBuyerPilot\(local\)/u);
});
