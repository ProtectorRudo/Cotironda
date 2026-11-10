import test from 'node:test';
import assert from 'node:assert/strict';
import {descripcionOriginalVerificableMvp288,
 numeroHumanoMvp288,lineaComercialLegibleMvp288} from
 '../../src/domain/ia-central/fidelidad-pedido-mvp288.ts';
import {componerRevisionCompradorMvp279} from
 '../../supabase/functions/cotironda-piloto-whapi/ai-central-buyer-review-mvp279.ts';
import {generarSolicitudPdfMvp091} from
 '../../supabase/functions/cotironda-piloto-whapi/request-pdf.ts';
const full='Necesito cotizar 20 bolsas de cemento CPC de 50 kg y 3 bolsones de arena. Entrega en La Plata.';
const e=['20 bolsas de cemento CPC','3 bolsones de arena'];
const items=e.map((v,i)=>({
 evidencia:v,descripcion:i===0?'Cemento CPC':'Arena',
 inicio:full.indexOf(v),fin:full.indexOf(v)+v.length
}));
const id='00000000-0000-4000-8000-000000000001';
function sourceRows(){
 return items.map((it,i)=>{
  const result=descripcionOriginalVerificableMvp288(full,it,items[i+1]?.inicio);
  assert.ok(result,'Faltó línea verificada '+i);
  return result;
 });
}
test('MVP288: conserva 50 kg aunque la IA sólo cite Cemento CPC',()=>{
 const rows=sourceRows();
 assert.deepEqual(rows,[
  'bolsas de cemento CPC de 50 kg',
  'bolsones de arena'
 ]);
 assert.ok(!rows[0].includes('Entrega en La Plata'));
});
test('MVP288: muestra 20 y 3; conserva 1.250 como 1.25',()=>{
 assert.equal(numeroHumanoMvp288('20.000'),'20');
 assert.equal(numeroHumanoMvp288('3.000'),'3');
 assert.equal(numeroHumanoMvp288('1.250'),'1.25');
 assert.equal(numeroHumanoMvp288('0.125'),'0.125');
 assert.equal(numeroHumanoMvp288('2000000.000'),null);
 assert.equal(numeroHumanoMvp288('-1'),null);
});
test('MVP288: muestra bolsa y bolsón según la descripción de fuente',()=>{
 const rows=sourceRows();
 assert.deepEqual(lineaComercialLegibleMvp288('20.000','bag',rows[0]),{
  cantidad:'20',unidad:'bolsas',descripcion:'cemento CPC de 50 kg'
 });
 assert.deepEqual(lineaComercialLegibleMvp288('3.000','bag',rows[1]),{
  cantidad:'3',unidad:'bolsones',descripcion:'arena'
 });
 assert.deepEqual(lineaComercialLegibleMvp288('1.000','bag','Cemento CPC'),{
  cantidad:'1',unidad:'bolsas',descripcion:'Cemento CPC'
 });
 assert.equal(lineaComercialLegibleMvp288('1.000','m3',rows[1]).unidad,'m3');
});
test('MVP288: comprador revisa especificaciones correctas y sin ceros espurios',()=>{
 const [a,b]=sourceRows();
 const text=componerRevisionCompradorMvp279({
  state:'issued',request_id:id,code:'832F06B3F76149FB',
  city:'La Plata',note:null,items_count:2,
  items:[
   {lineNo:1,description:a,quantity:'20.000',unit:'bag',rubro:'obra_gruesa'},
   {lineNo:2,description:b,quantity:'3.000',unit:'bag',rubro:'obra_gruesa'}
  ]
 });
 assert.ok(text);
 assert.match(text,/20 bolsas — cemento CPC de 50 kg/u);
 assert.match(text,/3 bolsones — arena/u);
 assert.doesNotMatch(text,/20\.000|3\.000|20 bag|3 bag/u);
 assert.match(text,/CONFIRMAR COTI 832F06B3F76149FB/u);
});
test('MVP288: PDF del proveedor mantiene presentaciones y cantidades literales',()=>{
 const [a,b]=sourceRows();
 const pdf=generarSolicitudPdfMvp091({
  requestId:id,city:'La Plata',deadlineIso:'2026-11-13T15:00:00Z',
  deliveryNote:null,
  items:[
   {description:a,quantity:'20.000',unit:'bag'},
   {description:b,quantity:'3.000',unit:'bag'}
  ]
 });
 const rendered=new TextDecoder('latin1').decode(pdf);
 assert.match(rendered,/20 bolsas/u);
 assert.match(rendered,/3 bolsones/u);
 assert.match(rendered,/cemento CPC de 50 kg/u);
 assert.match(rendered,/arena/u);
 assert.doesNotMatch(rendered,/20\.000|3\.000/u);
});
test('MVP288: falla cerrado si evidencia es falsa, cruza ítems o se trunca',()=>{
 const item=items[0];
 assert.equal(descripcionOriginalVerificableMvp288(full,{...item,evidencia:'20 bolsas falsificadas'},items[1].inicio),null);
 assert.equal(descripcionOriginalVerificableMvp288(full,item,item.fin-1),null);
 assert.equal(descripcionOriginalVerificableMvp288(full,item,item.inicio),null);
 const tooLong='20 bolsas de '+'cemento '.repeat(15)+'; entrega en La Plata';
 const x={descripcion:'Cemento',evidencia:tooLong.slice(0,25),
  inicio:0,fin:25};
 assert.equal(descripcionOriginalVerificableMvp288(tooLong,x),null);
});

test('MVP288: evita que un teléfono u otro carácter no PDF llegue a proveedores',()=>{
 const sources=['20 bolsas cemento por WhatsApp','20 bolsas de cemento — 50 kg'];
 for(const source of sources){
  const item={evidencia:source,descripcion:'Cemento CPC',
   inicio:0,fin:source.length};
  assert.equal(descripcionOriginalVerificableMvp288(source,item),null,source);
 }
});
