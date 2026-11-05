import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {diagnosticarRondaPrivadaMvp172 as preview} from
 '../../src/domain/diagnostico-ronda-mvp172.ts';

const REQUEST='469cb459-5f00-49c2-b0b9-bc8b11e5c900';
const seed=(i=1)=>{
 const HASH=String(i===1?'a':'c').repeat(64);
 const HMAC=String(i===1?'b':'d').repeat(64);
 const doc={
  requestId:REQUEST,anonId:'anon_private',messageHmac:HMAC,sourceSha256:HASH,
  declaredTotalLiteral:'$300,00',
  lineas:[
   {lineNo:1,descriptionLiteral:'BIG BAG de Arena',quantityLiteral:'1,00',unitLiteral:null,
    unitPriceLiteral:'$100,00',lineTotalLiteral:'$100,00'},
   {lineNo:2,descriptionLiteral:'BIG BAG de Piedra',quantityLiteral:'2,00',unitLiteral:null,
    unitPriceLiteral:'$100,00',lineTotalLiteral:'$200,00'}
  ],
  prueba:{requestId:REQUEST,messageHmac:HMAC,sourceSha256:HASH,
   version:9,state:'verified',reason:'covered',lineCount:2,
   sumLineCents:'30000',declaredTotalCents:'30000',
   rankingAllowed:false,revisionVigente:true,cotizacionVigente:true}
 };
 const fuente={
  requestId:REQUEST,messageHmac:HMAC,sourceSha256:HASH,
  state:'source_checked',rankingAllowed:false,sourceImmutabilityPreserved:true,
  lines:[1,2].map((lineNo)=>({
   lineNo,page:1,row:lineNo+4,unit:null,unitStatus:'not_explicit',presentation:'big_bag'
  }))
 };
 const economia={
  state:'source_checked',sourceSha256:HASH,rankingAllowed:false,
  descuentos:{estado:'descuentos_conciliados_sin_iva',precios:[{},{}]},
  condiciones:{iva:{estado:'no_informado'},flete:{estado:'a_convenir'},
   pago:{estado:'contado'},rankingHabilitado:false,stockCorroborado:false}
 };
 return {doc,fuente,economia};
};
const sample=()=>({
 state:'private_inputs',rankingAllowed:false,contactsRevealed:false,
 requestItems:[
  {id:'item_001',descripcionLiteral:'Arena fina',cantidad:'1.000',unidad:'m3',familia:'arena_fina'},
  {id:'item_002',descripcionLiteral:'Piedra partida',cantidad:'2.000',unidad:'m3',familia:'piedra_partida'},
  {id:'item_003',descripcionLiteral:'Cemento gris',cantidad:'20.000',unidad:'bag',familia:'cemento_gris_obra'}
 ],
 quotations:[seed(1),seed(2)]
});
test('MVP172: dos presupuestos de fuente real sintética conservan alternativas comerciales',()=>{
 const r=preview(sample());
 assert.equal(r.estado,'diagnostico_privado');
 assert.deepEqual(r.rondaResumen,{
  articulosSolicitados:3,cotizacionesTotales:2,cotizacionesAuditadas:2
 });
 assert.deepEqual(r.proveedoresAnonimos.map(x=>x.oferta),['oferta_001','oferta_002']);
 assert.deepEqual(r.proveedoresAnonimos[0].articulos.map(x=>x.estado),[
  'alternativa_comercial_con_aclaracion',
  'alternativa_comercial_con_aclaracion','presentacion_sin_acreditar'
 ]);
 assert.deepEqual(r.proveedoresAnonimos[0].articulos.map(x=>x.lineaFuente),[1,2,null]);
 assert.equal(r.rankingHabilitado,false);
 assert.equal(r.adjudicacion,false);
 assert.equal(r.whatsappEnviado,false);
 assert.equal(r.originalesDescargables,false);
});
test('MVP172: respuesta no filtra originales, HMAC, SHA ni dinero',()=>{
 const x=sample();
 const s=JSON.stringify(preview(x));
 for(const forbidden of [
  x.quotations[0].doc.messageHmac,
  x.quotations[0].doc.sourceSha256,
  x.quotations[1].doc.messageHmac,
  x.quotations[1].doc.sourceSha256,
  'BIG BAG','Cemento gris','$300,00','100,00','sourceSha256',
  'telefono','requestId'
 ])assert.ok(!s.includes(forbidden),forbidden);
});
test('MVP172: request y facts originales siguen idénticos',()=>{
 const x=sample(),before=structuredClone(x);
 preview(x);
 assert.deepEqual(x,before);
});
test('MVP172: v9 vencida invalida el diagnóstico completo, sin salida parcial',()=>{
 for(const patch of [{version:8},{revisionVigente:false},{cotizacionVigente:false},
  {state:'needs_source_review'},{rankingAllowed:true}]){
  const x=sample();Object.assign(x.quotations[0].doc.prueba,patch);
  const r=preview(x);
  assert.equal(r.estado,'insumos_invalidos',JSON.stringify(patch));
  assert.equal(r.proveedoresAnonimos.length,0);
 }
});
test('MVP172: rechazo de fuente económica de otro SHA, estado o factura distinta',()=>{
 for(const patch of [
  {sourceSha256:'e'.repeat(64)},{state:'unreadable'},{rankingAllowed:true}
 ]){
  const x=sample();Object.assign(x.quotations[0].economia,patch);
  assert.equal(preview(x).estado,'insumos_invalidos');
 }
});
test('MVP172: mensaje cruzado en pruebas fuente falla antes de publicar cobertura',()=>{
 for(const patch of [
  {messageHmac:'e'.repeat(64)},{sourceSha256:'f'.repeat(64)},
  {requestId:'another_request'},{state:'unreadable'},
  {sourceImmutabilityPreserved:false}
 ]){
  const x=sample();Object.assign(x.quotations[0].fuente,patch);
  assert.equal(preview(x).estado,'insumos_invalidos',JSON.stringify(patch));
 }
});
test('MVP172: falla cerrado si se intentan mezclar dos rondas o duplicar cotización',()=>{
 const x=sample();x.quotations[1].doc.requestId='another';
 assert.equal(preview(x).estado,'insumos_invalidos');
 const y=sample();y.quotations[1]=y.quotations[0];
 assert.equal(preview(y).estado,'insumos_invalidos');
});
test('MVP172: una fuente sin página o evidencia de BIG BAG no se transforma en coincidencia',()=>{
 const x=sample();x.quotations[0].fuente.lines[0].page=null;
 const r=preview(x);
 assert.equal(r.estado,'diagnostico_privado');
 assert.equal(r.proveedoresAnonimos[0].articulos[0].estado,'sin_presentacion_corroborada');
 assert.equal(r.proveedoresAnonimos[0].precioTotalComparable,null);
});
test('MVP172: arena gruesa explícita sigue siendo diferencia real, sin eliminar presupuesto',()=>{
 const x=sample();x.quotations[0].doc.lineas[0].descriptionLiteral='BIG BAG de arena gruesa';
 const r=preview(x);
 assert.equal(r.estado,'diagnostico_privado');
 assert.equal(r.proveedoresAnonimos.length,2);
 assert.equal(r.proveedoresAnonimos[0].articulos[0].estado,'variedad_diferente');
});
test('MVP172: exclusividad del comprador impide inventar fino desde arena genérica',()=>{
 const x=sample();x.requestItems[0].descripcionLiteral='Exclusivamente arena fina';
 const r=preview(x);
 assert.equal(r.estado,'diagnostico_privado');
 assert.equal(r.proveedoresAnonimos[0].articulos[0].estado,'variedad_no_acreditada');
});
test('MVP172: IVA desconocido no se sustituye por IVA cero ni precio final',()=>{
 const x=sample();const r=preview(x);
 for(const q of r.proveedoresAnonimos){
  assert.equal(q.precioTotalComparable,null);
  assert.equal(q.fiscalidad,'sin_base_comparable');
  assert.equal(q.flete,'no_acreditado_para_total');
  assert.equal(q.disponibilidad,'no_acreditada');
 }
});
test('MVP172: una ronda con límites excedidos no se recorta silenciosamente',()=>{
 const x=sample();x.quotations=Array.from({length:13},(_,i)=>{const q=seed(1);
  const h=String(i+1).padStart(64,'a'),d=String(i+1).padStart(64,'b');
  q.doc.messageHmac=h;q.doc.prueba.messageHmac=h;q.fuente.messageHmac=h;
  q.doc.sourceSha256=d;q.doc.prueba.sourceSha256=d;
  q.fuente.sourceSha256=d;q.economia.sourceSha256=d;return q;
 });
 assert.equal(preview(x).estado,'insumos_invalidos');
 const y=sample();y.requestItems=Array.from({length:31},(_,i)=>({
  id:'item_'+String(i+1).padStart(3,'0'),descripcionLiteral:'Piedra',
  cantidad:'1.000',unidad:'m3',familia:'piedra'
 }));
 assert.equal(preview(y).estado,'insumos_invalidos');
});
test('MVP172: la RPC SQL se limita estrictamente a service_role y evidencia completa',()=>{
 const sql=readFileSync(new URL('../../supabase/piloto/mvp172_private_round_inputs.sql',import.meta.url),'utf8');
 assert.match(sql,/security definer/i);
 assert.match(sql,/set search_path=''/i);
 assert.match(sql,/from public,anon,authenticated/i);
 assert.match(sql,/to service_role/i);
 assert.match(sql,/v_selected_count<>v_quotes_count/i);
 assert.match(sql,/supplier_source_facts_mvp163/i);
 assert.match(sql,/supplier_economic_facts_mvp168/i);
 assert.match(sql,/verifier_version>9/i);
 assert.doesNotMatch(sql,/insert into|update\s+cotironda_piloto_privado|delete from|whapi_outbox|finalist_activation/i);
});
