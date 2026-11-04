import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluarEquivalenciaCatalogoMvp171 as evaluar} from
 '../../src/domain/equivalencia-catalogo-mvp171.ts';
import {interpretarBolsonAridosMvp164 as arido} from
 '../../src/domain/aridos-bolson-mvp164.ts';
import {prepararPresentacionesAridosMvp170 as preparar} from
 '../../src/domain/adaptador-documental-mvp162.ts';
import {compararCotizacionesOffline as comparar} from
 '../../src/domain/comparacion-ofertas.ts';

const item=(clave,valor,obligatorio=false)=>({clave,valor,obligatorio});
const base=()=>({
 familiaPedido:'hidrofugo',familiaOferta:'hidrofugo',
 familiaCatalogoAcreditada:true,fuenteProveedorAcreditada:true,
 unidadCanonicaPedido:'l',unidadCanonicaOferta:'l',
 cantidadCanonicaPedido:'5.000',cantidadCanonicaOferta:'5.000',
 conversionPresentacionAcreditada:true,
 atributosPedido:[item('marca','Tacurú')],atributosOferta:[item('marca','Marca del proveedor')]
});
test('MVP171: hidrófugo Tacurú contra otra marca es alternativa si no fue excluyente',()=>{
 const r=evaluar(base());
 assert.equal(r.estado,'alternativa_comercial_con_aclaracion');
 assert.equal(r.equivalenciaParaComparador,'comercial_razonable');
 assert.deepEqual(r.motivos,['marca_alternativa']);
 assert.equal(r.rankingHabilitado,false);
});
test('MVP171: si se exige marca exacta, marca distinta no pasa',()=>{
 const x=base();x.atributosPedido=[item('marca','Tacurú',true)];
 const r=evaluar(x);
 assert.equal(r.estado,'incompatible');
 assert.equal(r.equivalenciaParaComparador,null);
});
test('MVP171: familia misma acreditada pero oferta genérica no se descarta',()=>{
 const x=base();x.atributosOferta=[];
 const r=evaluar(x);
 assert.equal(r.estado,'alternativa_comercial_con_aclaracion');
 assert.deepEqual(r.motivos,['variante_no_declarada']);
});
test('MVP171: sin marca ni variantes exigidas equivale con la misma familia y magnitud',()=>{
 const x=base();x.atributosPedido=[];x.atributosOferta=[];
 const r=evaluar(x);assert.equal(r.estado,'compatible_exacto');
 assert.equal(r.equivalenciaParaComparador,'verificada');
});
test('MVP171: sin ficha de catálogo, la IA no puede afirmar familia',()=>{
 for(const patch of [{familiaCatalogoAcreditada:false},{fuenteProveedorAcreditada:false}]){
  const r=evaluar({...base(),...patch});
  assert.equal(r.estado,'no_acreditado');assert.equal(r.equivalenciaParaComparador,null);
 }
});
test('MVP171: hidrófugo no es impermeabilizante de membrana por mera similitud',()=>{
 const r=evaluar({...base(),familiaOferta:'membrana'});
 assert.equal(r.estado,'incompatible');
 assert.deepEqual(r.motivos,['familia_distinta']);
});
test('MVP171: 4L no cubre pedido 5L aunque ambas presentaciones sean bidones',()=>{
 const r=evaluar({...base(),cantidadCanonicaOferta:'4.000'});
 assert.equal(r.estado,'incompatible');
 assert.deepEqual(r.motivos,['cantidad_insuficiente']);
});
test('MVP171: 5L pedidos cubiertos por 5L normalizados, incluso 5 envases de 1L comprobados',()=>{
 const r=evaluar({...base(),cantidadCanonicaOferta:'5.000',
  unidadCanonicaOferta:'l',atributosPedido:[],atributosOferta:[]});
 assert.equal(r.estado,'compatible_exacto');
});
test('MVP171: 50kg CPC y dos bolsas 25kg requieren conversión de capacidad corroborada',()=>{
 const x={...base(),familiaPedido:'cemento_cpc',familiaOferta:'cemento_cpc',
  unidadCanonicaPedido:'kg',unidadCanonicaOferta:'kg',
  cantidadCanonicaPedido:'50.000',cantidadCanonicaOferta:'50.000',
  conversionPresentacionAcreditada:false,atributosPedido:[],atributosOferta:[]};
 assert.equal(evaluar(x).estado,'no_acreditado');
 assert.equal(evaluar({...x,conversionPresentacionAcreditada:true}).estado,'compatible_exacto');
});
test('MVP171: 25kg no equivalen a 50kg aunque ambas sean bolsas',()=>{
 const r=evaluar({...base(),familiaPedido:'cemento_cpc',familiaOferta:'cemento_cpc',
  unidadCanonicaPedido:'kg',unidadCanonicaOferta:'kg',
  cantidadCanonicaPedido:'50.000',cantidadCanonicaOferta:'25.000'});
 assert.equal(r.estado,'incompatible');
});
test('MVP171: cable 2,5mm² no equivale a 1,5mm²',()=>{
 const x={...base(),familiaPedido:'cable_cobre',familiaOferta:'cable_cobre',
  unidadCanonicaPedido:'m',unidadCanonicaOferta:'m',
  atributosPedido:[item('seccion_mm2','2.5')],atributosOferta:[item('seccion_mm2','1.5')]};
 assert.equal(evaluar(x).estado,'incompatible');
});
test('MVP171: cable sin sección explícita no puede acreditarse por suposición',()=>{
 const x={...base(),familiaPedido:'cable_cobre',familiaOferta:'cable_cobre',
  unidadCanonicaPedido:'m',unidadCanonicaOferta:'m',
  atributosPedido:[item('seccion_mm2','2.5')],atributosOferta:[]};
 assert.equal(evaluar(x).estado,'no_acreditado');
 assert.deepEqual(evaluar(x).motivos,['exigencia_no_acreditada']);
});
test('MVP171: atributo obligatorio distinto de marca no se saltea',()=>{
 const x=base();x.atributosPedido=[item('tipo','cemento_cpc',true)];
 x.atributosOferta=[];
 assert.equal(evaluar(x).estado,'no_acreditado');
});
test('MVP171: incompatibilidad real de variante explícita bloquea',()=>{
 const x=base();x.atributosPedido=[item('granulometria','fina')];
 x.atributosOferta=[item('granulometria','gruesa')];
 assert.equal(evaluar(x).estado,'incompatible');
});
test('MVP171: variante no informada, no excluyente, es alternativa y no rechazo',()=>{
 const x=base();x.atributosPedido=[item('granulometria','fina')];
 x.atributosOferta=[];
 assert.equal(evaluar(x).estado,'alternativa_comercial_con_aclaracion');
});
test('MVP171: no se aceptan cantidades negativas o excedidas por notación maliciosa',()=>{
 for(const cantidad of ['-5','1e3','0','NaN','1.0000','50000000000']){
  assert.equal(evaluar({...base(),cantidadCanonicaOferta:cantidad}).estado,
   'no_acreditado',cantidad);
 }
});
test('MVP171: atributo repetido, clave arbitraria o fuente mal formada invalidan',()=>{
 for(const attributes of [
  [item('marca','A'),item('marca','B')],
  [item('Token secreto','clave')],
  [item('marca','A'.repeat(200))]
 ]){
  const r=evaluar({...base(),atributosOferta:attributes});
  assert.equal(r.estado,'no_acreditado');
 }
});
test('MVP171: never presume ranking, contacto o precio fiscal desde rubro acreditado',()=>{
 for(const x of [base(),{...base(),atributosPedido:[],atributosOferta:[]}]){
  const r=evaluar(x);
  assert.equal(r.rankingHabilitado,false);
  assert.equal(r.contactosRevelados,false);
  assert.equal(Object.hasOwn(r,'ivaPorcentaje'),false);
  assert.equal(Object.hasOwn(r,'precioUnitarioNeto'),false);
 }
});
test('MVP171: comprador sin exclusividad: arena fina => BIG BAG arena, con aclaración',()=>{
 const d={
  requestId:'req_a',anonId:'anon_aaa',messageHmac:'b'.repeat(64),sourceSha256:'a'.repeat(64),
  declaredTotalLiteral:'$ 100,00',
  lineas:[{lineNo:1,descriptionLiteral:'BIG BAG de Arena',quantityLiteral:'1',
   unitLiteral:null,unitPriceLiteral:'$ 100,00',lineTotalLiteral:'$ 100,00'}],
  prueba:{requestId:'req_a',messageHmac:'b'.repeat(64),sourceSha256:'a'.repeat(64),
   version:9,state:'verified',reason:'covered',lineCount:1,
   sumLineCents:'10000',declaredTotalCents:'10000',rankingAllowed:false,
   revisionVigente:true,cotizacionVigente:true}
 };
 const facts={requestId:'req_a',messageHmac:'b'.repeat(64),
  sourceSha256:'a'.repeat(64),state:'source_checked',rankingAllowed:false,
  sourceImmutabilityPreserved:true,
  lines:[{lineNo:1,unitStatus:'not_explicit',unit:null,
   presentation:'big_bag',page:1,row:3}]};
 const pedido=[{id:'arena_001',descripcionLiteral:'arena fina',
  cantidad:'1.000',unidad:'m3'}];
 const r=preparar(pedido,d,facts);
 assert.equal(r.diagnosticos[0].estado,'alternativa_comercial_con_aclaracion');
 assert.equal(r.correlaciones[0].equivalencia,'comercial_razonable');
 assert.equal(r.correlaciones[0].disponibilidadCorroborada,false);
 assert.equal(r.puente.ofertaComparable,null);
 assert.ok(r.puente.motivos.includes('disponibilidad_sin_acreditar'));
});
test('MVP171: EXCLUSIVAMENTE arena fina mantiene exclusión de variedad no declarada',()=>{
 const r=arido({
  pedidoDescripcion:'EXCLUSIVAMENTE arena fina',pedidoCantidad:'1',pedidoUnidad:'m3',
  ofertaDescripcion:'BIG BAG de arena',ofertaCantidad:'1',presentacionFuente:'big_bag',
  fuenteVerificada:true,presentacionComprobada:true
 });
 assert.equal(r.estado,'variedad_no_informada');
 assert.equal(r.permiteRanking,false);
});
test('MVP171: fuente arena gruesa explícita contradice fina, nunca es alternativa razonable',()=>{
 const r=arido({
  pedidoDescripcion:'arena fina',pedidoCantidad:'1',pedidoUnidad:'m3',
  ofertaDescripcion:'BIG BAG de arena gruesa',ofertaCantidad:'1',presentacionFuente:'big_bag',
  fuenteVerificada:true,presentacionComprobada:true
 });
 assert.equal(r.estado,'variedad_distinta');
});
test('MVP171: comparador permite alternativa comercial con advertencia SIN comparar IVA inventado',()=>{
 const pedido={items:[{id:'arena_001',cantidad:'1',unidad:'m3'}]};
 const offer=(anonId,amount,iva='21')=>({anonId,version:9,confirmada:true,moneda:'ARS',
  formaPago:'contado',plazoEntregaDias:2,fleteFinal:'0.00',minimoCompraFinal:'0.00',
  items:[{itemId:'arena_001',unidad:'m3',cantidadDisponible:'1',
   equivalencia:'comercial_razonable',precioUnitarioNeto:amount,ivaPorcentaje:iva}]});
 const result=comparar(pedido,[offer('anon_a','100.00')]);
 assert.equal(result.cobertura[0].lineasCompletas,1);
 assert.equal(result.cobertura[0].lineas[0].advertencia,'variante_no_especificada_por_proveedor');
 assert.equal(result.opcionesCompletas[0].advertencias[0].itemId,'arena_001');
 assert.equal(result.opcionesCompletas[0].totalFinal,'121.00');
 assert.equal(result.adjudicacionAutomatica,false);
 const withoutVAT=comparar(pedido,[offer('anon_b','80.00',null)]);
 assert.equal(withoutVAT.opcionesCompletas.length,0);
 assert.ok(withoutVAT.cobertura[0].motivos.includes('precio_o_iva_desconocido'));
});
test('MVP171: alternativa no sustituye a una oferta incompatible ni fracciona un ítem',()=>{
 const pedido={items:[{id:'item_001',unidad:'bag',cantidad:'10'}]};
 const offer=(anonId,eq,q='10')=>({anonId,version:1,confirmada:true,moneda:'ARS',
  formaPago:'contado',plazoEntregaDias:2,fleteFinal:'0.00',minimoCompraFinal:'0.00',
  items:[{itemId:'item_001',unidad:'bag',cantidadDisponible:q,
   equivalencia:eq,precioUnitarioNeto:'10.00',ivaPorcentaje:'21'}]});
 const result=comparar(pedido,[offer('anon_a','incompatible'),offer('anon_b','sin_verificar'),
  offer('anon_c','comercial_razonable','9')]);
 assert.equal(result.opcionesCompletas.length,0);
 assert.equal(result.cobertura[2].lineas[0].motivo,'cantidad_insuficiente');
});

