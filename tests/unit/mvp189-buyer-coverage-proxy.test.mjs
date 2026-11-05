import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const path=new URL('../../piloto/seguimiento-web/api/estado.js',import.meta.url);
const script=readFileSync(path,'utf8');
const begin=script.indexOf('function buyerView(parsed){');
const end=script.indexOf('export default async function handler',begin);
assert.ok(begin>=0&&end>begin);
const buyerView=vm.runInNewContext(
 script.slice(begin,end)+'\nbuyerView',Object.create(null),{timeout:1000}
);
const economy=()=>({
 state:'economia_observada_sin_ranking',quotations:2,
 iva_not_informed:2,freight_not_informed:2,freight_to_agree:0,
 stock_unverified:2,payment_not_informed:2,net_unverified:2,
 delivery_unverified:2,minimum_unverified:2,
 ranking_allowed:false,price_comparable:false,contacts_revealed:false
});
const coverage=()=>({
 state:'cobertura_revisada',quotations:2,requested_items:2,
 comparisons:4,commercial_alternatives:2,packaging_unproven:0,
 not_evaluated:2,explicit_differences:0,technical_uncertainty:0,
 ranking_allowed:false,price_comparable:false,contacts_revealed:false
});
const summary=()=>({
 state:'alternativas_cobertura_sin_ranking',quotations:2,requested_items:2,
 coberturaPorOferta:[
  {oferta:'Presupuesto 1',articulosConAlternativa:1,articulosSolicitados:2},
  {oferta:'Presupuesto 2',articulosConAlternativa:1,articulosSolicitados:2}
 ],
 alternativas:[{
  modo:'complementaria',
  ofertasAnonimas:['Presupuesto 1','Presupuesto 2'],
  articulos:[
   {itemId:'item_001',ofertasConAlternativa:['Presupuesto 1']},
   {itemId:'item_002',ofertasConAlternativa:['Presupuesto 2']}
  ]
 }],
 ranking_allowed:false,price_comparable:false,tax_calculated:false,
 freight_calculated:false,stock_confirmed:false,contacts_revealed:false,
 automatic_award:false,finalists_selected:false,whatsapp_sent:false,
 originals_downloadable:false
});
const request=()=>({
 state:'closed',can_open:true,received_count:2,deadline:'2026-11-08T22:00:00Z',
 offers:[{label:'Presupuesto 1',text:'Oferta revisada A'},
         {label:'Presupuesto 2',text:'Oferta revisada B'}],
 coverage:coverage(),economy:economy(),coverage_options:summary()
});
const view=d=>JSON.parse(JSON.stringify(buyerView(d)));

