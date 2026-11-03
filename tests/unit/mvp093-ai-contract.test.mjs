import test from 'node:test';
import assert from 'node:assert/strict';
import {PILOT_AI_SCHEMA,validateAiBuyerProposal}
 from '../../supabase/functions/cotironda-piloto-whapi/ai-contract.ts';
const source='Entrega: La Plata\n20 bolsas cemento CPC 50 kg\n5 litros hidrófugo';
const valid=()=>({
 intent:'quote_request',city:'La Plata',delivery_note:null,unresolved:[],
 items:[
  {description:'cemento CPC 50 kg',quantity:'20',unit:'bag',
   family:'cemento_gris_obra',source_evidence:'20 bolsas cemento CPC 50 kg'},
  {description:'hidrófugo',quantity:'5',unit:'l',
   family:'hidrofugo',source_evidence:'5 litros hidrófugo'}
 ]
});
test('MVP093: esquema sin campos inventados, todas las claves requeridas',()=>{
 assert.equal(PILOT_AI_SCHEMA.additionalProperties,false);
 assert.deepEqual(PILOT_AI_SCHEMA.required,
 ['intent','city','delivery_note','items','unresolved']);
 assert.equal(PILOT_AI_SCHEMA.properties.items.items.additionalProperties,false);
});
test('MVP093: IA texto verificado exige evidencia + cantidades y unidades independientes',()=>{
 const r=validateAiBuyerProposal(valid(),source);
 assert.equal(r.state,'source_verified_text');
 assert.equal(r.normalized?.items.length,2);
});
test('MVP093: no auto-envía PDF/imagen si no se verificó el contenido fuera de la IA',()=>{
 assert.equal(validateAiBuyerProposal(valid(),null).state,'review_required');
 assert.equal(validateAiBuyerProposal(valid(),'').reason,'source_document_not_verified');
});
test('MVP093: no auto-envía pedido parcial ni con material inventado',()=>{
 const cases=[
  {...valid(),items:valid().items.slice(0,1)},
  {...valid(),unresolved:['hay un tercer producto']},
  {...valid(),items:[{...valid().items[0],quantity:'5000'},valid().items[1]]},
  {...valid(),items:[{...valid().items[0],family:'ladrillo_comun'},valid().items[1]]},
  {...valid(),items:[{...valid().items[0],source_evidence:'material que no aparece'},valid().items[1]]},
  {...valid(),telefonos:['000']},
 ];
 for(const entry of cases)
  assert.equal(validateAiBuyerProposal(entry,source).state,'review_required');
});
test('MVP093: texto insuficiente o lista extra no legitima cobertura ficticia',()=>{
 assert.equal(validateAiBuyerProposal(valid(),source+'\n2 bolsas desconocidas').state,'review_required');
 assert.equal(validateAiBuyerProposal({intent:'other',city:null,delivery_note:null,items:[],unresolved:[]},source).state,'review_required');
});
test('MVP093: lugar discrepante no dispara distribución',()=>{
 assert.equal(validateAiBuyerProposal({...valid(),city:'Berisso'},source).state,'review_required');
});
