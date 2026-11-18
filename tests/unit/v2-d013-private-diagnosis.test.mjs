import test from 'node:test';
import assert from 'node:assert/strict';
import {resumirCantidadPrivadaD013} from
 '../../src/domain/ia-central/diagnostico-privado-cantidad-v2-d013.ts';
import {diagnosticarLecturaPrivadaD013} from
 '../../src/domain/ia-central/cliente-openai-v2-d013.ts';
import {ejecutarRecuperacionVaultD013,
 SQL_D013_APPROVED_COMMIT} from
 '../../supabase/functions/cotironda-piloto-v2-review-recovery-d013/worker-core.ts';

function request(action,release=null){
 return new Request('https://example.invalid/private',{method:'POST',
  headers:{'content-type':'application/json',
   ...(release?{'x-cotironda-d013-release':release}:{})},
  body:JSON.stringify({action})});
}
const fakeApiKey='sk-'+'s'.repeat(32);
function mockResponse(data){
 return new Response(JSON.stringify({status:'completed',output:[{
  type:'message',role:'assistant',content:[{
   type:'output_text',text:JSON.stringify(data)
  }]
 }]}),{status:200});
}
const full='Comprador: Florencia Pérez 1133445566.\n'+
 'Cemento blanco de marca confidencial sin cantidad.\nEntrega: La Plata';
const evidence='Cemento blanco de marca confidencial sin cantidad';
const start=full.indexOf(evidence);
const bogus={intencion:'cotizar',zona_entrega:'La Plata',dudas:[],
 articulos:[{evidencia:evidence,descripcion:evidence,cantidad:'99',
  unidad:'unit',rubro:'obra_gruesa',presentacion:null,
  aclaracion:null,citaCantidad:'noventa y nueve pedidos',
  citaProducto:'Cemento blanco',citaPresentacion:null}]
};

test('D013 diagnosis no serializa nombre, teléfono, material, cita o número real',()=>{
 const result=resumirCantidadPrivadaD013(full,{
  inicio:start,fin:start+evidence.length,evidencia:evidence,
  citaCantidad:bogus.articulos[0].citaCantidad,cantidad:'99'
 },0);
 assert.ok(result);
 assert.equal(result.indiceArticulo,0);
 assert.equal(result.indiceLinea,1);
 assert.equal(result.citaTipo,'texto_ilegible');
 const serial=JSON.stringify(result);
 for(const privateValue of ['Florencia','Pérez','1133445566',
  'Cemento','confidencial','noventa','99','La Plata'])
  assert.ok(!serial.includes(privateValue),privateValue);
 assert.ok(result.estructuraTramo.every(s=>s==='palabra_oculta'));
 assert.equal(resumirCantidadPrivadaD013(full,{
  inicio:start+1,fin:start+evidence.length,evidencia:evidence,
  citaCantidad:'99',cantidad:'99'
 },0),null);
});

test('D013 diagnóstico opcional no agrega lector de cantidad en flujo comercial',async()=>{
 let called=0;
 const result=await diagnosticarLecturaPrivadaD013({
  fuente:full,apiKey:fakeApiKey,model:'gpt-6-luna',
  fetchImpl:async(_url,init)=>{
   called++;
   assert.equal(JSON.parse(init.body).store,false);
   assert.deepEqual(JSON.parse(init.body).tools,[]);
   return mockResponse(bogus);
  }
 });
 assert.equal(called,1);
 assert.equal(result.estado,'sin_fallo_cantidad');
 assert.equal(result.detalle,null);
 assert.ok(!JSON.stringify(result).includes('Cemento'));
 assert.ok(!JSON.stringify(result).includes('Florencia'));
 assert.ok(!JSON.stringify(result).includes('1133445566'));
});

test('D013 no declara bloqueo numérico si fuente acreditó el número',async()=>{
 const e='12 placas de yeso de 12,5 mm';
 let reads=0;
 const r=await diagnosticarLecturaPrivadaD013({
  fuente:'Pedido: '+e+'. Entrega en La Plata',
  apiKey:fakeApiKey,model:'gpt-6-luna',
  fetchImpl:async()=>{
   reads++;
   return mockResponse({...bogus,articulos:[{
    ...bogus.articulos[0],evidencia:e,descripcion:e,
    cantidad:'12',unidad:'unit',citaCantidad:'12',
    citaProducto:'placas de yeso',citaPresentacion:'12,5 mm',
    presentacion:'12,5 mm'
   }]});
  }
 });
 assert.equal(reads,1);
 assert.equal(r.estado,'sin_fallo_cantidad');
 assert.equal(r.detalle,null);
});

test('D013 diagnose exige release autorizada y no invoca recuperador',async()=>{
 let recovered=0,diagnosed=0;
 const args={enabled:true,recover:async()=>{recovered++;
  return {estado:'staged_no_send',requestId:null,outboundSent:false}},
  diagnose:async()=>{diagnosed++;return {estado:'diagnostico_seguro',
   outboundSent:false,diagnostico:{estado:'cantidad_inacreditable',
    detalle:{indiceArticulo:0,indiceLinea:1,posicionTramo:'inicio_linea',
     prefijoLinea:'vacio',sufijoLinea:'vacio',citaTipo:'texto_ilegible',
     citaDentroTramo:false,numeroModeloTipo:'entero',
     estructuraTramo:['numero_entero','palabra_oculta'],truncado:false,
     rawSource:'NO DEBE SALIR',buyerPhone:'NO DEBE SALIR'},
    privateKey:'NO DEBE SALIR'}}}
 };
 const forbidden=await ejecutarRecuperacionVaultD013(
  request('diagnose'),args);
 assert.equal(forbidden.status,403);
 assert.equal(recovered,0);
 assert.equal(diagnosed,0);
 const approved=await ejecutarRecuperacionVaultD013(
  request('diagnose',SQL_D013_APPROVED_COMMIT),args);
 assert.equal(approved.status,200);
 assert.equal(recovered,0);
 assert.equal(diagnosed,1);
 const body=await approved.text();
 assert.ok(body.includes('diagnosis_verified'));
 assert.ok(!body.includes('NO DEBE SALIR'));
 assert.ok(!body.includes('rawSource'));
 assert.equal(JSON.parse(body).diagnosis.detalle.indiceLinea,1);
 assert.equal(approved.headers.get('cache-control'),'no-store');
});

test('D013 rechaza diagnósticos con estructura no permitida',async()=>{
 const r=await ejecutarRecuperacionVaultD013(
  request('diagnose',SQL_D013_APPROVED_COMMIT),{
   enabled:true,recover:async()=>{throw Error('no ejecutar');},
   diagnose:async()=>({estado:'diagnostico_seguro',
    outboundSent:false,diagnostico:{estado:'cantidad_inacreditable',
     detalle:{indiceArticulo:0,indiceLinea:0,posicionTramo:'inicio_linea',
      prefijoLinea:'vacio',sufijoLinea:'vacio',citaTipo:'vacia',
      citaDentroTramo:false,numeroModeloTipo:'entero',
      estructuraTramo:['telefono_privado'],truncado:false}}})
  });
 assert.equal(r.status,503);
 assert.equal((await r.json()).state,'invalid_diagnosis');
});
