import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {vistaCotizacionesRubrosMvp227} from
 '../../src/domain/ia-central/vista-comprador-rubros-mvp227.ts';
import {resumirAlternativasRubrosMvp255} from
 '../../src/domain/ia-central/resumen-comparador-rubros-mvp255.ts';

const fixture=()=>({
 state:'rubros_por_articulo',ranking_global_permitido:false,
 adjudicacion_automatica:false,contactos_revelados:false,
 recibidos:3,pendientes_revision:0,
 items:[
  {itemId:'item_1',descripcion:'Cemento CPC 50 kg',cantidad:'20',unidad:'bag',rubro:'obra_gruesa'},
  {itemId:'item_2',descripcion:'Arena bolsón',cantidad:'3',unidad:'m3',rubro:'obra_gruesa'},
  {itemId:'item_3',descripcion:'Látex interior',cantidad:'2',unidad:'unit',rubro:'pintura'},
  {itemId:'item_4',descripcion:'Cable 2,5 mm',cantidad:'100',unidad:'m',rubro:'electricidad'}
 ],
 ofertas:[
  {label:'Presupuesto 1',moneda:'ARS',iva:'no_informado',
   flete:'no_informado',pago:'no_informado',
   rubros:[{rubro:'obra_gruesa',solicitados:1,respondidos:1,
    precioComprobado:1,cobertura:'completa',faltantes:[]}],
   precios:[{pedidoId:'item_1',centavos:'18000000'}]},
  {label:'Presupuesto 2',moneda:'ARS',iva:'no_informado',
   flete:'no_informado',pago:'no_informado',
   rubros:[{rubro:'obra_gruesa',solicitados:1,respondidos:1,
    precioComprobado:1,cobertura:'completa',faltantes:[]}],
   precios:[{pedidoId:'item_2',centavos:'9000000'}]},
  {label:'Presupuesto 3',moneda:'ARS',iva:'no_informado',
   flete:'no_informado',pago:'no_informado',
   rubros:[
    {rubro:'pintura',solicitados:1,respondidos:1,
     precioComprobado:1,cobertura:'completa',faltantes:[]},
    {rubro:'electricidad',solicitados:1,respondidos:1,
     precioComprobado:1,cobertura:'completa',faltantes:[]}
   ],
   precios:[{pedidoId:'item_3',centavos:'5000000'},
    {pedidoId:'item_4',centavos:'8000000'}]}
 ]
});
function projected(){
 const f=fixture(),vista=vistaCotizacionesRubrosMvp227(f);
 assert.ok(vista);
 const cmp=resumirAlternativasRubrosMvp255(f,vista);
 assert.ok(cmp);
 return {f,vista,cmp};
}
const proxy=readFileSync(new URL('../../piloto/seguimiento-web/api/estado.js',import.meta.url),'utf8');
const buyerView=vm.runInNewContext(proxy.slice(0,proxy.indexOf('export default'))+
 '\nbuyerView;',{}, {timeout:1500});
