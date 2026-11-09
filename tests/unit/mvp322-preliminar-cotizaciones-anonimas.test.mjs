import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {vistaCotizacionesRubrosMvp227} from
 '../../src/domain/ia-central/vista-comprador-rubros-mvp227.ts';
import {preliminarAnonimoPresupuestosMvp322} from
 '../../src/domain/ia-central/preliminar-anonimo-presupuestos-mvp322.ts';

const fixture=()=>({
 state:'rubros_por_articulo',ranking_global_permitido:false,
 adjudicacion_automatica:false,contactos_revelados:false,
 recibidos:2,pendientes_revision:0,
 items:[
  {itemId:'item_1',descripcion:'Cemento CPC 50 kg',cantidad:'20',unidad:'bag',rubro:'obra_gruesa'},
  {itemId:'item_2',descripcion:'Arena bolsón 1 m³',cantidad:'3',unidad:'m3',rubro:'obra_gruesa'},
  {itemId:'item_3',descripcion:'Látex blanco 4 L',cantidad:'2',unidad:'unit',rubro:'pintura'}
 ],
 ofertas:[
  {label:'Presupuesto 1',moneda:'ARS',iva:'no_informado',
   flete:'a_convenir',pago:'no_informado',
   rubros:[{rubro:'obra_gruesa',solicitados:2,respondidos:1,cobertura:'parcial'}],
   precios:[{pedidoId:'item_1',centavos:'18000000',cantidad:'20',unidad:'bag'}]},
  {label:'Presupuesto 2',moneda:'ARS',iva:'sin_iva_explicito',
   flete:'no_informado',pago:'transferencia',
   rubros:[{rubro:'obra_gruesa',solicitados:2,respondidos:2,cobertura:'completa'},
    {rubro:'pintura',solicitados:1,respondidos:1,cobertura:'completa'}],
   precios:[{pedidoId:'item_1',centavos:'21000000'},
    {pedidoId:'item_2',centavos:'9000000'},
    {pedidoId:'item_3',centavos:'6000000'}]}
 ]
});
const get=()=>{const raw=fixture();const vista=vistaCotizacionesRubrosMvp227(raw);
 assert.ok(vista);const pre=preliminarAnonimoPresupuestosMvp322(raw,vista);
 assert.ok(pre);return {raw,vista,pre}};
const api=readFileSync(new URL('../../piloto/seguimiento-web/api/estado.js',import.meta.url),'utf8');
const buyerView=vm.runInNewContext(api.slice(0,api.indexOf('export default'))+
 '\nbuyerView;',{}, {timeout:2000});
const html=readFileSync(new URL('../../piloto/seguimiento-web/index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../../piloto/seguimiento-web/site.css',import.meta.url),'utf8');
const js=readFileSync(new URL('../../piloto/seguimiento-web/site.js',import.meta.url),'utf8');
const edge=readFileSync(new URL('../../supabase/functions/cotironda-piloto-seguimiento/index.ts',import.meta.url),'utf8');
const encoded=v=>JSON.parse(JSON.stringify(v));
const response=()=>{const {pre,vista}=get();return {
 state:'waiting',can_open:true,received_count:2,files_pending_review:0,
 deadline:'2026-11-10T19:00:00Z',offers:vista.offers,
 rubros_ia:vista.rubros_ia,preliminar_cotizaciones_ia:pre
};};

