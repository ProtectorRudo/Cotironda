import test from 'node:test';
import assert from 'node:assert/strict';
import {interpretarConIaCentralV1} from
 '../../src/domain/ia-central/cliente-openai-v1.ts';
import {localizarEvidenciasV1} from
 '../../src/domain/ia-central/contrato-v1.ts';

const source='necesito 20 bols cem cpc 50k, 3 bigbegs arna y 2 bolsones piedra. Entrega en LP.';
const evidence=['20 bols cem cpc 50k','3 bigbegs arna','2 bolsones piedra'];
const lines=evidence.map((snippet,i)=>({
 evidencia:snippet,descripcion:['Cemento CPC 50 kg','Arena embolsada','Piedra embolsada'][i],
 cantidad:['20','3','2'][i],unidad:['bag','m3','m3'][i],
 rubro:'obra_gruesa',presentacion:i===0?'bolsa 50 kg':'bolsón 1 m³',
 aclaracion:null
}));
const first={intencion:'cotizar',zona_entrega:'La Plata',articulos:lines,dudas:[]};
const second={integridad:'completa',zona_entrega:'La Plata',
 articulos:lines.map(x=>({evidencia:x.evidencia,cantidad:x.cantidad,
 unidad:x.unidad,rubro:x.rubro}))};
function responses(...payloads){
 const calls=[];
 const fn=async(url,req)=>{
  assert.equal(url,'https://api.openai.com/v1/responses');
  const body=JSON.parse(req.body);
  assert.equal(body.store,false);
  assert.deepEqual(body.tools,[]);
  assert.equal(body.model,'gpt-6-luna');
  assert.equal(body.text.format.type,'json_schema');
  calls.push(body);
  return new Response(JSON.stringify({status:'completed',output:[{
   type:'message',role:'assistant',content:[{
    type:'output_text',text:JSON.stringify(payloads.shift())
   }]
  }]}),{status:200,headers:{'content-type':'application/json'}});
 };
 return {fn,calls};
}
test('IA Central: dos lecturas interpretan typos sin un diccionario local',async()=>{
 const {fn,calls}=responses(first,second);
 const result=await interpretarConIaCentralV1({fuente:source,
  apiKey:'sk-'+'a'.repeat(24),model:'gpt-6-luna',fetchImpl:fn});
 assert.equal(result.estado,'listo_para_preparar');
 assert.equal(result.pedido.articulos.length,3);
 assert.equal(calls.length,2);
 assert.ok(calls[0].input[0].content[0].text.includes('errores de ortografía'));
 assert.notEqual(calls[0].text.format.name,calls[1].text.format.name);
});
test('IA Central: modelo no proporciona índices, los calcula el servidor',()=>{
 const located=localizarEvidenciasV1(source,first);
 assert.equal(located.articulos.length,3);
 assert.equal(located.articulos[0].inicio,source.indexOf(evidence[0]));
 assert.equal(located.articulos[1].fin,
  located.articulos[1].inicio+evidence[1].length);
});
test('IA Central: segunda lectura de cantidad distinta NO prepara ronda',async()=>{
 const changed=structuredClone(second);changed.articulos[1].cantidad='30';
 const {fn}=responses(first,changed);
 const result=await interpretarConIaCentralV1({fuente:source,
  apiKey:'sk-'+'a'.repeat(24),model:'gpt-6-luna',fetchImpl:fn});
 assert.equal(result.estado,'requiere_aclaracion');
});
test('IA Central: evidencia del modelo que no aparece en fuente bloquea sin gastar segunda llamada',async()=>{
 const fake=structuredClone(first);
 fake.articulos[0].evidencia='20 toneladas de cemento';
 const {fn,calls}=responses(fake);
 const result=await interpretarConIaCentralV1({fuente:source,
  apiKey:'sk-'+'a'.repeat(24),model:'gpt-6-luna',fetchImpl:fn});
 assert.equal(result.estado,'rechazado');
 assert.equal(calls.length,1);
});
test('IA Central: saludo no requiere segunda interpretación ni crea ronda',async()=>{
 const {fn,calls}=responses({intencion:'saludo',zona_entrega:null,
  articulos:[],dudas:[]});
 const result=await interpretarConIaCentralV1({fuente:'Hola!',
  apiKey:'sk-'+'a'.repeat(24),model:'gpt-6-luna',fetchImpl:fn});
 assert.equal(result.estado,'no_es_pedido');
 assert.equal(calls.length,1);
});
test('IA Central: error HTTP o API Key mala sin acciones externas',async()=>{
 let calls=0;
 const transport=async()=>{
  calls++;return new Response('{}',{status:429});
 };
 const result=await interpretarConIaCentralV1({fuente:source,
  apiKey:'sk-'+'a'.repeat(24),model:'gpt-6-luna',fetchImpl:transport});
 assert.equal(result.estado,'rechazado');assert.equal(calls,1);
 const missing=await interpretarConIaCentralV1({fuente:source,
  apiKey:'',model:'gpt-6-luna',fetchImpl:transport});
 assert.equal(missing.estado,'rechazado');assert.equal(calls,1);
});

