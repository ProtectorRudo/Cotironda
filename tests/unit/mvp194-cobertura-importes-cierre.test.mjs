import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {resumirCoberturaImportesMvp194 as summarize}
 from '../../src/domain/cobertura-importes-cierre-mvp194.ts';

const labels=['Presupuesto 1','Presupuesto 2'];
const economy=()=>({
 state:'economia_observada_sin_ranking',quotations:2,
 iva_not_informed:2,freight_not_informed:2,freight_to_agree:0,
 stock_unverified:2,payment_not_informed:2,net_unverified:2,
 delivery_unverified:2,minimum_unverified:2,
 ranking_allowed:false,price_comparable:false,contacts_revealed:false
});
const ref=(oferta,amount)=>({
 oferta,importeCotizado:amount,
 cantidadCotizadaLiteral:amount===null?null:'1',
 estado:amount===null?'no_homologable':'alternativa_comercial_con_aclaracion',
 iva:'sin_iva_por_convencion'
});
const prices=()=>({
 state:'importes_por_articulo_sin_ranking',
 quotations:2,requested_items:2,articulos:[
  {itemId:'item_001',descripcionSolicitada:'Arena',cantidadSolicitada:'1.000',
   unidadSolicitada:'m3',referencias:[ref(labels[1],null),ref(labels[0],'$ 150,00')]},
  {itemId:'item_002',descripcionSolicitada:'Piedra',cantidadSolicitada:'1.000',
   unidadSolicitada:'m3',referencias:[ref(labels[0],null),ref(labels[1],'$ 170,00')]}
 ],
 ranking_allowed:false,price_comparable:false,contacts_revealed:false,
 adjudicacion:false,originales_descargables:false,
 IVA_calculado:false,flete_calculado:false,stock_confirmado:false
});
const tracking=()=>({
 state:'closed',can_open:true,
 offers:[{label:labels[0],text:'Revisado A'},
         {label:labels[1],text:'Revisado B'}],
 economy:economy()
});
const state=()=>({ ...tracking(),item_prices:prices()});
const source=readFileSync(
 new URL('../../piloto/seguimiento-web/api/estado.js',import.meta.url),'utf8');
const begin=source.indexOf('function buyerView(parsed){');
const end=source.indexOf('export default async function handler',begin);
assert.ok(begin>=0&&end>begin);
const buyerView=vm.runInNewContext(
 source.slice(begin,end)+'\nbuyerView',Object.create(null),{timeout:1000}
);
const view=x=>JSON.parse(JSON.stringify(buyerView(x)));

test('MVP194: los dos presupuestos parciales tienen importes de fuente para toda la canasta al combinarse',()=>{
 const x=summarize(tracking(),prices());
 assert.equal(x?.state,'cobertura_importes_sin_ranking');
 assert.deepEqual(x.coberturaPorOferta.map(v=>v.articulosConImporte),[1,1]);
 assert.equal(x.parejasConImportesParaTodos.length,1);
 assert.deepEqual(x.parejasConImportesParaTodos[0].ofertasAnonimas,labels);
 assert.deepEqual(x.parejasConImportesParaTodos[0].articulos.map(a=>a.ofertasConImporte),
  [[labels[0]],[labels[1]]]);
 for(const flag of ['ranking_allowed','price_comparable','tax_calculated',
 'freight_calculated','stock_confirmed','contacts_revealed',
 'automatic_award','finalists_selected','whatsapp_sent','originals_downloadable'])
  assert.equal(x[flag],false,flag);
 const printed=JSON.stringify(x);
 for(const privateWord of ['150,00','170,00','sourceSha256','mensajeHmac','proveedor_','@'])
  assert.ok(!printed.includes(privateWord),privateWord);
});

test('MVP194: oferta ya completa NO exige un segundo negocio, pero conserva a todos',()=>{
 const x=prices();
 x.articulos[1].referencias[0].importeCotizado='$ 200,00';
 x.articulos[1].referencias[0].cantidadCotizadaLiteral='1';
 x.articulos[1].referencias[0].estado='alternativa_comercial_con_aclaracion';
 const out=summarize(tracking(),x);
 assert.deepEqual(out.coberturaPorOferta.map(y=>y.articulosConImporte),[2,1]);
 assert.equal(out.parejasConImportesParaTodos.length,0);
});

