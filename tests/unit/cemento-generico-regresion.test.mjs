import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {escenariosProducto} from '../fixtures/gold-invitaciones-producto-v1.mjs';
import {evaluarCasoCalidadDev} from '../../supabase/functions/cotironda-ia-dev/lab.ts';

const caso=escenariosProducto.find(c=>c.id==='cemento_generico_sin_especificacion_inventada');
if(!caso)throw Error('Caso gold faltante');
const original=caso.items[0];
const key='sk-sintetica_sin_red_123456789012345';
const simular=async(items)=>{
  let llamadas=0;
  const f=async(_url,options)=>{
    llamadas++;
    const body=JSON.parse(options.body);
    assert.equal(body.store,false);
    assert.deepEqual(body.tools,[]);
    assert.equal(body.model,'gpt-6-luna');
    assert.ok(!JSON.stringify(body).includes('proveedores_esperados'));
    return new Response(JSON.stringify({status:'completed',
      output:[{type:'message',role:'assistant',content:[{
        type:'output_text',text:JSON.stringify({items})
      }]}],usage:{input_tokens:100,output_tokens:50}}),{status:200});
  };
  const reporte=await evaluarCasoCalidadDev(caso.id,key,f);
  assert.equal(llamadas,1);
  assert.equal(reporte.envio_habilitado,false);
  assert.equal(reporte.proveedores_reales,0);
  assert.equal(reporte.mensajes_whatsapp,0);
  assert.ok(!JSON.stringify(reporte).includes(key));
  assert.ok(!JSON.stringify(reporte).includes('10 bolsas de Cemento'));
  return reporte;
};

test('gold conocido: 10 bolsas de cemento literal sí cumple contrato, MOCK sin IA real',async()=>{
  const r=await simular([original]);
  assert.equal(r.seguridad,'PASS');
  assert.equal(r.cobertura,'PASS');
  assert.equal(r.extraccion.exactos,1);
  assert.equal(r.invitaciones.correctas,1);
  assert.deepEqual(r.diagnostico,{
    items_propuestos:1,items_con_aclaracion:0,
    origen_no_verificado:0,cantidad_sin_evidencia:0,
    segmentos_sin_extraccion:0,items_retenidos:0
  });
});
test('mayúsculas no deberían alterar la identidad del material',async()=>{
  const r=await simular([{...original,descripcion_original:'cemento',producto_normalizado:'cemento'}]);
  assert.equal(r.seguridad,'PASS');
  assert.equal(r.cobertura,'PASS');
});
test('la IA puede devolver unidad equivocada: debe quedar retenida y explicada',async()=>{
  const r=await simular([{...original,unidad:'unit'}]);
  assert.equal(r.cobertura,'FAIL');
  assert.equal(r.invitaciones.correctas,0);
  assert.equal(r.diagnostico.cantidad_sin_evidencia,1);
  assert.equal(r.diagnostico.segmentos_sin_extraccion,1);
});
test('producto inventado cemento común queda retenido',async()=>{
  const r=await simular([{...original,descripcion_original:'Cemento común',
    producto_normalizado:'Cemento común'}]);
  assert.equal(r.cobertura,'FAIL');
  assert.equal(r.invitaciones.correctas,0);
  assert.equal(r.diagnostico.origen_no_verificado,1);
});
test('meter la cantidad dentro de descripción no se confunde con producto exacto',async()=>{
  const r=await simular([{...original,descripcion_original:'10 bolsas de Cemento',
    producto_normalizado:'10 bolsas de Cemento'}]);
  assert.equal(r.cobertura,'FAIL');
  assert.equal(r.invitaciones.correctas,0);
  assert.equal(r.diagnostico.cantidad_sin_evidencia,1);
});
test('cantidad inventada no pasa ni se corrige silenciosamente',async()=>{
  const r=await simular([{...original,cantidad:'100'}]);
  assert.equal(r.seguridad,'FAIL');
  assert.equal(r.cobertura,'FAIL');
  assert.equal(r.diagnostico.cantidad_sin_evidencia,1);
});
test('omisión total se distingue de propuesta rechazada y no produce falso PASS',async()=>{
  const r=await simular([]);
  assert.equal(r.cobertura,'FAIL');
  assert.equal(r.extraccion.omitidos,1);
  assert.equal(r.diagnostico.items_propuestos,0);
  assert.equal(r.diagnostico.segmentos_sin_extraccion,1);
});
test('el prompt aclara la separación sin incluir gold ni inventar atributos',()=>{
  const s=readFileSync('src/server/openai-extraccion.ts','utf8');
  assert.match(s,/sin la cantidad solicitada, sin la unidad de compra/);
  assert.match(s,/Ejemplo ajeno al pedido/);
  assert.match(s,/jamás agregar/);
  assert.match(s,/no son la unidad de compra/);
  assert.match(s,/cemento CPC 25 kg/);
  assert.ok(!s.includes('«10 bolsas de Cemento» se extrae'));
});
test('el SQL solo agrega métricas privadas y conserva reserva idempotente',()=>{
  const sql=readFileSync('supabase/sql/dev_quality_numeric_diagnostics.sql','utf8');
  assert.match(sql,/ALTER TABLE public\.dev_ia_quality_results/);
  assert.match(sql,/diag_origen_no_verificado integer/);
  assert.match(sql,/diag_cantidad_sin_evidencia integer/);
  assert.doesNotMatch(sql,/\b(DELETE|TRUNCATE|DROP TABLE|UPDATE public\.dev_ia_quality_claims)\b/i);
  assert.doesNotMatch(sql,/\bGRANT\b/);
});
