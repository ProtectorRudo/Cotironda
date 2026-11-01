import test from 'node:test';
import assert from 'node:assert/strict';
import {createCipheriv} from 'node:crypto';
import {construirBrokerWhapiPrivado}
 from '../../src/server/whapi-crypto-broker.ts';
import {crearProcesadorCotizacionesMvp062}
 from '../../src/server/whapi-quote-pipeline-mvp062.ts';
import {atenderCotizacionesMvp062}
 from '../../src/server/whapi-quote-http-mvp062.ts';
import {abrirRecursosCotizadorMvp062}
 from '../../src/server/whapi-quote-postgres-mvp062.ts';

const CH='whapi_quote062', CHAT='a'.repeat(64), MSG='b'.repeat(64);
const ROUND='dddddddd-0062-4062-8062-000000000621';
const SUP='bbbbbbbb-0062-4062-8062-000000000622';
const LEASE='eeeeeeee-0062-4062-8062-000000000621';
const TEXT='10 bolsas cemento CPC $121.00\nFlete a convenir';
const TIME=1793455000,KEY_ID='aes_2026_ci';
const KEYS={identidadHmac:Buffer.alloc(32,1),
 huellaHmac:Buffer.alloc(32,2),contenidoAes:Buffer.alloc(32,3)};
