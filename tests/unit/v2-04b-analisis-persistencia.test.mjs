import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {analizarOriginalPorPedidoV2} from '../../src/server/v2-04b-analisis-automatica-http.ts';
import {proyectarRespuestasV2} from '../../src/server/v2-03-catalogo-respondedores.ts';
import {obtenerTextoVerificadoV2} from '../../src/server/v2-04b-texto-original-verificado.ts';
const rid='aaaaaaaa-1111-4111-8111-111111111111';
const did='bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb';
const uid='11111111-1111-4111-8111-111111111111';
const sid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const hmac='d'.repeat(64);
const text='Presupuesto de obra: 100 bolsas de cemento Portland 50 kg, '+
 'con precio indicado de $1000 por bolsa. Pago por transferencia bancaria.';
const bytes=new TextEncoder().encode(text);
const originalSha=createHash('sha256').update(bytes).digest('hex');
const env={
 COTIRONDA_PILOT_V2_RESPONDERS_ENABLED:'true',
 COTIRONDA_PILOT_V2_ANALYSIS_ENABLED:'true',
 COTIRONDA_PILOT_V2_RESPONDERS_RELEASE_SHA:'f'.repeat(40),
 VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_SHA:'f'.repeat(40),
 COTIRONDA_REGISTRATION_ENABLED:'false',
 COTIRONDA_PILOT_SUPABASE_URL:'https://ilggkalaafhtiysyzlmg.supabase.co',
 COTIRONDA_PILOT_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fake_no_access',
 COTIRONDA_PILOT_SUPABASE_SECRET_KEY:'sb_secret_fake_no_access',
 COTIRONDA_PILOT_OPENAI_API_KEY:'sk-fake-test-only-abcdefghijklmnop'
};
const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
const token=enc({alg:'HS256',typ:'JWT'})+'.'+enc({
 iss:'https://ilggkalaafhtiysyzlmg.supabase.co/auth/v1',
 role:'authenticated',aud:'authenticated',sub:uid,session_id:sid,
 exp:Math.floor(Date.now()/1000)+3600
})+'.'+'x'.repeat(64);
const url='https://cotironda.test/api/piloto/v2/rondas/'+rid+
 '/originales/'+did+'/analizar';
const request=(auth=token,target=url)=>new Request(target,{
 method:'POST',headers:{Authorization:'Bearer '+auth}
});
const ticket={state:'analysis_claimed_v2',
 jobToken:'cccccccc-cccc-4ccc-accc-cccccccccccc',
 sourceSha256:originalSha};
const source={state:'authorized_original_v2',requestId:rid,
 documentId:did,sha256:originalSha,
 bucket:'cotironda-piloto-originals',path:'media/'+hmac,
 messageHmac:hmac,mime:'text/plain',byteCount:bytes.length};
