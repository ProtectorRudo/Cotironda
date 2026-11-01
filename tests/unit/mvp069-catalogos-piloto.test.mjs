import test from 'node:test';
import assert from 'node:assert/strict';
import {analizarListadoComercioMvp069 as read,
 simularConsultasCatalogosMvp069 as simulate}
 from '../../src/domain/catalogo-listado-mvp069.ts';
const a='Cemento Avellaneda 25 kg\nHidrófugo Ceresita 1 l\nArena especial sin ficha';
const b='producto;precio;cantidad;rubro\nCemento Loma Negra 50 kg;9900;2;corralon\nGranza especial sin ficha;3400;1;corralon';
const pedido='20 bolsas de cemento CPC 50 kg, 5 litros de hidrófugo, 6 litros de pintura látex. Entrega: La Plata.';
test('MVP069 texto natural detecta familia y retiene todo material desconocido',()=>{
 const r=read(a,'texto');
 assert.equal(r.estado,'interpretado_para_simulacion_sin_confirmar');
 assert.deepEqual(r.reconocidos.map(i=>i.producto_id),['cemento_gris_obra','hidrofugo']);
 assert.equal(r.pendientes.length,1);
 assert.equal(r.pendientes[0].descripcion,'Arena fina');
});
test('MVP069 CSV exportado de Excel: delimitador ; y precios ignorados',()=>{
 const r=read(b,'csv');
 assert.deepEqual(r.reconocidos.map(i=>i.producto_id),['cemento_gris_obra']);
 assert.equal(r.pendientes.length,1);
 assert.equal(r.avisos.length,1);
 assert.doesNotMatch(JSON.stringify(r),/9900|3400/);
});
test('MVP069 CSV con coma, comillas y marca se reconoce sin inventar SKU',()=>{
 const r=read('Material,Precio\n"Cemento, CPC 50 kg",123\n"pintura látex interior",456','csv');
 assert.deepEqual(r.reconocidos.map(i=>i.producto_id),['cemento_gris_obra','pintura_latex']);
 assert.equal(r.avisos.length,1);
});
test('MVP069 fórmulas, URLs, rubro conflictivo y duplicados no habilitan familia',()=>{
 const r=read('material;rubro\n=Cemento;corralon\nhttps://bad.example;corralon\nPintura látex;corralon\nCemento CPC 50 kg;corralon\n cemento  CPC 50 kg ;corralon','csv');
 assert.deepEqual(r.reconocidos.map(i=>i.producto_id),['cemento_gris_obra']);
 assert.deepEqual(r.pendientes.map(x=>x.motivo),[
  'formula_o_contenido_inseguro','formula_o_contenido_inseguro',
  'producto_no_corresponde_al_rubro','duplicado'
 ]);
});
test('MVP069 ejemplos peligrosos cementos no se asumen cemento de obra',()=>{
 const r=read('Cemento de contacto\nCemento blanco\nGuantes de látex\nCable coaxial\nTornillos para placa de yeso','texto');
 assert.equal(r.reconocidos.length,0);
 assert.equal(r.pendientes.length,5);
});
test('MVP069 columnas sin encabezado, quotes rotas y archivos gigantes se rechazan',()=>{
 for(const text of [
  'uno;dos\ncemento;1000',
  'Producto;Precio\n"Cemento sin cierre;123',
  'Producto;Precio\n"Cemento" texto;123',
  'Producto\n'+Array(502).fill('Cemento 25 kg').join('\n')
 ])assert.throws(()=>read(text,'csv'),/mvp069_catalogo_invalido/);
 assert.throws(()=>read('Cemento\n'.repeat(6000),'texto'),/mvp069_catalogo_invalido/);
 assert.throws(()=>read('a\u0000b','texto'),/mvp069_catalogo_invalido/);
});
test('MVP069 un material pedido se consulta SOLO a negocios declarados que cubren zona',()=>{
 const r=simulate({pedido,comercios:[
  {id:'corralon_a',zona:'La Plata',catalogo:read(a,'texto')},
  {id:'corralon_b',zona:'La Plata',catalogo:read(b,'csv')}
 ]});
 assert.equal(r.estado,'simulacion_cobertura_sin_envio');
 assert.deepEqual(r.invitaciones.map(x=>[x.comercio,x.items.map(y=>y.product_code)]),[
  ['corralon_a',['cemento_gris_obra','hidrofugo']],
  ['corralon_b',['cemento_gris_obra']]
 ]);
 assert.deepEqual(r.sinProveedor.map(i=>i.product_code),['pintura_latex']);
 assert.equal(r.mensajesEnviados,0);
});
test('MVP069 negocio fuera de zona no recibe, incluso si vende cemento',()=>{
 const r=simulate({pedido,comercios:[
  {id:'corralon_a',zona:'Berisso',catalogo:read(a,'texto')},
  {id:'corralon_b',zona:'Ensenada',catalogo:read(b,'csv')}
 ]});
 assert.equal(r.invitaciones.length,0);
 assert.equal(r.sinProveedor.length,3);
});
test('MVP069 el comprador sin zona NO inicia consultas a proveedores',()=>{
 const r=simulate({pedido:'20 bolsas cemento CPC 50 kg',comercios:[
  {id:'corralon_a',zona:'La Plata',catalogo:read(a,'texto')},
  {id:'corralon_b',zona:'La Plata',catalogo:read(b,'csv')}
 ]});
 assert.equal(r.estado,'pedido_necesita_aclaracion');
 assert.equal(r.invitaciones.length,0);
});
test('MVP069 no convierte los precios en catálogo ni envía Whapi',()=>{
 const r=read('Producto,Precio\nCemento Loma Negra 50 kg,50000','csv');
 assert.equal(r.reconocidos[0].producto_id,'cemento_gris_obra');
 assert.equal(JSON.stringify(r).includes('50000'),false);
 assert.equal(Object.hasOwn(r.reconocidos[0],'precio'),false);
});
