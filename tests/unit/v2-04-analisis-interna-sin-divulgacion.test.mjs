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
