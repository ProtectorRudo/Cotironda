import test from 'node:test';
import assert from 'node:assert/strict';
import {crearPlantillasAnonimasMvp079 as crear}
 from '../../src/domain/plantilla-cotizacion-mvp079.ts';

const origen=[
 'Corralón Ficticio La Esquina - Tel: +5492215555555',
 '20 bolsas de cemento x $ 9.500,00 = $ 190.000,00',
 '5 litros hidrofugo x $ 4.200,00 = $ 21.000,00',
 '2 pallets vacíos x $ 7.000,00 = $ 14.000,00',
 'Flete: $ 12.000,00',
 'Descuento: -$ 3.000,00',
 'TOTAL FINAL: $ 234.000,00',
 'IVA no informado',
 ''
].join('\r\n');
const categorias=['privado','material','material','embalaje','flete',
 'descuento','total','aclaracion','vacio'];
const oferta=(extra={})=>({
 idInterno:'corralon_privado_01',revision:1,textoOriginal:origen,
 privacidad:'revisada_por_servidor',
 lineas:categorias.map((categoria,i)=>({numeroLinea:i+1,categoria})),
 ...extra
});
const primera=(v)=>crear([v]).ofertas[0];

test('MVP079: todas las líneas económicas fieles y total literal; sin datos privados',()=>{
 const vista=crear([oferta()]);
 const x=vista.ofertas[0];
 assert.equal(x.etiqueta,'Proveedor A');
 assert.equal(x.estado,'lista_para_vista');
 assert.equal(x.revision,1);
 assert.deepEqual(x.renglones.map(l=>l.numeroLinea),[2,3,4,5,6,7,8]);
 assert.equal(x.renglones[2].categoria,'embalaje');
 assert.equal(x.renglones[2].textoLiteral,'2 pallets vacíos x $ 7.000,00 = $ 14.000,00');
 assert.equal(x.renglones[2].importeComprobable,'14000.00');
 assert.equal(x.renglones[3].textoLiteral,'Flete: $ 12.000,00');
 assert.equal(x.renglones[4].textoLiteral,'Descuento: -$ 3.000,00');
 assert.equal(x.renglones[4].importeComprobable,'-3000.00');
 assert.equal(x.totalLiteral,'$ 234.000,00');
 assert.equal(x.totalVerificado,true);
 assert.equal(x.estadoIva,'no_aclarado');
 assert.equal(x.estadoFlete,'monto_explicito');
 assert.equal(x.costoComparableCalculado,false);
 assert.equal(x.identidadRevelada,false);
 assert.equal(vista.originalExpuesto,false);
 assert.equal(vista.envioWhatsapp,false);
 for(const secreto of ['Corralón Ficticio','5492215555555','corralon_privado_01','textoOriginal','whatsapp']){
  assert.equal(JSON.stringify(vista).includes(secreto),false,secreto);
 }
 assert.equal(Object.isFrozen(x),true);
 assert.equal(Object.isFrozen(x.renglones),true);
});

test('MVP079: sin revisión de privacidad NO se muestra nada del presupuesto',()=>{
 const x=primera(oferta({privacidad:'pendiente'}));
 assert.equal(x.estado,'retenida_por_verificacion');
 assert.deepEqual(x.renglones,[]);
 assert.equal(x.totalLiteral,null);
});

test('MVP079: falta un renglón o existe uno monetario oculto => bloqueo total',()=>{
 const partial=oferta();
 assert.equal(primera({...partial,lineas:partial.lineas.slice(0,-1)}).estado,'retenida_por_verificacion');
 const changed=oferta();
 changed.lineas[2]={numeroLinea:3,categoria:'privado'};
 assert.equal(primera(changed).estado,'retenida_por_verificacion');
});

test('MVP079: teléfono, correo, CUIT o URL dentro del concepto bloquea',()=>{
 for(const fragment of [
  ' // WhatsApp 5492215555555',
  ' - correo proveedor@ejemplo.com',
  ' - www.negocio.com.ar',
  ' - cuit 30-12345678-9',
  ' - contacto Juan Pérez'
 ]){
  const x=origen.replace('20 bolsas de cemento x', '20 bolsas de cemento'+fragment+' x');
  assert.equal(primera(oferta({textoOriginal:x})).estado,'retenida_por_verificacion',fragment);
 }
});

