import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {
  escenariosProducto,correrCasoProducto,correrGoldProductoCompleto
} from '../helpers/evaluador-producto.mjs';
import {evaluarCalidadInvitacionesPorProducto}
  from '../../src/domain/evaluacion-invitaciones-producto.ts';

test('12 escenarios gold de producto clasifican puertas de seguridad y cobertura como se diseñó',async()=>{
  const r=await correrGoldProductoCompleto();
  assert.equal(r.escenarios,12);
  assert.equal(r.clasificaciones_correctas,12);
  assert.equal(r.solicitudes_openai_reales,0);
  assert.equal(r.whatsapp_reales,0);
  assert.ok(r.resultados.every(x=>x.calls===1));
  assert.ok(r.resultados.every(x=>x.informe.apto_para_envio_real===false));
});
test('Loma Negra mencionada es cotizable por Avellaneda, no por similitud literal',async()=>{
  const r=await correrCasoProducto(escenariosProducto[0]);
  assert.deepEqual(r.resultado.resultado.distribucion.plan.invitaciones
    .map(x=>x.proveedor_id),['corralon_001']);
  assert.equal(r.informe.invitaciones.correctas,1);
  assert.equal(r.informe.invitaciones.incorrectas,0);
  assert.equal(r.informe.puerta_seguridad,'PASS');
});
test('cemento genérico conserva marca y presentación como variables',async()=>{
  const r=await correrCasoProducto(escenariosProducto[1]);
  assert.equal(r.informe.extraccion.exactos,1);
  assert.equal(r.informe.invitaciones.correctas,1);
});
test('dos materiales de una línea cuentan por ARTÍCULO y por proveedor, no por línea',async()=>{
  const r=await correrCasoProducto(escenariosProducto[3]);
  assert.equal(r.informe.extraccion.exactos,2);
  assert.equal(r.informe.extraccion.cobertura,1);
  assert.equal(r.informe.invitaciones.esperadas,2);
  assert.equal(r.informe.invitaciones.correctas,2);
  assert.equal(r.resultado.resumen.segmentos_fuente_estimados,2);
});
test('si falta pintura en la misma línea, seguridad PASS pero cobertura FAIL',async()=>{
  const r=await correrCasoProducto(escenariosProducto[4]);
  assert.equal(r.informe.puerta_seguridad,'PASS');
  assert.equal(r.informe.puerta_cobertura,'FAIL');
  assert.equal(r.informe.extraccion.omitidos,1);
  assert.equal(r.informe.invitaciones.omitidas,1);
  assert.equal(r.resultado.resumen.parciales,1);
});
test('si una cantidad es inventada, ningún destino se considera correcto',async()=>{
  const r=await correrCasoProducto(escenariosProducto[5]);
  assert.equal(r.informe.puerta_seguridad,'FAIL');
  assert.equal(r.informe.puerta_cobertura,'FAIL');
  assert.equal(r.informe.extraccion.alterados_o_no_reconocidos,1);
});
test('marca explícitamente exclusiva excluye Avellaneda y permite Loma Negra',async()=>{
  const r=await correrCasoProducto(escenariosProducto[6]);
  assert.deepEqual(r.resultado.resultado.distribucion.plan.invitaciones
    .map(x=>x.proveedor_id),['corralon_loma']);
  assert.equal(r.informe.invitaciones.incorrectas,0);
});
test('proveedores sin consentimiento o fuera de zona no cuentan como oportunidad',async()=>{
  const r=await correrCasoProducto(escenariosProducto[7]);
  assert.deepEqual(r.resultado.resultado.distribucion.plan.invitaciones
    .map(x=>x.proveedor_id),['corralon_001']);
  assert.equal(r.informe.invitaciones.correctas,1);
});
test('placa RH frente RF permite solo consulta diferencial, no oferta idéntica',async()=>{
  const r=await correrCasoProducto(escenariosProducto[8]);
  assert.equal(r.informe.invitaciones.correctas,1);
  const alt=r.resultado.resultado.distribucion.plan.invitaciones[0].items[0].opciones[0];
  assert.equal(alt.relacion,'diferencia_tecnica_declarada');
  assert.equal(alt.comparable_como_identico,false);
});
test('producto sin proveedor no inventa destinos y la métrica de recall es null',async()=>{
  const r=await correrCasoProducto(escenariosProducto[9]);
  assert.equal(r.informe.invitaciones.esperadas,0);
  assert.equal(r.informe.invitaciones.correctas,0);
  assert.equal(r.informe.invitaciones.cobertura,null);
  assert.equal(r.informe.puerta_seguridad,'PASS');
});
test('un producto fuera del diccionario no se convierte en cemento de obra',async()=>{
  const r=await correrCasoProducto(escenariosProducto[10]);
  assert.equal(r.informe.extraccion.exactos,1);
  assert.equal(r.informe.invitaciones.correctas,0);
  assert.equal(r.informe.invitaciones.incorrectas,0);
  assert.equal(r.resultado.resumen.retenidas,1);
});
test('una invitación falsificada a proveedor ajeno hace FAIL en seguridad',async()=>{
  const r=await correrCasoProducto(escenariosProducto[0]);
  const copia=structuredClone(r.resultado);
  const i=copia.resultado.distribucion.plan.invitaciones[0];
  copia.resultado.distribucion.plan.invitaciones.push({
    ...i,proveedor_id:'proveedor_inventado_001',
    clave_idempotencia:'fraude_sintetico'
  });
  const score=evaluarCalidadInvitacionesPorProducto({
    esperados:escenariosProducto[0].esperados,resultado:copia
  });
  assert.equal(score.invitaciones.correctas,1);
  assert.equal(score.invitaciones.incorrectas,1);
  assert.equal(score.puerta_seguridad,'FAIL');
});
test('mismo proveedor y artículo duplicados no cuentan como más cobertura',async()=>{
  const r=await correrCasoProducto(escenariosProducto[0]);
  const copia=structuredClone(r.resultado);
  const invitacion=copia.resultado.distribucion.plan.invitaciones[0];
  invitacion.items.push({...invitacion.items[0]});
  const score=evaluarCalidadInvitacionesPorProducto({
    esperados:escenariosProducto[0].esperados,resultado:copia
  });
  assert.equal(score.invitaciones.correctas,1);
  assert.equal(score.invitaciones.incorrectas,1);
  assert.equal(score.puerta_seguridad,'FAIL');
});
test('la misma marca a un proveedor inesperado no es una invitación válida',async()=>{
  const r=await correrCasoProducto(escenariosProducto[0]);
  const copia=structuredClone(r.resultado);
  copia.resultado.distribucion.plan.invitaciones[0].proveedor_id='corralon_desconocido';
  const score=evaluarCalidadInvitacionesPorProducto({
    esperados:escenariosProducto[0].esperados,resultado:copia
  });
  assert.equal(score.invitaciones.correctas,0);
  assert.equal(score.invitaciones.incorrectas,1);
  assert.equal(score.puerta_seguridad,'FAIL');
});
test('cambiar unidades o cantidad en respuesta no puede contar como invitación correcta',async()=>{
  const r=await correrCasoProducto(escenariosProducto[0]);
  const copia=structuredClone(r.resultado);
  copia.resultado.extraccion.borrador.lineas[0].cantidad='50';
  const score=evaluarCalidadInvitacionesPorProducto({
    esperados:escenariosProducto[0].esperados,resultado:copia
  });
  assert.equal(score.extraccion.exactos,0);
  assert.equal(score.extraccion.alterados_o_no_reconocidos,1);
  assert.equal(score.invitaciones.correctas,0);
  assert.equal(score.invitaciones.incorrectas,1);
  assert.equal(score.puerta_seguridad,'FAIL');
});
test('umbral de cobertura estricto diferencia falsos destinatarios de omisiones',async()=>{
  const r=await correrCasoProducto(escenariosProducto[4]);
  const score=evaluarCalidadInvitacionesPorProducto({
    esperados:escenariosProducto[4].esperados,resultado:r.resultado,
    cobertura_minima:0.5
  });
  assert.equal(score.puerta_seguridad,'PASS');
  assert.equal(score.puerta_cobertura,'PASS');
  assert.equal(r.informe.puerta_cobertura,'FAIL');
});
test('gold corrupto o umbral imposible se rechaza',async()=>{
  const r=await correrCasoProducto(escenariosProducto[0]);
  assert.throws(()=>evaluarCalidadInvitacionesPorProducto({
    esperados:escenariosProducto[0].esperados,
    resultado:r.resultado,cobertura_minima:1.1
  }),/benchmark_producto_entrada_invalida/);
  const bad=[{...escenariosProducto[0].esperados[0],
    proveedores_esperados:['corralon_001','corralon_001']}];
  assert.throws(()=>evaluarCalidadInvitacionesPorProducto({
    esperados:bad,resultado:r.resultado
  }),/benchmark_gold_invalido/);
});
test('CLI reproducible produce JSON, clasifica mocks y no hace requests reales',()=>{
  const text=execFileSync(process.execPath,[
    '--experimental-strip-types','scripts/eval/producto-quality-offline.mjs'
  ],{encoding:'utf8',timeout:12000,stdio:['ignore','pipe','pipe']});
  const r=JSON.parse(text);
  assert.equal(r.modo,'benchmark_producto_mock_offline');
  assert.equal(r.escenarios,12);
  assert.equal(r.clasificaciones_correctas,12);
  assert.equal(r.solicitudes_openai_reales,0);
  assert.equal(r.whatsapp_reales,0);
});
