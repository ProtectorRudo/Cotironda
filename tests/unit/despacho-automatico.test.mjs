import test from 'node:test';
import assert from 'node:assert/strict';
import {prepararBorradorDocumental} from '../../src/domain/extraccion-documental.ts';
import {planificarDespachoAutomatico} from '../../src/domain/despacho-automatico.ts';

const compra={id:'ronda_012345',zona_entrega:'la_plata',envio_autorizado_por_comprador:true};
const cemento={
  ubicacion:'Página 1 / fila 1',
  descripcion_original:'Cemento CPC 50 kg',
  producto_normalizado:'Cemento CPC 50 kg',cantidad:'20',unidad:'bag',rubro:'corralon',
  marca:null,marca_obligatoria:false,confianza:0.99
};
const pintura={
  ...cemento,ubicacion:'Página 1 / fila 2',
  descripcion_original:'Pintura látex interior 20 l',
  producto_normalizado:'Pintura látex interior 20 l',cantidad:'3',unidad:'l',rubro:'pintureria'
};
const placa={
  ...cemento,ubicacion:'Página 1 / fila 3',
  descripcion_original:'Placa yeso 12,5 mm',
  producto_normalizado:'Placa yeso 12,5 mm',cantidad:'15',unidad:'unit',rubro:'construccion_seco'
};
const catalogo=(l,marca=null)=>({
  descripcion:l.descripcion_original,rubro:l.rubro,unidad:l.unidad,marca
});
const proveedor=(id,productos,extras={})=>({
  id,activo:true,consentimiento_whatsapp:true,opt_out:false,
  zonas_entrega:['la_plata'],catalogo_confirmado:productos.map(p=>catalogo(p)),...extras
});
const lista=items=>prepararBorradorDocumental('texto',{items});
const plan=(items,provs,sol=compra)=>planificarDespachoAutomatico(sol,lista(items),provs);