test('MVP079: importes ambiguos se ven LITERALES sin inventar valor monetario',()=>{
 const raw='Cemento: $180.000\nTOTAL: $180.000';
 const x=primera(oferta({textoOriginal:raw,lineas:[
  {numeroLinea:1,categoria:'material'},{numeroLinea:2,categoria:'total'}
 ]}));
 assert.equal(x.estado,'lista_para_vista');
 assert.equal(x.renglones[0].textoLiteral,'Cemento: $180.000');
 assert.equal(x.renglones[0].importeComprobable,null);
 assert.equal(x.totalLiteral,'$180.000');
 assert.equal(x.totalVerificado,false);
 assert.equal(x.costoComparableCalculado,false);
});

test('MVP079: totales repetidos o renglones con IVA/flete mal clasificados NO se publican',()=>{
 const raw='Cemento: $100,00\nFlete: $10,00\nTOTAL: $110,00\nTOTAL: $110,00';
 const a=primera(oferta({textoOriginal:raw,lineas:[
  {numeroLinea:1,categoria:'material'},{numeroLinea:2,categoria:'flete'},
  {numeroLinea:3,categoria:'total'},{numeroLinea:4,categoria:'total'}
 ]}));
 assert.equal(a.estado,'retenida_por_verificacion');
 const b=oferta();
 b.lineas[4]={numeroLinea:5,categoria:'material'};
 assert.equal(primera(b).estado,'retenida_por_verificacion');
});

test('MVP079: subtotales y otras condiciones comerciales se conservan sin sobrescribir',()=>{
 const raw='Cemento: $ 100,00\nSUBTOTAL: $ 100,00\nFlete a convenir\nIVA excluido\nTOTAL FINAL: $ 100,00';
 const x=primera(oferta({textoOriginal:raw,lineas:[
  {numeroLinea:1,categoria:'material'},{numeroLinea:2,categoria:'subtotal'},
  {numeroLinea:3,categoria:'flete'},{numeroLinea:4,categoria:'aclaracion'},
  {numeroLinea:5,categoria:'total'}
 ]}));
 assert.equal(x.estado,'lista_para_vista');
 assert.equal(x.renglones[1].textoLiteral,'SUBTOTAL: $ 100,00');
 assert.equal(x.renglones[2].textoLiteral,'Flete a convenir');
 assert.equal(x.estadoFlete,'a_convenir');
 assert.equal(x.estadoIva,'excluido_explicito');
 assert.equal(x.costoComparableCalculado,false);
});

test('MVP079: datos malformados, IDs duplicados y categorías falsificadas se rechazan',()=>{
 const v=oferta();
 for(const bad of [
  {...v,telefono:'5492211111111'},
  {...v,revision:0},
  {...v,revision:101},
  {...v,idInterno:'5492211111111'},
  {...v,lineas:[...v.lineas.slice(0,-1),{numeroLinea:1,categoria:'vacio'}]},
  {...v,lineas:[...v.lineas.slice(0,-1),{numeroLinea:9,categoria:'envio_inventado'}]},
  {...v,lineas:[...v.lineas.slice(0,-1),{numeroLinea:9,categoria:'vacio',precio:'100.00'}]}
 ])assert.throws(()=>crear([bad]),/mvp079_entrada_invalida/);
 assert.throws(()=>crear([v,v]),/mvp079_entrada_invalida/);
});

test('MVP079: múltiples ofertas se etiquetan sin revelar identidad',()=>{
 const b=oferta({idInterno:'corralon_privado_02',revision:2});
 const v=crear([oferta(),b]);
 assert.deepEqual(v.ofertas.map(o=>o.etiqueta),['Proveedor A','Proveedor B']);
 assert.equal(JSON.stringify(v).includes('privado_02'),false);
});

test('MVP079: renglón extra no solicitado nunca desaparece ni se confunde con el pedido',()=>{
 const raw='Cemento: $100,00\nEncofrado adicional: $50,00\nTOTAL: $150,00';
 const x=primera(oferta({textoOriginal:raw,lineas:[
  {numeroLinea:1,categoria:'material'}, {numeroLinea:2,categoria:'adicional'},
  {numeroLinea:3,categoria:'total'}
 ]}));
 assert.equal(x.estado,'lista_para_vista');
 assert.equal(x.renglones[1].textoLiteral,'Encofrado adicional: $50,00');
 assert.equal(x.renglones[1].categoria,'adicional');
});