test('IA Central: WhatsApp natural, cemento de 25 kg, baldes y rollos',async()=>{
 const text='Hola! Buen día, cómo va? Necesito que me coticen unas cositas para una obra en La Plata.\n\n'+
  'Serían 10 bolsas de cemento de 25 kilos, un bolsón de arena fina, '+
  '3 baldes de albañil de 10 litros y también 2 rollos de membrana aluminizada de 4 mm.\n\n'+
  'Cuando tengan precios me avisan. Gracias!';
 const spans=['10 bolsas de cemento de 25 kilos','un bolsón de arena fina',
  '3 baldes de albañil de 10 litros','2 rollos de membrana aluminizada de 4 mm'];
 const base={intencion:'cotizar',zona_entrega:'La Plata',dudas:[],articulos:
  spans.map((evidencia,i)=>({
   evidencia,descripcion:['cemento 25 kg','arena fina en bolsón',
    'balde albañil 10 L','membrana aluminizada 4 mm'][i],
   cantidad:['10','1','3','2'][i],unidad:['bag','unit','unit','roll'][i],
   rubro:i===3?'pintura':'obra_gruesa',
   presentacion:['25 kg',null,'10 L','4 mm'][i],aclaracion:null
  }))};
 const verifier={integridad:'completa',zona_entrega:' LA plata ',articulos:[
  {evidencia:'rollos de membrana aluminizada de 4 mm',
   cantidad:'2',unidad:'unidades',rubro:'obra_gruesa'},
  {evidencia:'baldes de albañil de 10 litros',
   cantidad:'3',unidad:'baldes',rubro:'ferreteria'},
  {evidencia:'arena fina',cantidad:'1',unidad:'bolson',rubro:'obra_gruesa'},
  {evidencia:'cemento de 25 kilos',
   cantidad:'10',unidad:'bolsas',rubro:'obra_gruesa'}
 ]};
 const {fn}=responses(base,verifier);
 const result=await interpretarConIaCentralV1({fuente:text,
  apiKey:'sk-'+'a'.repeat(24),model:'gpt-6-luna',fetchImpl:fn});
 assert.equal(result.estado,'listo_para_preparar',result.motivo);
 assert.deepEqual(result.pedido.articulos.map(x=>x.cantidad),['10','1','3','2']);
 assert.equal(result.pedido.articulos[0].presentacion,'25 kg');
 assert.equal(result.pedido.articulos[3].presentacion,'4 mm');
});
test('IA Central: lector secundario no puede convertir 25 kg en 25 bolsas',async()=>{
 const text='Necesito 10 bolsas de cemento de 25 kg en La Plata';
 const span='10 bolsas de cemento de 25 kg';
 const base={intencion:'cotizar',zona_entrega:'La Plata',dudas:[],articulos:[{
  evidencia:span,descripcion:'cemento 25 kg',cantidad:'10',unidad:'bag',
  rubro:'obra_gruesa',presentacion:'25 kg',aclaracion:null
 }]};
 const second={integridad:'completa',zona_entrega:'La Plata',articulos:[{
  evidencia:'cemento de 25 kg',cantidad:'25',unidad:'bag',rubro:'obra_gruesa'
 }]};
 const {fn}=responses(base,second);
 const result=await interpretarConIaCentralV1({fuente:text,
  apiKey:'sk-'+'a'.repeat(24),model:'gpt-6-luna',fetchImpl:fn});
 assert.equal(result.estado,'requiere_aclaracion');
 assert.equal(result.motivo,'lecturas_discrepan_en_articulo');
});
