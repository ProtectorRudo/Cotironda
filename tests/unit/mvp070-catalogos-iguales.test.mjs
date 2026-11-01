import test from 'node:test';
import assert from 'node:assert/strict';
import {MATERIALES_CORRALON_DEMO_MVP070,LISTADO_AMBOS_CORRALONES_MVP070,
 PEDIDO_COMUN_DEMO_MVP070}
 from '../../src/domain/catalogo-fixture-corralones-mvp070.ts';
import {analizarListadoComercioMvp069,simularConsultasCatalogosMvp069}
 from '../../src/domain/catalogo-listado-mvp069.ts';
import {identificarProducto,VERSION_TAXONOMIA}
 from '../../src/domain/taxonomia-materiales.ts';

test('MVP070 el catálogo grande es uno solo e idéntico para ambos negocios',()=>{
 const list=MATERIALES_CORRALON_DEMO_MVP070;
 assert.equal(list.length,51);
 assert.equal(new Set(list).size,list.length);
 assert.equal(LISTADO_AMBOS_CORRALONES_MVP070.split('\n').length,51);
 assert.equal(LISTADO_AMBOS_CORRALONES_MVP070,list.join('\n'));
 assert.equal(/precio|importe|costo\s*:\s*\d|[\d.,]+\s*ARS/i.test(LISTADO_AMBOS_CORRALONES_MVP070),false);
 for(const r of ['Cemento','Cal','Arena','Piedra','Ladrillo','Hierro','Malla','Hidrófugo'])
  assert.ok(list.some(m=>m.includes(r)),r);
});
test('MVP070 clasificación conservadora reconoce familias típicas pero no inventa las dudosas',()=>{
 const x=analizarListadoComercioMvp069(LISTADO_AMBOS_CORRALONES_MVP070,'texto');
 assert.equal(x.totalFilas,51);
 assert.equal(x.reconocidos.length+x.pendientes.length,51);
 assert.ok(x.reconocidos.length>=35,'esperamos cobertura útil del catálogo amplio');
 assert.equal(x.estado,'interpretado_para_simulacion_sin_confirmar');
 assert.equal(x.reconocidos.some(p=>p.producto_id==='cemento_gris_obra'),true);
 assert.equal(x.reconocidos.some(p=>p.producto_id==='ladrillo_hueco'),true);
 assert.equal(x.reconocidos.some(p=>p.producto_id==='hierro_adn'),true);
 assert.equal(x.reconocidos.some(p=>p.producto_id==='malla_electrosoldada'),true);
 assert.equal(x.pendientes.some(p=>p.descripcion==='Ladrillo refractario'),true);
 assert.equal(x.pendientes.some(p=>p.descripcion==='Bolsón vacío para escombros'),true);
});
test('MVP070 ambos corralones reciben el mismo pedido si tienen la misma lista y zona',()=>{
 const catalogo=analizarListadoComercioMvp069(LISTADO_AMBOS_CORRALONES_MVP070,'texto');
 const result=simularConsultasCatalogosMvp069({
  pedido:PEDIDO_COMUN_DEMO_MVP070,comercios:[
   {id:'corralon_a',zona:'La Plata',catalogo},
   {id:'corralon_b',zona:'La Plata',catalogo}
  ]
 });
 assert.equal(result.estado,'simulacion_cobertura_sin_envio');
 assert.equal(result.mensajesEnviados,0);
 assert.deepEqual(result.invitaciones.map(i=>i.comercio),['corralon_a','corralon_b']);
 assert.deepEqual(result.invitaciones[0].items,result.invitaciones[1].items);
 assert.deepEqual(result.invitaciones[0].items.map(i=>i.product_code),
  ['cemento_gris_obra','hidrofugo']);
 assert.equal(result.sinProveedor.length,0);
});
test('MVP070 catálogo idéntico NO evita que la zona o la falta de producto filtren al proveedor',()=>{
 const catalogo=analizarListadoComercioMvp069(LISTADO_AMBOS_CORRALONES_MVP070,'texto');
 const result=simularConsultasCatalogosMvp069({
  pedido:PEDIDO_COMUN_DEMO_MVP070,comercios:[
   {id:'corralon_a',zona:'La Plata',catalogo},
   {id:'corralon_b',zona:'Berisso',catalogo}
  ]
 });
 assert.deepEqual(result.invitaciones.map(i=>i.comercio),['corralon_a']);
});
test('MVP070 los materiales parecidos no se colapsan en familias incorrectas',()=>{
 assert.equal(VERSION_TAXONOMIA,'obra_ar_v2_2026_11_01');
 const examples=[
  ['Ladrillo común macizo','ladrillo_comun'],
  ['Ladrillo hueco 12x18x33 cm','ladrillo_hueco'],
  ['Bloque de hormigón 19x19x39','bloque_hormigon'],
  ['Arena gruesa','arena_gruesa'],
  ['Arena fina','arena_fina'],
  ['Cal hidráulica 25 kg','cal_hidraulica'],
  ['Cal aérea hidratada 25 kg','cal_aerea'],
  ['Vigueta pretensada 4 m','vigueta_pretensada'],
  ['Membrana asfáltica aluminizada','membrana_asfaltica']
 ];
 for(const [desc,product] of examples)
  assert.equal(identificarProducto(desc)?.producto_id,product,desc);
 for(const desc of [
  'Ladrillo refractario','Bloque de hormigón celular HCCA',
  'Cemento blanco','Cemento de contacto','Guantes de látex',
  'Cable coaxial','Alambre de cobre','Malla de fibra de vidrio',
  'Tornillos para placa de yeso'
 ])assert.equal(identificarProducto(desc),null,desc);
});
