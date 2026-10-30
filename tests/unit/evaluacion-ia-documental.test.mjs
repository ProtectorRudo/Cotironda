import test from 'node:test';
import assert from 'node:assert/strict';
import {correrGoldCompleto,correrCasoGold,corpusGold}
  from '../helpers/evaluador-gold.mjs';
import {evaluarCalidadDocumental}
  from '../../src/domain/evaluacion-ia-documental.ts';
import {prepararBorradorDocumental}
  from '../../src/domain/extraccion-documental.ts';
import {planificarDespachoAutomatico}
  from '../../src/domain/despacho-automatico.ts';

const fixture=corpusGold();
const primera=fixture.scenarios[0];
const ejemploItem={
  ubicacion:'Texto, línea 1',descripcion_original:'Cemento CPC 50 kg',
  producto_normalizado:'Cemento CPC 50 kg',
  cantidad:'20',unidad:'bag',rubro:'corralon',marca:null,
  marca_obligatoria:false,confianza:0.99
};
const prov={
  id:'corralon_001',activo:true,consentimiento_whatsapp:true,
  opt_out:false,zonas_entrega:['la_plata'],
  catalogo_confirmado:[{
    descripcion:'Cemento CPC 50 kg',unidad:'bag',rubro:'corralon',marca:null
  }]
};
const solicitud={id:'ronda_gold_00001',zona_entrega:'la_plata',
  envio_autorizado_por_comprador:true};
const reporte=(items=[ejemploItem],ps=[prov],expected=primera.destinos_esperados)=>{
  const borrador=prepararBorradorDocumental('texto',{items});
  const plan=planificarDespachoAutomatico(solicitud,borrador,ps);
  return evaluarCalidadDocumental({
    esperados:primera.esperados,destinos_esperados:expected,borrador,plan
  });
};

