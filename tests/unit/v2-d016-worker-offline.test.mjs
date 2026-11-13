import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {procesarTrabajoOfflineD016}
 from '../../supabase/functions/cotironda-piloto-v2-worker-d016/worker-core.ts';

const PILOT='https://ilggkalaafhtiysyzlmg.supabase.co';
const URL=PILOT+'/functions/v1/cotironda-piloto-v2-worker-d016';
const KEY='bc12345678de'+ 'f'.repeat(52);
const SHARED='InternalD016Worker_Secret_0123456789_ABCDEFGxy';
const SKEY='sb_secret_'+'X'.repeat(30),OAI='sk-'+'x'.repeat(30);
const ROUND='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DOC='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const MESSAGE='1'.repeat(64),CHAT='2'.repeat(64);
const TEXT='Lista de proveedores: 15 bolsas de cemento, IVA no informado, flete pendiente.';
const BYTES=new TextEncoder().encode(TEXT);
const SHA=createHash('sha256').update(BYTES).digest('hex');
const job=()=>({requestId:ROUND,documentId:DOC,sourceSha256:SHA,mime:'text/plain'});
const cfg=()=>({enabled:true,url:PILOT,serviceKey:SKEY,internalSecret:SHARED,
 apiKey:OAI,aesHex:KEY});
const request=(c={})=>new Request(URL+(c.query??''),{
 method:c.method??'POST',
 headers:{apikey:c.apikey??SKEY,
 'x-cotironda-d016-worker-internal':c.secret??SHARED,
 ...(c.cookie?{'cookie':c.cookie}:{})},
 body:c.method==='GET'?undefined:c.body??'{}'
});
const file=()=>({state:'authorized_original_v2',
 ...job(),buyerKey:'buyer_a',supplierKey:'supplier_a',
 messageHmac:MESSAGE,sha256:SHA,consentAt:1700000000000,invitedAt:1700000000001,
 bucket:'cotironda-piloto-originals',path:'media/'+MESSAGE,byteCount:BYTES.length});
const points=()=>[
 {categoria:'material',evidencia:'15 bolsas de cemento',
  observacion:'El original indica quince bolsas de cemento.'},
 {categoria:'iva',evidencia:'IVA no informado',
  observacion:'El IVA figura como una condición sin informar.'}
];
const report=()=>({estado:'analisis_disponible',codigo:'verificado',
 titulo:'Lo importante de este presupuesto',documentoId:DOC,sha256:SHA,
 puntos:points(),advertencia:'El original prevalece.',
 originalPermaneceDisponible:true,whatsappEnviado:false});