test('MVP189 proxy: permite combinación verificada de 2 ofertas, sin contactos ni orden de precios',()=>{
 const d=request();
 d.coverage_options.contactoWhatsapp='5492211234567';
 d.coverage_options.alternativas[0].precioFinal='$ 1.00';
 d.coverage_options.coberturaPorOferta[0].supplier_key='empresa_privada';
 const v=view(d),p=v.coverage_options;
 assert.equal(p.state,'alternativas_cobertura_sin_ranking');
 assert.deepEqual(p.alternativas[0].articulos.map(x=>x.itemId),
  ['item_001','item_002']);
 assert.equal(p.automatic_award,false);
 assert.equal(p.finalists_selected,false);
 const body=JSON.stringify(v);
 for(const key of ['contactoWhatsapp','precioFinal','supplier_key',
  'empresa_privada','5492211234567','sourceSha256','storage_path'])
  assert.equal(body.includes(key),false,key);
 assert.equal(v.offers.length,2);
});
test('MVP189 proxy: flags peligrosos o correlación distinta eliminan SOLO nueva vista',()=>{
 const changes=[
  d=>{d.coverage_options.ranking_allowed=true},
  d=>{d.coverage_options.contacts_revealed=true},
  d=>{d.coverage_options.automatic_award=true},
  d=>{d.coverage_options.finalists_selected=true},
  d=>{d.coverage_options.quotations=3},
  d=>{d.coverage_options.requested_items=1},
  d=>{d.coverage.commercial_alternatives=3},
  d=>{d.coverage_options.coberturaPorOferta[1].oferta='Proveedor real'},
  d=>{d.coverage_options.coberturaPorOferta[0].articulosConAlternativa=2},
  d=>{d.coverage_options.alternativas[0].ofertasAnonimas=['Presupuesto 1','Cliente secreto']},
  d=>{d.coverage_options.alternativas[0].articulos[0].itemId='item_000<script>'},
  d=>{d.coverage_options.alternativas[0].articulos[1].itemId='item_001'},
  d=>{d.coverage_options.alternativas[0].articulos[0].ofertasConAlternativa=['Presupuesto 1','Presupuesto 1']},
  d=>{d.coverage_options.alternativas[0].modo='ganadores'},
  d=>{d.coverage_options.alternativas[0].articulos[0].ofertasConAlternativa=[]},
  d=>{d.coverage_options.alternativas[0].articulos[1].ofertasConAlternativa=['Proveedor no invitado']}
 ];
 for(const mutate of changes){
  const d=request();mutate(d);
  const v=view(d);
  assert.equal(v.coverage_options,undefined);
  assert.equal(v.offers.length,2);
  assert.equal(v.coverage.state,'cobertura_revisada');
 }
});
test('MVP189 proxy: nada antes del cierre ni sin permiso',()=>{
 for(const mutate of [
  d=>{d.state='waiting'},
  d=>{d.can_open=false},
  d=>{d.coverage=null},
  d=>{d.economy=null},
  d=>{d.coverage.price_comparable=true},
  d=>{d.economy.contacts_revealed=true},
  d=>{d.coverage_options.alternativas.push(structuredClone(d.coverage_options.alternativas[0]))}
 ]){
  const d=request();mutate(d);
  const v=view(d);
  assert.equal(v.coverage_options,undefined);
 }
});
test('MVP189 proxy: sin combinación completa conserva parciales, sin adjudicar',()=>{
 const d=request();d.coverage_options.alternativas=[];
 const v=view(d);
 assert.equal(v.coverage_options.alternativas.length,0);
 assert.deepEqual(v.coverage_options.coberturaPorOferta.map(x=>x.articulosConAlternativa),
  [1,1]);
 assert.equal(v.coverage_options.price_comparable,false);
});
test('MVP189 proxy: una alternativa individual debe cubrir TODOS los artículos',()=>{
 const d=request();d.coverage_options.coberturaPorOferta[0].articulosConAlternativa=2;
 d.coverage.commercial_alternatives=3;
 d.coverage_options.alternativas=[{
  modo:'individual',ofertasAnonimas:['Presupuesto 1'],
  articulos:[
   {itemId:'item_001',ofertasConAlternativa:['Presupuesto 1']},
   {itemId:'item_002',ofertasConAlternativa:['Presupuesto 1']}
  ]
 }];
 const v=view(d);
 assert.equal(v.coverage_options.alternativas[0].modo,'individual');
 assert.equal(v.coverage_options.alternativas[0].ofertasAnonimas.length,1);
});

test('MVP203 proxy: pareja única orienta por cobertura, nunca por precio ni contactos',()=>{
 const d=request();
 d.coverage_options.alternativas[0].totalEconomicoFalso='999999';
 const v=view(d);
 assert.deepEqual(v.orientacion,{
  state:'orientacion_de_cobertura_no_economica',
  tipo:'pareja_complementaria',ofertasAnonimas:['Presupuesto 1','Presupuesto 2'],
  alternativasCompletas:1,presupuestosRevisados:2,
  ranking_allowed:false,price_comparable:false,contacts_revealed:false,
  automatic_award:false,originales_descargables:false
 });
 assert.equal(v.offers.length,2);
 assert.ok(!JSON.stringify(v).includes('totalEconomicoFalso'));
});

