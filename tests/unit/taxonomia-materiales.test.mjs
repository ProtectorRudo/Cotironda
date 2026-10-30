import test from 'node:test';
import assert from 'node:assert/strict';
import {prepararBorradorDocumental} from '../../src/domain/extraccion-documental.ts';
import {
  VERSION_TAXONOMIA,identificarProducto,resolverProductosDeBorrador,
  simularInvitacionesDesdeBorrador
} from '../../src/domain/taxonomia-materiales.ts';
import {simularInvitacionesConIA} from '../../src/server/openai-extraccion.ts';

const solicitud={id:'ronda_taxonomia_1',zona_entrega:'la_plata',envio_autorizado_por_comprador:true};
const registro=(desc,qty='20',unidad='bag',rubro='corralon',extra={})=>({
  ubicacion:'Texto, línea 1',descripcion_original:desc,producto_normalizado:desc,
  cantidad:qty,unidad,rubro,marca:null,marca_obligatoria:false,confianza:0.98,...extra
});
const borrador=(...items)=>prepararBorradorDocumental('texto',{items});
const sku=(id,producto,descripcion,marca,extra={})=>({
  sku:id,descripcion,producto_id:producto,rubro:'corralon',marca,
  unidad_venta:'bag',contenido_por_envase:'25',unidad_base:'kg',
  atributos_criticos:[{codigo:'tipo',valor:'cpc'}],
  especificaciones_verificadas:true,confirmado_por_proveedor:true,...extra
});
const provider=(id,skus,opts={})=>({
  id,activo:true,consentimiento_whatsapp:true,opt_out:false,
  zonas_entrega:['la_plata'],catalogo_confirmado:[],skus_confirmados:skus,...opts
});
const avellaneda=sku('cemento_avella_25','cemento_gris_obra',
  'Cemento Avellaneda 25 kg','Avellaneda');
const prov=[provider('corralon_001',[avellaneda])];
const simular=(b,ps=prov,s=solicitud)=>simularInvitacionesDesdeBorrador({
  solicitud:s,borrador:b,proveedores:ps
});

