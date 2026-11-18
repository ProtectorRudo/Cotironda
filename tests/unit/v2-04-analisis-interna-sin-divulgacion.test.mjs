import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {analizarOriginalTextoConIAV2} from '../../src/server/v2-04-analisis-individual.ts';

const doc='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const source='10 bolsas de cemento CPC de 50 kg\n1 bolsón de arena fina de 1 m³\n1 bolsón de piedra partida de 1 m³\nEl presupuesto original no establece plazos adicionales.';
const sha=createHash('sha256').update(source,'utf8').digest('hex');
const evidence=[
 {categoria:'material',evidencia:'10 bolsas de cemento CPC de 50 kg',
  observacion:'El proveedor indica 10 bolsas de cemento CPC de 50 kg.'},
 {categoria:'presentacion',evidencia:'1 bolsón de arena fina de 1 m³',
  observacion:'La arena fina se ofrece en 1 bolsón de 1 m³.'}
];
const internal={
 documentoId:doc,sha256:sha,tipo:'texto_extraido_de_original',
 originalAutenticado:true,proveedorAutenticado:true,
 consentimientoOriginalVerificado:false,compradorAutorizado:false,
 procesamientoInternoPrivado:true,fuente:source
};
const apiKey='sk-'+'Z'.repeat(25);
function mock(points){
 let count=0;
 return {get count(){return count},
  send:async(url,init)=>{
   count++;
   assert.equal(url,'https://api.openai.com/v1/responses');
   assert.equal(init.method,'POST');
   const payload=JSON.parse(init.body);
   assert.equal(payload.model,'gpt-6-luna');
   assert.equal(payload.store,false);
   assert.deepEqual(payload.tools,[]);
   assert.ok(payload.input[1].content[0].text.includes(source));
   return new Response(JSON.stringify({status:'completed',output:[
    {type:'message',role:'assistant',content:[
     {type:'output_text',text:JSON.stringify({puntos:points})}
    ]}
   ]}),{status:200});
  }
 };
}
test('preanálisis interno autenticado funciona sin fingir autorización de exhibir original',async()=>{
 const m=mock(evidence);
 const out=await analizarOriginalTextoConIAV2({
  fuente:internal,apiKey,model:'gpt-6-luna',fetchImpl:m.send
 });
 assert.equal(out.estado,'analisis_disponible');
 assert.equal(out.puntos.length,2);
 assert.equal(m.count,1);
 assert.equal(out.whatsappEnviado,false);
});
test('sin consentimiento NI modo interno, la IA no lee el archivo',async()=>{
 const m=mock(evidence);
 const out=await analizarOriginalTextoConIAV2({
  fuente:{...internal,procesamientoInternoPrivado:undefined},
  apiKey,model:'gpt-6-luna',fetchImpl:m.send
 });
 assert.equal(out.estado,'analisis_pendiente');
 assert.equal(m.count,0);
});
test('observación con cantidades no demostradas se rechaza incluso en modo interno',async()=>{
 const m=mock([{...evidence[0],observacion:'El proveedor indica 1000 bolsas de cemento CPC de 50 kg.'},evidence[1]]);
 const out=await analizarOriginalTextoConIAV2({
  fuente:internal,apiKey,model:'gpt-6-luna',fetchImpl:m.send
 });
 assert.equal(out.estado,'analisis_pendiente');
 assert.equal(out.codigo,'evidencias_ia_no_comprobadas');
});


