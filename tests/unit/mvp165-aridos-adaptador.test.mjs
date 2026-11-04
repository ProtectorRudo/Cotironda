import test from 'node:test';
import assert from 'node:assert/strict';
import {adaptarDocumentoMvp162} from '../../src/domain/adaptador-documental-mvp162.ts';
import {recomendarHastaDosOffline} from '../../src/domain/recomendaciones-mvp160.ts';

const SHA='a'.repeat(64),HMAC='b'.repeat(64),REQUEST='ronda_mvp165';
const pedido=()=>({items:[
 {id:'arena_001',cantidad:'1',unidad:'m3'},
 {id:'piedra_001',cantidad:'2',unidad:'m3'},
 {id:'cemento_001',cantidad:'25',unidad:'bag'}
]});
const documento=()=>({
 requestId:REQUEST,anonId:'anon_prueba',messageHmac:HMAC,sourceSha256:SHA,
 declaredTotalLiteral:'$ 544,50',
 lineas:[
  {lineNo:1,descriptionLiteral:'BIG BAG de arena fina',quantityLiteral:'1',
   unitLiteral:null,unitPriceLiteral:'$ 100,00',lineTotalLiteral:'$ 121,00'},
  {lineNo:2,descriptionLiteral:'2 BIG BAG piedra partida',quantityLiteral:'2',
   unitLiteral:null,unitPriceLiteral:'$ 50,00',lineTotalLiteral:'$ 121,00'},
  {lineNo:3,descriptionLiteral:'Cemento gris CPC de 25 kg',quantityLiteral:'25',
   unitLiteral:'bolsas',unitPriceLiteral:'$ 10,00',lineTotalLiteral:'$ 302,50'}
 ],
 prueba:{requestId:REQUEST,messageHmac:HMAC,sourceSha256:SHA,
  version:9,state:'verified',reason:'covered',lineCount:3,
  sumLineCents:'54450',declaredTotalCents:'54450',
  rankingAllowed:false,revisionVigente:true,cotizacionVigente:true}
});
const correlaciones=()=>[
 {itemId:'arena_001',lineNo:1,sourceSha256:SHA,equivalencia:'verificada',disponibilidadCorroborada:true},
 {itemId:'piedra_001',lineNo:2,sourceSha256:SHA,equivalencia:'verificada',disponibilidadCorroborada:true},
 {itemId:'cemento_001',lineNo:3,sourceSha256:SHA,equivalencia:'verificada',disponibilidadCorroborada:true}
];
const pruebas=()=>[
 {itemId:'arena_001',lineNo:1,sourceSha256:SHA,
  pedidoDescripcionLiteral:'arena fina',presentacionFuente:'big_bag'},
 {itemId:'piedra_001',lineNo:2,sourceSha256:SHA,
  pedidoDescripcionLiteral:'piedra partida',presentacionFuente:'big_bag'}
];
const terminos=()=>({
 sourceSha256:SHA,sourceVerified:true,moneda:'ARS',pago:'contado',
 plazoEntregaDias:2,fleteFinal:'0.00',minimoCompraFinal:'0.00',
 tratamientoFlete:'sin_cargo',
 precios:[
  {lineNo:1,sourceSha256:SHA,unitarioNetoTrasDescuento:'100.00',ivaExplicito:'21',tratamientoIva:'incluido_en_total'},
  {lineNo:2,sourceSha256:SHA,unitarioNetoTrasDescuento:'50.00',ivaExplicito:'21',tratamientoIva:'incluido_en_total'},
  {lineNo:3,sourceSha256:SHA,unitarioNetoTrasDescuento:'10.00',ivaExplicito:'21',tratamientoIva:'incluido_en_total'}
 ]
});
const adaptar=(d=documento(),e=correlaciones(),t=terminos(),b=pruebas(),p=pedido())=>
 adaptarDocumentoMvp162(p,d,e,t,b);

