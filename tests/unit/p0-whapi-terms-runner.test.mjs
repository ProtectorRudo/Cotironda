import test from 'node:test';
import assert from 'node:assert/strict';
import {createCipheriv,createHash,createHmac} from 'node:crypto';
import {crearEjecutorAvisosP0}
 from '../../src/server/whapi-terms-runner-p0.ts';

const REF='ilggkalaafhtiysyzlmg';
const LOGIN='cotironda_terms_sender_login_p0';
const ROLE='cotironda_pilot_terms_sender_p0';
const CHANNEL='whapi_pilot_ci';
const TO='5492211234567';
const CHAT=TO+'@s.whatsapp.net';
const MAC=Buffer.alloc(32,41),AES=Buffer.alloc(32,74);
const JOB='eeeeeeee-0000-4000-8000-000000000551';
const LEASE='aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BODY='cotironda-originales-alta-v1. Condiciones de alta de prueba '+
 'permiten al comprador autenticado descargar los originales de futuras '+
 'rondas cerradas, previa aceptación expresa revisada, incluso cuando '+
 'la oferta original no resulte adjudicada. No confundir transporte con consentimiento.';
const sha=x=>createHash('sha256').update(x).digest('hex');
const chatHmac=createHmac('sha256',MAC)
 .update('cotironda|pilot|chat|'+CHANNEL+'|'+CHAT).digest('hex');
const claim={state:'leased',jobId:JOB,leaseToken:LEASE,supplierKey:'corralon_ailin',
 channel:CHANNEL,chatHmac,termsVersion:'cotironda-originales-alta-v1',
 termsSha256:sha(BODY),body:BODY};
const nonce=Buffer.alloc(12,6);
const cipher=createCipheriv('aes-256-gcm',AES,nonce);
cipher.setAAD(Buffer.from(chatHmac+'|cotironda-contact-v1'));
const sealed=Buffer.concat([cipher.update(CHAT,'utf8'),cipher.final(),cipher.getAuthTag()]);
const recipient={state:'ready',jobId:JOB,leaseToken:LEASE,
 supplierKey:'corralon_ailin',channel:CHANNEL,chatHmac,
 contactSha256:sha(CHAT),
 nonceB64:nonce.toString('base64'),ciphertextB64:sealed.toString('base64')};
const dbEnv={
 COTIRONDA_P0_TERMS_DB_DRIVER_ENABLED:'true',
 COTIRONDA_P0_TERMS_PILOT_AUTHORIZED:'true',
 VERCEL_ENV:'preview',
 COTIRONDA_P0_TERMS_PROJECT_REF:REF,
 COTIRONDA_P0_TERMS_DB_URL:'postgresql://'+LOGIN+':'+
  'a'.repeat(28)+'@db.'+REF+'.supabase.co:5432/postgres',
 COTIRONDA_P0_TERMS_DB_ROOT_CA_PEM:
  '-----BEGIN CERTIFICATE-----\n'+'A'.repeat(205)+
  '\n-----END CERTIFICATE-----'
};
function fixture(config={}){
 const log={opened:0,closed:0,http:0,rpcs:[],finished:null};
 const runner=crearEjecutorAvisosP0({
  habilitado:true,pilotoAutorizado:true,dbEnv,channel:CHANNEL,
  pilotHmacKey:MAC,contactAesKey:AES,
  destinatariosPermitidos:[TO],
  whapiToken:'TOKEN_SYNTHETIC_abcdefghijklmnopqrstuvwxyz',
  fetcher:async()=>{
   log.http++;
   return new Response(JSON.stringify({sent:true,message:{
    id:'outgoing.term.000551',status:'pending',
    chat_id:CHAT,from_me:true,type:'text'
   }}),{status:200,headers:{'content-type':'application/json'}});
  },
  loadPgFactory:async()=>(_url,_opts)=>{
   log.opened++;
   let ident=0;
   return {
    reserve:async()=>({
     unsafe:async(sql,args)=>{
      if(sql==='select session_user as login, current_user as rol'){
       ident++;
       return [{login:LOGIN,rol:ident===1?LOGIN:ROLE}];
      }
      if(sql==='set role cotironda_pilot_terms_sender_p0')return [];
      log.rpcs.push({sql,args});
      if(sql.includes('terms_claim_p0'))return [{payload:claim}];
      if(sql.includes('terms_recipient_packet_p0'))
       return [{payload:recipient}];
      if(sql.includes('terms_begin_p0'))
       return [{payload:config.begin??{state:'in_flight',jobId:JOB}}];
      if(sql.includes('terms_authorize_p0'))
       return [{payload:config.authorized??true}];
      if(sql.includes('terms_finish_p0')){
       log.finished=args;
       if(config.finishFailure)throw Error('db_fail');
       return [{payload:{state:config.ackState??(
        args[5]==='api_accepted'?'api_accepted':'uncertain')}}];
      }
      throw Error('unknown_sql');
     },
     release:async()=>{}
    }),
    end:async()=>{log.closed++}
   };
  },
  ...config.config
 });
 return {log,run:()=>runner.procesarUno()};
}
test('P0 runner: transporte simulado completo con SQL seguro y cifra real',async()=>{
 const x=fixture();
 assert.deepEqual(await x.run(),{estado:'aceptado_por_transporte'});
 assert.equal(x.log.http,1);
 assert.equal(x.log.opened,5);
 assert.equal(x.log.closed,5);
 assert.deepEqual(x.log.rpcs.map(x=>x.sql.split('terms_')[1].split('_p0')[0]),
  ['claim','recipient_packet','begin','authorize','finish']);
 assert.equal(x.log.finished[5],'api_accepted');
 assert.equal(x.log.finished[6],
  createHmac('sha256',MAC).update('cotironda|pilot|msg|'+CHANNEL+'|outgoing.term.000551').digest('hex'));
});
test('P0 runner: apagado nunca abre DB ni llama a Whapi',async()=>{
 for(const patch of [{habilitado:false},{pilotoAutorizado:false},
  {fetcher:undefined},{whapiToken:undefined},{destinatariosPermitidos:[]}]){
  const x=fixture({config:patch});
  assert.deepEqual(await x.run(),{estado:'desactivado'});
  assert.equal(x.log.opened,0);
  assert.equal(x.log.http,0);
 }
});
test('P0 runner: DB de otro proyecto o sin permiso nunca llama a Whapi',async()=>{
 for(const env of [
  {...dbEnv,COTIRONDA_P0_TERMS_PROJECT_REF:'wrong'},
  {...dbEnv,COTIRONDA_P0_TERMS_PILOT_AUTHORIZED:'false'}
 ]){
  const x=fixture({config:{dbEnv:env}});
  await assert.rejects(x.run(),/p0_terms_pg_no_disponible/u);
  assert.equal(x.log.http,0);
  assert.equal(x.log.opened,0);
 }
});
test('P0 runner: BEGIN sin ACK evita HTTP; autorización revocada no envía',async()=>{
 for(const cfg of [
  {begin:{state:'cancelled',jobId:JOB}},
  {authorized:false}
 ]){
  const x=fixture(cfg);
  const r=await x.run();
  assert.notEqual(r.estado,'aceptado_por_transporte');
  assert.equal(x.log.http,0);
  assert.equal(x.log.opened,x.log.closed);
 }
});
test('P0 runner: pérdida de COMMIT del ACK nunca declara aceptación',async()=>{
 const x=fixture({finishFailure:true});
 assert.deepEqual(await x.run(),{estado:'incierto_sin_reenvio'});
 assert.equal(x.log.http,1);
 assert.equal(x.log.opened,x.log.closed);
});
