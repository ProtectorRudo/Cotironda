import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {analizarOriginalWhatsAppD016}
 from '../../src/server/v2-d016-analisis-automatica.ts';
import {D016_SESSION_COOKIE,digestSesionPrivadaD016}
 from '../../src/server/v2-d016-sesion-privada.ts';
const ORIGIN='https://cotironda-portal-9sl89v1ho-protector-rudo-s-projects.vercel.app';
const ROUND='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DOC='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const COOKIE='f'.repeat(43),KEY='c'.repeat(64);
const RAW=new TextEncoder().encode(
 'Cemento 50 kg x 15 unidades. Precio de referencia $130000. '+
 'El proveedor no informó el IVA ni el flete para la zona de entrega.'
);
const SHA=createHash('sha256').update(RAW).digest('hex');
const gate=()=>({habilitada:true,entorno:'preview',
 proyectoUrl:'https://ilggkalaafhtiysyzlmg.supabase.co',
 shaDesplegado:'a'.repeat(40),shaAprobado:'a'.repeat(40),
 origenPortal:ORIGIN,claveHmacHex:KEY});
const conf=()=>({habilitado:true,apiKey:'sk-'+'x'.repeat(30),
 pdfHabilitado:false,pdfSecret:''});
const source=()=>({state:'authorized_text_v2',
 requestId:ROUND,documentId:DOC,buyerKey:'buyer_a',
 messageHmac:'1'.repeat(64),chatHmac:'2'.repeat(64),
 mime:'text/plain',sha256:SHA});
const request=(patch={})=>new Request(
 ORIGIN+'/api/piloto/v2/rondas/'+ROUND+'/analisis-whatsapp/'+DOC+
 (patch.query??''),{
  method:patch.method??'POST',
  headers:{origin:patch.origin??ORIGIN,
   'sec-fetch-site':patch.site??'same-origin',
   'cookie':patch.cookie===null?'':D016_SESSION_COOKIE+'='+
    (patch.cookie??COOKIE),
   ...(patch.contentType?{'content-type':patch.contentType}:{})}
 });
const ready=()=>({estado:'analisis_disponible',codigo:'verificado',
 documentoId:DOC,sha256:SHA,titulo:'Lo importante de este presupuesto',
 puntos:[
  {categoria:'material',evidencia:'Cemento 50 kg',
   observacion:'La presentación ofrecida es bolsa de 50 kg.'},
  {categoria:'iva',evidencia:'El proveedor no informó el IVA',
   observacion:'El original aclara que falta informar el IVA.'}
 ],advertencia:'El original prevalece.',
 originalPermaneceDisponible:true,whatsappEnviado:false});