test('V2 genera seis hallazgos en una sola llamada sin exigir segunda interpretación',async()=>{
 const six=[
  {...evidence[0]},
  {...evidence[1]},
  {categoria:'cobertura',evidencia:'10 bolsas de cemento CPC de 50 kg',
   observacion:'El documento menciona bolsas de cemento CPC.'},
  {categoria:'aclaracion',evidencia:'1 bolsón de piedra partida de 1 m³',
   observacion:'La piedra partida aparece como un artículo del presupuesto.'},
  {categoria:'plazo',evidencia:'El presupuesto original no establece plazos adicionales.',
   observacion:'El documento señala que no establece plazos adicionales.'},
  {categoria:'material',evidencia:'1 bolsón de arena fina de 1 m³',
   observacion:'Se identifica una presentación de arena fina.'}
 ];
 const m=mock(six);
 const out=await analizarOriginalTextoConIAV2({
  fuente:internal,apiKey,model:'gpt-6-luna',fetchImpl:m.send
 });
 assert.equal(m.count,1);
 assert.equal(out.estado,'analisis_disponible');
 assert.equal(out.puntos.length,6);
});
test('V2 limita a ocho las observaciones verificadas aunque la IA devuelva nueve',async()=>{
 const over=Array.from({length:9},(_,i)=>({
  categoria:i%2?'material':'presentacion',
  evidencia:'10 bolsas de cemento CPC de 50 kg',
  observacion:'El presupuesto informa cemento CPC en bolsas.'
 }));
 const m=mock(over);
 const out=await analizarOriginalTextoConIAV2({
  fuente:internal,apiKey,model:'gpt-6-luna',fetchImpl:m.send
 });
 assert.equal(out.estado,'analisis_disponible');
 assert.equal(out.puntos.length,8);
 assert.equal(out.codigo,'evidencias_parciales_comprobadas');
 assert.equal(m.count,1);
});
test('conserva dos hallazgos verificables y descarta un precio inventado, sin segunda llamada',async()=>{
 const m=mock([
  evidence[0],
  {categoria:'precio',evidencia:'10 bolsas de cemento CPC de 50 kg',
   observacion:'El total informado de la oferta es $500.000.'},
  evidence[1]
 ]);
 const out=await analizarOriginalTextoConIAV2({
  fuente:internal,apiKey,model:'gpt-6-luna',fetchImpl:m.send
 });
 assert.equal(m.count,1);
 assert.equal(out.estado,'analisis_disponible');
 assert.equal(out.codigo,'evidencias_parciales_comprobadas');
 assert.equal(out.puntos.length,2);
 assert.ok(out.puntos.every(p=>!p.observacion.includes('500.000')));
 assert.equal(out.originalPermaneceDisponible,true);
 assert.equal(out.whatsappEnviado,false);
});
test('omite citas inexistentes, categorías inválidas, duplicados y datos personales sin contaminar la ficha',async()=>{
 const m=mock([
  evidence[0],
  {categoria:'material',evidencia:'material que no está en el texto',
   observacion:'Se mencionan materiales que no constan en el original.'},
  {categoria:'inexistente',evidencia:'1 bolsón de arena fina de 1 m³',
   observacion:'La arena es fina según el texto.'},
  {categoria:'precio',evidencia:'1 bolsón de arena fina de 1 m³',
   observacion:'Contactar al proveedor a ventas@ejemplo.com para confirmar.'},
  {...evidence[0]},
  evidence[1]
 ]);
 const out=await analizarOriginalTextoConIAV2({
  fuente:internal,apiKey,model:'gpt-6-luna',fetchImpl:m.send
 });
 assert.equal(m.count,1);
 assert.equal(out.estado,'analisis_disponible');
 assert.equal(out.puntos.length,2);
 assert.equal(out.codigo,'evidencias_parciales_comprobadas');
 assert.ok(out.puntos.every(p=>!p.observacion.includes('@')));
});
test('con menos de dos observaciones comprobables el análisis sigue pendiente, sin inventar relleno',async()=>{
 const m=mock([
  evidence[0],
  {categoria:'iva',evidencia:'1 bolsón de arena fina de 1 m³',
   observacion:'El IVA figura incluido en el presupuesto.'}
 ]);
 const out=await analizarOriginalTextoConIAV2({
  fuente:internal,apiKey,model:'gpt-6-luna',fetchImpl:m.send
 });
 assert.equal(m.count,1);
 assert.equal(out.estado,'analisis_pendiente');
 assert.equal(out.codigo,'evidencias_ia_no_comprobadas');
 assert.equal(out.puntos.length,0);
});