function fixture(){
 const state={due:[job()],source:file(),claimed:false,claimCount:0,
  modelCount:0,finishCount:0,readCount:0,
  afterSource:null,currentSource:null,
  modelFail:false,finishOk:true,changed:false,receipt:null};
 const ports={
  due:async()=>state.due,
  source:async q=>{
   assert.deepEqual(q,{requestId:ROUND,documentId:DOC});
   state.readCount++;
   if(state.afterSource&&state.readCount>=3)return state.afterSource;
   return state.source;
  },
  claim:async q=>{
   state.claimCount++;
   if(state.claimed)return null;
   state.claimed=true;
   return {state:'analysis_claimed_v2',
    sourceSha256:SHA,jobToken:'11111111-1111-4111-8111-111111111111'};
  },
  readStorage:async q=>{
   assert.deepEqual(q,{bucket:'cotironda-piloto-originals',path:'media/'+MESSAGE});
   return BYTES;
  },
  analyze:async data=>{
   state.modelCount++;
   assert.equal(data.fuente.fuente,TEXT);
   assert.equal(data.fuente.compradorAutorizado,true);
   assert.equal(data.fuente.consentimientoOriginalVerificado,true);
   assert.equal(data.fuente.sha256,SHA);
   if(state.modelFail)throw Error('simulate_model_timeout');
   return report();
  },
  finish:async data=>{
   state.finishCount++;state.receipt=data;
   assert.equal(data.sourceSha256,SHA);
   assert.equal(data.jobToken,'11111111-1111-4111-8111-111111111111');
   return state.finishOk;
  }
 };
 return {state,ports,run:(req=request(),conf=cfg())=>
  procesarTrabajoOfflineD016(req,conf,ports)};
}
test('D016 offline: 1 oferta autenticada → fuente → IA → finish ready, sin comprador online',async()=>{
 const f=fixture();const res=await f.run();
 assert.equal(res.status,200);
 const payload=await res.json();
 assert.deepEqual(payload,{state:'ready',checked:1,ready:1,review:0});
 assert.deepEqual([f.state.claimCount,f.state.modelCount,f.state.finishCount],[1,1,1]);
 assert.equal(f.state.receipt.textSha256,SHA);
 assert.equal(f.state.receipt.points.length,2);
 assert.equal(JSON.stringify(payload).includes(TEXT),false);
});
test('D016 offline: sin trabajo, respuesta sin datos privados y costo cero',async()=>{
 const f=fixture();f.state.due=[];
 const response=await f.run();
 assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{state:'idle',checked:0,ready:0,review:0});
 assert.equal(f.state.modelCount,0);
});
test('D016 offline: dos solicitudes concurrentes no duplican el costo IA',async()=>{
 const f=fixture();const [a,b]=await Promise.all([f.run(),f.run()]);
 assert.deepEqual([a.status,b.status],[200,200]);
 const states=[(await a.json()).state,(await b.json()).state].sort();
 assert.deepEqual(states,['ready','skipped']);
 assert.equal(f.state.modelCount,1);
});
test('D016 offline: sin flags, secreto, apikey, cookie o cuerpo inválido jamás lee SQL',async()=>{
 const cases=[
  [request({apikey:'bad'}),cfg()],
  [request({secret:'bad'}),cfg()],
  [request({cookie:'session=stolen'}),cfg()],
  [request({query:'?requestId='+ROUND}),cfg()],
  [request({body:JSON.stringify({requestId:ROUND})}),cfg()],
  [request({method:'GET'}),cfg()],
  [request(),{...cfg(),enabled:false}],
  [request(),{...cfg(),url:'https://evil.example'}],
  [request(),{...cfg(),aesHex:'0'.repeat(64)}],
  [request(),{...cfg(),internalSecret:'abc'}]
 ];
 for(const [req,conf] of cases){
  const f=fixture();const r=await f.run(req,conf);
  assert.notEqual(r.status,200);
  assert.equal(f.state.claimCount,0);
  assert.equal(f.state.modelCount,0);
 }
});
test('D016 offline: fuente adulterada o ilegible no consulta a la IA',async()=>{
 const bad=[{...file(),buyerKey:''},{...file(),path:'media/'+'f'.repeat(64)},
  {...file(),sha256:'f'.repeat(64)},
  {...file(),consentAt:1700000000002,invitedAt:1700000000001}];
 for(const x of bad){const f=fixture();f.state.source=x;
  const res=await f.run();assert.equal((await res.json()).state,'skipped');
  assert.equal(f.state.claimCount,0);assert.equal(f.state.modelCount,0);
 }
});
test('D016 offline: revocación luego de leer o durante IA no finaliza',async()=>{
 const f=fixture();f.state.afterSource={...file(),supplierKey:'supplier_b'};
 const res=await f.run();
 assert.equal((await res.json()).state,'revoked');
 assert.equal(f.state.finishCount,0);
});
test('D016 offline: error IA guarda review y no inventa guías',async()=>{
 const f=fixture();f.state.modelFail=true;
 const res=await f.run();
 assert.deepEqual(await res.json(),{state:'review',checked:1,ready:0,review:1});
 assert.equal(f.state.receipt.status,'review');
 assert.equal(f.state.receipt.points,null);
 assert.equal(f.state.receipt.textSha256,null);
});
