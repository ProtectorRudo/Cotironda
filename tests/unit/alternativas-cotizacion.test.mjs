import test from 'node:test';
import assert from 'node:assert/strict';
import {prepararBorradorDocumental} from '../../src/domain/extraccion-documental.ts';
import {proponerAlternativasDeCotizacion} from '../../src/domain/alternativas-cotizacion.ts';

const solicitud={id:'ronda_alt_0001',zona_entrega:'la_plata',envio_autorizado_por_comprador:true};
const linea=(descripcion,cantidad,unidad='bag',rubro='corralon',extras={})=>({
  ubicacion:'Texto, línea 1',descripcion_original:descripcion,
  producto_normalizado:descripcion,cantidad,unidad,rubro,
  marca:null,marca_obligatoria:false,confianza:0.99,...extras
});
const sku=(id,descripcion,contenido,extras={})=>({
  sku:id,descripcion,rubro:'corralon',unidad_venta:'bag',
  familia_tecnica:'cemento_cpc',
  especificacion_clave:'cemento_cpc_clase_40',
  magnitud:'kg',contenido_por_envase:contenido,marca:null,
  confirmado_por_proveedor:true,...extras
});
const req=(descripcion,contenido='50',extras={})=>({
  fila:1,descripcion_original:descripcion,rubro:'corralon',unidad_solicitada:'bag',
  familia_tecnica:'cemento_cpc',especificacion_clave:'cemento_cpc_clase_40',
  magnitud:'kg',contenido_por_unidad_solicitada:contenido,...extras
});
const pro=(id,productos,extras={})=>({
  id,activo:true,consentimiento_whatsapp:true,opt_out:false,
  zonas_entrega:['la_plata'],catalogo_confirmado:[],
  presentaciones_confirmadas:productos,...extras
});
const cemento=linea('Cemento CPC 50 kg','20');
const p25=sku('cemento_25','Cemento CPC 25 kg','25');
const input=(lineas=[cemento],requisitos=[req(cemento.descripcion_original)],
  proveedores=[pro('corralon_001',[p25])],relaciones=[])=>({
  solicitud,borrador:prepararBorradorDocumental('texto',{items:lineas}),
  requisitos,proveedores,relaciones
});
const run=(...args)=>proponerAlternativasDeCotizacion(input(...args));
const first=(r)=>r.propuestas[0]?.items[0];