test('MVP165: puente puro de 1 y 2 BIG BAG nominales con variedad EXPRESA, sin tocar originales',()=>{
 const d=documento(),original=structuredClone(d);
 const resultado=adaptar(d);
 assert.deepEqual(d,original);
 assert.equal(resultado.estado,'comparable');
 assert.deepEqual(resultado.motivos,[]);
 assert.deepEqual(resultado.ofertaComparable.items.map(x=>[x.unidad,x.cantidadDisponible]),
  [['m3','1'],['m3','2'],['bag','25']]);
 const ranking=recomendarHastaDosOffline(pedido(),[resultado.ofertaComparable]);
 assert.equal(ranking.estado,'alternativas_comparables');
 assert.equal(ranking.opcionPrincipal.totalFinal,'544.50');
 assert.deepEqual(ranking.recomendadosAnonimos,['anon_prueba']);
 assert.equal(ranking.contactosRevelados,false);
 assert.equal(ranking.adjudicacion,false);
 assert.equal(resultado.originalesDescargables,false);
 assert.ok(!JSON.stringify(resultado).includes(SHA));
});

test('MVP165: no normaliza ARIDOS sin prueba de presentación exacta',()=>{
 for(const b of [[],[pruebas()[0]],[pruebas()[1]]]){
  const r=adaptar(documento(),correlaciones(),terminos(),b);
  assert.equal(r.estado,'visible_no_comparable');
  assert.ok(r.motivos.includes('unidad_sin_acreditar'));
 }
});

test('MVP171: arena y piedra genéricas son alternativas razonables, no sustitución textual exacta',()=>{
 for(const anon of ['anon_ailin','anon_nahuel']){
  const d=documento();d.anonId=anon;
  d.lineas[0].descriptionLiteral='BIG BAG de Arena; Dscto. 22.4%';
  d.lineas[1].descriptionLiteral='BIG BAG de Piedra; Dscto. 0.0%';
  const r=adaptar(d);
  assert.equal(r.estado,'comparable');
  assert.deepEqual(r.articulosSinCobertura,[]);
  assert.deepEqual(r.ofertaComparable.items.slice(0,2).map(x=>x.equivalencia),
   ['comercial_razonable','comercial_razonable']);
  const ranking=recomendarHastaDosOffline(pedido(),[r.ofertaComparable]);
  assert.equal(ranking.opcionPrincipal.advertencias.length,2);
  assert.equal(ranking.contactosRevelados,false);
 }
});

test('MVP165: variantes contradictorias y familias distintas se rechazan pese a equivalencia externa',()=>{
 const descriptions=['BIG BAG arena gruesa','BIG BAG piedra partida','BIG BAG cascote'];
 for(const name of descriptions){
  const d=documento();d.lineas[0].descriptionLiteral=name;
  const r=adaptar(d);
  assert.equal(r.estado,'visible_no_comparable',name);
  assert.ok(r.motivos.includes('equivalencia_sin_acreditar'),name);
 }
});

test('MVP165: alias big biag y bolsón con familia y variedad explícitas sí son comerciales',()=>{
 const d=documento();
 d.lineas[0].descriptionLiteral='Big biag arena fina';
 d.lineas[1].descriptionLiteral='Bolson de piedra partida';
 const b=pruebas();b[1].presentacionFuente='bolson';
 assert.equal(adaptar(d,correlaciones(),terminos(),b).estado,'comparable');
});

test('MVP165: envases de 0,75 m3, jumbo o peso no son precio por m3 automáticamente',()=>{
 for(const name of ['BIG BAG de arena fina 0,75 m3',
  'BIG BAG mini de arena fina','BIG BAG arena fina 500 kg']){
  const d=documento();d.lineas[0].descriptionLiteral=name;
  const r=adaptar(d);
  assert.equal(r.estado,'visible_no_comparable',name);
  assert.equal(r.ofertaComparable,null);
 }
});

test('MVP165: capacidad expresa de 2 m3 por bolsón no convierte precio unitario de bolsa a m3',()=>{
 const d=documento();d.lineas[0].descriptionLiteral='BIG BAG arena fina 2 m3';
 const r=adaptar(d);
 assert.equal(r.estado,'visible_no_comparable');
 assert.equal(r.ofertaComparable,null);
});

