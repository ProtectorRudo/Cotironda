import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {evaluarLecturasSemanticasV1,validarRuteoSemanticoV1,
 asociarCotizacionV1} from '../../src/domain/ia-central/contrato-v1.ts';
import {resumirRubrosCompradorMvp216} from
 '../../src/domain/rubros-comprador-mvp216.ts';

// El validador NO tiene que conocer «cem», «bigbeg», «int térmica» ni
// equivalencias regionales. Esa comprensión la aporta el modelo.
const source='qiero 20 bols cem cpc 50k, 3 bigbegs arna y 2 bolsones piedra; obra en La Plata';
const snippets=[
 '20 bols cem cpc 50k','3 bigbegs arna','2 bolsones piedra'
];
function item(e,description,quantity,rubro,unidad='m3'){
 const start=source.indexOf(e);
 return {evidencia:e,inicio:start,fin:start+e.length,descripcion:description,
  cantidad:String(quantity),unidad,rubro,presentacion:null,aclaracion:null};
}
const proposal={intencion:'cotizar',zona_entrega:'La Plata',dudas:[],articulos:[
 item(snippets[0],'Cemento CPC, bolsa 50 kg',20,'obra_gruesa','bag'),
 item(snippets[1],'Arena en big bag de 1 m³ nominal',3,'obra_gruesa'),
 item(snippets[2],'Piedra en bolsón de 1 m³ nominal',2,'obra_gruesa')
]};
const second={integridad:'completa',zona_entrega:'La Plata',
 articulos:proposal.articulos.map(x=>({
  evidencia:x.evidencia,cantidad:x.cantidad,unidad:x.unidad,rubro:x.rubro
 }))};
test('IA Central acepta lenguaje libre y typos con dos lecturas que concuerdan',()=>{
 const r=evaluarLecturasSemanticasV1(source,proposal,second);
 assert.equal(r.estado,'listo_para_preparar');
 assert.equal(r.pedido.articulos.length,3);
 assert.equal(r.pedido.articulos[1].descripcion,'Arena en big bag de 1 m³ nominal');
});
test('IA Central rechaza prueba textual fabricada, repetida o sin origen',()=>{
 const fake=structuredClone(proposal);
 fake.articulos[1].evidencia='3 bolsones de pintura';
 assert.equal(evaluarLecturasSemanticasV1(source,fake,second).estado,'rechazado');
 const overlap=structuredClone(proposal);
 overlap.articulos[2].inicio=overlap.articulos[1].inicio;
 overlap.articulos[2].fin=overlap.articulos[1].fin;
 overlap.articulos[2].evidencia=overlap.articulos[1].evidencia;
 assert.equal(evaluarLecturasSemanticasV1(source,overlap,second).estado,'rechazado');
});
test('IA Central no permite una cantidad distinta, renglones perdidos ni zona ausente',()=>{
 const changed=structuredClone(second);changed.articulos[1].cantidad='30';
 assert.equal(evaluarLecturasSemanticasV1(source,proposal,changed).estado,'requiere_aclaracion');
 assert.equal(evaluarLecturasSemanticasV1(source,proposal,
  {...second,integridad:'faltan_articulos'}).estado,'requiere_aclaracion');
 assert.equal(evaluarLecturasSemanticasV1(source,{...proposal,zona_entrega:null},
  {...second,zona_entrega:null}).motivo,'zona_de_entrega_faltante');
});
test('Ruteo consulta catálogo y permisos sin un diccionario de marcas',()=>{
 const pedido=evaluarLecturasSemanticasV1(source,proposal,second).pedido;
 const suppliers=[
  {key:'corralon_ailin',consentido:true,activo:true,zona:'La Plata',rubros:['obra_gruesa']},
  {key:'pintureria_sur',consentido:true,activo:true,zona:'La Plata',rubros:['pintura']},
  {key:'otro_proveedor',consentido:false,activo:true,zona:'La Plata',rubros:['obra_gruesa']}
 ];
 const good=validarRuteoSemanticoV1(pedido,suppliers,
  [{proveedor:'corralon_ailin',articulos:[0,1,2]}]);
 assert.equal(good.estado,'ruteo_verificado');
 assert.equal(validarRuteoSemanticoV1(pedido,suppliers,
  [{proveedor:'pintureria_sur',articulos:[0]}]).estado,'requiere_revision');
 assert.equal(validarRuteoSemanticoV1(pedido,suppliers,
  [{proveedor:'otro_proveedor',articulos:[0]}]).estado,'requiere_revision');
});
test('Cotización sin referencia con dos rondas NO se adivina por IA',()=>{
 const invitations=[
  {idRonda:'r1',proveedor:'corralon_ailin',whapiId:'msg1',codigo:'COTI-1',vigente:true},
  {idRonda:'r2',proveedor:'corralon_ailin',whapiId:'msg2',codigo:'COTI-2',vigente:true}
 ];
 const args={proveedor:'corralon_ailin',respuestaAWhapiId:null,
  codigoRonda:null,invitaciones:invitations};
 assert.deepEqual(asociarCotizacionV1(args),{estado:'ambigua',idRonda:null});
 assert.deepEqual(asociarCotizacionV1({...args,respuestaAWhapiId:'msg2'}),
  {estado:'asociada',idRonda:'r2'});
 assert.deepEqual(asociarCotizacionV1({...args,codigoRonda:'COTI-1'}),
  {estado:'asociada',idRonda:'r1'});
 assert.deepEqual(asociarCotizacionV1({...args,respuestaAWhapiId:'msg-unrelated'}),
  {estado:'sin_ronda',idRonda:null});
});
const publicStatus={state:'closed',can_open:true};
const prices={state:'importes_por_articulo_sin_ranking',
 ranking_allowed:false,contacts_revealed:false,
 articulos:[{itemId:'item_001'},{itemId:'item_002'},{itemId:'item_003'}]};
