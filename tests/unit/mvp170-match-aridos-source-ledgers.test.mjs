import test from 'node:test';
import assert from 'node:assert/strict';
import {prepararPresentacionesAridosMvp170 as preparar} from
 '../../src/domain/adaptador-documental-mvp162.ts';

const SHA='a'.repeat(64),HMAC='b'.repeat(64);
const REQUEST='469cb459-5f00-49c2-b0b9-bc8b11e5c900';
const pedido=(a='Arena fina',p='Piedra partida')=>[
 {id:'arena_001',descripcionLiteral:a,cantidad:'1.000',unidad:'m3'},
 {id:'piedra_001',descripcionLiteral:p,cantidad:'2.000',unidad:'m3'},
 {id:'cemento_001',descripcionLiteral:'Cemento gris obra',cantidad:'20.000',unidad:'bag'}
];
const doc=()=>({
 requestId:REQUEST,anonId:'anon_proveedor',messageHmac:HMAC,sourceSha256:SHA,
 declaredTotalLiteral:'$ 300,00',
 lineas:[
  {lineNo:1,descriptionLiteral:'BIG BAG de Arena',quantityLiteral:'1,00',
   unitLiteral:null,unitPriceLiteral:'$ 100,00',lineTotalLiteral:'$ 100,00'},
  {lineNo:2,descriptionLiteral:'BIG BAG de Piedra',quantityLiteral:'2,00',
   unitLiteral:null,unitPriceLiteral:'$ 100,00',lineTotalLiteral:'$ 200,00'}
 ],
 prueba:{requestId:REQUEST,messageHmac:HMAC,sourceSha256:SHA,
  version:9,state:'verified',reason:'covered',lineCount:2,
  sumLineCents:'30000',declaredTotalCents:'30000',
  rankingAllowed:false,revisionVigente:true,cotizacionVigente:true}
});
const source=()=>({
 requestId:REQUEST,messageHmac:HMAC,sourceSha256:SHA,state:'source_checked',
 rankingAllowed:false,sourceImmutabilityPreserved:true,
 lines:[
  {lineNo:1,unitStatus:'not_explicit',unit:null,
   presentation:'big_bag',page:1,row:5},
  {lineNo:2,unitStatus:'not_explicit',unit:null,
   presentation:'big_bag',page:1,row:6}
 ]
});
const check=r=>{
 assert.equal(r.rankingHabilitado,false);
 assert.equal(r.contactosRevelados,false);
 if(r.puente){
  assert.equal(r.puente.contactosRevelados,false);
  assert.equal(r.puente.originalesDescargables,false);
  assert.equal(r.puente.ofertaComparable,null);
 }
};
test('MVP170: arena fina + piedra partida del pedido NO se inventan desde BIG BAG genéricos',()=>{
 const r=preparar(pedido(),doc(),source());
 assert.equal(r.estado,'preparacion_offline');
 assert.deepEqual(r.diagnosticos.map(x=>x.estado),[
  'alternativa_comercial_con_aclaracion','alternativa_comercial_con_aclaracion','no_aplica'
 ]);
 assert.equal(r.correlaciones.length,2);
 assert.equal(r.pruebasBolson.length,2);
 assert.ok(r.correlaciones.every(x=>x.equivalencia==='comercial_razonable'&&x.disponibilidadCorroborada===false));
 check(r);
});
test('MVP170: arena y piedra genéricas sí admiten nominal 1m3/BIG BAG y 2m3/2 BIG BAG',()=>{
 const d=doc(),r=preparar(pedido('Arena','Piedra'),d,source());
 assert.deepEqual(r.diagnosticos.map(x=>x.estado),[
  'coincide_volumen_nominal_sin_stock','coincide_volumen_nominal_sin_stock','no_aplica'
 ]);
 assert.deepEqual(r.correlaciones.map(x=>[x.itemId,x.lineNo,x.disponibilidadCorroborada]),[
  ['arena_001',1,false],['piedra_001',2,false]
 ]);
 assert.equal(r.pruebasBolson.length,2);
 assert.equal(r.pruebasBolson[0].presentacionFuente,'big_bag');
 assert.equal(d.lineas[0].unitLiteral,null);
 assert.ok(r.puente.motivos.includes('disponibilidad_sin_acreditar'));
 assert.ok(r.puente.motivos.includes('faltan_articulos'));
 check(r);
});
test('MVP170: si el pedido es solo áridos genéricos, stock aún bloquea el ranking',()=>{
 const r=preparar(pedido('Arena','Piedra').slice(0,2),doc(),source());
 assert.deepEqual(r.puente.motivos,['disponibilidad_sin_acreditar']);
 check(r);
});
test('MVP170: cantidad distinta no equivale a monto neto ni a cobertura',()=>{
 const items=pedido('Arena','Piedra');items[0].cantidad='2.000';
 const r=preparar(items,doc(),source());
 assert.equal(r.diagnosticos[0].estado,'cantidad_diferente');
 assert.equal(r.correlaciones.length,1);
 check(r);
});
test('MVP170: presentación sin registrar en fuente no acredita BIG BAG por leer descripción',()=>{
 const f=source();f.lines[0].presentation='none';
 const r=preparar(pedido('Arena','Piedra'),doc(),f);
 assert.equal(r.diagnosticos[0].estado,'sin_presentacion_corroborada');
 assert.equal(r.correlaciones.length,1);
 check(r);
});
test('MVP170: hechos fuente de versión antigua u otra revisión no sirven',()=>{
 for(const patch of [{version:8},{revisionVigente:false},{cotizacionVigente:false},
  {state:'needs_source_review'},{rankingAllowed:true}]){
  const d=doc();Object.assign(d.prueba,patch);
  const r=preparar(pedido(),d,source());
  assert.equal(r.estado,'fuente_no_verificada',JSON.stringify(patch));
  check(r);
 }
});
test('MVP170: SHA, HMAC o request cruzados entre proveedores fail closed',()=>{
 for(const patch of [{sourceSha256:'c'.repeat(64)},
  {messageHmac:'d'.repeat(64)},{requestId:'request_diferente'}]){
  const f=source();Object.assign(f,patch);
  const r=preparar(pedido(),doc(),f);
  assert.equal(r.estado,'fuente_no_verificada');
  check(r);
 }
});
test('MVP170: hechos fuente sin vinculación real (not_found o sin página) no hacen match',()=>{
 for(const patch of [{unitStatus:'not_found'},{unitStatus:'ambiguous'},
  {page:null},{row:null},{unit:'kg'}]){
  const f=source();Object.assign(f.lines[0],patch);
  const r=preparar(pedido('Arena','Piedra'),doc(),f);
  assert.equal(r.diagnosticos[0].estado,'sin_presentacion_corroborada',JSON.stringify(patch));
  check(r);
 }
});
test('MVP170: dos pruebas con mismo ordinal o faltante invalidan evidencia',()=>{
 const f=source();f.lines[1].lineNo=1;
 assert.equal(preparar(pedido(),doc(),f).estado,'fuente_no_verificada');
 const f2=source();f2.lines.pop();
 assert.equal(preparar(pedido(),doc(),f2).estado,'fuente_no_verificada');
});
test('MVP170: dos ítems del comprador no pueden reclamar el mismo BIG BAG',()=>{
 const items=[
  {id:'arena_001',descripcionLiteral:'Arena',cantidad:'1.000',unidad:'m3'},
  {id:'arena_002',descripcionLiteral:'Arena',cantidad:'1.000',unidad:'m3'}
 ];
 const r=preparar(items,doc(),source());
 assert.deepEqual(r.diagnosticos.map(x=>x.estado),['presentacion_ambigua','presentacion_ambigua']);
 assert.equal(r.correlaciones.length,0);
 check(r);
});
test('MVP170: materia prima distinta NUNCA recibe la oferta de arena',()=>{
 const r=preparar([{id:'piedra_001',descripcionLiteral:'Piedra partida',
  cantidad:'1.000',unidad:'m3'}],{
   ...doc(),lineas:[doc().lineas[0]],
   declaredTotalLiteral:'$ 100,00',
   prueba:{...doc().prueba,lineCount:1,sumLineCents:'10000',declaredTotalCents:'10000'}
  },{
  ...source(),lines:[source().lines[0]]
 });
 assert.equal(r.diagnosticos[0].estado,'sin_presentacion_corroborada');
 check(r);
});
test('MVP170: fuente piedra partida y arena fina sí acreditan variedad literal',()=>{
 const d=doc();
 d.lineas[0].descriptionLiteral='BIG BAG de Arena fina';
 d.lineas[1].descriptionLiteral='BIG BAG de Piedra partida';
 const r=preparar(pedido().slice(0,2),d,source());
 assert.equal(r.correlaciones.length,2);
 assert.ok(r.diagnosticos.every(x=>x.estado==='coincide_volumen_nominal_sin_stock'));
 check(r);
});
test('MVP170: especie explícitamente contraria no se acepta como equivalente',()=>{
 const d=doc();d.lineas[0].descriptionLiteral='BIG BAG de Arena gruesa';
 const r=preparar(pedido('Arena fina','Piedra'),d,source());
 assert.equal(r.diagnosticos[0].estado,'variedad_diferente');
 assert.equal(r.correlaciones.length,1);
 check(r);
});
test('MVP170: capacidad expresa 0,5 m3 no se transforma en 1m3',()=>{
 const d=doc();d.lineas[0].descriptionLiteral='BIG BAG de Arena 0,5 m3';
 const r=preparar(pedido('Arena','Piedra'),d,source());
 assert.equal(r.diagnosticos[0].estado,'cantidad_diferente');
 assert.equal(r.correlaciones.length,1);
 check(r);
});
test('MVP170: un monto original inconsistente no permite ni correlaciones nominales',()=>{
 const d=doc();d.declaredTotalLiteral='$ 301,00';
 const r=preparar(pedido('Arena','Piedra'),d,source());
 assert.equal(r.estado,'fuente_no_verificada');
 check(r);
});
test('MVP170: una línea fuente duplicada o con texto vacío invalida ronda',()=>{
 const d=doc();d.lineas[1].lineNo=1;
 assert.equal(preparar(pedido(),d,source()).estado,'fuente_no_verificada');
 const d2=doc();d2.lineas[0].descriptionLiteral='';
 assert.equal(preparar(pedido(),d2,source()).estado,'fuente_no_verificada');
});
test('MVP170: un pedido no-árido no genera equivalencia artificiosa ni precio comparable',()=>{
 const p=[{id:'hidrofugo_001',descripcionLiteral:'Hidrófugo Tacurú',
  cantidad:'5.000',unidad:'l'}];
 const r=preparar(p,doc(),source());
 assert.equal(r.diagnosticos[0].estado,'no_aplica');
 assert.equal(r.correlaciones.length,0);check(r);
});
test('MVP170: fuente puede contener BIG BAG en descripción, pero no en registro de presentación',()=>{
 const f=source();f.lines[0].presentation='none';
 const r=preparar(pedido('Arena','Piedra'),doc(),f);
 assert.equal(r.pruebasBolson.length,1);
 assert.ok(r.pruebasBolson.every(x=>x.lineNo!==1));
 check(r);
});
test('MVP170: términos fiscales y stock nunca salen de la mera mención de envase',()=>{
 const r=preparar(pedido('Arena','Piedra').slice(0,2),doc(),source());
 assert.equal(r.puente.estado,'visible_no_comparable');
 assert.equal(r.puente.ofertaComparable,null);
 assert.equal(r.rankingHabilitado,false);
 assert.equal(r.contactosRevelados,false);
});