test('MVP171: descripción con dos variedades opuestas NO pasa como genérica',()=>{
 for(const entrada of [
  {pedido:'arena fina',cotizado:'BIG BAG de arena fina y gruesa'},
  {pedido:'piedra partida',cotizado:'BIG BAG piedra partida o rodada'}
 ]){
  const r=arido({
   pedidoDescripcion:entrada.pedido,pedidoCantidad:'1',pedidoUnidad:'m3',
   ofertaDescripcion:entrada.cotizado,ofertaCantidad:'1',
   presentacionFuente:'big_bag',fuenteVerificada:true,presentacionComprobada:true
  });
  assert.equal(r.estado,'variedad_distinta',entrada.cotizado);
 }
});
test('MVP171: recomendación combinada conserva la advertencia del proveedor asignado',()=>{
 const pedido={items:[
  {id:'arena_001',cantidad:'1',unidad:'m3'},
  {id:'cable_001',cantidad:'1',unidad:'m'}
 ]};
 const a={anonId:'anon_a',version:9,confirmada:true,moneda:'ARS',
  formaPago:'contado',plazoEntregaDias:2,fleteFinal:'0.00',minimoCompraFinal:'0.00',
  items:[{itemId:'arena_001',unidad:'m3',cantidadDisponible:'1',
   equivalencia:'comercial_razonable',precioUnitarioNeto:'20.00',ivaPorcentaje:'21'}]};
 const b={anonId:'anon_b',version:9,confirmada:true,moneda:'ARS',
  formaPago:'contado',plazoEntregaDias:2,fleteFinal:'0.00',minimoCompraFinal:'0.00',
  items:[{itemId:'cable_001',unidad:'m',cantidadDisponible:'1',
   equivalencia:'verificada',precioUnitarioNeto:'10.00',ivaPorcentaje:'21'}]};
 const result=comparar(pedido,[a,b]);
 assert.equal(result.opcionesCompletas.length,1);
 assert.deepEqual(result.opcionesCompletas[0].proveedoresAnonimos,['anon_a','anon_b']);
 assert.deepEqual(result.opcionesCompletas[0].advertencias,
  [{itemId:'arena_001',tipo:'variante_no_especificada_por_proveedor'}]);
 assert.equal(result.adjudicacionAutomatica,false);
});

test('MVP171: negocio sin catálogo no queda afuera si su archivo acredita la familia',()=>{
 const x={...base(),familiaCatalogoAcreditada:false,
  familiaCotejadaEnTextoFuente:true,atributosOferta:[]};
 const r=evaluar(x);
 assert.equal(r.estado,'alternativa_comercial_con_aclaracion');
 assert.equal(r.equivalenciaParaComparador,'comercial_razonable');
 assert.equal(r.contactosRevelados,false);
});
test('MVP171: la IA sola sin fuente ni catálogo no habilita emparejamientos',()=>{
 const r=evaluar({...base(),familiaCatalogoAcreditada:false,
  familiaCotejadaEnTextoFuente:false});
 assert.equal(r.estado,'no_acreditado');
 assert.equal(r.rankingHabilitado,false);
});