function mocks(){
 const count={getUser:0,source:0,claim:0,read:0,analyze:0,finish:0};
 const state={ticket:{...ticket},source:{...source},raw:new Uint8Array(bytes),
  finish:true,allow:true};
 const ports={
  getUser:async()=>{count.getUser++;return state.allow?{
   id:uid,phone:'5491123456789',phone_confirmed_at:'2026-11-10',
   is_anonymous:false
  }:null},
  source:async q=>{count.source++;
   assert.deepEqual(q,{rondaId:rid,documentoId:did,usuarioId:uid,sessionId:sid});
   return state.source},
  claim:async q=>{count.claim++;return state.ticket},
  read:async(bucket,path)=>{count.read++;
   assert.equal(bucket,'cotironda-piloto-originals');
   assert.equal(path,'media/'+hmac);return state.raw},
  finish:async q=>{count.finish++;
   assert.equal(q.jobToken,ticket.jobToken);
   assert.equal(q.sourceSha256,originalSha);
   return state.finish},
  analyze:async ({fuente})=>{
   count.analyze++;
   assert.equal(fuente.fuente,text);
   assert.equal(fuente.sha256,originalSha);
   assert.equal(fuente.originalAutenticado,true);
   return {estado:'analisis_disponible',codigo:'evidencias_ajustadas_a_original',
    documentoId:did,sha256:originalSha,titulo:'Lo importante de este presupuesto',
    puntos:[{categoria:'material',evidencia:'100 bolsas de cemento Portland 50 kg',
     observacion:'El presupuesto indica cemento Portland en presentación de 50 kg.'},
    {categoria:'forma_pago',evidencia:'Pago por transferencia bancaria',
     observacion:'La transferencia bancaria figura como forma de pago.'}],
    advertencia:'El original prevalece.',
    originalPermaneceDisponible:true,whatsappEnviado:false}
  }
 };
 return {ports,count,state};
}
test('V2-04b: buyer Auth -> SHA original -> claim unico -> IA -> SQL',async()=>{
 const {ports,count}=mocks();
 const r=await analizarOriginalPorPedidoV2(request(),rid,did,ports,env);
 assert.equal(r.status,200);
 assert.deepEqual(await r.json(),{estado:'analisis_disponible'});
 assert.equal(count.getUser,3);
 assert.equal(count.source,2);assert.equal(count.claim,1);
 assert.equal(count.read,1);assert.equal(count.analyze,1);
 assert.equal(count.finish,1);
 assert.match(r.headers.get('cache-control'),/no-store/u);
});
test('V2-04b: feature OFF no llega a datos ni a IA',async()=>{
 const {ports,count}=mocks();
 const r=await analizarOriginalPorPedidoV2(request(),rid,did,ports,{
  ...env,COTIRONDA_PILOT_V2_ANALYSIS_ENABLED:'false'
 });
 assert.equal(r.status,503);assert.equal(count.getUser,0);
});
test('V2-04b: sin identidad/consentimiento o duplicate claim no gasta IA',async()=>{
 const {ports,count,state}=mocks();
 state.allow=false;
 assert.equal((await analizarOriginalPorPedidoV2(
  request(),rid,did,ports,env)).status,404);
 assert.equal(count.claim,0);
 state.allow=true;state.ticket=null;
 assert.equal((await analizarOriginalPorPedidoV2(
  request(),rid,did,ports,env)).status,202);
 assert.equal(count.analyze,0);
});
test('V2-04b: SHA binario alterado => review, nunca procesar texto inventado',async()=>{
 const {ports,count,state}=mocks();
 state.raw=new TextEncoder().encode(text.replace('$1000','$9999'));
 const r=await analizarOriginalPorPedidoV2(request(),rid,did,ports,env);
 assert.equal(r.status,202);assert.equal(count.analyze,0);
 assert.equal(count.finish,1);
});
test('V2-04b: consentimiento revocado durante lectura bloquea IA',async()=>{
 const {ports,count,state}=mocks();
 const previous=ports.read;
 const guarded={...ports,read:async(...args)=>{
  const data=await previous(...args);
  state.source=null;return data;
 }};
 const r=await analizarOriginalPorPedidoV2(request(),rid,did,guarded,env);
 assert.equal(r.status,404);assert.equal(count.analyze,0);
 assert.equal(count.finish,0);
});
test('V2-04b: suplantación del recurso y query no inicia trabajo',async()=>{
 const {ports,count}=mocks();
 const wrong=await analizarOriginalPorPedidoV2(
  request(token,url+'?auth=spoof'),rid,did,ports,env);
 assert.equal(wrong.status,400);assert.equal(count.claim,0);
 const noToken=await analizarOriginalPorPedidoV2(
  new Request(url,{method:'POST'}),rid,did,ports,env);
 assert.equal(noToken.status,401);
});
test('V2-04b: proyección lista muestra solo notas de responder real',()=>{
 const received=Date.now()-20_000;
 const entry={
  documentId:'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb',
  supplierName:'Corralon autorizado',mime:'application/pdf',
  kind:'document',receivedAt:received,
  analysis:{state:'ready',points:[{
   categoria:'material',evidencia:'cemento Portland 50 kg',
   observacion:'Presentación de cemento Portland indicada por proveedor.'
  },{
   categoria:'forma_pago',evidencia:'Pago mediante transferencia',
   observacion:'La forma de pago declarada es una transferencia.'
  }]}
 };
 const res=proyectarRespuestasV2({
  state:'authorized_responders_v2',buyerKey:'buyer_a',
  total:1,originals:[entry]
 });
 assert.equal(res?.respuestas.length,1);
 assert.equal(res?.respuestas[0].puntos.length,2);
 assert.equal(res?.respuestas[0].analisis,'Lo importante de este presupuesto');
 assert.equal('messageHmac' in res.respuestas[0],false);
});
test('V2-04b: proyección invalida nota privada, no cancela original',()=>{
 const v=proyectarRespuestasV2({
  state:'authorized_responders_v2',buyerKey:'buyer_a',
  total:1,originals:[{
   documentId:'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb',
   supplierName:'Corralon autorizado',mime:'application/pdf',
   kind:'document',receivedAt:Date.now(),
   analysis:{state:'ready',points:[{
    categoria:'material',evidencia:'Cemento Portland',
    observacion:'Contacto personal contacto@privado.example'
   },{
    categoria:'presentacion',evidencia:'Bolsa 50 kg',
    observacion:'Presentación indicada en la cotización.'
   }]}
  }]
 });
 assert.equal(v?.respuestas.length,1);
 assert.equal(v?.respuestas[0].puntos.length,0);
});
test('V2-04b: extractor no inventa texto PDF o imagen ni altera archivo',async()=>{
 const txt=await obtenerTextoVerificadoV2({
  bytes,shaBinario:originalSha,mime:'text/plain'
 });
 assert.equal(txt?.fuente,text);
 assert.equal(txt?.shaTexto,originalSha);
 for(const mime of ['application/pdf','image/png',
 'application/vnd.ms-excel']){
  const result=await obtenerTextoVerificadoV2({bytes,
   shaBinario:originalSha,mime});
  assert.equal(result,null);
 }
 const bad=await obtenerTextoVerificadoV2({bytes,
  shaBinario:'0'.repeat(64),mime:'text/plain'});
 assert.equal(bad,null);
});