test('MVP194: sin importe conciliable una oferta no simula cobertura ni precio',()=>{
 const x=prices();
 x.articulos[1].referencias[1]=ref(labels[1],null);
 const out=summarize(tracking(),x);
 assert.deepEqual(out.coberturaPorOferta.map(y=>y.articulosConImporte),[1,0]);
 assert.equal(out.parejasConImportesParaTodos.length,0);
});

test('MVP194: permiso, cierre, revisión y vínculos rotos invalidan TODO el resumen',()=>{
 for(const change of [
  x=>x.status.state='waiting',
  x=>x.status.state='cancelled',
  x=>x.status.can_open=false,
  x=>x.status.economy=null,
  x=>x.status.economy.ranking_allowed=true,
  x=>x.status.offers[1].text=x.status.offers[0].text,
  x=>x.status.offers[1].label=x.status.offers[0].label,
  x=>x.result.articulos[0].referencias[0].oferta='proveedor_privado',
  x=>x.result.articulos[0].referencias[1].oferta=labels[1],
  x=>x.result.quotations=3,
  x=>x.result.adjudicacion=true,
  x=>x.result.articulos[0].itemId='item_002',
  x=>x.result.articulos[1].referencias.pop(),
  x=>x.result.articulos[0].referencias[1].importeCotizado='https://bad.test',
  x=>x.result.articulos[0].referencias[1].estado='no_homologable',
  x=>x.result.articulos[0].referencias[1].iva='iva_incluido_no_homologado',
  x=>x.result.articulos[0].referencias[1].cantidadCotizadaLiteral=null
 ]){
  const x={status:tracking(),result:prices()};change(x);
  assert.equal(summarize(x.status,x.result),null);
 }
});

test('MVP194: prueba de dos compañías — etiqueta ajena nunca se vincula como cobertura',()=>{
 const status=tracking(),p=prices();
 status.offers[1].label='Otra empresa';
 assert.equal(summarize(status,p),null);
});

test('MVP194: proxy revalida cada artículo y elimina dinero, hashes y teléfonos',()=>{
 const x=state();
 x.priced_coverage=structuredClone(summarize(x,x.item_prices));
 x.priced_coverage.contacto='5492215000000';
 x.priced_coverage.parejasConImportesParaTodos[0].subtotal='999999';
 const v=view(x);
 assert.deepEqual(v.priced_coverage.coberturaPorOferta.map(y=>y.articulosConImporte),[1,1]);
 assert.equal(v.priced_coverage.parejasConImportesParaTodos.length,1);
 const serialized=JSON.stringify(v.priced_coverage);
 for(const f of ['contacto','5492215000000','subtotal','999999',
  'sourceSha256','business_key','telefono','$ 150'])
  assert.ok(!serialized.includes(f),f);
 assert.equal(v.priced_coverage.price_comparable,false);
});

test('MVP194: proxy omite vista alterada sin ocultar ofertas ni precios previamente verificados',()=>{
 for(const change of [
  x=>x.priced_coverage.quotations=3,
  x=>x.priced_coverage.ranking_allowed=true,
  x=>x.priced_coverage.contacts_revealed=true,
  x=>x.priced_coverage.coberturaPorOferta[0].articulosConImporte=2,
  x=>x.priced_coverage.coberturaPorOferta[0].oferta='Negocio ajeno',
  x=>x.priced_coverage.parejasConImportesParaTodos[0].ofertasAnonimas.reverse(),
  x=>x.priced_coverage.parejasConImportesParaTodos[0].articulos.pop(),
  x=>x.priced_coverage.parejasConImportesParaTodos[0].articulos[0].ofertasConImporte=[labels[1]],
  x=>x.priced_coverage.parejasConImportesParaTodos=[],
  x=>x.state='waiting',
  x=>x.economy=null,
  x=>x.item_prices=null
 ]){
  const x=state();x.priced_coverage=structuredClone(summarize(x,x.item_prices));
  change(x);const v=view(x);
  assert.equal(v.priced_coverage,undefined);
  assert.equal(v.offers.length,2);
 }
});

test('MVP194: el proxy nunca deja una pareja sin prueba de ambos aportes exclusivos',()=>{
 const x=state();
 // Both offers price one article but neither covers the second.
 x.item_prices.articulos[0].referencias[0]=ref(labels[1],'$ 190,00');
 x.item_prices.articulos[1].referencias[1]=ref(labels[1],null);
 x.priced_coverage=structuredClone(summarize(x,x.item_prices));
 assert.equal(x.priced_coverage.parejasConImportesParaTodos.length,0);
 const v=view(x);
 assert.deepEqual(v.priced_coverage.parejasConImportesParaTodos,[]);
});
