import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const proxy=readFileSync(new URL('../../piloto/seguimiento-web/api/estado.js',import.meta.url),'utf8');
const site=readFileSync(new URL('../../piloto/seguimiento-web/site.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../../piloto/seguimiento-web/index.html',import.meta.url),'utf8');
const start=proxy.indexOf('function buyerView(parsed){');
const end=proxy.indexOf('export default async function handler',start);
assert.ok(start>=0&&end>start);
const buyerView=vm.runInNewContext(proxy.slice(start,end)+'\nbuyerView',{}, {timeout:1000});
const clean=x=>JSON.parse(JSON.stringify(buyerView(x)));

function payload(){
 return {
  state:'closed',can_open:true,deadline:'2026-11-10T18:00:00Z',
  received_count:1,files_pending_review:0,
  offers:[{label:'Presupuesto 1',text:'Presupuesto fuente verificado'}],
  economy:{
   state:'economia_observada_sin_ranking',quotations:1,
   iva_not_informed:1,freight_not_informed:1,freight_to_agree:0,
   stock_unverified:1,payment_not_informed:1,net_unverified:1,
   delivery_unverified:1,minimum_unverified:1,
   ranking_allowed:false,price_comparable:false,contacts_revealed:false
  },
  item_prices:{
   state:'importes_por_articulo_sin_ranking',quotations:1,requested_items:1,
   articulos:[{
    itemId:'item_001',descripcionSolicitada:'Arena',
    cantidadSolicitada:'1.000',unidadSolicitada:'m3',
    referencias:[{oferta:'Presupuesto 1',importeCotizado:'AR$ 100,00',
     cantidadCotizadaLiteral:'1,00',
     estado:'coincide_volumen_nominal_sin_stock',
     iva:'sin_iva_por_convencion'}]
   }],
   ranking_allowed:false,price_comparable:false,contacts_revealed:false,
   adjudicacion:false,originales_descargables:false,
   IVA_calculado:false,flete_calculado:false,stock_confirmado:false
  },
  economic_readiness:{
   state:'condiciones_por_oferta_sin_ranking',quotations:1,requested_items:1,
   ofertas:[{oferta:'Presupuesto 1',articulosConImporte:1,
    articulosSolicitados:1,iva:'no_informado',flete:'no_informado',
    pago:'no_informado',moneda:'ARS',stockCorroborado:false,
    plazoCorroborado:false,minimoCorroborado:false}],
   ranking_allowed:false,price_comparable:false,contacts_revealed:false,
   tax_calculated:false,freight_calculated:false,stock_confirmed:false,
   automatic_award:false,originals_downloadable:false
  },
  material_baskets:{
   state:'referencia_materiales_sin_precio_final',quotations:1,requested_items:1,
   ofertas:[{oferta:'Presupuesto 1',articulosConBase:1,motivo:null}],
   opciones:[{
    ofertasAnonimas:['Presupuesto 1'],moneda:'ARS',
    subtotalMaterialesSinIva:'100.00',
    asignacion:[{itemId:'item_001',oferta:'Presupuesto 1'}],
    advertencias:['iva_no_informado','flete_no_incluido_en_comparacion',
     'stock_no_corroborado','minimos_y_pago_no_evaluados']
   }],
   ranking_final:false,iva_calculado:false,flete_calculado:false,
   stock_confirmado:false,contactos_revelados:false,adjudicacion:false,
   originales_descargables:false,whatsapp_enviado:false
  }
 };
}

test('MVP210: proxy coteja AR$100,00 y permite solo el subtotal de la canasta completa',()=>{
 const d=payload();
 d.material_baskets.supplier_key='NO DEBE SALIR';
 d.material_baskets.opciones[0].originalUrl='https://ejemplo.invalid/privado.pdf';
 const r=clean(d);
 assert.ok(r.item_prices&&r.economic_readiness&&r.material_baskets);
 assert.equal(r.economic_readiness.ofertas[0].moneda,'ARS');
 assert.equal(r.material_baskets.opciones[0].subtotalMaterialesSinIva,'100.00');
 assert.deepEqual(r.material_baskets.opciones[0].ofertasAnonimas,['Presupuesto 1']);
 assert.equal(r.material_baskets.ranking_final,false);
 assert.equal(r.offers.length,1);
 assert.doesNotMatch(JSON.stringify(r),/NO DEBE SALIR|supplier_key|originalUrl|\\.pdf/);
});

