import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runRoundPreviewMvp173 as run} from
 '../../supabase/functions/cotironda-piloto-round-preview-staging/logic.ts';

const REQ='469cb459-5f00-49c2-b0b9-bc8b11e5c900';
const ENDPOINT='https://example.invalid/functions/v1/cotironda-piloto-round-preview-staging';
const TOKEN='a'.repeat(96);
function request(token=TOKEN,body=JSON.stringify({requestId:REQ}),method='POST'){
 return new Request(ENDPOINT,{method,headers:{
  'content-type':'application/json','x-cotironda-recovery-token':token
 },body:method==='POST'?body:undefined});
}
function sample(){
 const hash='c'.repeat(64),hmac='d'.repeat(64);
 const doc={
  requestId:REQ,anonId:'anon_private',messageHmac:hmac,
  sourceSha256:hash,declaredTotalLiteral:'$100,00',
  lineas:[{lineNo:1,descriptionLiteral:'BIG BAG de arena',quantityLiteral:'1',
   unitLiteral:null,unitPriceLiteral:'$100,00',lineTotalLiteral:'$100,00'}],
  prueba:{requestId:REQ,messageHmac:hmac,sourceSha256:hash,
   version:9,state:'verified',reason:'covered',lineCount:1,
   sumLineCents:'10000',declaredTotalCents:'10000',
   rankingAllowed:false,revisionVigente:true,cotizacionVigente:true}
 };
 const fuente={
  requestId:REQ,messageHmac:hmac,sourceSha256:hash,
  state:'source_checked',rankingAllowed:false,sourceImmutabilityPreserved:true,
  lines:[{lineNo:1,page:1,row:2,presentation:'big_bag',
   unit:null,unitStatus:'not_explicit'}]
 };
 const economia={
  state:'source_checked',sourceSha256:hash,rankingAllowed:false,
  descuentos:{estado:'parcial',precios:[{}]},
  condiciones:{iva:{estado:'no_informado'},flete:{estado:'a_convenir'},
   pago:{estado:'no_informado'},rankingHabilitado:false,stockCorroborado:false}
 };
 return {
  state:'private_inputs',rankingAllowed:false,contactsRevealed:false,
  requestItems:[{id:'item_001',descripcionLiteral:'arena fina',
   cantidad:'1.000',unidad:'m3',familia:'arena_fina'}],
  quotations:[{doc,fuente,economia}]
 };
}
function io(data=sample()){
 const calls={auth:0,lookup:0,requests:[]};
 return {calls,options:{
  enabled:true,
  authorize:async token=>{calls.auth++;return token===TOKEN},
  lookup:async id=>{calls.lookup++;calls.requests.push(id);
   return {data,error:null}}
 }};
}
test('MVP173: llamada con token válido devuelve resumen sin identificadores ni importes',async()=>{
 const x=io(),r=await run(request(),x.options),body=await r.json();
 assert.equal(r.status,200);
 assert.deepEqual(body,{
  state:'preview_checked',rounds:1,quotations:1,requestedItems:1,
  outcomes:{alternativa_comercial_con_aclaracion:1},
  rankingAllowed:false,contactsRevealed:false,
  originalDocumentsReleased:false,messagesSent:false
 });
 assert.equal(r.headers.get('cache-control'),'no-store');
 assert.deepEqual(x.calls,{auth:1,lookup:1,requests:[REQ]});
 const literal=JSON.stringify(body);
 for(const word of [REQ,TOKEN,'BIG BAG','sourceSha256',
  'messageHmac','supplier_key','100,00','telefono'])
  assert.ok(!literal.includes(word),word);
});
test('MVP173: sin token no consulta base ni usa servicio',async()=>{
 const x=io(),r=await run(request(''),x.options);
 assert.equal(r.status,401);
 assert.deepEqual(await r.json(),{state:'unauthorized'});
 assert.equal(x.calls.auth,0);assert.equal(x.calls.lookup,0);
});
test('MVP173: token no autorizado con formato válido falla cerrado',async()=>{
 const x=io(),r=await run(request('b'.repeat(96)),x.options);
 assert.equal(r.status,401);
 assert.equal(x.calls.auth,1);assert.equal(x.calls.lookup,0);
});
test('MVP173: GET no permite leer ni validar la solicitud',async()=>{
 const x=io(),r=await run(request(TOKEN,'','GET'),x.options);
 assert.equal(r.status,405);
 assert.equal(x.calls.lookup,0);
});
test('MVP173: apagado por configuración deniega incluso token válido',async()=>{
 const x=io();x.options.enabled=false;
 const r=await run(request(),x.options);
 assert.equal(r.status,503);assert.equal(x.calls.lookup,0);
});
test('MVP173: JSON malformado o campos extras no permiten consulta',async()=>{
 for(const body of ['{','[]','{}',
  JSON.stringify({requestId:REQ,phone:'123'}),
  JSON.stringify({requestId:42}),
  JSON.stringify({requestId:'00000000-0000-0000-0000-000000000000'})
 ]){
  const x=io(),r=await run(request(TOKEN,body),x.options);
  assert.equal(r.status,400,body);
  assert.equal(x.calls.lookup,0);
 }
});
test('MVP173: payload muy largo o con cabecera de tamaño prohibido se bloquea',async()=>{
 const x=io();
 let r=await run(request(TOKEN,JSON.stringify({requestId:REQ})+' '.repeat(120)),x.options);
 assert.equal(r.status,400);assert.equal(x.calls.lookup,0);
 r=await run(new Request(ENDPOINT,{method:'POST',headers:{
  'content-type':'application/json','x-cotironda-recovery-token':TOKEN,
  'content-length':'999'},body:'{}'}),x.options);
 assert.equal(r.status,413);assert.equal(x.calls.lookup,0);
});
test('MVP173: selector niega ronda desconocida sin identificadores visibles',async()=>{
 const x=io({state:'not_permitted'});
 const r=await run(request(),x.options);
 assert.equal(r.status,409);
 assert.deepEqual(await r.json(),{state:'incomplete_evidence'});
});
test('MVP173: faltante de proveedor o documento v9 mantiene ronda bloqueada',async()=>{
 for(const state of ['incomplete_evidence','capacity_or_empty','invalid_request_items']){
  const x=io({state});
  const r=await run(request(),x.options);
  assert.equal(r.status,409,state);
  assert.equal((await r.json()).state,'incomplete_evidence');
 }
});
test('MVP173: datos incompletos/alterados rechazan el diagnóstico',async()=>{
 const data=sample();data.quotations[0].doc.prueba.revisionVigente=false;
 const x=io(data);
 const r=await run(request(),x.options);
 assert.equal(r.status,503);
 assert.deepEqual(await r.json(),{state:'preview_unavailable'});
});
test('MVP173: error SQL no filtra el mensaje del driver',async()=>{
 const x=io();
 x.options.lookup=async()=>({data:null,error:'private SQL identifier'});
 const r=await run(request(),x.options);
 assert.equal(r.status,503);
 assert.ok(!(await r.text()).includes('private SQL'));
});
test('MVP173: excepciones de RPC tampoco filtran PII del piloto',async()=>{
 const x=io();
 x.options.lookup=async()=>{throw new Error('personal phone in private source')};
 const r=await run(request(),x.options);
 assert.equal(r.status,503);
 assert.deepEqual(await r.json(),{state:'temporarily_unavailable'});
});
test('MVP173: no cambia el payload privado ni entrega ofertas completas',async()=>{
 const data=sample(),original=structuredClone(data);
 const x=io(data);
 const r=await run(request(),x.options);
 assert.equal(r.status,200);
 assert.deepEqual(data,original);
 const result=await r.json();
 assert.equal(Object.hasOwn(result,'quotationsDetail'),false);
 assert.equal(Object.hasOwn(result,'originals'),false);
});
test('MVP173: entrypoint staging solo usa RPC privada, sin IA, outbox, cron ni ranking',()=>{
 const filename=new URL(
  '../../supabase/functions/cotironda-piloto-round-preview-staging/index.ts',
  import.meta.url
 );
 const s=readFileSync(filename,'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/gu,'');
 assert.match(s,/cotironda_piloto_recovery_token_allowed_mvp132/);
 assert.match(s,/cotironda_piloto_private_round_inputs_mvp172/);
 assert.match(s,/runRoundPreviewMvp173/);
 assert.doesNotMatch(s,/whapi-|sendMessage|finalist|outbox|cron\.schedule|adjudicar|publishOriginal/i);
});