const privateInput={state:'private_inputs',rankingAllowed:false,contactsRevealed:false,
 requestItems:[
  {id:'item_001',familia:'cemento_gris_obra'},
  {id:'item_002',familia:'pintura_interior',rubro:'pintura'},
  {id:'item_003',familia:'cable_2_5mm',rubro:'electricidad'}
 ]};
test('Rubros seguros organizan obra gruesa, pintura y electricidad',()=>{
 const result=resumirRubrosCompradorMvp216(publicStatus,privateInput,prices);
 assert.deepEqual(result.items.map(x=>x.rubro),['obra_gruesa','pintura','electricidad']);
 assert.equal(result.contacts_revealed,false);
 assert.equal(result.ranking_allowed,false);
 assert.equal(resumirRubrosCompradorMvp216(publicStatus,
  {...privateInput,requestItems:privateInput.requestItems.slice(0,2)},prices),null);
 assert.equal(resumirRubrosCompradorMvp216({...publicStatus,can_open:false},
  privateInput,prices),null);
});
test('UI: mapa por rubro se presenta como secciones, sin inventar precios',async()=>{
 const raw=readFileSync(new URL('../../piloto/seguimiento-web/site.js',import.meta.url),'utf8');
 class FakeNode{
  constructor(){this.children=[];this.hidden=false;this.textContent='';this.className=''}
  append(...items){this.children.push(...items)}
  appendChild(x){this.children.push(x);return x}
  replaceChildren(){this.children=[]}
 }
 const dom=new Map();const el=id=>{
  if(!dom.has(id))dom.set(id,new FakeNode());return dom.get(id);
 };
 const labels=['Presupuesto 1'];
 const priceData={state:'importes_por_articulo_sin_ranking',quotations:1,
  requested_items:3,
  articulos:[
   {itemId:'item_001',descripcionSolicitada:'Cemento',
    cantidadSolicitada:'20.000',unidadSolicitada:'bag'},
   {itemId:'item_002',descripcionSolicitada:'Pintura látex',
    cantidadSolicitada:'2.000',unidadSolicitada:'unit'},
   {itemId:'item_003',descripcionSolicitada:'Cable',
    cantidadSolicitada:'50.000',unidadSolicitada:'m'}
  ].map(item=>({...item,referencias:[{
   oferta:labels[0],importeCotizado:null,cantidadCotizadaLiteral:null,
   estado:'sin_importe_asignable',iva:'sin_iva_por_convencion'
  }]})),
  ranking_allowed:false,price_comparable:false,contacts_revealed:false,
  adjudicacion:false,originales_descargables:false,IVA_calculado:false,
  flete_calculado:false,stock_confirmado:false
 };
 const d={state:'waiting',can_open:true,received_count:1,
  deadline:'2026-11-10T15:00:00Z',files_pending_review:0,
  offers:[{label:labels[0],text:'texto presupuesto'}],item_prices:priceData,
  economy:{state:'economia_observada_sin_ranking',quotations:1,
   ranking_allowed:false,price_comparable:false,contacts_revealed:false},
  rubros:resumirRubrosCompradorMvp216(publicStatus,privateInput,prices)
 };
 const script=raw;
 vm.runInNewContext(script,{
  document:{getElementById:el,createElement:()=>new FakeNode()},
  window:{location:{hash:'#'+'a'.repeat(64)}},
  fetch:async()=>({ok:true,json:async()=>d}),setInterval:()=>{}
 },{timeout:1400});
 await new Promise(resolve=>setTimeout(resolve,0));
 const groups=el('itemPricesGrid').children;
 assert.equal(groups.length,3);
 const body=JSON.stringify(groups);
 assert.match(body,/Obra gruesa/);
 assert.match(body,/Pintura/);
 assert.match(body,/Electricidad/);
 assert.match(body,/Sin importe asociable/);
 assert.doesNotMatch(body,/Ganador|Primer puesto|Adjudicado/u);
});