test('MVP210: el proxy rechaza totales falsos, moneda contradicha, cobertura parcial y flags de ganador',()=>{
 const mutants=[
  d=>d.material_baskets.opciones[0].subtotalMaterialesSinIva='0.00',
  d=>d.material_baskets.opciones[0].moneda='USD',
  d=>d.material_baskets.opciones[0].ofertasAnonimas=['Proveedor con nombre'],
  d=>d.material_baskets.opciones[0].asignacion[0].oferta='Presupuesto 2',
  d=>d.material_baskets.opciones[0].asignacion[0].itemId='item_002',
  d=>d.material_baskets.opciones[0].advertencias=[],
  d=>d.material_baskets.opciones[0].advertencias=['stock_no_corroborado',
   'flete_no_incluido_en_comparacion','minimos_y_pago_no_evaluados'],
  d=>d.material_baskets.opciones[0].advertencias.push('ganador'),
  d=>d.material_baskets.opciones[0].asignacion=[],
  d=>d.material_baskets.ranking_final=true,
  d=>d.material_baskets.contactos_revelados=true,
  d=>d.material_baskets.ofertas[0].articulosConBase=2,
  d=>d.item_prices.articulos[0].referencias[0].importeCotizado='AR$ 99,00',
  d=>d.economic_readiness.ofertas[0].moneda='USD',
  d=>d.economic_readiness.ofertas[0].stockCorroborado=true
 ];
 for(const mutate of mutants){
  const d=payload();mutate(d);
  const r=clean(d);
  assert.equal(r.material_baskets,undefined,String(mutate));
  assert.equal(r.offers.length,1,'nunca quitar el presupuesto original');
 }
});

test('MVP210: si la ronda está abierta o el enlace revocado NO muestra canastas',()=>{
 for(const change of [
  d=>d.state='waiting',
  d=>d.can_open=false,
  d=>d.state='cancelled'
 ]){
  const d=payload();change(d);
  const r=clean(d);
  assert.equal(r.material_baskets,undefined);
 }
});

class Element{
 constructor(){this.children=[];this.hidden=false;this.textContent='';this.className=''}
 append(...args){this.children.push(...args)}
 appendChild(a){this.children.push(a);return a}
 replaceChildren(){this.children=[]}
}
async function browser(replies){
 const dom=new Map(),callbacks=[];
 const node=id=>{if(!dom.has(id))dom.set(id,new Element());return dom.get(id)};
 vm.runInNewContext(site,{
  window:{location:{hash:'#'+'a'.repeat(64)}},
  document:{getElementById:node,createElement:()=>new Element()},
  fetch:async()=>{const answer=replies.shift();
   if(answer?.offline)throw Error('red');
   return {ok:true,json:async()=>answer};
  },
  setInterval:fn=>callbacks.push(fn)
 },{timeout:1200});
 await new Promise(r=>setTimeout(r,0));
 return {node,next:async()=>{
  callbacks[0]();
  await new Promise(r=>setTimeout(r,0));
 }};
}
test('MVP210: navegador renderiza referencia sin mostrar ganador ni contactos',async()=>{
 const p=await browser([clean(payload())]);
 assert.equal(p.node('materialBasketsSection').hidden,false);
 assert.equal(p.node('materialBasketsGrid').children.length,1);
 assert.match(JSON.stringify(p.node('materialBasketsGrid').children),/ARS 100,00/);
 assert.equal(p.node('offers').children.length,1);
 assert.match(html,/id="materialBasketsSection"/);
 assert.doesNotMatch(site,/\.innerHTML\s*=/);
});

test('MVP210: link revocado o red offline borra subtotales y ofertas previamente visibles',async()=>{
 for(const next of [{state:'not_found'},{offline:true}]){
  const p=await browser([clean(payload()),next]);
  assert.equal(p.node('materialBasketsSection').hidden,false);
  await p.next();
  assert.equal(p.node('materialBasketsSection').hidden,true);
  assert.equal(p.node('materialBasketsGrid').children.length,0);
  assert.equal(p.node('offers').children.length,0);
 }
});