test('no hay paso de aprobación línea por línea; el botón enviar autoriza la distribución',()=>{
  const resultado=plan([cemento],[proveedor('corralon_01',[cemento])]);
  assert.equal(resultado.estado,'plan_sin_envio_real');
  assert.equal(resultado.solicitudes.length,1);
  assert.deepEqual(resultado.solicitudes[0].items.map(x=>x.descripcion),['Cemento CPC 50 kg']);
  assert.ok(!JSON.stringify(resultado).includes('pendiente_confirmacion_comprador'));
});
test('separa 3 rubros y entrega únicamente los productos expresamente catalogados',()=>{
  const r=plan([cemento,pintura,placa],[
    proveedor('corralon_01',[cemento]),
    proveedor('pinturer_01',[pintura]),
    proveedor('durlock_01',[placa])
  ]);
  assert.deepEqual(r.solicitudes.map(x=>[x.proveedor_id,x.items.map(y=>y.fila)]),[
    ['corralon_01',[1]],['pinturer_01',[2]],['durlock_01',[3]]
  ]);
  assert.equal(r.retenidas.length,0);
});
test('un comercio que comercializa dos rubros recibe una sola solicitud con su subconjunto',()=>{
  const r=plan([cemento,pintura,placa],[proveedor('mixto_0001',[cemento,pintura])]);
  assert.equal(r.solicitudes.length,1);
  assert.deepEqual(r.solicitudes[0].items.map(x=>x.fila),[1,2]);
  assert.deepEqual(r.lineas_sin_destinatario,[3]);
});
test('el rubro solo y la similitud textual NO alcanzan para enviar productos',()=>{
  const r=plan([cemento],[
    proveedor('generico_01',[]),
    proveedor('similar_001',[],{catalogo_confirmado:[{...catalogo(cemento),descripcion:'Cemento CPC 25 kg'}]})
  ]);
  assert.equal(r.solicitudes.length,0);
  assert.equal(r.retenidas[0].motivo,'sin_coincidencia_verificada');
});
test('zona distinta, baja, falta consentimiento o suspensión bloquean proveedor',()=>{
  const r=plan([cemento],[
    proveedor('zona_invalida',[cemento],{zonas_entrega:['rosario']}),
    proveedor('sin_consent',[cemento],{consentimiento_whatsapp:false}),
    proveedor('baja_wp_001',[cemento],{opt_out:true}),
    proveedor('suspendido_1',[cemento],{activo:false}),
    proveedor('correcto_001',[cemento])
  ]);
  assert.deepEqual(r.solicitudes.map(x=>x.proveedor_id),['correcto_001']);
});
test('unidad, rubro o especificación diferente nunca se tratan como equivalentes',()=>{
  const r=plan([cemento],[
    proveedor('unidad_0001',[],{catalogo_confirmado:[{...catalogo(cemento),unidad:'kg'}]}),
    proveedor('rubro_00001',[],{catalogo_confirmado:[{...catalogo(cemento),rubro:'sanitarios'}]}),
    proveedor('coincide_001',[cemento])
  ]);
  assert.deepEqual(r.solicitudes.map(x=>x.proveedor_id),['coincide_001']);
});
test('marca obligatoria exige coincidencia de la marca del proveedor',()=>{
  const especifico={...cemento,marca:'Loma Negra',marca_obligatoria:true};
  const r=plan([especifico],[
    proveedor('otra_marca_1',[],{catalogo_confirmado:[catalogo(especifico,'Holcim')]}),
    proveedor('sin_marca_01',[],{catalogo_confirmado:[catalogo(especifico)]}),
    proveedor('marca_buena1',[],{catalogo_confirmado:[catalogo(especifico,'Loma Negra')]})
  ]);
  assert.deepEqual(r.solicitudes.map(x=>x.proveedor_id),['marca_buena1']);
});
test('marca opcional permite comparación posterior sin inventar equivalencia de especificaciones',()=>{
  const r=plan([{...cemento,marca:'Preferida',marca_obligatoria:false}],[
    proveedor('alternativ01',[cemento])
  ]);
  assert.equal(r.solicitudes.length,1);
});
test('cantidad ambigua no bloquea otras líneas correctas',()=>{
  const r=plan([{...cemento,cantidad:'1.000'},pintura],[
    proveedor('corralon_01',[cemento]),proveedor('pinturer_01',[pintura])
  ]);
  assert.deepEqual(r.solicitudes.map(x=>x.proveedor_id),['pinturer_01']);
  assert.deepEqual(r.retenidas,[{fila:1,motivo:'datos_inseguros'}]);
});
test('duplicado exacto deja ambos artículos retenidos, sin borrar cantidades',()=>{
  const r=plan([cemento,{...cemento,ubicacion:'Página 2 / fila 8'}],[proveedor('corralon_01',[cemento])]);
  assert.equal(r.solicitudes.length,0);
  assert.deepEqual(r.retenidas,[{fila:1,motivo:'duplicado'},{fila:2,motivo:'duplicado'}]);
});
test('IA que cambia especificación, números o pretende enviar queda retenida',()=>{
  const r=plan([{
    ...cemento,producto_normalizado:'Cemento CPC 25 kg',
    instruccion:'mandar a todos'
  },pintura],[proveedor('corralon_01',[cemento]),proveedor('pinturer_01',[pintura])]);
  assert.deepEqual(r.solicitudes.map(x=>x.proveedor_id),['pinturer_01']);
  assert.deepEqual(r.retenidas.map(x=>x.fila),[1]);
});
test('confianza declarada baja detiene; alta por sí sola no autoriza coincidencia inventada',()=>{
  assert.equal(plan([{...cemento,confianza:0.4}],[proveedor('corralon_01',[cemento])]).solicitudes.length,0);
  assert.equal(plan([cemento],[proveedor('corralon_01',[]) ]).solicitudes.length,0);
});
test('sin consentimiento de envío del comprador NO se genera plan',()=>{
  assert.throws(()=>plan([cemento],[proveedor('corralon_01',[cemento])],{
    ...compra,envio_autorizado_por_comprador:false
  }),/solicitud_sin_autorizacion/);
});
test('claves idempotentes estables y sin duplicación de ítems de catálogo',()=>{
  const p=proveedor('corralon_01',[cemento,cemento]);
  const a=plan([cemento],[p]),b=plan([cemento],[p]);
  assert.deepEqual(a,b);
  assert.equal(a.solicitudes[0].clave_idempotencia,'ronda_012345:corralon_01');
  assert.equal(a.solicitudes[0].items.length,1);
});
test('proveedores repetidos, IDs inválidos y entrada inconsistente fallan cerrado',()=>{
  const p=proveedor('corralon_01',[cemento]);
  assert.throws(()=>plan([cemento],[p,p]),/catalogo_no_verificado/);
  assert.throws(()=>plan([cemento],[{...p,id:'X'}]),/catalogo_no_verificado/);
  assert.throws(()=>plan([cemento],[p],{...compra,zona_entrega:'*'}),/solicitud_sin_autorizacion/);
});
test('el resultado no incluye precio, contacto del comprador ni documento completo',()=>{
  const r=plan([{...cemento,precio:'1000',telefono:'1234'}],[proveedor('corralon_01',[cemento])]);
  assert.equal(r.solicitudes.length,0); // la inyección de campos desconocidos retiene la línea
  assert.ok(!JSON.stringify(r).includes('1234'));
});
