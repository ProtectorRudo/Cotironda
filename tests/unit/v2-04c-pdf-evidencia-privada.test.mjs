import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {resolverPdfPrivadoV2} from '../../supabase/functions/cotironda-piloto-v2-pdf-reader/pdf-core.ts';
import {leerPdfOriginalPorEdgeV2} from '../../src/server/v2-04c-pdf-edge-client.ts';
import {obtenerTextoVerificadoV2} from '../../src/server/v2-04b-texto-original-verificado.ts';
import {analizarOriginalPorPedidoV2} from '../../src/server/v2-04b-analisis-automatica-http.ts';
const key='A'.repeat(48);
const data=new TextEncoder().encode('%PDF-1.4\n'+'synthetic-for-auth-only\n'.repeat(15));
const text='PRESUPUESTO: 100 bolsas de cemento Portland 50 kg a $9500. '+
 'Pago por transferencia bancaria anticipada. Se indica entrega en La Plata.';
const hash=x=>createHash('sha256').update(x).digest('hex');
const sha=hash(data);
const shaText=hash(text);
const uri='https://ilggkalaafhtiysyzlmg.supabase.co/functions/v1/cotironda-piloto-v2-pdf-reader';
const env={COTIRONDA_PILOT_SUPABASE_URL:'https://ilggkalaafhtiysyzlmg.supabase.co',
 COTIRONDA_PILOT_V2_PDF_ENABLED:'true',
 COTIRONDA_PILOT_V2_PDF_SHARED_SECRET:key};