test('MVP203 proxy: una o dos ofertas completas, todas las parciales siguen visibles',()=>{
 const d=request();
 d.coverage_options.coberturaPorOferta[0].articulosConAlternativa=2;
 d.coverage.commercial_alternatives=3;
 const a={
  modo:'individual',ofertasAnonimas:['Presupuesto 1'],
  articulos:[
   {itemId:'item_001',ofertasConAlternativa:['Presupuesto 1']},
   {itemId:'item_002',ofertasConAlternativa:['Presupuesto 1']}
  ]
 };
 d.coverage_options.alternativas=[a];
 assert.equal(view(d).orientacion.tipo,'una_individual');
 assert.deepEqual(view(d).orientacion.ofertasAnonimas,['Presupuesto 1']);
 d.coverage_options.coberturaPorOferta[1].articulosConAlternativa=2;
 d.coverage.commercial_alternatives=4;
 d.coverage_options.alternativas=[
  a,{modo:'individual',ofertasAnonimas:['Presupuesto 2'],
    articulos:[
     {itemId:'item_001',ofertasConAlternativa:['Presupuesto 2']},
     {itemId:'item_002',ofertasConAlternativa:['Presupuesto 2']}
    ]}
 ];
 const result=view(d);
 assert.equal(result.orientacion.tipo,'dos_individuales');
 assert.deepEqual(result.orientacion.ofertasAnonimas,
  ['Presupuesto 1','Presupuesto 2']);
 assert.equal(result.offers.length,2);
});

test('MVP203 proxy: tres alternativas completas no se convierten en dos preferidas arbitrarias',()=>{
 const d=request();
 const extraName='Presupuesto 3';
 d.offers.push({label:extraName,text:'Revisado C'});
 d.economy.quotations=3;
 d.coverage.quotations=3;d.coverage.comparisons=6;
 d.coverage.commercial_alternatives=6;
 d.coverage.not_evaluated=0;
 d.coverage_options.quotations=3;
 d.coverage_options.coberturaPorOferta=[
  ...d.coverage_options.coberturaPorOferta.map(x=>({
   ...x,articulosConAlternativa:2
  })),
  {oferta:extraName,articulosConAlternativa:2,articulosSolicitados:2}
 ];
 d.coverage_options.alternativas=d.offers.map(x=>({
  modo:'individual',ofertasAnonimas:[x.label],
  articulos:['item_001','item_002'].map(itemId=>({
   itemId,ofertasConAlternativa:[x.label]
  }))
 }));
 const v=view(d);
 assert.equal(v.coverage_options.alternativas.length,3);
 assert.equal(v.orientacion.tipo,'multiples_sin_preferencia');
 assert.deepEqual(v.orientacion.ofertasAnonimas,[]);
 assert.equal(v.offers.length,3);
});

test('MVP203 proxy: sin cobertura total no inventa recomendados',()=>{
 const d=request();d.coverage_options.alternativas=[];
 const v=view(d);
 assert.equal(v.orientacion.tipo,'sin_cobertura_completa');
 assert.deepEqual(v.orientacion.ofertasAnonimas,[]);
 assert.equal(v.offers.length,2);
});

test('MVP203 proxy: nunca orienta antes de cierre, sin token válido o ante proyección alterada',()=>{
 for(const mutate of [
  d=>{d.state='waiting'},
  d=>{d.can_open=false},
  d=>{d.coverage_options.automatic_award=true},
  d=>{d.coverage_options.alternativas[0].ofertasAnonimas[0]='proveedor real'},
  d=>{d.economy.price_comparable=true},
  d=>{d.coverage.commercial_alternatives=100}
 ]){
  const d=request();mutate(d);
  const v=view(d);
  assert.equal(v.orientacion,undefined);
 }
});
