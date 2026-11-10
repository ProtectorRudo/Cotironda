import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const js=readFileSync(new URL('../../piloto/seguimiento-web/site.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../../piloto/seguimiento-web/index.html',import.meta.url),'utf8');
class Node{
 constructor(){this.children=[];this.hidden=false;this.textContent='';this.className=''}
 append(...xs){this.children.push(...xs)}
 appendChild(x){this.children.push(x);return x}
 replaceChildren(){this.children=[]}
}
const state=()=>({
 state:'closed',can_open:true,received_count:2,deadline:'2026-11-09T17:00:00Z',
 offers:[{label:'Presupuesto 1',text:'Texto A'},
   {label:'Presupuesto 2',text:'Texto B'}],
 economy:{
  state:'economia_observada_sin_ranking',quotations:2,iva_not_informed:2,
  freight_not_informed:2,freight_to_agree:0,stock_unverified:2,
  payment_not_informed:2,net_unverified:2,delivery_unverified:2,
  minimum_unverified:2,ranking_allowed:false,price_comparable:false,
  contacts_revealed:false
 },
 item_prices:{
  state:'importes_por_articulo_sin_ranking',quotations:2,requested_items:2,
  articulos:['item_001','item_002'].map((id,i)=>({
   itemId:id,descripcionSolicitada:i?'Piedra':'Arena',
   cantidadSolicitada:'1.000',unidadSolicitada:'m3',
   referencias:['Presupuesto 1','Presupuesto 2'].map((oferta,j)=>({
    oferta,importeCotizado:j===0?'$ 150,00':null,
    cantidadCotizadaLiteral:j===0?'1,00':null,
    estado:j===0?'alternativa_comercial_con_aclaracion':'no_homologable',
    iva:'sin_iva_por_convencion'
   }))
  })),
  ranking_allowed:false,price_comparable:false,contacts_revealed:false,
  adjudicacion:false,originales_descargables:false,
  IVA_calculado:false,flete_calculado:false,stock_confirmado:false
 },
 economic_readiness:{
  state:'condiciones_por_oferta_sin_ranking',quotations:2,requested_items:2,
  ofertas:[{
   oferta:'Presupuesto 1',articulosConImporte:2,articulosSolicitados:2,
   iva:'no_informado',flete:'no_informado',pago:'no_informado',
   moneda:'no_acreditada',stockCorroborado:false,
   plazoCorroborado:false,minimoCorroborado:false
  },{
   oferta:'Presupuesto 2',articulosConImporte:0,articulosSolicitados:2,
   iva:'no_informado',flete:'no_informado',pago:'no_informado',
   moneda:'no_acreditada',stockCorroborado:false,
   plazoCorroborado:false,minimoCorroborado:false
  }],
  ranking_allowed:false,price_comparable:false,contacts_revealed:false,
  tax_calculated:false,freight_calculated:false,stock_confirmed:false,
  automatic_award:false,originals_downloadable:false
 }
});
async function browser(replies){
 const dom=new Map(),timers=[];
 const node=id=>{if(!dom.has(id))dom.set(id,new Node());return dom.get(id)};
 vm.runInNewContext(js,{
  window:{location:{hash:'#'+'a'.repeat(64)}},
  document:{getElementById:node,createElement:()=>new Node()},
  fetch:async()=>{const r=await replies.shift();
   if(r?.error)throw Error('offline');
   return {ok:true,json:async()=>r};
  },setInterval:fn=>timers.push(fn)
 },{timeout:1000});
 await new Promise(res=>setTimeout(res,0));
 return {node,next:async()=>{timers[0]();await new Promise(res=>setTimeout(res,0));}};
}
test('MVP204 UI: condiciones explícitas por oferta, IVA por convención y todas las ofertas',async()=>{
 const p=await browser([state()]);
 assert.equal(p.node('economicReadinessSection').hidden,false);
 assert.equal(p.node('economicReadinessGrid').children.length,2);
 const content=JSON.stringify(p.node('economicReadinessGrid').children);
 assert.match(content,/Presupuesto 1/);
 assert.match(content,/Presupuesto 2/);
 assert.match(content,/0 de 2 artículos/);
 assert.match(content,/IVA no informado/);
 assert.match(content,/no IVA 0%/);
 assert.match(content,/Moneda no acreditada/);
 assert.match(content,/Flete no informado/);
 assert.equal(p.node('offers').children.length,2);
 assert.doesNotMatch(content,/\bganador\b|adjudicad[oa]|precio final comprobado/iu);
 assert.match(html,/id="economicReadinessSection"/);
});
test('MVP204 UI: abierto, revocado y sin red no filtran estados viejos',async()=>{
 const waiting=state();waiting.state='waiting';
 const b=await browser([waiting]);
 assert.equal(b.node('economicReadinessSection').hidden,true);
 for(const next of [{state:'not_found'},{error:true}]){
  const p=await browser([state(),next]);
  assert.equal(p.node('economicReadinessSection').hidden,false);
  await p.next();
  assert.equal(p.node('economicReadinessSection').hidden,true);
  assert.equal(p.node('economicReadinessGrid').children.length,0);
  assert.equal(p.node('offers').children.length,0);
 }
});
test('MVP204 UI: montos falsos, status incongruentes o contacto extra no habilitan vista',async()=>{
 for(const mutate of [
  d=>d.economic_readiness.price_comparable=true,
  d=>d.economic_readiness.ofertas[0].stockCorroborado=true,
  d=>d.economic_readiness.ofertas[1].oferta='Otro proveedor',
  d=>d.economic_readiness.ofertas[0].articulosConImporte=0,
  d=>d.economic_readiness.ofertas[1].moneda='USD',
  d=>d.economic_readiness.ofertas[0].iva='IVA 0 por defecto',
  d=>d.economy.iva_not_informed=1,
  d=>d.item_prices.articulos[0].referencias[0].importeCotizado=null
 ]){
  const d=state();mutate(d);
  const p=await browser([d]);
  assert.equal(p.node('economicReadinessSection').hidden,true);
 }
 assert.doesNotMatch(js,/\.innerHTML\s*=/);
});