const fakeReader=async()=>({pages:1,scanned:false,rows:[{page:1,text}]});
const req=(token=key,body=data,srcSha=hash(body))=>new Request(uri,{
 method:'POST',headers:{authorization:'Bearer '+token,
 'content-type':'application/pdf','x-original-sha256':srcSha},
 body:new Blob([Uint8Array.from(body)])
});
test('PDF Edge: exige secreto server-only antes de procesar bytes',async()=>{
 let read=0;
 const handler=async()=>{read++;return fakeReader()};
 const no=await resolverPdfPrivadoV2(req('wrong-key'),key,handler);
 assert.equal(no.status,404);
 assert.equal(read,0);
 const off=await resolverPdfPrivadoV2(req(),'',handler);
 assert.equal(off.status,503);
 assert.equal(read,0);
});
test('PDF Edge: verifica SHA original, limita formatos y extrae evidencia con SHA propio',async()=>{
 const good=await resolverPdfPrivadoV2(req(),key,fakeReader);
 assert.equal(good.status,200);
 const response=await good.json();
 assert.equal(response.state,'verified_pdf_text_v2');
 assert.equal(response.sourceSha256,sha);
 assert.equal(response.textSha256,shaText);
 assert.equal(response.text,text);
 assert.equal(good.headers.get('cache-control').includes('no-store'),true);
 const wrong=await resolverPdfPrivadoV2(req(key,data,'0'.repeat(64)),key,fakeReader);
 assert.equal(wrong.status,422);
});
test('PDF Edge: escaneado y más de 12 páginas no se aprueban',async()=>{
 for(const fake of [
  {pages:1,scanned:true,rows:[]},
  {pages:13,scanned:false,rows:[{page:1,text}]},
  {pages:2,scanned:false,rows:[{page:3,text}]},
  {pages:1,scanned:false,rows:[]}
 ]){
  assert.equal((await resolverPdfPrivadoV2(req(),key,async()=>fake)).status,422);
 }
});
test('PDF cliente: solo URL fija y bytes auténticos, sin navegador ni URLs del usuario',async()=>{
 let count=0;
 const fetcher=async (url,init)=>{
  count++;
  assert.equal(url,uri);
  assert.equal(init.credentials,'omit');
  assert.equal(init.redirect,'error');
  assert.equal(init.headers.Authorization,'Bearer '+key);
  assert.equal(init.headers['X-Original-SHA256'],sha);
  return resolverPdfPrivadoV2(new Request(url,init),key,fakeReader);
 };
 const res=await leerPdfOriginalPorEdgeV2(data,sha,env,fetcher);
 assert.equal(res?.text,text);
 assert.equal(res?.sourceSha256,sha);
 assert.equal(res?.textSha256,shaText);
 assert.equal(count,1);
 assert.equal(await leerPdfOriginalPorEdgeV2(data,'0'.repeat(64),env,fetcher),null);
 assert.equal(await leerPdfOriginalPorEdgeV2(data,sha,{
  ...env,COTIRONDA_PILOT_V2_PDF_ENABLED:'false'
 },fetcher),null);
 assert.equal(count,1);
});
test('PDF cliente: no acepta texto falso devuelto por lector comprometido',async()=>{
 const bad=async()=>new Response(JSON.stringify({
  state:'verified_pdf_text_v2',sourceSha256:sha,
  textSha256:shaText,text:text+' Total inventado $99.999',pages:1
 }),{status:200,headers:{'content-type':'application/json'}});
 assert.equal(await leerPdfOriginalPorEdgeV2(data,sha,env,bad),null);
});
test('PDF textual: copia completa de citas y hash separado; falla sin lector',async()=>{
 const yes=await obtenerTextoVerificadoV2({
  bytes:data,shaBinario:sha,mime:'application/pdf',
  pdfReader:async()=>({text,sourceSha256:sha,textSha256:shaText})
 });
 assert.equal(yes?.fuente,text);
 assert.equal(yes?.shaTexto,shaText);
 assert.equal(yes?.shaBinario,sha);
 const no=await obtenerTextoVerificadoV2({
  bytes:data,shaBinario:sha,mime:'application/pdf'
 });
 assert.equal(no,null);
});
test('PDF circuito: Auth/claim/bytes de Storage/Edge/IA/finish con original verificado',async()=>{
 const rid='aaaaaaaa-1111-4111-8111-111111111111';
 const did='bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb';
 const uid='11111111-1111-4111-8111-111111111111';
 const sid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 const enc=obj=>Buffer.from(JSON.stringify(obj)).toString('base64url');
 const jwt=enc({alg:'HS256',typ:'JWT'})+'.'+enc({
  iss:'https://ilggkalaafhtiysyzlmg.supabase.co/auth/v1',
  role:'authenticated',aud:'authenticated',
  sub:uid,session_id:sid,exp:Math.floor(Date.now()/1000)+3600
 })+'.'+'x'.repeat(64);
 const request=new Request('https://cotironda.test/api/piloto/v2/rondas/'+rid+
  '/originales/'+did+'/analizar',{method:'POST',
  headers:{Authorization:'Bearer '+jwt}});
 const settings={
  ...env,COTIRONDA_PILOT_V2_ANALYSIS_ENABLED:'true',
  COTIRONDA_PILOT_V2_RESPONDERS_ENABLED:'true',
  COTIRONDA_PILOT_V2_RESPONDERS_RELEASE_SHA:'f'.repeat(40),
  VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_SHA:'f'.repeat(40),
  COTIRONDA_REGISTRATION_ENABLED:'false',
  COTIRONDA_PILOT_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fake',
  COTIRONDA_PILOT_SUPABASE_SECRET_KEY:'sb_secret_fake'
 };
 let calls=0,finished=0;
 const ports={
  getUser:async()=>({id:uid,phone:'5491123456789',
   phone_confirmed_at:'2026-11-11',is_anonymous:false}),
  source:async()=>({state:'authorized_original_v2',requestId:rid,
   documentId:did,sha256:sha,bucket:'cotironda-piloto-originals',
   messageHmac:'d'.repeat(64),path:'media/'+'d'.repeat(64),
   mime:'application/pdf',byteCount:data.length}),
  claim:async()=>({state:'analysis_claimed_v2',sourceSha256:sha,
   jobToken:'cccccccc-cccc-4ccc-accc-cccccccccccc'}),
  read:async()=>data,
  readPdf:async()=>{calls++;return {text,sourceSha256:sha,textSha256:shaText}},
  analyze:async ({fuente})=>{
   assert.equal(fuente.fuente,text);assert.equal(fuente.sha256,shaText);
   return {estado:'analisis_disponible',codigo:'cita_literal',
    documentoId:did,sha256:shaText,titulo:'Lo importante',
    puntos:[{categoria:'presentacion',evidencia:'cemento Portland 50 kg',
     observacion:'Presentación explícita en el presupuesto.'},
    {categoria:'forma_pago',evidencia:'transferencia bancaria anticipada',
     observacion:'Forma de pago descrita en el presupuesto.'}],
    advertencia:'Original prevalece',originalPermaneceDisponible:true,
    whatsappEnviado:false}
  },
  finish:async q=>{
   finished++;
   assert.equal(q.sourceSha256,sha);
   assert.equal(q.textSha256,shaText);
   assert.equal(q.status,'ready');
   return true
  }
 };
 const res=await analizarOriginalPorPedidoV2(request,rid,did,ports,settings);
 assert.equal(res.status,200);
 assert.equal(calls,1);
 assert.equal(finished,1);
});
