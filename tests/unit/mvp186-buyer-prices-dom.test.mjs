import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const root=new URL('../../piloto/seguimiento-web/',import.meta.url);
const script=readFileSync(new URL('site.js',root),'utf8');
const html=readFileSync(new URL('index.html',root),'utf8');
const css=readFileSync(new URL('site.css',root),'utf8');
class Node{
 constructor(){this.children=[];this.hidden=false;this.textContent='';this.className='';}
 append(...items){this.children.push(...items)}
 appendChild(item){this.children.push(item);return item}
 replaceChildren(){this.children=[]}
}
const economy=()=>({
 state:'economia_observada_sin_ranking',quotations:2,iva_not_informed:2,
 freight_not_informed:2,freight_to_agree:0,stock_unverified:2,
 payment_not_informed:2,net_unverified:2,delivery_unverified:2,
 minimum_unverified:2,ranking_allowed:false,price_comparable:false,
 contacts_revealed:false
});
const prices=()=>({
 state:'importes_por_articulo_sin_ranking',quotations:2,requested_items:2,
 articulos:[1,2].map((j)=>({
  itemId:'item_'+String(j).padStart(3,'0'),
  descripcionSolicitada:j===1?'Arena fina':'Piedra partida',
  cantidadSolicitada:j===1?'1.000':'2.500',
  unidadSolicitada:'m3',
  referencias:[
   {oferta:'Presupuesto 1',importeCotizado:j===1?'$ 90,00':'$ 190,00',
    cantidadCotizadaLiteral:j===1?'1,00':'40',
    estado:'alternativa_comercial_con_aclaracion',iva:'sin_iva_por_convencion'},
   {oferta:'Presupuesto 2',importeCotizado:j===1?'$ 100,00':'$ 200,00',
    cantidadCotizadaLiteral:j===1?'1,00':'20',
    estado:'coincide_volumen_nominal_sin_stock',iva:'sin_iva_declarado'}
  ]
 })),
 ranking_allowed:false,price_comparable:false,contacts_revealed:false,
 adjudicacion:false,originales_descargables:false,IVA_calculado:false,
 flete_calculado:false,stock_confirmado:false
});
const response=()=>({
 state:'waiting',can_open:true,received_count:2,files_pending_review:0,
 deadline:'2026-11-08T18:00:00Z',
 offers:[{label:'Presupuesto 1',text:'Cotizado'},{label:'Presupuesto 2',text:'Cotizado 2'}],
 economy:economy(),item_prices:prices()
});
async function page(replies){
 const dom=new Map(),timers=[];let calls=0;
 const node=id=>{if(!dom.has(id))dom.set(id,new Node());return dom.get(id)};
 vm.runInNewContext(script,{
  window:{location:{hash:'#'+'a'.repeat(64)}},
  document:{getElementById:node,createElement:()=>new Node()},
  fetch:async()=>{const v=await replies.shift();calls++;if(v?.error)throw Error('network');
   return {ok:true,json:async()=>v};},
  setInterval:fn=>timers.push(fn)
 },{timeout:1000});
 await new Promise(res=>setTimeout(res,0));
 return {node,calls:()=>calls,next:async()=>{
  timers[0]();await new Promise(res=>setTimeout(res,0));
 }};
}
test('MVP186 UI: muestra importes por artículo, sin ordenar como ganadores',async()=>{
 const v=await page([response()]);
 assert.equal(v.node('itemPricesSection').hidden,false);
 assert.equal(v.node('itemPricesGrid').children.length,2);
 const all=JSON.stringify(v.node('itemPricesGrid').children);
 assert.match(all,/Presupuesto 1/);
 assert.match(all,/Presupuesto 2/);
 assert.match(all,/90,00/);
 assert.match(all,/100,00/);
 assert.match(all,/convención/);
 assert.match(all,/Arena fina/);
 assert.match(all,/Piedra partida/);
 assert.match(all,/Pedido: 1 m³/);
 assert.match(all,/Pedido: 2,5 m³/);
 assert.match(all,/Cantidad que figura en la oferta: 40/);
 assert.match(v.node('itemPricesCaption').textContent,/4 importes/);
 assert.doesNotMatch(all,/Ganador|1er puesto|mejor proveedor|adjudicado/iu);
 assert.match(html,/id="itemPricesGrid"/u);
 assert.match(css,/\.itemprices-panel/u);
});
test('MVP186 UI: inyección de HTML se trata como texto, no HTML interpretado',async()=>{
 const d=response();
 d.item_prices.articulos[0].referencias[0].oferta='Presupuesto 1';
 d.offers[0].text='<img src=x onerror=alert(1)>';
 const v=await page([d]);
 assert.equal(v.node('itemPricesSection').hidden,false);
 assert.doesNotMatch(script,/\.innerHTML\s*=/u);
});
test('MVP186 UI: permisos, cotización ajena y flags de ranking falsos ocultan la vista',async()=>{
 for(const mutate of [
  d=>d.can_open=false,
  d=>d.item_prices.ranking_allowed=true,
  d=>d.item_prices.contacts_revealed=true,
  d=>d.item_prices.quotations=1,
  d=>d.item_prices.articulos[0].referencias[0].oferta='Proveedor secreto',
  d=>d.item_prices.articulos[1].referencias[0].importeCotizado='http://malicious',
  d=>d.item_prices.articulos[0].descripcionSolicitada=' ',
  d=>d.item_prices.articulos[0].cantidadSolicitada='1e99',
  d=>d.item_prices.articulos[0].unidadSolicitada='money',
  d=>d.item_prices.articulos[0].referencias[0].cantidadCotizadaLiteral='40;exec()',
  d=>d.economy.price_comparable=true
 ]){
  const d=response();mutate(d);
  const v=await page([d]);
  assert.equal(v.node('itemPricesSection').hidden,true);
  assert.equal(v.node('itemPricesGrid').children.length,0);
 }
});
test('MVP186 UI: revocación o caída de red limpia importes visibles inmediatamente',async()=>{
 for(const next of [{state:'not_found'},{error:true}]){
  const v=await page([response(),next]);
  assert.equal(v.node('itemPricesSection').hidden,false);
  await v.next();
  assert.equal(v.node('itemPricesSection').hidden,true);
  assert.equal(v.node('itemPricesGrid').children.length,0);
  assert.equal(v.node('itemPricesCaption').textContent,'');
  assert.equal(v.node('offers').children.length,0);
 }
});
test('MVP186 UI: oferta no puede restaurarse con respuesta vieja tras revocación',async()=>{
 let release;
 const delayed=new Promise(resolve=>{release=resolve;});
 const v=await page([response(),delayed,{state:'not_found'}]);
 v.next();await v.next();
 release(response());
 await new Promise(res=>setTimeout(res,0));
 assert.equal(v.node('itemPricesSection').hidden,true);
 assert.equal(v.node('itemPricesGrid').children.length,0);
});

test('MVP187 UI: el material original del comprador nunca se interpreta como HTML',async()=>{
 const d=response();
 d.item_prices.articulos[0].descripcionSolicitada='<img src=x onerror=alert(1)>';
 const v=await page([d]);
 assert.equal(v.node('itemPricesSection').hidden,false);
 const cards=v.node('itemPricesGrid').children;
 const heading=cards[0].children[0].textContent;
 assert.match(heading,/<img src=x onerror=alert\(1\)>/u);
 assert.equal(v.node('itemPricesGrid').children.length,2);
 assert.doesNotMatch(script,/\.innerHTML\s*=/u);
});

test('MVP187 UI: un importe sin cantidad original no puede simular precio comparable',async()=>{
 const d=response();
 d.item_prices.articulos[0].referencias[0].cantidadCotizadaLiteral=null;
 const v=await page([d]);
 assert.equal(v.node('itemPricesSection').hidden,true);
 assert.equal(v.node('itemPricesGrid').children.length,0);
});