test('corpus gold tiene casos de selección segura y adversarios, sin nombres reales de proveedores',()=>{
  assert.equal(fixture.version,'cotironda_gold_dispatch_v1');
  assert.equal(fixture.scenarios.length,12);
  assert.equal(new Set(fixture.scenarios.map(x=>x.id)).size,12);
  assert.ok(fixture.scenarios.some(x=>x.gates.seguridad==='FAIL'));
  assert.ok(fixture.scenarios.some(x=>x.gates.cobertura==='FAIL'));
  for(const escenario of fixture.scenarios){
    assert.ok(typeof escenario.texto==='string');
    assert.ok(Array.isArray(escenario.proveedores));
    assert.ok(Array.isArray(escenario.destinos_esperados));
  }
});
test('12 casos end-to-end de mock IA + validación + matching se clasifican correctamente',async()=>{
  const r=await correrGoldCompleto();
  assert.equal(r.casos,12);
  assert.equal(r.simulaciones_correctamente_clasificadas,12);
  assert.equal(r.pruebas_que_deben_ser_rechazadas,2);
  assert.equal(r.llamadas_a_openai_real,0);
  assert.equal(r.solicitudes_whatsapp_reales,0);
  assert.ok(r.resultados.every(x=>x.requests===1));
  assert.ok(r.resultados.every(x=>x.informe.apto_para_envio_real===false));
});
test('3 rubros correctos cuentan como 3 destinos esperados y 0 falsos destinatarios',async()=>{
  const e=fixture.scenarios.find(s=>s.id==='tres_rubros');
  const r=await correrCasoGold(e);
  assert.equal(r.informe.extraccion.cobertura,1);
  assert.equal(r.informe.distribucion.destinos_esperados,3);
  assert.equal(r.informe.distribucion.correctos,3);
  assert.equal(r.informe.distribucion.incorrectos,0);
  assert.equal(r.informe.puerta_seguridad,'PASS');
});
test('alucinación de peso 25 por 50 no consigue envío seguro aunque exista otro corralón',async()=>{
  const e=fixture.scenarios.find(s=>s.id==='peso_25_por_50_inventado');
  const r=await correrCasoGold(e);
  assert.equal(r.informe.distribucion.correctos,0);
  assert.equal(r.informe.distribucion.incorrectos,0);
  assert.equal(r.informe.extraccion.inventados,1);
  assert.equal(r.informe.puerta_seguridad,'FAIL');
  assert.equal(r.informe.puerta_cobertura,'FAIL');
});
test('un artículo omitido no se premia como resultado completo',async()=>{
  const e=fixture.scenarios.find(s=>s.id==='omision_no_es_exito');
  const r=await correrCasoGold(e);
  assert.equal(r.informe.extraccion.omitidos,1);
  assert.equal(r.informe.distribucion.omitidos,1);
  assert.equal(r.informe.puerta_seguridad,'PASS');
  assert.equal(r.informe.puerta_cobertura,'FAIL');
  assert.deepEqual(r.lines_without_extraction,[1]);
});
test('sin destinatarios autorizados no se inventan envíos ni se declara una cobertura falsa',async()=>{
  const e=fixture.scenarios.find(s=>s.id==='no_consentimiento_proveedor');
  const r=await correrCasoGold(e);
  assert.equal(r.informe.distribucion.destinos_esperados,0);
  assert.equal(r.informe.distribucion.correctos,0);
  assert.equal(r.informe.distribucion.cobertura,null);
  assert.equal(r.informe.puerta_seguridad,'PASS');
});
test('un proveedor equivocado produce FAIL incluso si la descripción y cantidad coinciden',()=>{
  const borrador=prepararBorradorDocumental('texto',{items:[ejemploItem]});
  const plan=planificarDespachoAutomatico(solicitud,borrador,[{
    ...prov,id:'invalido_001'
  }]);
  const r=evaluarCalidadDocumental({
    esperados:primera.esperados,
    destinos_esperados:primera.destinos_esperados,borrador,plan
  });
  assert.equal(r.distribucion.incorrectos,1);
  assert.equal(r.distribucion.correctos,0);
  assert.equal(r.puerta_seguridad,'FAIL');
});
test('el error de cantidad del proveedor se detecta aunque producto e identidad coincidan',()=>{
  const borrador=prepararBorradorDocumental('texto',{items:[{...ejemploItem,cantidad:'30'}]});
  const plan=planificarDespachoAutomatico(solicitud,borrador,[prov]);
  const r=evaluarCalidadDocumental({
    esperados:primera.esperados,
    destinos_esperados:primera.destinos_esperados,borrador,plan
  });
  assert.equal(r.extraccion.errores_cantidad_unidad,1);
  assert.equal(r.distribucion.incorrectos,1);
  assert.equal(r.puerta_seguridad,'FAIL');
});
test('precisión y cobertura son métricas distintas; los retenidos no cuentan como aciertos de envío',()=>{
  const r=reporte([{...ejemploItem,cantidad:null}]);
  assert.equal(r.extraccion.exactos,0);
  assert.equal(r.extraccion.cobertura,0);
  assert.equal(r.distribucion.correctos,0);
  assert.equal(r.distribucion.cobertura,0);
  assert.equal(r.distribucion.lineas_retenidas,1);
  assert.equal(r.puerta_cobertura,'FAIL');
});
test('el evaluador rechaza gold malformado y umbrales no finitos sin tolerancia silenciosa',()=>{
  const b=prepararBorradorDocumental('texto',{items:[ejemploItem]});
  const p=planificarDespachoAutomatico(solicitud,b,[prov]);
  for(const cobertura_minima of [-0.1,1.1,NaN,Infinity])
    assert.throws(()=>evaluarCalidadDocumental({
      esperados:primera.esperados,destinos_esperados:primera.destinos_esperados,
      borrador:b,plan:p,cobertura_minima
    }),/evaluacion_entrada_invalida/);
  assert.throws(()=>evaluarCalidadDocumental({
    esperados:[{...primera.esperados[0],ubicacion:'\u0000'}],
    destinos_esperados:primera.destinos_esperados,borrador:b,plan:p
  }),/gold_invalido/);
});
test('el evaluador conserva multiplicidad: la repetición no se convierte en único acierto',()=>{
  const b=prepararBorradorDocumental('texto',{items:[ejemploItem,ejemploItem]});
  const p=planificarDespachoAutomatico(solicitud,b,[prov]);
  const r=evaluarCalidadDocumental({
    esperados:primera.esperados,destinos_esperados:primera.destinos_esperados,
    borrador:b,plan:p
  });
  assert.equal(r.extraccion.exactos,1);
  assert.equal(r.extraccion.inventados,1);
  assert.equal(r.puerta_seguridad,'FAIL');
});
test('un falso extra enviado sin gold se cuenta como incorrecto',()=>{
  const b=prepararBorradorDocumental('texto',{items:[ejemploItem]});
  const p=planificarDespachoAutomatico(solicitud,b,[prov]);
  const r=evaluarCalidadDocumental({
    esperados:primera.esperados,destinos_esperados:[],
    borrador:b,plan:p
  });
  assert.equal(r.distribucion.incorrectos,1);
  assert.equal(r.puerta_seguridad,'FAIL');
});
