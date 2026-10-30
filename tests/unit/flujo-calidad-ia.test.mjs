import test from 'node:test';
import assert from 'node:assert/strict';
import {simularRondaConCalidadIA} from '../../src/server/flujo-calidad-ia.ts';

const clave='sk-clave_pruebas_sinteticas_123456789012345';
const solicitud={
  id:'ronda_calidad_001',zona_entrega:'la_plata',
  envio_autorizado_por_comprador:true
};
const sku=(id,producto,descripcion,marca,rubro,attrs,base='kg',envase='25')=>({
  sku:id,producto_id:producto,descripcion,marca,rubro,
  unidad_venta:'unit',unidad_base:base,contenido_por_envase:envase,
  atributos_criticos:attrs,especificaciones_verificadas:true,
  confirmado_por_proveedor:true
});
const proveedor=(id,skus,extra={})=>({
  id,activo:true,opt_out:false,consentimiento_whatsapp:true,
  zonas_entrega:['la_plata'],catalogo_confirmado:[],skus_confirmados:skus,...extra
});
const corralon=proveedor('corralon_001',[
  sku('avellaneda_25','cemento_gris_obra','Cemento Avellaneda CPC 25 kg',
    'Avellaneda','corralon',[{codigo:'tipo',valor:'cpc'}])
]);
const pintureria=proveedor('pintura_001',[
  sku('latex_int_18','pintura_latex','Pintura látex interior 18 L',
    'Marca P','pintureria',[{codigo:'uso',valor:'interior'}],'l','18')
]);
const proveedores=[corralon,pintureria];
const item=(n,descripcion,cantidad,unidad,rubro,opts={})=>({
  ubicacion:'Texto, línea '+n,
  descripcion_original:descripcion,producto_normalizado:descripcion,
  cantidad,unidad,rubro,marca:null,marca_obligatoria:false,confianza:0.98,...opts
});
const cemento=item(1,'Cemento CPC 50 kg','20','bag','corralon');
const latex=item(2,'pintura látex interior','5','l','pintureria');
const respuesta=items=>({
  status:'completed',
  output:[{type:'message',role:'assistant',content:[
    {type:'output_text',text:JSON.stringify({items})}
  ]}],
  usage:{input_tokens:152,output_tokens:75}
});
function apiMock(items,options={}){
  let llamadas=0;
  const fetchImpl=async(url,config)=>{
    llamadas++;
    assert.equal(url,'https://api.openai.com/v1/responses');
    const req=JSON.parse(config.body);
    assert.equal(req.store,false);
    assert.deepEqual(req.tools,[]);
    assert.equal(req.model,'gpt-6-luna');
    return new Response(JSON.stringify(respuesta(items)),{
      status:options.status??200
    });
  };
  return{fetchImpl,obtenerLlamadas:()=>llamadas};
}
const run=(texto,items,ps=proveedores,extra={})=>{
  const mock=apiMock(items);
  return simularRondaConCalidadIA({
    texto,solicitud,proveedores:ps,apiKey:clave,
    habilitarLlamadaExterna:true,fetchImpl:mock.fetchImpl,...extra
  });
};