test('MVP322: each anonymous partial quote retains own currency and vetted line amounts',()=>{
 const {pre}=get();
 assert.equal(pre.ofertas.length,2);
 assert.equal(pre.ofertas[0].label,'Presupuesto 1');
 assert.equal(pre.ofertas[0].precioDeMaterialesCentavos,'18000000');
 assert.equal(pre.ofertas[0].cobertura,'parcial');
 assert.equal(pre.ofertas[0].respondidosAsignados,1);
 assert.equal(pre.ofertas[0].solicitadosAsignados,2);
 assert.equal(pre.ofertas[1].precioDeMaterialesCentavos,'36000000');
 assert.equal(pre.ofertas[1].articulos.length,3);
 assert.equal(pre.ofertas[1].cobertura,'completa_asignada');
 for(const k of ['ranking_permitido','total_final','iva_calculado',
  'flete_calculado','contactos_revelados','adjudicacion_automatica'])
  assert.equal(pre[k],false);
});
test('MVP322: USD remains separate and high-precision source cents do not overflow Number',()=>{
 const f=fixture();
 f.ofertas[1].moneda='USD';
 f.ofertas[1].precios[0].centavos='99999999999999999';
 const safe=vistaCotizacionesRubrosMvp227(f);
 assert.ok(safe);
 const p=preliminarAnonimoPresupuestosMvp322(f,safe);
 assert.ok(p);
 assert.equal(p.ofertas[0].moneda,'ARS');
 assert.equal(p.ofertas[1].moneda,'USD');
 assert.equal(p.ofertas[1].precioDeMaterialesCentavos,'100000000000149999');
});
test('MVP322: forged price after validated view and stale revision are rejected',()=>{
 const {raw,vista}=get();
 raw.ofertas[0].precios[0].centavos='1';
 assert.equal(preliminarAnonimoPresupuestosMvp322(raw,vista),null);
 const another=fixture();another.ofertas[1].precios.push({
  pedidoId:'item_1',centavos:'1'
 });
 assert.equal(preliminarAnonimoPresupuestosMvp322(another,vista),null);
});
test('MVP322: duplicate lines, wrong rubros, bad coverage and unknown quantities fail closed',()=>{
 const changes=[
  r=>r.ofertas[0].precios.push({pedidoId:'item_1',centavos:'100'}),
  r=>r.ofertas[0].rubros[0].cobertura='completa',
  r=>r.ofertas[0].rubros[0].respondidos=0,
  r=>r.ofertas[0].precios[0].cantidad='999',
  r=>r.ofertas[0].precios[0].unidad='m3',
  r=>r.items[0].rubro='pintura',
  r=>r.ofertas[0].precios[0].centavos='-1',
  r=>r.ofertas[0].label='Corralón auténtico'
 ];
 for(const patch of changes){
  const f=fixture();patch(f);
  const vista=vistaCotizacionesRubrosMvp227(f);
  assert.equal(preliminarAnonimoPresupuestosMvp322(f,vista),null);
 }
});
test('MVP322: no raw supplier identity, phone, HMAC, source or exact original in output',()=>{
 const {raw,vista}=get();
 raw.encoded_phone='+542211234567';
 raw.sourceFile='private/original.pdf';
 raw.ofertas[0].supplierName='CONFIDENTIAL';
 raw.ofertas[0].chat_hmac='f'.repeat(64);
 const p=preliminarAnonimoPresupuestosMvp322(raw,vista);
 assert.ok(p);
 assert.doesNotMatch(JSON.stringify(p),/encoded_phone|sourceFile|supplierName|CONFIDENTIAL|private\/original|chat_hmac|\+54221/u);
});
test('MVP322: Edge uses token-authorized reduced source; proxy calculates sum independently',()=>{
 assert.match(edge,/preliminarAnonimoPresupuestosMvp322\(ai\.data,safe\)/u);
 assert.match(edge,/preliminar_cotizaciones_ia:preliminar/u);
 const data=buyerView(response());
 assert.ok(data.preliminar_cotizaciones_ia);
 assert.equal(data.preliminar_cotizaciones_ia.ofertas[1].precioDeMaterialesCentavos,'36000000');
 assert.equal(data.preliminar_cotizaciones_ia.total_final,false);
 assert.equal(data.preliminar_cotizaciones_ia.ofertas[0].cobertura,'parcial');
});
test('MVP322: proxy drops stale/forged totals, injected private fields and disabled views',()=>{
 const source=response();
 for(const patch of [
  d=>d.preliminar_cotizaciones_ia.ofertas[0].precioDeMaterialesCentavos='1',
  d=>d.preliminar_cotizaciones_ia.ofertas[0].articulos[0].importeRenglonCentavos='-1',
  d=>d.preliminar_cotizaciones_ia.ofertas[0].supplierPhone='11223344',
  d=>d.preliminar_cotizaciones_ia.ofertas[0].articulos[0].sourceHmac='f'.repeat(64),
  d=>d.preliminar_cotizaciones_ia.ofertas[0].label='Proveedor reconocido',
  d=>d.preliminar_cotizaciones_ia.total_final=true,
  d=>d.preliminar_cotizaciones_ia.ofertas[0].cobertura='completa_asignada',
  d=>d.preliminar_cotizaciones_ia.ofertas[0].articulos[0].rubro='electricidad'
 ]){
  const d=structuredClone(source);patch(d);
  const reduced=buyerView(d);
  assert.equal(reduced?.preliminar_cotizaciones_ia,undefined);
 }
 for(const d of [
  {...source,can_open:false},{...source,state:'cancelled'},
  {...source,state:'not_found'}
 ]){
  assert.equal(buyerView(d)?.preliminar_cotizaciones_ia,undefined);
 }
});
class Node{
 constructor(tag='div'){this.tagName=tag;this.children=[];this.textContent='';
  this.hidden=false;this.className='';}
 append(...values){this.children.push(...values)}
 appendChild(x){this.children.push(x);return x}
 replaceChildren(...values){this.children=[...values]}
 setAttribute(){}
}
test('MVP322: DOM renders two anonymous cards, prices, no winner and clears after revoked token',()=>{
 const nodes=new Map();
 const context={
  window:{location:{hash:''},addEventListener(){}},
  document:{createElement(tag){return new Node(tag)},
   getElementById(id){if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id)}},
  setInterval(){throw Error('no automatic refresh in test')},
  fetch(){throw Error('no outbound')},
  console:{log(){},warn(){},error(){}}
 };
 const getFn=vm.runInNewContext(js+'\n({render,clearPrivateView});',context,{timeout:3000});
 const data=encoded(buyerView(response()));
 getFn.render(data);
 assert.equal(nodes.get('previewSection').hidden,false);
 assert.equal(nodes.get('previewGrid').children.length,2);
 const flatten=n=>typeof n==='string'?n:([n.textContent,...n.children.map(flatten)].join(' '));
 const shown=flatten(nodes.get('previewGrid'));
 assert.match(shown,/Presupuesto 1/u);
 assert.match(shown,/Presupuesto 2/u);
 assert.match(shown,/\$ 180\.000,00/u);
 assert.match(shown,/\$ 360\.000,00/u);
 assert.match(shown,/Oferta parcial/u);
 assert.doesNotMatch(shown,/Ganador|Proveedor real|Contactar/u);
 getFn.render({state:'not_found'});
 assert.equal(nodes.get('previewSection').hidden,true);
 assert.equal(nodes.get('previewGrid').children.length,0);
});
test('MVP322: HTML and stylesheet provide distinct mobile section; no scripts alter prices',()=>{
 assert.match(html,/id="previewSection"/u);
 assert.match(html,/id="previewGrid"/u);
 assert.match(css,/\.preliminar-card/u);
 assert.match(css,/@media\(max-width:500px\)/u);
 assert.match(js,/showPreliminarMvp322\(d\)/u);
 assert.match(js,/setInterval\(refresh,45000\)/u);
 assert.doesNotMatch(js,/preliminar_cotizaciones_ia.*sort\(/u);
});