const CA='-----BEGIN CERTIFICATE-----\n'+('a'.repeat(350))+'\n-----END CERTIFICATE-----';
const REF='qkercsoqhehbenbbncwk';
const LOGIN={
 cola:['cotironda_quote_worker_queue_login_d092','cotironda_queue_gateway_d062','COTIRONDA_QUOTE_DB_URL_QUEUE'],
 lectura:['cotironda_quote_worker_read_login_d092','cotironda_quote_gateway_d061','COTIRONDA_QUOTE_DB_URL_READ'],
 escritura:['cotironda_quote_worker_write_login_d092','cotironda_price_gateway_d060','COTIRONDA_QUOTE_DB_URL_WRITE']
};
const SECRET='quote062_secret_'.padEnd(50,'s');
function env(extra={}){
 const result={
  VERCEL_ENV:'preview',
  VERCEL_GIT_COMMIT_REF:'integration/mvp-piloto-20261031',
  COTIRONDA_QUOTE_WORKER_ENABLED:'true',
  COTIRONDA_QUOTE_WORKER_PILOT_AUTHORIZED:'true',
  COTIRONDA_QUOTE_WORKER_DB_DRIVER_ENABLED:'true',
  COTIRONDA_QUOTE_WORKER_DB_PROJECT_REF:REF,
  COTIRONDA_QUOTE_WORKER_DB_ROOT_CA_PEM:CA,
  COTIRONDA_QUOTE_WORKER_SECRET:SECRET,
  COTIRONDA_WHAPI_CHANNEL:CH,
  COTIRONDA_WHAPI_WEBHOOK_SECRET:'webhook061_'.padEnd(50,'x'),
  COTIRONDA_WHAPI_AES_KEY_ID:KEY_ID,
  COTIRONDA_WHAPI_HMAC_ID_HEX:KEYS.identidadHmac.toString('hex'),
  COTIRONDA_WHAPI_HMAC_FINGERPRINT_HEX:KEYS.huellaHmac.toString('hex'),
  COTIRONDA_WHAPI_AES_CONTENT_HEX:KEYS.contenidoAes.toString('hex')
 };
 for(const [port,[login,,variable]] of Object.entries(LOGIN))
  result[variable]=`postgresql://${login}.${REF}:${'p'.repeat(30)}@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`;
 return {...result,...extra};
}
function encrypted(text=TEXT,tagCorrupt=false){
 const nonce=Buffer.alloc(12,5);
 const cipher=createCipheriv('aes-256-gcm',KEYS.contenidoAes,nonce);
 cipher.setAAD(Buffer.from(JSON.stringify(['cotironda','d029',1,
  CH,CHAT,MSG,'text',TIME,'key-id',KEY_ID])));
 const bytes=Buffer.concat([cipher.update(JSON.stringify({
  tipo:'text',texto:text,marcaTiempoUnix:TIME
 })),cipher.final()]);
 return {
  channel:CH,messageKey:MSG,chatKey:CHAT,supplierOrgId:SUP,
  roundId:ROUND,kind:'text',sourceUnix:TIME,cryptoKeyId:KEY_ID,
  fingerprint:'f'.repeat(64),cipherHex:bytes.toString('hex'),
  nonceHex:nonce.toString('hex'),
  tagHex:tagCorrupt?'f'.repeat(32):cipher.getAuthTag().toString('hex'),
  expectedRevision:0,
  roundItems:[{itemId:'cemento_001',line_no:1,unit:'bag'}]
 };
}
function verifier(){
 return construirBrokerWhapiPrivado({
  channel:CH,secretoWebhook:'secret_'.padEnd(40,'x'),
  habilitado:false,claves:KEYS,contenidoKeyId:KEY_ID,
  almacen:{resolverVinculo:async()=>null,
   registrarEntrada:async()=>{throw Error('MUST_NOT_STORE')},
   registrarBaja:async()=>{throw Error('MUST_NOT_BAJA')}},
  ahoraUnix:()=>TIME
 }).verificarContenido;
}
function simulation({quote=encrypted(),noAuth=false,receiptFail=false,
  noPrice=false,replay=false}={}){
 const s={sql:[],writes:0,checked:0,claims:0,finishes:[],acks:0,version:1};
 const ports={
  cola:{query:async(sql,args)=>{
   s.sql.push({role:'cola',sql,args});
   if(sql.includes('whapi_claim_quote_d062')){
    s.claims++;
    return {rows:[{payload:s.claims===1?{
     channel:CH,messageKey:MSG,leaseToken:LEASE,attempt:1}:null}]};
   }
   assert.match(sql,/whapi_finish_quote_d062/u);
   s.finishes.push(args[3]);s.acks++;
   return {rows:[{payload:{
    state:args[3]==='received'?'done':
      args[3]==='no_price'?'manual_review':
      args[3]==='not_eligible'?'discarded':'pending',
    attempts:1
   }}]};
  }},
  lectura:{query:async(sql,args)=>{
   s.sql.push({role:'lectura',sql,args});
   assert.match(sql,/whapi_quote_read_d061/u);
   assert.deepEqual(args,[CH,MSG]);s.checked++;
   return {rows:[{payload:noAuth?null:quote}]};
  }},
  escritura:{query:async(sql,args)=>{
   s.sql.push({role:'escritura',sql,args});
   assert.match(sql,/whapi_receive_with_prices_d060/u);
   s.writes++;if(receiptFail)throw Error('REAL_PRIVATE_DB');
   assert.deepEqual(args.slice(0,3),[CH,MSG,0]);
   const stored=JSON.parse(args[3]),lines=JSON.parse(args[4]);
   assert.equal(stored.currency,'ARS');
   assert.equal(stored.lines_snapshot.length,1);
   assert.equal(stored.lines_snapshot[0].net_unit_price,null);
   assert.equal(lines.length,1);
   assert.equal(lines[0].quoted_unit_price,'121.00');
   assert.equal(lines[0].vat_basis,'no_informado');
   assert.equal(lines[0].source_line_no,1);
   return {rows:[{payload:{state:'offer_received',version:1,
    revision:1,repeated:replay,prices_preserved:true}}]};
  }}
 };
 const worker=crearProcesadorCotizacionesMvp062({
  habilitado:true,puertos:ports,verificar:verifier()
 });
 return {s,ports,worker};
}
function request(secret=SECRET,{body=false,method='POST'}={}){
 return new Request('https://preview.invalid/api/integraciones/whapi/cotizaciones',{
  method,headers:{'x-cotironda-quote-worker-key':secret},
  ...(body?{body:'{"buyer":"forged"}'}:{})
 });
}
test('MVP062: D062 cola + D061 AES real + D063 + D060 precio y fuente, sin Confirmo',async()=>{
 const t=simulation();
 assert.deepEqual(await t.worker.procesarLote(2),{
  tomados:1,registrados:1,revisionManual:0,descartados:0,pendientes:0,agotados:0
 });
 assert.equal(t.s.writes,1);
 assert.deepEqual(t.s.finishes,['received']);
 assert.deepEqual(t.s.sql.map(x=>x.role),
  ['cola','lectura','escritura','cola','cola']);
});
test('MVP062: replay mismo mensaje devuelve recibo repetido, no nueva versión',async()=>{
 const t=simulation({replay:true});
 const x=await t.worker.procesarUno();
 assert.deepEqual(x,{estado:'procesado',cola:'done',intento:1});
 assert.equal(t.s.writes,1);
});
test('MVP062: precio ambiguo o material ajeno exige revisión, no inventa oferta',async()=>{
 for(const text of ['10 bolsas arena gruesa $121.00',
  '10 bolsas cemento CPC $121.00 y $122.00',
  'cemento $121.00','Confirmo']){
  const t=simulation({quote:encrypted(text)});
  const x=await t.worker.procesarUno();
  assert.ok(['manual_review','pending'].includes(x.cola));
  assert.equal(t.s.writes,0,text);
 }
});
test('MVP062: desconocido/revocado, AES corrupto y SQL caído, sin escritura falsa',async()=>{
 const missing=simulation({noAuth:true});
 assert.equal((await missing.worker.procesarUno()).cola,'discarded');
 assert.equal(missing.s.writes,0);
 const invalid=simulation({quote:encrypted(TEXT,true)});
 assert.equal((await invalid.worker.procesarUno()).cola,'pending');
 assert.equal(invalid.s.writes,0);
 const fail=simulation({receiptFail:true});
 assert.equal((await fail.worker.procesarUno()).cola,'pending');
 assert.equal(fail.s.writes,1);
});
test('MVP062: puerto SQL no puede consultar otra función ni tabla',async()=>{
 const t=simulation();
 const wrong=crearProcesadorCotizacionesMvp062({
  habilitado:true,verificar:verifier(),
  puertos:{cola:t.ports.cola,lectura:t.ports.lectura,
   escritura:{query:async()=>{throw Error('MUST_NOT_BE_CALLED')}}}
 });
 assert.equal(typeof wrong.procesarUno,'function');
 assert.throws(()=>crearProcesadorCotizacionesMvp062({
  habilitado:true,verificar:verifier(),puertos:{...t.ports,cola:{}}
 }),/mvp062_cotizador_privado_no_disponible/);
});
test('MVP062: endpoint privado bloquea GET, producción, secreto inválido y body',async()=>{
 let opens=0;
 const cfg=e=>({env:e,abrirRecursos:async()=>{
  opens++;throw Error('CANNOT_PRINT_SECRETS')
 }});
 assert.equal((await atenderCotizacionesMvp062(request(SECRET,{method:'GET'}),cfg(env()))).status,405);
 for(const patch of [{VERCEL_ENV:'production'},
  {VERCEL_GIT_COMMIT_REF:'main'},{COTIRONDA_QUOTE_WORKER_ENABLED:'false'},
  {COTIRONDA_QUOTE_WORKER_PILOT_AUTHORIZED:'false'},
  {COTIRONDA_REGISTRATION_ENABLED:'true'}])
 assert.equal((await atenderCotizacionesMvp062(request(),cfg(env(patch)))).status,503);
 assert.equal((await atenderCotizacionesMvp062(request('wrong'),cfg(env()))).status,401);
 assert.equal((await atenderCotizacionesMvp062(request(SECRET,{body:true}),cfg(env()))).status,415);
 assert.equal(opens,0);
});
test('MVP062: endpoint sin tareas devuelve solo contadores y cierra recursos',async()=>{
 const t=simulation();
 let closed=0;
 const r=await atenderCotizacionesMvp062(request(),{
  env:env(),abrirRecursos:async()=>({
   sql:t.ports,verificar:verifier(),cerrar:async()=>{closed++}
  })
 });
 assert.equal(r.status,200);
 assert.deepEqual(await r.json(),{
  estado:'procesado',tomados:1,registrados:1,
  revisionManual:0,descartados:0,pendientes:0,agotados:0,mensajesEnviados:0
 });
 assert.equal(closed,1);
 assert.match(r.headers.get('cache-control'),/no-store/);
});