test('20 bolsas de 50kg → propuesta 40 bolsas de 25 kg, sin reemplazar el original',()=>{
  const r=run();
  assert.equal(r.estado,'simulacion_alternativas_sin_envio');
  assert.equal(r.propuestas.length,1);
  assert.equal(r.propuestas[0].proveedor_id,'corralon_001');
  assert.deepEqual({
    tipo:first(r).tipo,envases:first(r).envases_cotizables,
    pedido:first(r).pedido_original,requerido:first(r).contenido_requerido,
    ofrecido:first(r).contenido_ofrecido,excedente:first(r).excedente
  },{
    tipo:'presentacion_alternativa',envases:'40',pedido:'Cemento CPC 50 kg',
    requerido:'1000',ofrecido:'1000',excedente:'0'
  });
  assert.equal(first(r).comparable_como_identico,false);
  assert.equal(first(r).estado_tecnico,'requiere_confirmacion_proveedor');
});
test('4 litros de hidrófugo → 1 envase de 5 L con 1 L excedente',()=>{
  const l=linea('Hidrófugo líquido 4 litros','4','l');
  const r=run([l],[req(l.descripcion_original,'1',{
    unidad_solicitada:'l',familia_tecnica:'hidrofugo_liquido',
    especificacion_clave:'hidrofugo_misma_formulacion',
    magnitud:'l'
  })],[pro('corralon_001',[sku('hidrofugo_5','Hidrófugo líquido 5 L','5',{
    unidad_venta:'unit',familia_tecnica:'hidrofugo_liquido',
    especificacion_clave:'hidrofugo_misma_formulacion',magnitud:'l'
  })])]);
  assert.equal(first(r).envases_cotizables,'1');
  assert.equal(first(r).contenido_requerido,'4');
  assert.equal(first(r).contenido_ofrecido,'5');
  assert.equal(first(r).excedente,'1');
});
test('20 litros de látex versus envases de 18 L propone dos envases con 16 L excedentes',()=>{
  const l=linea('Látex interior blanco 20 L','20','l','pintureria');
  const sku18=sku('latex_18','Látex interior blanco 18 L','18',{
    rubro:'pintureria',unidad_venta:'unit',magnitud:'l',
    familia_tecnica:'latex_interior',
    especificacion_clave:'latex_interior_blanco_mate'
  });
  const r=run([l],[req(l.descripcion_original,'1',{
    rubro:'pintureria',unidad_solicitada:'l',magnitud:'l',
    familia_tecnica:'latex_interior',
    especificacion_clave:'latex_interior_blanco_mate'
  })],[pro('pintura_001',[sku18])]);
  assert.equal(first(r).envases_cotizables,'2');
  assert.equal(first(r).contenido_ofrecido,'36');
  assert.equal(first(r).excedente,'16');
  assert.equal(first(r).comparable_como_identico,false);
});
test('CPC vs CPN y distintas clases NO se convierten automáticamente',()=>{
  const r=run([cemento],[req(cemento.descripcion_original)],[
    pro('corralon_001',[
      sku('cemento_cpn','Cemento CPN 25 kg','25',{
        familia_tecnica:'cemento_cpn',especificacion_clave:'cemento_cpn_clase_40'
      }),
      sku('cemento_32','Cemento CPC 25 kg clase 32','25',{
        especificacion_clave:'cemento_cpc_clase_32'
      })
    ])
  ]);
  assert.equal(r.propuestas.length,0);
  assert.equal(r.retenidas[0].motivo,'sin_alternativa_confirmada');
});
test('nunca convierte masa kg a volumen litros sin densidad validada',()=>{
  const r=run([cemento],[req(cemento.descripcion_original)],[
    pro('corralon_001',[sku('cemento_l','Cemento líquido 25 L','25',{magnitud:'l'})])
  ]);
  assert.equal(r.propuestas.length,0);
});
test('Ceresita versus hidrófugo: solo consulta curada, no identidad ni sustitución',()=>{
  const l=linea('Ceresita 5 L','4','l');
  const s=sku('hidrofugo_5','Hidrófugo líquido 5 L','5',{
    magnitud:'l',unidad_venta:'unit',
    familia_tecnica:'hidrofugo_cementicio',
    especificacion_clave:'formulacion_a_verificar'
  });
  const rel=[{
    descripcion_pedida:'Ceresita 5 L',sku_proveedor:'hidrofugo_5',rubro:'corralon',
    uso_a_verificar:'Confirmar fabricante, ficha, uso y dosificación antes de comparar.',
    curada:true
  }];
  const r=run([l],[],[pro('corralon_001',[s])],rel);
  assert.equal(first(r).tipo,'consulta_funcional');
  assert.equal(first(r).comparable_como_identico,false);
  assert.equal(first(r).estado_tecnico,'requiere_verificar_uso_y_ficha');
  assert.equal(first(r).envases_cotizables,undefined);
});
test('Ligante/Tacurú: consultar solo con relación curada y advertencia técnica',()=>{
  const l=linea('Ligante para obra','2','unit');
  const producto=sku('tacuru_001','Tacurú aditivo vinílico','1',{
    unidad_venta:'unit',magnitud:'l',familia_tecnica:'aditivo_vinilico',
    especificacion_clave:'no_acredita_promotor_adherencia'
  });
  const r=run([l],[],[pro('corralon_001',[producto])],[{
    descripcion_pedida:'Ligante para obra',sku_proveedor:'tacuru_001',
    rubro:'corralon',uso_a_verificar:'No asumir promotor de adherencia; verificar uso y ficha.',
    curada:true
  }]);
  assert.equal(first(r).tipo,'consulta_funcional');
  assert.match(first(r).advertencia,/No asumir promotor/);
});
test('ningún parecido por rubro o nombre sin relación curada invita a cotizar',()=>{
  const l=linea('Ceresita 5 L','4','l');
  assert.equal(run([l],[],[pro('corralon_001',[sku('hidrofugo_5','Hidrófugo 5 L','5')])]).propuestas.length,0);
});
test('marca obligatoria no se sustituye ni aun con relación curada',()=>{
  const l=linea('Ceresita 5 L','4','l','corralon',{
    marca:'Ceresita',marca_obligatoria:true
  });
  const s=sku('hidrofugo_5','Hidrófugo 5 L','5',{marca:'Otra marca'});
  assert.equal(run([l],[],[pro('corralon_001',[s])],[{
    descripcion_pedida:'Ceresita 5 L',sku_proveedor:'hidrofugo_5',
    rubro:'corralon',uso_a_verificar:'Diferencias técnicas',curada:true
  }]).propuestas.length,0);
});
test('opt-out, zona incorrecta, sin consentimiento y suspendido quedan excluidos',()=>{
  const r=run([cemento],[req(cemento.descripcion_original)],[
    pro('suspendido_1',[p25],{activo:false}),
    pro('baja_00001',[p25],{opt_out:true}),
    pro('sin_consent',[p25],{consentimiento_whatsapp:false}),
    pro('otra_zona_1',[p25],{zonas_entrega:['rosario']}),
    pro('corralon_001',[p25])
  ]);
  assert.deepEqual(r.propuestas.map(x=>x.proveedor_id),['corralon_001']);
});
test('duplicados quedan retenidos; no se multiplica la cantidad',()=>{
  const lines=[cemento,{...cemento,ubicacion:'Texto, línea 2'}];
  const r=run(lines,[req(cemento.descripcion_original)],[
    pro('corralon_001',[p25])
  ]);
  assert.equal(r.propuestas.length,0);
  assert.deepEqual(r.retenidas.map(x=>x.motivo),['duplicado','duplicado']);
});
test('cantidad decimal exacta y techo determinista, no redondea bolsas al azar',()=>{
  const l=linea('Hidrófugo líquido','2.5','l');
  const r=run([l],[req(l.descripcion_original,'1',{
    unidad_solicitada:'l',familia_tecnica:'hidrofugo_liquido',
    especificacion_clave:'hidrofugo_uso_interior',magnitud:'l'
  })],[pro('corralon_001',[sku('hidro_5','Hidrófugo 5 L','5',{
    unidad_venta:'unit',magnitud:'l',familia_tecnica:'hidrofugo_liquido',
    especificacion_clave:'hidrofugo_uso_interior'
  })])]);
  assert.equal(first(r).envases_cotizables,'1');
  assert.equal(first(r).excedente,'2.5');
});
test('sin cantidad verificable o número 1.000 ambiguo, no se propone presentación',()=>{
  for(const q of [null,'1.000']){
    const l=linea('Cemento CPC 50 kg',q);
    const r=run([l],[req(l.descripcion_original)],[pro('corralon_001',[p25])]);
    assert.equal(r.propuestas.length,0);
    assert.equal(r.retenidas[0].motivo,'datos_inseguros');
  }
});
test('autorización de envío y catálogo confirmado son obligatorios',()=>{
  const a=input();a.solicitud={...solicitud,envio_autorizado_por_comprador:false};
  assert.throws(()=>proponerAlternativasDeCotizacion(a),/solicitud_sin_autorizacion/);
  const b=input();b.proveedores[0].presentaciones_confirmadas=[{...p25,confirmado_por_proveedor:false}];
  assert.throws(()=>proponerAlternativasDeCotizacion(b),/alternativas_sku_no_confirmado/);
});
test('una relación inventada o incompleta falla cerrado',()=>{
  const a=input([cemento],[],[pro('corralon_001',[p25])],[{
    descripcion_pedida:'Cemento CPC 50 kg',sku_proveedor:'cemento_25',
    rubro:'corralon',uso_a_verificar:'Revisar ficha',curada:false
  }]);
  assert.throws(()=>proponerAlternativasDeCotizacion(a),/alternativas_relacion_no_curada/);
});
test('propuestas por proveedor son deterministas, identificables y no incluyen precio',()=>{
  const a=run(),b=run();
  assert.deepEqual(a,b);
  assert.equal(a.propuestas[0].clave_idempotencia,'ronda_alt_0001:alt:corralon_001');
  assert.ok(!JSON.stringify(a).includes('precio'));
});
test('especificación ambigua y rubros incongruentes no habilitan equivalencia',()=>{
  const l=linea('Placa de yeso RH 12,5 mm','5','unit','construccion_seco');
  const requisito=req(l.descripcion_original,'1',{
    rubro:'construccion_seco',unidad_solicitada:'unit',magnitud:'kg',
    familia_tecnica:'placa_yeso',especificacion_clave:'RH_12.5'
  });
  const p=sku('placa_rf_125','Placa RF 12,5 mm','1',{
    rubro:'construccion_seco',unidad_venta:'unit',
    familia_tecnica:'placa_yeso',especificacion_clave:'RF_12.5'
  });
  assert.equal(run([l],[requisito],[pro('durlock_001',[p])]).propuestas.length,0);
});
