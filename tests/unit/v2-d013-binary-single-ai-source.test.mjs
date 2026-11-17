import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {contrastarDocumentoCompradorV2UnicaD013}
 from '../../supabase/functions/cotironda-piloto-whapi/ai-central-buyer-source-v2-d013.ts';
import {prepararDocumentoBinarioV2D013}
 from '../../supabase/functions/cotironda-piloto-whapi/ai-central-buyer-binary-v2-d013.ts';
import {generarWebhookD016}
 from '../../scripts/piloto/v2-d016-whapi-overlay.mjs';

const content='application/pdf';
const srcRows=['Pedido de materiales','10 bolsas cemento 25 kg','Localidad: La Plata'];
const draft={
 status:'review_required',kind:'buyer_request',
 delivery_city:'La Plata',requested_delivery_note:null,total_declared:null,
 unanswered:[],
 lines:[{
  original_description:'cemento 25 kg',quantity:'10',unit:'bolsas',
  evidence_location:'página 1, fila 2',ambiguity:null,
  unit_price:null,line_total:null
 }]
};
async function original(){
 const bytes=new Uint8Array(256).fill(42);
 const digest=await crypto.subtle.digest('SHA-256',bytes);
 const sha256=Array.from(new Uint8Array(digest),x=>
  x.toString(16).padStart(2,'0')).join('');
 return {mime:content,sha256,bytes};
}
const reader=async(_bytes)=>({pages:1,scanned:false,
 rows:srcRows.map(text=>({page:1,text}))});
const config=async()=>({
 habilitado:true,original:await original(),primera:draft,lectorPdf:reader
});
test('V2 PDF: una sola lectura IA y evidencia PDF de bytes reales; no requiere otra IA',async()=>{
 const result=await contrastarDocumentoCompradorV2UnicaD013(await config());
 assert.equal(result.estado,'fuente_contrastada_privada',result.codigo);
 assert.equal(result.origenIndependiente,true);
 assert.equal(result.renglonesAcreditados,1);
 assert.equal(result.textoFuentePrivado,srcRows.join('\n'));
 assert.equal(result.sha256Original,(await original()).sha256);
 assert.equal(result.whatsappEnviado,false);
 assert.equal(result.rondaCreada,false);
});
test('V2 PDF: archivo cambiado no pasa validación antes de lector ni SQL',async()=>{
 const args=await config();let called=false;
 const result=await contrastarDocumentoCompradorV2UnicaD013({
  ...args,original:{...args.original,sha256:'a'.repeat(64)},
  lectorPdf:async()=>{called=true;return reader()}
 });
 assert.equal(result.estado,'requiere_revision');
 assert.equal(result.codigo,'original_sha256_mismatch');
 assert.equal(called,false);
});
test('V2 PDF: producto inventado, item omitido, ciudad inventada y precios no acreditados',async()=>{
 const args=await config();
 const wrong=await contrastarDocumentoCompradorV2UnicaD013({
  ...args,primera:{...draft,lines:[{...draft.lines[0],
   original_description:'tornillo no solicitado'}]}
 });
 assert.equal(wrong.codigo,'line_not_proven_on_original');
 const missing=await contrastarDocumentoCompradorV2UnicaD013({
  ...args,lectorPdf:async()=>({pages:1,scanned:false,
   rows:[...srcRows,{page:1,text:'4 unidades adicionales pintura'}].map(
    x=>typeof x==='string'?{page:1,text:x}:x)})
 });
 assert.equal(missing.codigo,'unclaimed_original_row');
 const city=await contrastarDocumentoCompradorV2UnicaD013({
  ...args,primera:{...draft,delivery_city:'Rosario'}
 });
 assert.equal(city.estado,'requiere_zona');
 assert.equal(city.codigo,'delivery_city_not_proven');
 const money=await contrastarDocumentoCompradorV2UnicaD013({
  ...args,primera:{...draft,lines:[{
   ...draft.lines[0],unit_price:'5000'
  }]}
 });
 assert.equal(money.estado,'requiere_revision');
 assert.equal(money.codigo,'single_draft_not_credible');
});
test('V2: documento escaneado o no verificable permanece privado sin ronda',async()=>{
 const args=await config();
 for(const proof of [
  {pages:1,scanned:true,rows:[]},
  {pages:1,scanned:false,rows:[]}
 ]){
  const res=await contrastarDocumentoCompradorV2UnicaD013({
   ...args,lectorPdf:async()=>proof
  });
  assert.equal(res.estado,'requiere_revision');
  assert.equal(res.whatsappEnviado,false);
 }
});
test('V2 wrapper: no suplanta segunda IA y no publica si está cerrado por D016',async()=>{
 const args=await config();
 let called=false;
 const res=await prepararDocumentoBinarioV2D013({
  enabled:true,autenticadoPorWebhook:true,compradorAutorizado:true,
  chatHmac:'a'.repeat(64),messageHmac:'b'.repeat(64),
  original:args.original,primera:draft,segunda:null,
  apiKey:'sk-'+'a'.repeat(24),model:'gpt-6-luna',
  rpc:async()=>{throw Error('no SQL allowed')},
  preparar:async bundle=>{
   called=true;
   assert.equal(bundle.segunda,null);
   const verified=await bundle.contrastar({
    habilitado:true,original:bundle.original,
    primera:bundle.primera,segunda:null,
    lectorPdf:reader
   });
   assert.equal(verified.codigo,'single_ai_independent_rows_verified');
   return {estado:'requiere_revision'};
  }
 });
 assert.equal(called,true);
 assert.equal(res.estado,'requiere_revision');
 assert.equal(res.whatsappEnviado,false);
});
test('V2 webhook offline: proveedor conserva segunda IA, comprador no tiene fallback V1',()=>{
 const legacy=readFileSync(new URL(
  '../../supabase/functions/cotironda-piloto-whapi/index.ts',import.meta.url),'utf8');
 const generated=generarWebhookD016(legacy);
 assert.ok(generated.length>100000);
 assert.match(generated,/Promise\.allSettled\(verifiedSupplier\?\[/u);
 assert.match(generated,/reasoningEffort:'high'/u);
 assert.match(generated,/const binaryWorker=prepararDocumentoBinarioV2D013/u);
 assert.doesNotMatch(generated,/const binaryWorker=d013BinaryEnabled\?/u);
 assert.match(generated,/enabled:d013BinaryEnabled/u);
 assert.match(generated,/proposeDocumentAI\(\{\.\.\.args,perspective:'corroboration'\}\)/u);
 assert.match(generated,/cotironda_piloto_ia_attest_binary_mvp278/u);
});
