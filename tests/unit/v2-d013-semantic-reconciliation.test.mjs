import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {interpretarConIaCentralV2D013} from '../../src/domain/ia-central/cliente-openai-v2-d013.ts';
import {evaluarLecturasSemanticasV2D013} from '../../src/domain/ia-central/contrato-v2-d013.ts';

const original='Hola! Buen día, cómo va? Necesito que me coticen unas cositas para una obra en La Plata.\n\n'+
 'Serían 10 bolsas de cemento de 25 kilos, un bolsón de arena fina, '+
 '3 baldes de albañil de 10 litros y también 2 rollos de membrana aluminizada de 4 mm.\n\n'+
 'Cuando tengan precios me avisan. Gracias!';
const fragments=['10 bolsas de cemento de 25 kilos','un bolsón de arena fina',
 '3 baldes de albañil de 10 litros','2 rollos de membrana aluminizada de 4 mm'];
const first={intencion:'cotizar',zona_entrega:'La Plata',dudas:[],
 articulos:fragments.map((evidencia,i)=>({
  evidencia,inicio:original.indexOf(evidencia),fin:original.indexOf(evidencia)+evidencia.length,
  descripcion:['cemento 25 kg','arena fina en bolsón','balde albañil 10 L','membrana 4 mm'][i],
  cantidad:['10','1','3','2'][i],unidad:['bag','unit','unit','roll'][i],
  rubro:i===3?'pintura':'obra_gruesa',presentacion:['25 kg',null,'10 L','4 mm'][i],aclaracion:null,
  citaCantidad:['10','un','3','2'][i],
  citaProducto:['cemento','arena fina','baldes de albañil','membrana aluminizada'][i],
  citaPresentacion:['25 kilos',null,'10 litros','4 mm'][i]
 }))};
const second={integridad:'completa',zona_entrega:' LA plata ',articulos:[
 {evidencia:'rollos de membrana aluminizada de 4 mm',cantidad:'2',unidad:'unidades',rubro:'obra_gruesa',citaCantidad:'2'},
 {evidencia:'baldes de albañil de 10 litros',cantidad:'3',unidad:'baldes',rubro:'ferreteria',citaCantidad:'3'},
 {evidencia:'arena fina',cantidad:'1',unidad:'bolson',rubro:'obra_gruesa',citaCantidad:'un'},
 {evidencia:'cemento de 25 kilos',cantidad:'10',unidad:'bolsas',rubro:'obra_gruesa',citaCantidad:'10'}
]};
function fake(...data){return async(_url,req)=>{
 const body=JSON.parse(req.body);
 assert.equal(body.store,false);assert.deepEqual(body.tools,[]);
 return new Response(JSON.stringify({status:'completed',output:[{
  type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(data.shift())}]
 }]}),{status:200});
}}
test('D013: mensaje natural acepta 4 ítems con envases, rubros y orden diferentes',async()=>{
 const out=await interpretarConIaCentralV2D013({fuente:original,apiKey:'sk-'+'a'.repeat(24),
  model:'gpt-6-luna',fetchImpl:fake(first,second)});
 assert.equal(out.estado,'listo_para_preparar',out.motivo);
 assert.deepEqual(out.pedido.articulos.map(x=>x.cantidad),['10','1','3','2']);
 assert.equal(out.pedido.articulos[0].presentacion,'25 kg');
});
test('D013: no transformar los 25 kg de presentación en 25 bolsas',()=>{
 const changed=structuredClone(second);changed.articulos[3].cantidad='25';
 assert.equal(evaluarLecturasSemanticasV2D013(original,first,changed).estado,'requiere_aclaracion');
});
test('D013: no confundir envases con magnitudes ni cruzar citas',()=>{
 for(const unidad of ['kg','m3','l','m2']){
  const changed=structuredClone(second);changed.articulos[0].unidad=unidad;
  assert.equal(evaluarLecturasSemanticasV2D013(original,first,changed).estado,
   'requiere_aclaracion',unidad);
 }
 for(const evidence of ['cemento inventado','arena fina']){
  const changed=structuredClone(second);changed.articulos[3].evidencia=evidence;
  assert.equal(evaluarLecturasSemanticasV2D013(original,first,changed).estado,
   'requiere_aclaracion',evidence);
 }
});
test('D013: dos citas iguales usadas para artículos distintos son ambiguas',()=>{
 const source='10 bolsas cemento CPC y 20 bolsas cemento CPC. Entrega La Plata.';
 const es=['10 bolsas cemento CPC','20 bolsas cemento CPC'];
 const a={...first,articulos:es.map((evidencia,i)=>({...first.articulos[0],
  evidencia,inicio:source.indexOf(evidencia),fin:source.indexOf(evidencia)+evidencia.length,
  cantidad:i?'20':'10',citaCantidad:i?'20':'10',
  presentacion:null,citaPresentacion:null}))};
 const b={...second,articulos:[
  {evidencia:'cemento CPC',cantidad:'10',unidad:'bag',rubro:'obra_gruesa',citaCantidad:'10'},
  {evidencia:'cemento CPC',cantidad:'20',unidad:'bag',rubro:'obra_gruesa',citaCantidad:'20'}
 ]};
 assert.equal(evaluarLecturasSemanticasV2D013(source,a,b).estado,'requiere_aclaracion');
});
test('D013: se conecta solo al planner V2, no altera el lector histórico',()=>{
 const planner=readFileSync(new URL('../../src/domain/ia-central/planificador-piloto-v2-d013.ts',
  import.meta.url),'utf8');
 assert.match(planner,/cliente-openai-v2-d013/u);
 assert.doesNotMatch(planner,/cliente-openai-v1\.ts/u);
});