test('prioridad IA incluso para pedidos claros: una llamada MOCK y datos trazados',async()=>{
  const r=await run('20 bolsas de Cemento CPC 50 kg',[cemento]);
  assert.equal(r.estrategia,'ia_primero');
  assert.equal(r.estado,'plan_calidad_prioritaria_sin_envio');
  assert.equal(r.resumen.lineas_originales,1);
  assert.equal(r.resumen.completas,1);
  assert.equal(r.resumen.pedido_totalmente_cubierto,true);
  assert.equal(r.lineas[0].estado,'preparada_para_consultar');
  assert.equal(r.lineas[0].proveedores_candidatos,1);
  assert.deepEqual(r.tokens,{entrada:152,salida:75});
  const o=r.resultado.distribucion.plan.invitaciones[0].items[0].opciones[0];
  assert.equal(o.marca_catalogo,'Avellaneda');
  assert.equal(o.cantidad_envases_orientativa,'40');
  assert.equal(o.comparable_como_identico,false);
});
test('lenguaje coloquial «necesito» con cantidad verificable no se pierde',async()=>{
  const r=await run('Necesito 20 bolsas de Cemento CPC 50 kg',[cemento]);
  assert.equal(r.resumen.completas,1);
  assert.equal(r.resumen.retenidas,0);
});
test('tres líneas: una omitida no se esconde detrás de dos correctas',async()=>{
  const texto='20 bolsas de Cemento CPC 50 kg\n5 litros de pintura látex interior\n4 unidades de Producto desconocido';
  const r=await run(texto,[cemento,latex]);
  assert.deepEqual(r.lineas.map(x=>x.estado),[
    'preparada_para_consultar','preparada_para_consultar','omitida_por_ia'
  ]);
  assert.equal(r.resumen.omitidas,1);
  assert.equal(r.resumen.proveedores_preparados,2);
  assert.equal(r.resumen.pedido_totalmente_cubierto,false);
  assert.deepEqual(r.lineas[2].motivos,['linea_sin_extraccion']);
});
test('producto fuera del diccionario queda retenido, pero líneas válidas continúan',async()=>{
  const txt='20 bolsas de Cemento CPC 50 kg\n4 unidades de Producto desconocido';
  const desconocido=item(2,'Producto desconocido','4','unit','corralon');
  const r=await run(txt,[cemento,desconocido]);
  assert.deepEqual(r.lineas.map(x=>x.estado),[
    'preparada_para_consultar','retenida'
  ]);
  assert.equal(r.resumen.completas,1);
  assert.equal(r.resumen.retenidas,1);
  assert.equal(r.resumen.pedido_totalmente_cubierto,false);
});
test('si ningún proveedor trabaja cemento, no se reporta el pedido como exitoso',async()=>{
  const r=await run('20 bolsas de Cemento CPC 50 kg',[cemento],[pintureria]);
  assert.equal(r.lineas[0].estado,'sin_proveedor_confirmado');
  assert.equal(r.resumen.sin_proveedor,1);
  assert.equal(r.resumen.proveedores_preparados,0);
  assert.equal(r.resumen.pedido_totalmente_cubierto,false);
});
test('la cantidad inventada bloquea el artículo, aunque la familia sea correcta',async()=>{
  const r=await run('20 bolsas de Cemento CPC 50 kg',[
    {...cemento,cantidad:'200'}
  ]);
  assert.equal(r.resumen.retenidas,1);
  assert.equal(r.resumen.proveedores_preparados,0);
  assert.ok(r.lineas[0].motivos.includes('cantidad_sin_evidencia'));
});
test('un peso de envase no puede convertirse en cantidad pedida',async()=>{
  const r=await run('20 bolsas de Cemento CPC 50 kg',[
    {...cemento,cantidad:'50',unidad:'kg'}
  ]);
  assert.equal(r.resumen.retenidas,1);
  assert.ok(r.lineas[0].motivos.includes('cantidad_sin_evidencia'));
});
test('recortar CPC y 50 kg para simular mismo cemento genérico falla cerrado',async()=>{
  const r=await run('20 bolsas de Cemento CPC 50 kg',[
    {...cemento,descripcion_original:'Cemento',producto_normalizado:'Cemento'}
  ]);
  assert.equal(r.lineas[0].estado,'retenida');
  assert.ok(r.lineas[0].motivos.includes('cantidad_sin_evidencia'));
});
test('marca mencionada no bloquea corralón Avellaneda, exclusividad sí',async()=>{
  const preferida=item(1,'Cemento Loma Negra CPC 50 kg','20','bag','corralon',{
    marca:'Loma Negra',marca_obligatoria:true
  });
  const r=await run('20 bolsas de Cemento Loma Negra CPC 50 kg',[preferida]);
  assert.equal(r.lineas[0].estado,'preparada_para_consultar');
  assert.equal(r.resultado.distribucion.plan.invitaciones[0].items[0].marca_exclusiva,false);
  const exclusiva=item(1,'Cemento solo Loma Negra CPC 50 kg','20','bag','corralon',{
    marca:'Loma Negra',marca_obligatoria:true
  });
  const e=await run('20 bolsas de Cemento solo Loma Negra CPC 50 kg',[exclusiva]);
  assert.equal(e.lineas[0].estado,'sin_proveedor_confirmado');
  assert.equal(e.resumen.completas,0);
});
test('duplicados detectados no multiplican invitaciones',async()=>{
  const r=await run('20 bolsas de Cemento CPC 50 kg\n20 bolsas de Cemento CPC 50 kg',[
    cemento,{...cemento,ubicacion:'Texto, línea 2'}
  ]);
  assert.equal(r.resumen.retenidas,2);
  assert.equal(r.resumen.proveedores_preparados,0);
});
test('si 429 del proveedor, no existe éxito simulado ni fallback silencioso',async()=>{
  await assert.rejects(run('20 bolsas de Cemento CPC 50 kg',[cemento],
    proveedores,{fetchImpl:async()=>new Response('{}',{status:429})}),
  /ia_cuota_o_rate_limit/);
});
test('sin autorización comprador no consume IA ni produce plan',async()=>{
  let llamadas=0;
  await assert.rejects(simularRondaConCalidadIA({
    texto:'20 bolsas de Cemento CPC 50 kg',
    apiKey:clave,habilitarLlamadaExterna:true,
    solicitud:{...solicitud,envio_autorizado_por_comprador:false},
    proveedores,
    fetchImpl:async()=>{llamadas++;return new Response('{}');}
  }),/solicitud_sin_autorizacion/);
  assert.equal(llamadas,0);
});
test('IA apagada no sustituye a escondidas por ruta de calidad insuficientemente probada',async()=>{
  let llamadas=0;
  await assert.rejects(simularRondaConCalidadIA({
    texto:'20 bolsas de Cemento CPC 50 kg',
    apiKey:clave,habilitarLlamadaExterna:false,
    solicitud,proveedores,
    fetchImpl:async()=>{llamadas++;return new Response('{}');}
  }),/ia_remota_no_autorizada/);
  assert.equal(llamadas,0);
});
test('proveedor sin opt-in o fuera de zona no recibe ninguna invitación',async()=>{
  const p=[{...corralon,consentimiento_whatsapp:false}];
  const r=await run('20 bolsas de Cemento CPC 50 kg',[cemento],p);
  assert.equal(r.resumen.sin_proveedor,1);
  assert.equal(r.resumen.proveedores_preparados,0);
});