test('MVP165: no acepta unidad fuente contradictoria ni cantidad ausente',()=>{
 const d=documento();d.lineas[0].unitLiteral='kg';
 const r=adaptar(d);
 assert.ok(r.motivos.includes('unidad_sin_acreditar'));
 const d2=documento();d2.lineas[0].quantityLiteral=null;
 assert.ok(adaptar(d2).motivos.includes('cantidad_sin_acreditar'));
});

test('MVP165: conteo de bolsones distinto al pedido sigue siendo cantidad insuficiente',()=>{
 const d=documento();d.lineas[1].quantityLiteral='1';
 const r=adaptar(d);
 assert.equal(r.estado,'visible_no_comparable');
 assert.ok(r.motivos.includes('cantidad_sin_acreditar'));
});

test('MVP165: un documento o revision no vigente no habilita conversión',()=>{
 for(const patch of [
  {revisionVigente:false},{cotizacionVigente:false},{state:'needs_source_review'}
 ]){
  const d=documento();d.prueba={...d.prueba,...patch};
  assert.equal(adaptar(d).estado,'fuente_no_verificada');
 }
});

test('MVP165: pruebas cruzadas SHA, linea, alias y duplicados no habilitan ranking',()=>{
 const b=pruebas();
 for(const pruebasFalsas of [
  [{...b[0],sourceSha256:'c'.repeat(64)},b[1]],
  [{...b[0],lineNo:2},b[1]],
  [{...b[0],presentacionFuente:'bolson'},b[1]],
  [b[0],b[0],b[1]]
 ]){
  const r=adaptar(documento(),correlaciones(),terminos(),pruebasFalsas);
  assert.notEqual(r.estado,'comparable');
  assert.equal(r.ofertaComparable,null);
 }
});

test('MVP165: sin disponibilidad acreditada, IVA o flete explícitos NO hay precio final',()=>{
 const e=correlaciones();e[0].disponibilidadCorroborada=false;
 assert.ok(adaptar(documento(),e).motivos.includes('disponibilidad_sin_acreditar'));
 for(const t of [
  {...terminos(),fleteFinal:null},
  {...terminos(),pago:null},
  {...terminos(),precios:terminos().precios.map((x,i)=>i===0?{...x,ivaExplicito:null}:x)}
 ]){
  const r=adaptar(documento(),correlaciones(),t);
  assert.equal(r.estado,'visible_no_comparable');
 }
});

test('MVP165: un descuento o unitario inventado no pasa la suma centavo a centavo',()=>{
 const t=terminos();
 t.precios[0].unitarioNetoTrasDescuento='120.00';
 const r=adaptar(documento(),correlaciones(),t);
 assert.equal(r.estado,'visible_no_comparable');
 assert.ok(r.motivos.includes('importe_no_conciliado'));
});

test('MVP165: no descarta extras/pallets de la fuente ni habilita oferta parcial engañosa',()=>{
 const d=documento();
 d.lineas.push({lineNo:4,descriptionLiteral:'Pallet',quantityLiteral:'1',
  unitLiteral:'unidad',unitPriceLiteral:'$ 10,00',lineTotalLiteral:'$ 10,00'});
 d.declaredTotalLiteral='$ 554,50';
 d.prueba={...d.prueba,lineCount:4,sumLineCents:'55450',declaredTotalCents:'55450'};
 const r=adaptar(d);
 assert.equal(r.estado,'visible_no_comparable');
 assert.deepEqual(r.lineasNoAsignadas,[4]);
 assert.ok(r.motivos.includes('extras_sin_clasificar'));
});

test('MVP165: presentación BIG BAG no se aplica a cemento aunque cantidad y precio coincidan',()=>{
 const d=documento();d.lineas[0].descriptionLiteral='BIG BAG de cemento';
 const r=adaptar(d);
 assert.equal(r.estado,'visible_no_comparable');
 assert.equal(r.ofertaComparable,null);
});

test('MVP165: sin atestación de equivalencia técnica de fuente no confía solo en el envase',()=>{
 const e=correlaciones();e[0].equivalencia='sin_verificar';
 const r=adaptar(documento(),e);
 assert.ok(r.motivos.includes('equivalencia_sin_acreditar'));
 assert.equal(r.ofertaComparable,null);
});