test('diccionario inicial versionado para 5 rubros de construcción',()=>{
  assert.equal(VERSION_TAXONOMIA,'obra_ar_v1_2026_10_30');
  const casos=[
    ['Cemento','cemento_gris_obra','corralon'],
    ['Cemento común','cemento_gris_obra','corralon'],
    ['Cemento Loma Negra 50 kg','cemento_gris_obra','corralon'],
    ['Cemento Avellaneda 25kg','cemento_gris_obra','corralon'],
    ['Hidrófugo líquido','hidrofugo','corralon'],
    ['Ceresita','hidrofugo','corralon'],
    ['Pintura látex interior','pintura_latex','pintureria'],
    ['Placa de yeso RH 12,5 mm','placa_yeso','construccion_seco'],
    ['Placas Durlock','placa_yeso','construccion_seco'],
    ['Cable unipolar 2,5 mm2','cable_unipolar','electricidad'],
    ['Caño de PVC 110','cano_pvc','sanitarios']
  ];
  for(const [desc,id,rubro] of casos){
    const r=identificarProducto(desc);
    assert.equal(r?.producto_id,id,desc);
    assert.equal(r?.rubro,rubro,desc);
  }
});
test('cemento genérico, común, Avellaneda o Loma Negra llega al corralón con SKU confirmado',()=>{
  for(const desc of ['Cemento','Cemento común','Cemento Avellaneda 25kg',
    'Cemento Loma Negra 50 kg']){
    const r=simular(borrador(registro(desc)));
    assert.deepEqual(r.plan.invitaciones.map(x=>x.proveedor_id),['corralon_001'],desc);
    assert.equal(r.plan.invitaciones[0].items[0].producto_id,'cemento_gris_obra');
    assert.equal(r.plan.invitaciones[0].items[0].opciones[0].comparable_como_identico,false);
  }
});
test('la presentación 50kg en 20 bolsas se transforma a 40×25 si el tipo está verificado',()=>{
  const r=simular(borrador(registro('Cemento CPC Loma Negra 50 kg','20','bag','corralon',{
    marca:'Loma Negra'
  })));
  const item=r.plan.invitaciones[0].items[0];
  assert.equal(item.marca_exclusiva,false);
  assert.equal(item.opciones[0].cantidad_envases_orientativa,'40');
  assert.equal(item.opciones[0].excedente_orientativo,'0');
  assert.deepEqual(r.resolucion.requisitos[0].atributos_solicitados,[{codigo:'tipo',valor:'cpc'}]);
});
test('si sólo dice «cemento» no se le atribuye un tipo CPC ni tamaño de bolsa',()=>{
  const r=simular(borrador(registro('Cemento')));
  assert.deepEqual(r.resolucion.requisitos[0].atributos_solicitados,[]);
  assert.equal(r.resolucion.requisitos[0].contenido_por_unidad_solicitada,null);
  assert.equal(r.plan.invitaciones[0].items[0].opciones[0].cantidad_envases_orientativa,null);
  assert.equal(r.plan.invitaciones[0].items[0].opciones[0].relacion,'verificar_especificacion');
});
test('modelo marca Loma Negra como exclusiva sin frase expresa: se corrige y participa Avellaneda',()=>{
  const r=simular(borrador(registro('Cemento Loma Negra 50 kg','20','bag','corralon',{
    marca:'Loma Negra',marca_obligatoria:true
  })));
  assert.deepEqual(r.resolucion.marcas_no_exclusivas_corregidas,[1]);
  assert.equal(r.plan.invitaciones.length,1);
  assert.equal(r.plan.invitaciones[0].items[0].marca_exclusiva,false);
});
test('«Solo Loma Negra» sí es exclusividad expresa: no cotiza Avellaneda',()=>{
  const r=simular(borrador(registro('Cemento solo Loma Negra 50 kg','20','bag','corralon',{
    marca:'Loma Negra',marca_obligatoria:false
  })));
  assert.deepEqual(r.resolucion.marcas_exclusivas_verificadas,[1]);
  assert.equal(r.plan.invitaciones.length,0);
  assert.equal(r.plan.retenidas[0].motivo,'sin_proveedor_que_trabaje_producto');
});
test('frase «sin sustitutos» sin marca identificada retiene, no invita indiscriminadamente',()=>{
  const r=simular(borrador(registro('Cemento sin sustitutos')));
  assert.deepEqual(r.resolucion.retenidas.map(x=>x.motivo),
    ['marca_exclusiva_sin_identificar']);
  assert.equal(r.plan.invitaciones.length,0);
});
test('alucinación de exclusividad sin marca se corrige si el texto no la exige',()=>{
  const r=simular(borrador(registro('Cemento común','10','bag','corralon',{
    marca_obligatoria:true,marca:null
  })));
  assert.equal(r.plan.invitaciones.length,1);
  assert.deepEqual(r.resolucion.marcas_no_exclusivas_corregidas,[1]);
});
test('categorías similares ajenas no son confundidas con cemento de obra',()=>{
  for(const desc of ['Adhesivo cerámico','Cemento cola','Cemento de contacto',
    'Cemento blanco','Mortero de cemento','Pintura color cemento',
    'Cemento refractario','Cemento alisado']){
    assert.equal(identificarProducto(desc),null,desc);
  }
});
test('términos parecidos de otros nichos tampoco se mapean a familia incorrecta',()=>{
  for(const desc of ['Guantes de látex','Adhesivo para placa de yeso',
    'Tornillo para placa de yeso','Cable de acero','Cable de red','Caño PVC eléctrico',
    'Durlock','Pintura sintética','Cable','Caño']){
    assert.equal(identificarProducto(desc),null,desc);
  }
});
test('rubro propuesto por IA contrario al producto curado queda retenido',()=>{
  const r=simular(borrador(registro('Cemento','20','bag','pintureria')));
  assert.equal(r.plan.invitaciones.length,0);
  assert.deepEqual(r.resolucion.retenidas.map(x=>x.motivo),['rubro_incompatible']);
});
test('producto desconocido se retiene; el resto del pedido se invita igual',()=>{
  const b=borrador(registro('Producto ficticio desconocido'),
    registro('Cemento común','15','bag','corralon',{ubicacion:'Texto, línea 2'}));
  const r=simular(b);
  assert.deepEqual(r.resolucion.retenidas.map(x=>x.fila),[1]);
  assert.deepEqual(r.plan.invitaciones[0].items.map(x=>x.fila),[2]);
});
test('atributos se extraen SOLO cuando el pedido los expresa',()=>{
  const casos=[
    [registro('Placas de yeso RH 12,5 mm','4','unit','construccion_seco'),
      [{codigo:'clase',valor:'rh'},{codigo:'espesor_mm',valor:'12.5'}]],
    [registro('Pintura látex exterior mate','20','l','pintureria'),
      [{codigo:'uso',valor:'exterior'},{codigo:'terminacion',valor:'mate'}]],
    [registro('Cable unipolar 2,5 mm2 PVC','100','m','electricidad'),
      [{codigo:'seccion_mm2',valor:'2.5'},{codigo:'aislacion',valor:'pvc'}]]
  ];
  for(const [item,attrs] of casos){
    const r=resolverProductosDeBorrador(borrador(item));
    assert.deepEqual(r.requisitos[0].atributos_solicitados,attrs);
  }
});
test('marca exclusiva por texto y SKU compatible pasa; marca diferente no',()=>{
  const b=borrador(registro('Cemento solo Loma Negra CPC 50 kg','20','bag','corralon',{
    marca:'Loma Negra'
  }));
  const r=simular(b,[provider('corralon_001',[
    avellaneda,sku('cemento_loma_25','cemento_gris_obra',
      'Cemento Loma Negra CPC 25 kg','Loma Negra')
  ])]);
  assert.equal(r.plan.invitaciones[0].items[0].opciones.length,1);
  assert.equal(r.plan.invitaciones[0].items[0].opciones[0].marca_catalogo,'Loma Negra');
});
test('opt-out, estado y zona siguen filtrando incluso con sinónimos',()=>{
  const r=simular(borrador(registro('Cemento común')),[provider('fuera_zona_1',[avellaneda],{
    zonas_entrega:['rosario']
  }),provider('baja_000001',[avellaneda],{opt_out:true}),provider('corralon_001',[avellaneda])]);
  assert.deepEqual(r.plan.invitaciones.map(x=>x.proveedor_id),['corralon_001']);
});
test('cantidad 1.000 ambiguo no se inventa ni se envía',()=>{
  const r=simular(borrador(registro('Cemento común','1.000')));
  assert.equal(r.plan.invitaciones.length,0);
  assert.deepEqual(r.resolucion.retenidas.map(x=>x.motivo),['datos_documentales_inseguros']);
});
test('no se invitan proveedores sin autorización al enviar lista',()=>{
  assert.throws(()=>simular(borrador(registro('Cemento')),prov,{
    ...solicitud,envio_autorizado_por_comprador:false
  }),/solicitud_sin_autorizacion/);
});
test('peticiones idénticas mantienen idempotencia y carecen de envío',()=>{
  const a=simular(borrador(registro('Cemento común')));
  const b=simular(borrador(registro('Cemento común')));
  assert.deepEqual(a,b);
  assert.equal(a.estado,'simulacion_taxonomia_sin_envio');
  assert.equal(a.plan.estado,'invitaciones_por_producto_sin_envio');
  assert.equal(a.plan.invitaciones[0].clave_idempotencia,
    'ronda_taxonomia_1:familia:corralon_001');
});
test('IA simulada se conecta al catálogo sin mandar WhatsApp ni hacer OpenAI real',async()=>{
  const row=registro('Cemento Loma Negra 50 kg','20','bag','corralon',{
    marca:'Loma Negra',marca_obligatoria:true
  });
  let calls=0;
  const mock=async(url,options)=>{
    calls++;
    assert.equal(url,'https://api.openai.com/v1/responses');
    const req=JSON.parse(options.body);
    assert.deepEqual(req.tools,[]);
    assert.equal(req.store,false);
    return new Response(JSON.stringify({
      status:'completed',output:[{type:'message',role:'assistant',content:[{
        type:'output_text',text:JSON.stringify({items:[row]})
      }]}],usage:{input_tokens:100,output_tokens:100}
    }),{status:200});
  };
  const res=await simularInvitacionesConIA({
    texto:'20 bolsas de Cemento Loma Negra 50 kg',
    apiKey:'sk-fake_dev_only_12345678901234',habilitarLlamadaExterna:true,
    fetchImpl:mock,solicitud,proveedores:prov
  });
  assert.equal(calls,1);
  assert.equal(res.estado,'simulacion_ia_productos_sin_envio');
  assert.equal(res.distribucion.plan.invitaciones.length,1);
  assert.equal(res.distribucion.plan.invitaciones[0].items[0].marca_exclusiva,false);
});
test('servicio bloquea solicitud sin autorización ANTES de consumir tokens',async()=>{
  let calls=0;
  await assert.rejects(()=>simularInvitacionesConIA({
    texto:'20 bolsas de cemento',apiKey:'sk-fake_dev_only_12345678901234',
    habilitarLlamadaExterna:true,
    fetchImpl:async()=>{calls++;return new Response('{}')},
    solicitud:{...solicitud,envio_autorizado_por_comprador:false},
    proveedores:prov
  }),/solicitud_sin_autorizacion/);
  assert.equal(calls,0);
});