function fixture(){
 const state={source:source(),authorized:true,afterAuthorized:true,
  claimed:false,claimCalls:0,modelCalls:0,finishCalls:0,readCalls:0,
  valid:true,bytes:RAW,status:null,job:'11111111-1111-4111-8111-111111111111',
  failAt:'',afterSource:null,verified:0,stored:null};
 const ports={
  verificarSesion:async q=>{
   state.verified++;
   assert.equal(q.sesionHmac,digestSesionPrivadaD016(COOKIE,KEY));
   assert.equal(q.rondaId,ROUND);
   if(!state.authorized||(state.verified>1&&!state.afterAuthorized))
    return null;
   return {buyerKey:'buyer_a',requestId:ROUND};
  },
  fuente:async q=>{
   assert.equal(q.rondaId,ROUND);
   assert.equal(q.documentoId,DOC);
   assert.equal(q.sesionHmac,digestSesionPrivadaD016(COOKIE,KEY));
   return state.afterSource&&state.verified>1?
    state.afterSource:state.source;
  },
  reclamar:async q=>{
   state.claimCalls++;
   if(state.claimed)return null;
   state.claimed=true;
   return {state:'analysis_claimed_v2',jobToken:state.job,
    sourceSha256:state.source.sha256};
  },
  leerTexto:async(raw,session)=>{
   state.readCalls++;
   assert.deepEqual(raw,state.source);
   assert.equal(session,digestSesionPrivadaD016(COOKIE,KEY));
   return state.bytes;
  },
  leerArchivo:async()=>{throw Error('unexpected_file_read')},
  analizar:async args=>{
   state.modelCalls++;
   assert.equal(args.fuente.fuente,new TextDecoder().decode(RAW));
   assert.equal(args.fuente.sha256,SHA);
   assert.equal(args.fuente.compradorAutorizado,true);
   assert.equal(args.model,'gpt-6-luna');
   if(state.failAt==='model')throw Error('model_timeout');
   return ready();
  },
  finalizar:async q=>{
   state.finishCalls++;
   assert.equal(q.sourceSha256,SHA);
   assert.equal(q.jobToken,state.job);
   state.stored=q;
   return state.valid;
  }
 };
 return {state,ports,run:(req=request(),g=gate(),c=conf())=>
  analizarOriginalWhatsAppD016(g,req,ROUND,DOC,c,ports)};
}
test('D016 análisis automático: modelo una vez, snapshot exacto, fin ready, sin original',async()=>{
 const f=fixture();
 const res=await f.run();assert.equal(res.status,200);
 assert.deepEqual(await res.json(),{estado:'analisis_disponible'});
 assert.equal(f.state.claimCalls,1);assert.equal(f.state.modelCalls,1);
 assert.equal(f.state.finishCalls,1);
 assert.equal(f.state.stored.status,'ready');
 assert.equal(f.state.stored.textSha256,SHA);
 assert.equal(f.state.stored.points.length,2);
 assert.equal((await f.run()).status,202);
 assert.equal(f.state.modelCalls,1,'no recotiza ni gasta más IA');
});
test('D016 análisis: sin cookie, CSRF u otro documento no consulta la fuente',async()=>{
 const cases=[request({cookie:null}),request({origin:'https://attacker.invalid'}),
  request({site:'cross-site'}),request({site:'none'}),
  request({query:'?key=secret'}),request({method:'GET'}),
  request({contentType:'application/json'})];
 for(const req of cases){
  const f=fixture();
  const res=await f.run(req);
  assert.notEqual(res.status,200);
  assert.equal(f.state.claimCalls,0);assert.equal(f.state.readCalls,0);
  assert.equal(f.state.modelCalls,0);
 }
 const f=fixture();f.state.authorized=false;
 assert.equal((await f.run()).status,404);
 assert.equal(f.state.claimCalls,0);
});
test('D016 análisis: apagado o sin clave IA nunca reclama un trabajo',async()=>{
 for(const c of [{habilitado:false},
  {apiKey:''},{pdfHabilitado:false}]){
  const f=fixture();
  if(c.pdfHabilitado===false){
   f.state.source={...source(),state:'authorized_original_v2',
    mime:'application/pdf',bucket:'cotironda-piloto-originals',
    path:'media/'+'1'.repeat(64),byteCount:800};
  }
  const r=await f.run(request(),gate(),{...conf(),...c});
  assert.notEqual(r.status,200);assert.equal(f.state.claimCalls,0);
 }
});
test('D016 análisis: sin fuente, identidad incorrecta y SHA adulterado no generan guía',async()=>{
 for(const invalid of [
  null,{...source(),buyerKey:'buyer_b'},
  {...source(),requestId:'cccccccc-cccc-4ccc-8ccc-cccccccccccc'},
  {...source(),sha256:'0'.repeat(64)}
 ]){
  const f=fixture();f.state.source=invalid;
  const res=await f.run();
  assert.notEqual(res.status,200);
  if(invalid?.sha256==='0'.repeat(64)){
   assert.equal(f.state.modelCalls,0);
   assert.equal(f.state.stored.status,'review');
  }else assert.equal(f.state.claimCalls,0);
 }
});
test('D016 análisis: revocación entre lectura y IA/finalización no persiste nada',async()=>{
 for(const variant of ['session','supplier']){
  const f=fixture();
  if(variant==='session')f.state.afterAuthorized=false;
  else f.state.afterSource={...source(),buyerKey:'buyer_b'};
  const res=await f.run();
  assert.equal(res.status,404);
  assert.equal(f.state.finishCalls,0);
  assert.equal(f.state.modelCalls,0);
 }
});
test('D016 análisis: timeout IA y SQL finish rechazado no muestran guía falsa',async()=>{
 const f=fixture();f.state.failAt='model';
 assert.equal((await f.run()).status,202);
 assert.equal(f.state.stored.status,'review');
 assert.equal(f.state.stored.points,null);
 const x=fixture();x.state.valid=false;
 assert.equal((await x.run()).status,202);
 assert.equal(x.state.modelCalls,1);
});
test('D016 análisis: dos clics paralelos no duplican llamadas al modelo',async()=>{
 const f=fixture();
 const [a,b]=await Promise.all([f.run(),f.run()]);
 assert.deepEqual([a.status,b.status].sort(),[200,202]);
 assert.equal(f.state.modelCalls,1);
});