const edge=readFileSync(new URL('../../supabase/functions/cotironda-piloto-seguimiento/index.ts',import.meta.url),'utf8');
const html=readFileSync(new URL('../../piloto/seguimiento-web/index.html',import.meta.url),'utf8');
const browserScript=readFileSync(new URL('../../piloto/seguimiento-web/site.js',import.meta.url),'utf8');
const response=()=>{
 const {cmp,vista}=projected();
 return {state:'waiting',can_open:true,received_count:3,
  files_pending_review:0,deadline:'2026-11-10T19:00:00Z',
  offers:[],rubros_ia:vista.rubros_ia,comparador_rubros_ia:cmp};
};
function safeJson(v){return JSON.parse(JSON.stringify(v))}
test('MVP255: dos proveedores completan obra gruesa por importes cotejados',()=>{
 const {cmp}=projected();
 assert.equal(cmp.state,'alternativas_rubro_con_importes_sin_ranking');
 assert.equal(cmp.rubros.length,3);
 const obra=cmp.rubros.find(x=>x.rubro==='obra_gruesa');
 assert.equal(obra.solicitados,2);
 assert.equal(obra.opcionesTotales,3);
 assert.deepEqual(obra.opciones[0].ofertasAnonimas,
  ['Presupuesto 1','Presupuesto 2']);
 assert.deepEqual(obra.opciones[0].articulosConPrecio,['item_1','item_2']);
 assert.deepEqual(obra.opciones[0].articulosPendientes,[]);
 assert.equal(obra.opciones[0].cobertura,'completa_con_importes');
 assert.equal(obra.opciones[0].totalGlobalComparable,false);
 assert.equal(cmp.ranking_global_permitido,false);
 assert.equal(cmp.adjudicacion_automatica,false);
 assert.equal(cmp.contactos_revelados,false);
});
test('MVP255: ofertas parciales, USD y respuesta sin precio se señalan, no se inventan',()=>{
 const f=fixture();
 f.ofertas[1].moneda='USD';
 f.ofertas[2].rubros.push({
  rubro:'obra_gruesa',solicitados:1,respondidos:1,
  precioComprobado:0,cobertura:'completa',faltantes:[]
 });
 const view=vistaCotizacionesRubrosMvp227(f);
 assert.ok(view);
 const cmp=resumirAlternativasRubrosMvp255(f,view);
 assert.ok(cmp);
 const obra=cmp.rubros.find(x=>x.rubro==='obra_gruesa');
 assert.equal(obra.opciones[0].cobertura,'completa_con_importes');
 assert.equal(obra.opciones[0].condicionesDeclaradasIguales,false);
 assert.deepEqual(obra.ofertasConRespuestaSinPrecio,['Presupuesto 3']);
 assert.deepEqual(obra.articulosConReferenciasCoincidentes,[]);
});
test('MVP255: dos precios del mismo artículo y condiciones compatibles se detectan sin ranking',()=>{
 const f=fixture();
 f.ofertas[1].rubros[0].solicitados=1;
 f.ofertas[1].precios=[{pedidoId:'item_1',centavos:'16500000'}];
 const view=vistaCotizacionesRubrosMvp227(f);
 assert.ok(view);
 const cmp=resumirAlternativasRubrosMvp255(f,view);
 assert.deepEqual(cmp.rubros.find(x=>x.rubro==='obra_gruesa')
  .articulosConReferenciasCoincidentes,['item_1']);
 assert.equal(JSON.stringify(cmp).includes('16500000'),false);
});
test('MVP255: rechazar precios falsos, sumarios adulterados, etiquetas privadas y supuestos de completitud',()=>{
 const mutations=[
  f=>f.ofertas[0].precios[0].centavos='sin control',
  f=>f.ofertas[0].precios[0].pedidoId='item_4',
  f=>f.ofertas[0].label='Corralón Nahuel',
  f=>f.ofertas[0].rubros[0].precioComprobado=0,
  f=>f.ofertas[0].rubros[0].faltantes=['item_1'],
  f=>f.ofertas[0].rubros[0].solicitados=2,
  f=>f.ofertas[0].rubros[0].respondidos=2,
  f=>f.contactos_revelados=true,
  f=>f.items[0].rubro='otro_rubro',
  f=>f.ofertas[0].iva='incluido_pero_no_probado'
 ];
 for(const change of mutations){
  const f=fixture(),original=vistaCotizacionesRubrosMvp227(f);
  assert.ok(original);
  change(f);
  assert.equal(resumirAlternativasRubrosMvp255(f,original),null);
 }
});
test('MVP255: ante campos privados adicionales solo sale una lista blanca de datos anónimos',()=>{
 const {f,vista}=projected();
 f.participant_key='supplier_real';
 f.document_original='CONFIDENTIAL';
 f.ofertas[0].supplier_phone='+54 221 111 2222';
 f.ofertas[0].chat_hmac='a'.repeat(64);
 const preview=resumirAlternativasRubrosMvp255(f,vista);
 assert.ok(preview);
 const encoded=JSON.stringify(preview);
 assert.doesNotMatch(encoded,/supplier_real|CONFIDENTIAL|supplier_phone|chat_hmac|\+54|document_original/);
 assert.equal(preview.rubros.length,3);
});
test('MVP255: mismo token RPC / Edge / proxy; nunca pasa un payload sin validación',()=>{
 assert.match(edge,/resumirAlternativasRubrosMvp255\(ai\.data,safe\)/);
 assert.match(edge,/comparador_rubros_ia:comparison/);
 assert.match(edge,/publicResult\?\.can_open===true&&\s*\(publicResult\.state==='waiting'/u);
 const source=response();
 const safe=buyerView(source);
 assert.ok(safe.comparador_rubros_ia);
 const actual=safeJson(safe.comparador_rubros_ia);
 assert.equal(actual.state,'alternativas_rubro_con_importes_sin_ranking');
 assert.equal(actual.rubros[0].opciones[0].ofertasAnonimas.length,2);
 const forged=structuredClone(source);
 forged.comparador_rubros_ia.rubros[0].opciones[0].supplier='Real Name';
 forged.comparador_rubros_ia.rubros[0].secret='PII';
 const cleaned=buyerView(forged);
 assert.ok(cleaned.comparador_rubros_ia);
 assert.doesNotMatch(JSON.stringify(cleaned),/Real Name|PII|secret|supplier/);
});
test('MVP255: proxy bloquea revocación, rubro errado, llamada sin can_open y campos injertados',()=>{
 const source=response();
 const mutations=[
  f=>f.comparador_rubros_ia.rubros[0].titulo='Datos de comercio',
  f=>f.comparador_rubros_ia.rubros[0].opciones[0].ofertasAnonimas[0]='Negocio X',
  f=>f.comparador_rubros_ia.rubros[0].opciones[0].articulosConPrecio=['item_900'],
  f=>f.comparador_rubros_ia.rubros[0].opciones[0].totalGlobalComparable=true,
  f=>f.comparador_rubros_ia.contactos_revelados=true,
  f=>f.comparador_rubros_ia.rubros[0].opciones[0].articulosPendientes.push('item_2')
 ];
 for(const change of mutations){
  const f=structuredClone(source);change(f);
  assert.equal(buyerView(f).comparador_rubros_ia,undefined);
 }
 assert.deepEqual(safeJson(buyerView({...source,state:'not_found'})),{state:'not_found'});
 assert.equal(buyerView({...source,can_open:false}).comparador_rubros_ia,undefined);
 assert.equal(buyerView({...source,state:'cancelled'}).comparador_rubros_ia,undefined);
});
class Node{
 constructor(){this.children=[];this.hidden=true;this.textContent='';
  this.className='';this.disabled=false;this.handlers={};}
 append(...children){this.children.push(...children)}
 appendChild(child){this.children.push(child);return child}
 replaceChildren(...children){this.children=children}
 addEventListener(kind,fn){this.handlers[kind]=fn}
}
async function webpage(responses){
 const nodes=new Map(),node=id=>{
  if(!nodes.has(id))nodes.set(id,new Node());
  return nodes.get(id);
 };
 let count=0;
 const fetch=async()=>{
  const next=responses[Math.min(count++,responses.length-1)];
  if(next?.network_error)throw Error('simulated network failure');
  return {ok:true,json:async()=>next};
 };
 let polling;
 const window={location:{hash:'#'+'a'.repeat(64)},addEventListener(){}};
 vm.runInNewContext(browserScript,{window,document:{
  getElementById:node,createElement:()=>new Node()
 },fetch,setInterval:fn=>{polling=fn;return 1}}, {timeout:1600});
 await new Promise(resolve=>setTimeout(resolve,0));
 return {node,refresh:async()=>{polling();await new Promise(r=>setTimeout(r,0))}};
}
test('MVP255: la pantalla real muestra 3 rubros, coberturas y no ganadores',async()=>{
 assert.match(html,/id="rubroCompareSection"/);
 assert.match(html,/id="rubroCompareGrid"/);
 const page=await webpage([buyerView(response())]);
 const section=page.node('rubroCompareSection');
 assert.equal(section.hidden,false);
 assert.equal(page.node('rubroCompareGrid').children.length,3);
 const txt=JSON.stringify(page.node('rubroCompareGrid'));
 assert.match(txt,/Presupuesto 1 \+ Presupuesto 2/u);
 assert.match(txt,/cobertura acreditada/u);
 assert.doesNotMatch(txt,/Corralón Nahuel|ganador|adjudicación automática/i);
});
test('MVP255: revocación posterior o error de red borra TODA la cobertura privada',async()=>{
 for(const last of [{state:'not_found'},{network_error:true}]){
  const page=await webpage([buyerView(response()),last]);
  assert.equal(page.node('rubroCompareSection').hidden,false);
  await page.refresh();
  assert.equal(page.node('rubroCompareSection').hidden,true);
  assert.equal(page.node('rubroCompareGrid').children.length,0);
 }
});
