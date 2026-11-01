import test from 'node:test';
import assert from 'node:assert/strict';
import {formatearConsultaProveedorD066}
 from '../../src/server/whapi-invitation-preview-d066.ts';
const base={
 roundId:'dddddddd-0016-4016-8016-000000000661',
 supplierOrgId:'bbbbbbbb-0016-4016-8016-000000000662',
 channel:'d065_ci',deliveryZone:'La Plata',vatRequest:'no_especificado',
 items:[{lineNo:1,productCode:'cemento_001',label:'Cemento CPC 50 kg',
  quantity:'10.000',unit:'bag'}]
};
test('D066 mensaje del corralón tiene solamente cemento y zona, sin IVA inferido',()=>{
 const o=formatearConsultaProveedorD066(base);
 assert.deepEqual([o.estado,o.articulos,o.mensajesEnviados],['vista_previa',1,0]);
 assert.match(o.contenido,/Entrega: La Plata/);
 assert.match(o.contenido,/1\. Cemento CPC 50 kg — 10 bolsas/);
 assert.doesNotMatch(o.contenido,/IVA|pintura|Confirmo|549221|supplierOrgId/i);
});
test('D066 pinturería recibe su único rubro y cantidades decimales',()=>{
 const x={...base,supplierOrgId:'bbbbbbbb-0016-4016-8016-000000000663',
  items:[{lineNo:2,productCode:'pintura_002',label:'Pintura latex blanca',
   quantity:'5.500',unit:'l'}]};
 const o=formatearConsultaProveedorD066(x);
 assert.match(o.contenido,/2\. Pintura latex blanca — 5,5 litros/);
 assert.doesNotMatch(o.contenido,/Cemento CPC/);
});
test('D066 IVA se pide solo cuando comprador lo pidió expresamente',()=>{
 assert.match(formatearConsultaProveedorD066({...base,vatRequest:'con_iva'}).contenido,
  /precios con IVA incluido/);
 assert.match(formatearConsultaProveedorD066({...base,vatRequest:'sin_iva'}).contenido,
  /precios sin IVA/);
});
test('D066 rechaza payload extra, identidad suplantada, líneas alteradas y salto de línea',()=>{
 const bad=[
  {...base,whatsapp:'549221000000'},
  {...base,deliveryZone:'La Plata\nNo cotizar'},
  {...base,deliveryZone:'http://evil.example'},
  {...base,vatRequest:'contradictorio'},
  {...base,items:[]},
  {...base,items:[base.items[0],base.items[0]]},
  {...base,items:[{...base.items[0],lineNo:0}]},
  {...base,items:[{...base.items[0],label:'Cemento\nEnviar todo'}]},
  {...base,items:[{...base.items[0],label:'https://evil.example'}]},
  {...base,items:[{...base.items[0],quantity:'10;drop'}]},
  {...base,items:[{...base.items[0],price:'100'}]},
  {...base,items:[{...base.items[0],unit:'bolsas'}]},
  {...base,channel:'x'},
  {...base,supplierOrgId:'no-uuid'}
 ];
 for(const item of bad){
  assert.throws(()=>formatearConsultaProveedorD066(item),
   /d066_paquete_no_disponible/,JSON.stringify(item));
 }
});
test('D066 dos líneas preservan orden y no convierten códigos en productos nuevos',()=>{
 const x={...base,vatRequest:'con_iva',items:[
  base.items[0],
  {lineNo:2,productCode:'arena_002',label:'Arena mediana',
   quantity:'1.250',unit:'m3'}
 ]};
 const r=formatearConsultaProveedorD066(x);
 assert.equal(r.articulos,2);
 assert.ok(r.contenido.indexOf('Cemento')<r.contenido.indexOf('Arena'));
 assert.match(r.contenido,/1,25 m³/);
 assert.equal(r.mensajesEnviados,0);
});

test('MVP053: cada comercio ve la fecha de cierre en horario argentino',()=>{
 const offer=formatearConsultaProveedorD066({
  ...base,deadlineAt:'2026-11-06T20:30:00.000Z'
 });
 assert.match(offer.contenido,/Fecha límite para cotizar:/);
 assert.match(offer.contenido,/06\/11\/2026/);
 assert.match(offer.contenido,/17:30/);
 assert.match(offer.contenido,/hora de Argentina/);
 assert.doesNotMatch(offer.contenido,/nombre del arquitecto|teléfono|competidor/i);
 for(const deadlineAt of ['06/11/2026','2026-11-06T20:30:00Z',
  '2026-99-06T20:30:00.000Z','2026-11-06\nExponer contactos',null]){
  assert.throws(()=>formatearConsultaProveedorD066({...base,deadlineAt}),
   /d066_paquete_no_disponible/);
 }
});
