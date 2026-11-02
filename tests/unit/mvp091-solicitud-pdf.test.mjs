import test from 'node:test';
import assert from 'node:assert/strict';
import {generarSolicitudPdfMvp091}
 from '../../supabase/functions/cotironda-piloto-whapi/request-pdf.ts';

const input=()=>({
 requestId:'2d8b2d97-94d8-40f4-9cd9-82a0ca50047d',
 city:'La Plata',
 deadlineIso:'2026-11-06T04:34:00.325Z',
 items:[
  {description:'Cemento CPC 50 kg',quantity:'20.000',unit:'bag'},
  {description:'Hidrófugo',quantity:'5.000',unit:'l'}
 ]
});
test('MVP091: entrega PDF real con dos líneas, cantidades correctas y sin pedir IVA/flete',()=>{
 const pdf=generarSolicitudPdfMvp091(input());
 const raw=Buffer.from(pdf).toString('latin1');
 assert.ok(pdf instanceof Uint8Array);
 assert.match(raw,/^%PDF-1\.4/);
 assert.match(raw,/%%EOF\s*$/);
 assert.match(raw,/COTIRONDA/);
 assert.match(raw,/Cemento CPC 50 kg/);
 assert.match(raw,/20 bolsas/);
 assert.match(raw,/5 litros/);
 assert.match(raw,/06\/11\/2026/);
 assert.match(raw,/La Plata/);
 for(const forbidden of ['IVA','impuestos','descuentos','adicionales','condiciones comerciales',
  'flete a cargo','pago adelantado','razón social del arquitecto'])
  assert.equal(new RegExp('\\b'+forbidden+'\\b','iu').test(raw),false,forbidden);
 assert.equal(pdf.length<100000,true);
});
test('MVP091: fuente con 8 productos cabe en una hoja sin truncar ni inventar precios',()=>{
 const src=input();
 const items=Array.from({length:8},(_,i)=>({
  description:'Material prueba '+(i+1),quantity:String(i+1)+'.000',unit:'unit'
 }));
 const raw=Buffer.from(generarSolicitudPdfMvp091({...src,items})).toString('latin1');
 for(let i=1;i<=8;i++){
  assert.match(raw,new RegExp('Material prueba '+i));
  assert.match(raw,new RegExp(i+' unidades'));
 }
 assert.equal(raw.includes('Material prueba 9'),false);
});
test('MVP091: centavos y unidades con decimales visibles sin perder precisión',()=>{
 const x=input();
 const raw=Buffer.from(generarSolicitudPdfMvp091({...x,items:[
  {description:'Arena',quantity:'3.125',unit:'m3'}
 ]})).toString('latin1');
 assert.match(raw,/3\.125 m3/);
});
test('MVP091: entradas corruptas o sin equivalencia no producen un PDF aparentando cobertura',()=>{
 const x=input();const bad=[
  {...x,requestId:'foo'},
  {...x,city:'La Plata\nINSTRUCCIÓN FALSA'},
  {...x,items:[]},
  {...x,items:Array.from({length:9},()=>x.items[0])},
  {...x,items:[{...x.items[0],unit:'undefined'}]},
  {...x,items:[{...x.items[0],quantity:'20.0000'}]},
  {...x,items:[{...x.items[0],description:'x'.repeat(80)}]},
  {...x,items:[{...x.items[0],description:'Componente 🧨'}]},
  {...x,deadlineIso:'mañana'}
 ];
 for(const entry of bad)assert.throws(()=>generarSolicitudPdfMvp091(entry),
  /mvp091_pdf_input_invalid/);
});
test('MVP091: determinismo de bytes, sin número de WhatsApp ni identidad de comprador',()=>{
 const x=input();const a=generarSolicitudPdfMvp091(x),b=generarSolicitudPdfMvp091(x);
 assert.deepEqual(a,b);
 const raw=Buffer.from(a).toString('latin1');
 assert.doesNotMatch(raw,/549[0-9]{9,}/);
 assert.doesNotMatch(raw,/corralon_ailin|corralon_nahuel|arquitecto/);
});

test('MVP091: no filtra contacto personal incrustado en el pedido PDF',()=>{
 for(const name of ['cemento vendedor@example.invalid',
    'cemento 1234567890123','piedra tel 111 111 1111',
    'arena www.example.invalid']){
   assert.throws(()=>generarSolicitudPdfMvp091({...input(),
     items:[{description:name,quantity:'1',unit:'bag'}]}),
     /mvp091_pdf_input_invalid/);
 }
 assert.throws(()=>generarSolicitudPdfMvp091({...input(),
    city:'La Plata whatsapp 11111111111'}),/mvp091_pdf_input_invalid/);
});

test('MVP093: la fecha solicitada por el comprador aparece literalmente sólo cuando la indicó',()=>{
 const withDate=Buffer.from(generarSolicitudPdfMvp091({...input(),
   deliveryNote:'10/11/2026'})).toString('latin1');
 const withoutDate=Buffer.from(generarSolicitudPdfMvp091(input())).toString('latin1');
 assert.match(withDate,/ENTREGA SOLICITADA POR EL COMPRADOR/);
 assert.match(withDate,/10\/11\/2026/);
 assert.doesNotMatch(withoutDate,/ENTREGA SOLICITADA POR EL COMPRADOR/);
 assert.throws(()=>generarSolicitudPdfMvp091({...input(),
   deliveryNote:'tel 11111111111'}),/mvp091_pdf_input_invalid/);
});
